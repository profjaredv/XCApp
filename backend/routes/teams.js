const express = require('express');
const router = express.Router();
const { customAlphabet } = require('nanoid');
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const calculationService = require('../services/performance/calculationService');
const {
  resolveActiveSeason,
  deriveGrade,
  deriveGraduationYear,
  currentCalendarSeason,
  listSeasonsWithData,
  isEnrolled,
} = require('../lib/season');
const { parseDistanceToMeters } = require('../lib/distance');
const { normalizeAthleteName, matchAthlete } = require('../lib/athleteMatching');
const { normalizeGender } = require('../lib/gender');

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

// POST /api/teams
router.post('/', authenticate, async (req, res) => {
  const { name, athleticTeamId } = req.body;
  const userId = req.user.id;

  if (!name || !athleticTeamId) {
    return res.status(400).json({ message: 'Team name and Athletic.net Team ID are required.' });
  }

  try {
    const existingTeam = await prisma.team.findUnique({ where: { athleticTeamId: String(athleticTeamId) } });
    if (existingTeam) {
      return res.status(409).json({ message: 'A team with this Athletic.net ID already exists.' });
    }

    const newTeam = await prisma.team.create({
      data: {
        name,
        athleticTeamId: String(athleticTeamId),
        joinCode: nanoid(),
        coachUid: userId,
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { role: 'coach', teamId: newTeam.id },  // User.role: onboarding hint only, unchanged
    });

    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: newTeam.id, userId } },
      update: { role: 'HEAD_COACH' },
      create: { teamId: newTeam.id, userId, role: 'HEAD_COACH' },
    });

    const updatedUser = await prisma.user.findUnique({ where: { id: userId }, include: { team: true } });

    res.status(201).json({
      success: true,
      message: 'Team created successfully. You have been upgraded to coach role.',
      user: updatedUser,
      team: newTeam,
    });
  } catch (error) {
    console.error('Error creating team:', error.message);
    res.status(500).json({ message: 'Failed to create team.' });
  }
});

// GET /api/teams/current
router.get('/current', authenticate, requireTeam, async (req, res) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.user.teamId } });
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    res.json({
      id: team.id,
      name: team.name,
      athleticTeamId: team.athleticTeamId,
      joinCode: team.joinCode,
    });
  } catch (error) {
    console.error('Error fetching current team:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Team-join-by-code lives at POST /api/team/join (routes/team.js, singular
// mount) — that's the endpoint the frontend has always called. This was a
// second, divergent implementation at the plural path nothing ever reached.

// POST /api/teams/scrape
// Scrapes Athletic.net for the CALLER'S OWN team — requireRole checks
// req.user.teamId itself and limits this to head/paid coaches (importing
// results is athlete read/write territory, not a head-coach-only action).
router.post('/scrape', authenticate, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { year } = req.body;
  const { spawn } = require('child_process');
  const path = require('path');
  const { parse } = require('csv-parse/sync');
  const moment = require('moment');

  try {
    const team = req.user.team;
    const yearNum = parseInt(year, 10) || currentCalendarSeason();

    // Re-importing a season that was already imported: wipe it first.
    const importedSeasons = team.importedSeasons || [];
    if (importedSeasons.includes(yearNum)) {
      const racesToDelete = await prisma.race.findMany({
        where: { teamId: team.id, season: yearNum },
        select: { id: true },
      });
      if (racesToDelete.length > 0) {
        const raceIds = racesToDelete.map((r) => r.id);
        await prisma.result.deleteMany({ where: { raceId: { in: raceIds } } });
        await prisma.race.deleteMany({ where: { id: { in: raceIds } } });
      }
    }

    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
    const scriptPath = isRailway
      ? path.join(__dirname, '..', 'scrape_season_playwright.js')
      : path.join(__dirname, '..', 'scrape_season.py');

    // spawn() with an argument array never invokes a shell — team.athleticTeamId
    // and yearNum are passed as discrete argv entries, not interpolated into
    // a command string, so this is not vulnerable to shell injection even
    // though the values are ultimately user-influenced (team setup).
    const scraperProcess = isRailway
      ? spawn('node', [scriptPath, '--team_id', team.athleticTeamId, '--year', String(yearNum)])
      : spawn('python3', [scriptPath, '--team_id', team.athleticTeamId, '--year', String(yearNum)]);

    let csvData = '';
    let errorData = '';

    scraperProcess.stdout.on('data', (data) => {
      csvData += data.toString();
    });
    scraperProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    scraperProcess.on('error', (err) => {
      console.error('Failed to start scraper subprocess:', err.message);
      return res.status(500).json({ message: 'Failed to start scraper process.' });
    });

    scraperProcess.on('close', async (code) => {
      if (code !== 0) {
        console.error(`Scraper process exited with code ${code}: ${errorData}`);
        return res.status(500).json({ message: 'Failed to scrape data.' });
      }

      try {
        if (csvData.length === 0) {
          return res.status(500).json({ message: 'No data received from scraper.' });
        }

        const records = parse(csvData, { columns: true, skip_empty_lines: true, trim: true });

        let recordsProcessed = 0;
        let skippedMissing = 0;
        let skippedDate = 0;
        const importedAthleteIds = new Set();
        const importedGradYears = new Map();

        // Phase 2 step 5: athletes(team_id, name) is no longer unique (two
        // "Jack Smith"s on one roster is normal), so athlete.upsert's old
        // teamId_name compound key doesn't exist anymore — match by hand
        // instead, preferring athleticAthleteId over name (see
        // lib/athleteMatching.js). Pre-fetch once and keep the lookup maps
        // updated as rows create new athletes, since one CSV row per result
        // means the same athlete recurs across many rows in this loop.
        const existingAthletes = await prisma.athlete.findMany({ where: { teamId: team.id } });
        const athleteByAthleticId = new Map(
          existingAthletes.filter((a) => a.athleticAthleteId).map((a) => [a.athleticAthleteId, a])
        );
        const athleteByName = new Map(existingAthletes.map((a) => [normalizeAthleteName(a.name), a]));

        const parseTimeToSeconds = (timeStr) => {
          if (!timeStr) return null;
          const parts = timeStr.split(':').map((p) => parseFloat(p));
          if (parts.length === 2) return parts[0] * 60 + parts[1];
          if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
          return null;
        };

        // Grade in a season implies a graduation year, and graduation year is
        // the fact we keep: it stays true no matter which season you import
        // next, or in what order.
        const calculateGraduationYear = (grade, currentYear) => deriveGraduationYear(grade, currentYear);

        const dateFormats = ['MMM D, YYYY', 'MMMM D, YYYY', 'M/D, YYYY', 'M/D/YYYY', 'MM/DD/YYYY', 'MM/D/YYYY', 'M/DD/YYYY'];

        for (const rowData of records) {
          const {
            'Race Name': raceName,
            'Athlete Name': athleteName,
            Grade: grade,
            Gender: gender,
            Time: time,
            'Race Date': raceDate,
            Distance: distance,
            'Source URL': sourceUrl,
            'Athletic Meet ID': athleticMeetId,
            'Athletic Athlete ID': athleticAthleteId,
          } = rowData;

          if (!raceName || !athleteName || !time || !raceDate) {
            skippedMissing++;
            continue;
          }

          const parsedDate = moment(raceDate, dateFormats, true);
          if (!parsedDate.isValid()) {
            skippedDate++;
            continue;
          }

          const gradeNum = grade ? parseInt(grade, 10) : null;
          const graduationYear = grade ? calculateGraduationYear(grade, yearNum) : null;
          const athleticAthleteIdValue = athleticAthleteId || null;
          const genderValue = normalizeGender(gender);

          // Deliberately NOT writing `grade` onto the athlete: grade is a
          // function of (graduationYear, season) and is derived on read. The
          // old code stored it here, so importing 2025 rewrote every
          // athlete's grade for 2024 too. Only fill graduationYear when this
          // row actually told us one — a blank grade must not wipe it.
          const existingMatch = matchAthlete(
            { athleticAthleteId: athleticAthleteIdValue, name: athleteName },
            { byAthleticId: athleteByAthleticId, byName: athleteByName }
          );

          let athlete;
          if (existingMatch) {
            athlete = await prisma.athlete.update({
              where: { id: existingMatch.id },
              data: {
                ...(genderValue ? { gender: genderValue } : {}),
                ...(graduationYear !== null ? { graduationYear } : {}),
                // Backfill only — never overwrite a stable id with a
                // different one from a stray/misparsed href.
                ...(athleticAthleteIdValue && !existingMatch.athleticAthleteId
                  ? { athleticAthleteId: athleticAthleteIdValue }
                  : {}),
              },
            });
          } else {
            athlete = await prisma.athlete.create({
              data: { name: athleteName, teamId: team.id, gender: genderValue, graduationYear, athleticAthleteId: athleticAthleteIdValue },
            });
          }

          // Keep the lookup maps current so later rows for this same athlete
          // (a different race, same import) match instead of creating a
          // duplicate.
          if (athlete.athleticAthleteId) athleteByAthleticId.set(athlete.athleticAthleteId, athlete);
          athleteByName.set(normalizeAthleteName(athlete.name), athlete);

          if (graduationYear !== null) {
            importedGradYears.set(athlete.id, graduationYear);
          }
          importedAthleteIds.add(athlete.id);

          // csv-parse gives '' for a present-but-empty column, not undefined —
          // normalize to null so a re-scrape without a resolvable meet link
          // doesn't write an empty string over a previously-good value.
          const sourceUrlValue = sourceUrl || null;
          const athleticMeetIdValue = athleticMeetId || null;

          const race = await prisma.race.upsert({
            where: {
              teamId_name_date_distance: {
                teamId: team.id,
                name: raceName,
                date: parsedDate.startOf('day').toDate(),
                distance,
              },
            },
            update: {
              distance,
              distanceMeters: parseDistanceToMeters(distance),
              season: yearNum,
              ...(sourceUrlValue ? { sourceUrl: sourceUrlValue } : {}),
              ...(athleticMeetIdValue ? { athleticMeetId: athleticMeetIdValue } : {}),
            },
            create: {
              name: raceName,
              date: parsedDate.startOf('day').toDate(),
              teamId: team.id,
              distance,
              distanceMeters: parseDistanceToMeters(distance),
              season: yearNum,
              sourceUrl: sourceUrlValue,
              athleticMeetId: athleticMeetIdValue,
            },
          });

          const timeInSeconds = parseTimeToSeconds(time);

          await prisma.result.upsert({
            where: { athleteId_raceId: { athleteId: athlete.id, raceId: race.id } },
            update: { time: timeInSeconds, grade: gradeNum, teamId: team.id },
            create: { athleteId: athlete.id, raceId: race.id, teamId: team.id, time: timeInSeconds, grade: gradeNum },
          });

          recordsProcessed++;
        }

        const updatedSeasons = [...new Set([...importedSeasons, yearNum])];

        // An import is also a statement that this season exists. Previously
        // nothing ever wrote Season/SeasonRoster rows, so the roster tables
        // sat empty and every screen had to re-infer the team from raw
        // results — which is why a season with no results yet showed nothing.
        const seasonRow = await prisma.season.upsert({
          where: { teamId_year_sport: { teamId: team.id, year: yearNum, sport: 'XC' } },
          update: {},
          create: { teamId: team.id, year: yearNum, sport: 'XC' },
        });

        for (const athleteId of importedAthleteIds) {
          const gradYear = importedGradYears.get(athleteId) ?? null;
          const grade = gradYear !== null ? deriveGrade(gradYear, yearNum) : null;
          await prisma.seasonRoster.upsert({
            where: { seasonId_athleteId: { seasonId: seasonRow.id, athleteId } },
            update: { grade, isActive: true },
            create: { seasonId: seasonRow.id, athleteId, grade, isActive: true },
          });
        }

        // Advance the team to the newest season it now has data for — not
        // simply the season just imported. Backfilling an older year must not
        // drag the team backwards: importing 2025 and then 2024 previously
        // left "current season" sitting on 2024.
        const newestWithData = Math.max(...updatedSeasons);
        const nextCurrentSeason = Number.isFinite(team.currentSeason)
          ? Math.max(team.currentSeason, newestWithData)
          : newestWithData;

        await prisma.team.update({
          where: { id: team.id },
          data: {
            importedSeasons: updatedSeasons,
            currentSeason: nextCurrentSeason,
          },
        });

        calculationService
          .calculateAllMetrics(team.id, yearNum)
          .catch((calcError) => console.error(`Error calculating analytics for season ${yearNum}:`, calcError.message));

        res.status(200).json({
          success: true,
          message: `Successfully imported ${recordsProcessed} results for season ${yearNum}. Analytics are calculating in the background - you can safely leave this page.`,
          recordsProcessed,
          skippedMissing,
          skippedDate,
          totalRecords: records.length,
          calculationStatus: 'processing',
        });
      } catch (error) {
        console.error('Error processing scraped data:', error.message);
        res.status(500).json({ message: 'Failed to process scraped data.' });
      }
    });
  } catch (error) {
    console.error('Error in scrape endpoint:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /api/teams/scrape-roster
//
// Pulls the CURRENT roster (names/grades, no results) from Athletic.net and
// merges it into the season's SeasonRoster. Deliberately conservative,
// unlike /scrape's wipe-and-reimport: this never deletes or deactivates
// anything. An athlete who was active but no longer appears on Athletic.net
// gets flaggedForRemoval — a signal for the coach to review on the Roster
// page — never an automatic isActive: false. Re-running this after a coach
// dismisses a flag (or after the athlete reappears on Athletic.net) clears
// it again. Name matching is exact (normalized), not fuzzy — a near-miss
// name shows up as a new athlete rather than risking silently merging two
// different people. (normalizeAthleteName, imported above, is this same
// normalization — kept as one implementation per rule 3.)

router.post('/scrape-roster', authenticate, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { year } = req.body;
  const { spawn } = require('child_process');
  const path = require('path');
  const { parse } = require('csv-parse/sync');

  try {
    const team = req.user.team;
    const yearNum = parseInt(year, 10) || currentCalendarSeason();

    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
    const scriptPath = isRailway
      ? path.join(__dirname, '..', 'scrape_roster_playwright.js')
      : path.join(__dirname, '..', 'scrape_roster.py');

    const scraperProcess = isRailway
      ? spawn('node', [scriptPath, '--team_id', team.athleticTeamId, '--year', String(yearNum)])
      : spawn('python3', [scriptPath, '--team_id', team.athleticTeamId, '--year', String(yearNum)]);

    let csvData = '';
    let errorData = '';

    scraperProcess.stdout.on('data', (data) => { csvData += data.toString(); });
    scraperProcess.stderr.on('data', (data) => { errorData += data.toString(); });

    scraperProcess.on('error', (err) => {
      console.error('Failed to start roster scraper subprocess:', err.message);
      return res.status(500).json({ message: 'Failed to start roster scraper process.' });
    });

    scraperProcess.on('close', async (code) => {
      if (code !== 0) {
        console.error(`Roster scraper exited with code ${code}: ${errorData}`);
        return res.status(500).json({
          message: 'Failed to scrape the roster from Athletic.net. This page may not match what the scraper expects — check server logs for diagnostics.',
        });
      }

      try {
        const records = csvData.length > 0
          ? parse(csvData, { columns: true, skip_empty_lines: true, trim: true })
          : [];

        // A genuinely empty roster is indistinguishable from a scraper that
        // silently found nothing — treat zero rows as a failure rather than
        // flagging the entire existing roster for removal against nothing.
        if (records.length === 0) {
          console.error('Roster scraper returned zero athletes:', errorData);
          return res.status(502).json({
            message: 'Athletic.net returned no athletes for this roster — nothing was changed. This may mean the roster isn\'t published there yet, or the page structure changed.',
          });
        }

        const season = await prisma.season.upsert({
          where: { teamId_year_sport: { teamId: team.id, year: yearNum, sport: 'XC' } },
          update: {},
          create: { teamId: team.id, year: yearNum, sport: 'XC' },
        });

        // Match against every athlete this TEAM has ever had, not just this
        // season's roster — a returning athlete from a prior season already
        // has an Athlete row, and this season's SeasonRoster is often empty
        // (a brand-new season, which is exactly the preseason case this
        // exists for). Matching only within the season's own roster meant
        // every returning athlete looked "new" and hit the (team, name)
        // unique constraint on athlete creation.
        const [existingAthletes, existingRoster] = await Promise.all([
          prisma.athlete.findMany({ where: { teamId: team.id } }),
          prisma.seasonRoster.findMany({ where: { seasonId: season.id }, include: { athlete: true } }),
        ]);
        const athleteByName = new Map(existingAthletes.map((a) => [normalizeAthleteName(a.name), a]));
        const athleteByAthleticId = new Map(
          existingAthletes.filter((a) => a.athleticAthleteId).map((a) => [a.athleticAthleteId, a])
        );
        const rosterByAthleteId = new Map(existingRoster.map((r) => [r.athleteId, r]));

        const added = [];
        const reactivated = [];
        const updated = [];
        const matchedAthleteIds = new Set();

        for (const row of records) {
          const name = (row['Athlete Name'] || '').trim();
          if (!name) continue;

          const gradeNum = row.Grade ? parseInt(row.Grade, 10) : null;
          const graduationYear = Number.isFinite(gradeNum) ? deriveGraduationYear(gradeNum, yearNum) : null;
          const gender = normalizeGender(row.Gender);
          const athleticAthleteIdValue = row['Athletic Athlete ID'] || null;

          const existingAthlete = matchAthlete(
            { athleticAthleteId: athleticAthleteIdValue, name },
            { byAthleticId: athleteByAthleticId, byName: athleteByName }
          );

          let athleteId;
          if (existingAthlete) {
            athleteId = existingAthlete.id;
            const athleteUpdates = {};
            if (graduationYear !== null && existingAthlete.graduationYear !== graduationYear) {
              athleteUpdates.graduationYear = graduationYear;
            }
            if (gender && existingAthlete.gender !== gender) {
              athleteUpdates.gender = gender;
            }
            if (athleticAthleteIdValue && !existingAthlete.athleticAthleteId) {
              athleteUpdates.athleticAthleteId = athleticAthleteIdValue;
            }
            if (Object.keys(athleteUpdates).length > 0) {
              const updatedAthlete = await prisma.athlete.update({ where: { id: athleteId }, data: athleteUpdates });
              if (updatedAthlete.athleticAthleteId) athleteByAthleticId.set(updatedAthlete.athleticAthleteId, updatedAthlete);
            }
          } else {
            const created = await prisma.athlete.create({
              data: { teamId: team.id, name, gender, graduationYear, athleticAthleteId: athleticAthleteIdValue },
            });
            athleteId = created.id;
            athleteByName.set(normalizeAthleteName(created.name), created);
            if (created.athleticAthleteId) athleteByAthleticId.set(created.athleticAthleteId, created);
          }
          matchedAthleteIds.add(athleteId);

          const rosterEntry = rosterByAthleteId.get(athleteId);
          if (rosterEntry) {
            const wasInactiveOrFlagged = !rosterEntry.isActive || rosterEntry.flaggedForRemoval;
            await prisma.seasonRoster.update({
              where: { id: rosterEntry.id },
              data: {
                isActive: true,
                flaggedForRemoval: false,
                flaggedForRemovalAt: null,
                grade: Number.isFinite(gradeNum) ? gradeNum : rosterEntry.grade,
              },
            });
            if (wasInactiveOrFlagged) reactivated.push(name);
            else updated.push(name);
          } else {
            await prisma.seasonRoster.create({
              data: { seasonId: season.id, athleteId, grade: gradeNum, isActive: true },
            });
            added.push(name);
          }
        }

        const flaggedForRemoval = [];
        for (const entry of existingRoster) {
          if (entry.isActive && !matchedAthleteIds.has(entry.athleteId)) {
            await prisma.seasonRoster.update({
              where: { id: entry.id },
              data: { flaggedForRemoval: true, flaggedForRemovalAt: new Date() },
            });
            flaggedForRemoval.push(entry.athlete.name);
          }
        }

        res.status(200).json({
          success: true,
          season: yearNum,
          totalScraped: records.length,
          added,
          reactivated,
          updated,
          flaggedForRemoval,
          message: `Synced ${records.length} athletes from Athletic.net: ${added.length} added, ` +
            `${reactivated.length} reactivated, ${flaggedForRemoval.length} flagged for review.`,
        });
      } catch (error) {
        console.error('Error processing scraped roster:', error.message);
        res.status(500).json({ message: 'Failed to process scraped roster.' });
      }
    });
  } catch (error) {
    console.error('Error in scrape-roster endpoint:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /api/teams/seasons/:year/roster/:athleteId/clear-flag
// A coach's "keep them" review action: this athlete didn't match the last
// Athletic.net sync, but the coach knows they're still on the team (e.g. a
// name mismatch, or Athletic.net just hasn't been updated yet).
router.post('/seasons/:year/roster/:athleteId/clear-flag', authenticate, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const teamId = req.user.teamId;
  const year = parseInt(req.params.year, 10);

  try {
    const season = await prisma.season.findFirst({ where: { teamId, year } });
    if (!season) {
      return res.status(404).json({ message: 'Season not found.' });
    }

    const result = await prisma.seasonRoster.updateMany({
      where: { seasonId: season.id, athleteId: req.params.athleteId },
      data: { flaggedForRemoval: false, flaggedForRemovalAt: null },
    });
    if (result.count === 0) {
      return res.status(404).json({ message: 'Roster entry not found.' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing removal flag:', error.message);
    res.status(500).json({ message: 'Failed to update roster.' });
  }
});

// GET /api/teams/seasons
//
// Every season this team knows about — one it has results for, one the coach
// created but hasn't raced yet, or both. `hasData` is what lets the UI show a
// roster-only preseason differently from a season with races in the books,
// instead of treating "no results" as "nothing here".
router.get('/seasons', authenticate, requireTeam, async (req, res) => {
  const teamId = req.user.teamId;

  try {
    const [seasonRows, raceGroups, activeSeason] = await Promise.all([
      prisma.season.findMany({ where: { teamId }, orderBy: { year: 'desc' } }),
      prisma.race.groupBy({ by: ['season'], where: { teamId }, _count: { _all: true } }),
      resolveActiveSeason(teamId),
    ]);

    const raceCountByYear = new Map(raceGroups.map((g) => [g.season, g._count._all]));
    const years = [...new Set([...seasonRows.map((s) => s.year), ...raceCountByYear.keys()])].sort(
      (a, b) => b - a
    );

    const rosterCounts = await prisma.seasonRoster.groupBy({
      by: ['seasonId'],
      where: { seasonId: { in: seasonRows.map((s) => s.id) }, isActive: true },
      _count: { _all: true },
    });
    const rosterCountBySeasonId = new Map(rosterCounts.map((g) => [g.seasonId, g._count._all]));
    const seasonRowByYear = new Map(seasonRows.map((s) => [s.year, s]));

    const seasons = years.map((year) => {
      const row = seasonRowByYear.get(year);
      const raceCount = raceCountByYear.get(year) || 0;
      return {
        id: row?.id ?? null,
        year,
        name: `${year} Cross Country`,
        raceCount,
        rosterCount: row ? rosterCountBySeasonId.get(row.id) || 0 : 0,
        hasData: raceCount > 0,
        isActive: year === activeSeason,
      };
    });

    res.status(200).json(seasons);
  } catch (error) {
    console.error('Error fetching seasons:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// GET /api/teams/context
//
// One call that tells the client everything it needs to decide what to render
// before it renders anything: which season is active, what seasons exist, and
// crucially whether this team is set up at all. The app used to have no way to
// ask "is this a brand new team?", so first-run coaches were dropped straight
// into a dozen empty analytics screens.
router.get('/context', authenticate, requireTeam, async (req, res) => {
  const teamId = req.user.teamId;

  try {
    const [team, activeSeason, seasonsWithData, athleteCount, raceCount] = await Promise.all([
      prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true, athleticTeamId: true, currentSeason: true, joinCode: true },
      }),
      resolveActiveSeason(teamId),
      listSeasonsWithData(teamId),
      prisma.athlete.count({ where: { teamId } }),
      prisma.race.count({ where: { teamId } }),
    ]);

    const activeRosterSeason = await prisma.season.findFirst({
      where: { teamId, year: activeSeason },
      select: { id: true },
    });
    const activeRosterCount = activeRosterSeason
      ? await prisma.seasonRoster.count({
          where: { seasonId: activeRosterSeason.id, isActive: true },
        })
      : 0;
    const activeSeasonRaceCount = await prisma.race.count({
      where: { teamId, season: activeSeason },
    });

    res.json({
      team,
      activeSeason,
      calendarSeason: currentCalendarSeason(),
      seasonsWithData,
      totals: { athletes: athleteCount, races: raceCount },
      activeSeasonSummary: {
        season: activeSeason,
        rosterCount: activeRosterCount,
        raceCount: activeSeasonRaceCount,
        // A roster but no races = preseason, which is a real state to show,
        // not an error and not an empty dashboard.
        isPreseason: activeRosterCount > 0 && activeSeasonRaceCount === 0,
      },
      setup: {
        hasAthleticTeamId: Boolean(team?.athleticTeamId),
        hasRoster: athleteCount > 0,
        hasResults: raceCount > 0,
        isComplete: Boolean(team?.athleticTeamId) && athleteCount > 0 && raceCount > 0,
      },
    });
  } catch (error) {
    console.error('Error building team context:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /api/teams/seasons/:year/start
//
// Roll the roster forward into a new season. This is the operation the app was
// missing entirely: last year's seniors age out of the active roster, everyone
// else moves up a grade, and nothing is deleted — results stay attached to the
// athletes forever, so graduated runners still appear in trends, career
// progressions and past-season views.
router.post('/seasons/:year/start', authenticate, requireRole(['HEAD_COACH']), async (req, res) => {
  const teamId = req.user.teamId;
  const targetYear = parseInt(req.params.year, 10);
  const { fromSeason, activate = true } = req.body || {};

  if (!Number.isFinite(targetYear)) {
    return res.status(400).json({ message: 'A valid season year is required.' });
  }

  try {
    // Where are we carrying the roster from? The most recent season before
    // the target that actually has people in it.
    let sourceYear = parseInt(fromSeason, 10);
    if (!Number.isFinite(sourceYear)) {
      const priorSeasons = await prisma.season.findMany({
        where: { teamId, year: { lt: targetYear } },
        orderBy: { year: 'desc' },
        select: { year: true },
      });
      const priorWithData = (await listSeasonsWithData(teamId)).filter((y) => y < targetYear);
      sourceYear = priorSeasons[0]?.year ?? priorWithData[0] ?? null;
    }

    const targetSeason = await prisma.season.upsert({
      where: { teamId_year_sport: { teamId, year: targetYear, sport: 'XC' } },
      update: {},
      create: { teamId, year: targetYear, sport: 'XC' },
    });

    // Candidates: whoever was on the source roster, plus anyone who raced
    // that season (covers teams whose history came in via import only).
    let candidateIds = [];
    if (Number.isFinite(sourceYear)) {
      const sourceSeason = await prisma.season.findFirst({
        where: { teamId, year: sourceYear },
        select: { id: true },
      });
      const [rosterRows, resultRows] = await Promise.all([
        sourceSeason
          ? prisma.seasonRoster.findMany({
              where: { seasonId: sourceSeason.id, isActive: true },
              select: { athleteId: true },
            })
          : [],
        prisma.result.findMany({
          where: { teamId, race: { season: sourceYear } },
          select: { athleteId: true },
          distinct: ['athleteId'],
        }),
      ]);
      candidateIds = [
        ...new Set([...rosterRows.map((r) => r.athleteId), ...resultRows.map((r) => r.athleteId)]),
      ];
    }

    const candidates = await prisma.athlete.findMany({
      where: { id: { in: candidateIds }, teamId },
      select: { id: true, name: true, graduationYear: true },
    });

    const carried = [];
    const graduated = [];
    const unknownGradYear = [];

    for (const athlete of candidates) {
      if (!Number.isFinite(athlete.graduationYear)) {
        // No graduation year means we can't know if they aged out. Surface
        // them rather than silently guessing in either direction.
        unknownGradYear.push({ id: athlete.id, name: athlete.name });
        continue;
      }
      if (isEnrolled(athlete.graduationYear, targetYear)) {
        const grade = deriveGrade(athlete.graduationYear, targetYear);
        await prisma.seasonRoster.upsert({
          where: { seasonId_athleteId: { seasonId: targetSeason.id, athleteId: athlete.id } },
          update: { grade, isActive: true },
          create: { seasonId: targetSeason.id, athleteId: athlete.id, grade, isActive: true },
        });
        carried.push({ id: athlete.id, name: athlete.name, grade });
      } else {
        graduated.push({
          id: athlete.id,
          name: athlete.name,
          graduationYear: athlete.graduationYear,
        });
      }
    }

    if (activate) {
      await prisma.season.updateMany({
        where: { teamId, sport: 'XC', id: { not: targetSeason.id } },
        data: { isActive: false },
      });
      await prisma.season.update({ where: { id: targetSeason.id }, data: { isActive: true } });
      await prisma.team.update({ where: { id: teamId }, data: { currentSeason: targetYear } });
    }

    res.json({
      success: true,
      season: targetYear,
      fromSeason: Number.isFinite(sourceYear) ? sourceYear : null,
      carriedCount: carried.length,
      graduatedCount: graduated.length,
      carried,
      graduated,
      needsReview: unknownGradYear,
      message: Number.isFinite(sourceYear)
        ? `Started ${targetYear}: carried ${carried.length} returning athletes, ${graduated.length} graduated.`
        : `Started ${targetYear} with an empty roster.`,
    });
  } catch (error) {
    console.error('Error starting season:', error.message);
    res.status(500).json({ message: 'Failed to start season.' });
  }
});

// GET /api/teams/results-grid
router.get('/results-grid', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const { seasons, grades } = req.query;

    if (!seasons) {
      return res.status(400).json({ message: 'Seasons parameter is required' });
    }

    const seasonsArray = seasons
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((s) => !isNaN(s));
    const gradesArray = grades
      ? grades
          .split(',')
          .map((g) => parseInt(g.trim(), 10))
          .filter((g) => !isNaN(g) && g > 0)
      : [];

    if (seasonsArray.length === 0) {
      return res.status(400).json({ message: 'Invalid seasons format' });
    }

    const races = await prisma.race.findMany({
      where: { teamId, season: { in: seasonsArray } },
      select: { id: true, name: true, date: true, season: true },
      orderBy: { date: 'asc' },
    });

    const raceHeaders = races.map((r) => ({ raceId: r.id, name: r.name }));
    const raceIds = races.map((r) => r.id);

    if (raceIds.length === 0) {
      return res.json({ races: [], athletes: [] });
    }

    const results = await prisma.result.findMany({
      where: {
        teamId,
        raceId: { in: raceIds },
        ...(gradesArray.length > 0 ? { grade: { in: gradesArray } } : {}),
      },
      select: {
        id: true,
        time: true,
        grade: true,
        raceId: true,
        athlete: { select: { id: true, name: true, gender: true } },
      },
    });

    const athleteMap = new Map();
    results.forEach((result) => {
      if (!result.athlete) return;
      const athleteId = result.athlete.id;
      if (!athleteMap.has(athleteId)) {
        athleteMap.set(athleteId, {
          athleteId,
          name: result.athlete.name,
          grade: result.grade,
          gender: result.athlete.gender || '',
          resultsByRace: new Map(),
        });
      }
      athleteMap.get(athleteId).resultsByRace.set(result.raceId, result.time);
    });

    const gridData = Array.from(athleteMap.values())
      .map((athlete) => ({
        athleteId: athlete.athleteId,
        name: athlete.name,
        grade: athlete.grade,
        gender: athlete.gender,
        results: raceHeaders.map((h) => athlete.resultsByRace.get(h.raceId) || null),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ races: raceHeaders.map((h) => h.name), athletes: gridData });
  } catch (error) {
    console.error('Error fetching results grid:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Team & roster management
//
// These are the "run the program" operations, as opposed to the analytics
// reads above. Several of them are called by the existing UI but never
// actually existed on the server (saving team settings 404'd), which is the
// clearest sign that management was bolted on after the analytics.
//
// NOTE: parameterised routes are declared last on purpose — `/:id` would
// otherwise shadow `/seasons`, `/context` and `/current`.
// ---------------------------------------------------------------------------

// POST /api/teams/seasons/:year/roster — add or restore an athlete
router.post('/seasons/:year/roster', authenticate, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const teamId = req.user.teamId;
  const year = parseInt(req.params.year, 10);
  const { athleteId, grade } = req.body || {};

  if (!Number.isFinite(year) || !athleteId) {
    return res.status(400).json({ message: 'A valid season year and athleteId are required.' });
  }

  try {
    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId } });
    if (!athlete) {
      return res.status(404).json({ message: 'Athlete not found on this team.' });
    }

    const season = await prisma.season.upsert({
      where: { teamId_year_sport: { teamId, year, sport: 'XC' } },
      update: {},
      create: { teamId, year, sport: 'XC' },
    });

    const resolvedGrade = Number.isFinite(parseInt(grade, 10))
      ? parseInt(grade, 10)
      : deriveGrade(athlete.graduationYear, year);

    // Adding someone to a season is also the moment to fix their graduation
    // year if the coach supplied a grade — otherwise the two disagree.
    if (Number.isFinite(parseInt(grade, 10))) {
      await prisma.athlete.update({
        where: { id: athlete.id },
        data: { graduationYear: deriveGraduationYear(grade, year) },
      });
    }

    const entry = await prisma.seasonRoster.upsert({
      where: { seasonId_athleteId: { seasonId: season.id, athleteId } },
      update: { isActive: true, grade: resolvedGrade },
      create: { seasonId: season.id, athleteId, grade: resolvedGrade, isActive: true },
    });

    res.json({ success: true, season: year, entry });
  } catch (error) {
    console.error('Error adding athlete to roster:', error.message);
    res.status(500).json({ message: 'Failed to update roster.' });
  }
});

// DELETE /api/teams/seasons/:year/roster/:athleteId
// Deactivates the roster entry rather than deleting it: the athlete's results
// for the season must survive being taken off the roster.
router.delete('/seasons/:year/roster/:athleteId', authenticate, requireRole(['HEAD_COACH']), async (req, res) => {
  const teamId = req.user.teamId;
  const year = parseInt(req.params.year, 10);

  try {
    const season = await prisma.season.findFirst({ where: { teamId, year } });
    if (!season) {
      return res.status(404).json({ message: 'Season not found.' });
    }

    await prisma.seasonRoster.updateMany({
      where: { seasonId: season.id, athleteId: req.params.athleteId },
      data: { isActive: false },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing athlete from roster:', error.message);
    res.status(500).json({ message: 'Failed to update roster.' });
  }
});

// PUT /api/teams/:id — team settings.
// The Settings screen has always called this endpoint; it never existed.
router.put('/:id', authenticate, requireRole(['HEAD_COACH']), async (req, res) => {
  const teamId = req.user.teamId;
  const { name, athleticTeamId, current_season: currentSeason } = req.body || {};

  if (req.params.id !== teamId) {
    return res.status(403).json({ message: 'You can only update your own team.' });
  }

  try {
    if (athleticTeamId) {
      const clash = await prisma.team.findFirst({
        where: { athleticTeamId: String(athleticTeamId), id: { not: teamId } },
        select: { id: true },
      });
      if (clash) {
        return res
          .status(409)
          .json({ message: 'Another team is already using this Athletic.net Team ID.' });
      }
    }

    const updates = {};
    if (name) updates.name = name;
    if (athleticTeamId) updates.athleticTeamId = String(athleticTeamId);
    if (currentSeason !== undefined && Number.isFinite(parseInt(currentSeason, 10))) {
      updates.currentSeason = parseInt(currentSeason, 10);
    }

    const team = await prisma.team.update({ where: { id: teamId }, data: updates });
    res.json(team);
  } catch (error) {
    console.error('Error updating team:', error.message);
    res.status(500).json({ message: 'Failed to update team.' });
  }
});

// DELETE /api/teams/:athleticTeamId/results — clear imported race data.
// Athletes and roster membership survive; only results/races are removed, so
// the team you manage isn't destroyed by clearing data you imported.
router.delete('/:athleticTeamId/results', authenticate, requireRole(['HEAD_COACH']), async (req, res) => {
  const teamId = req.user.teamId;
  const { season } = req.query;

  try {
    if (String(req.user.team?.athleticTeamId) !== String(req.params.athleticTeamId)) {
      return res.status(403).json({ message: 'You can only clear data for your own team.' });
    }

    const seasonFilter = Number.isFinite(parseInt(season, 10))
      ? { season: parseInt(season, 10) }
      : {};

    const races = await prisma.race.findMany({
      where: { teamId, ...seasonFilter },
      select: { id: true },
    });
    const raceIds = races.map((r) => r.id);

    if (raceIds.length > 0) {
      await prisma.result.deleteMany({ where: { raceId: { in: raceIds } } });
      await prisma.race.deleteMany({ where: { id: { in: raceIds } } });
    }

    const remaining = await listSeasonsWithData(teamId);
    await prisma.team.update({
      where: { id: teamId },
      data: { importedSeasons: remaining },
    });

    res.json({ success: true, clearedRaces: raceIds.length });
  } catch (error) {
    console.error('Error clearing team results:', error.message);
    res.status(500).json({ message: 'Failed to clear team data.' });
  }
});

module.exports = router;
