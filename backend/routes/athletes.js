const express = require('express');
const router = express.Router();
const { parse } = require('csv-parse/sync');
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole, requireLinkedAthlete } = require('../middleware/auth');
const { DESTRUCTIVE, FULL_COACH } = require('../lib/teamRoles');
const {
  resolveActiveSeason,
  deriveGrade,
  deriveGraduationYear,
  isEnrolled,
  hasGraduated,
} = require('../lib/season');
const { normalizeGender } = require('../lib/gender');
const { decideCanAcceptAthleteInvite } = require('../lib/athleteInvites');
const { sendEmail } = require('../lib/email');
const { requireActivePlan } = require('../lib/entitlements');
const calculationService = require('../services/performance/calculationService');
const { parseRosterCsv } = require('../lib/rosterCsv');
const { matchAthlete, normalizeAthleteName } = require('../lib/athleteMatching');
const { validateImportRequest } = require('../lib/trainingLogImport');
const { planDedup } = require('../lib/athleteMerge');

// www, not the apex — the apex leadpack.cc has no DNS record pointed at
// the app, so bare-domain invite links 404 at the DNS level before ever
// reaching the server.
const FRONTEND_URL = process.env.FRONTEND_URL
  || (process.env.NODE_ENV === 'production' ? 'https://www.leadpack.cc' : 'http://localhost:5173');

// GET /api/athletes?season=&activeOnly=&search=
//
// Returns the roster for a season. "Roster" has a specific meaning here:
//
//   * If the coach has an explicit SeasonRoster for that season, that IS the
//     roster — even if nobody has raced yet. This is what makes a new season
//     with no results still show a full team instead of an empty screen.
//   * Otherwise the roster is inferred: anyone who raced that season, plus
//     anyone still enrolled (grades 9-12) by graduation year.
//
// Grade is always derived for the requested season, never read off the
// athlete record, so looking at 2024 shows 2024 grades even after a 2025
// import has happened.
router.get('/', authenticate, requireTeam, async (req, res) => {
  const { season, activeOnly, search } = req.query;
  const teamId = req.user.teamId;

  try {
    const seasonYear = await resolveActiveSeason(teamId, season);
    const onlyActive = String(activeOnly ?? 'true').toLowerCase() !== 'false';

    const athletes = await prisma.athlete.findMany({
      where: {
        teamId,
        ...(search && search.trim() !== '' ? { name: { contains: search.trim(), mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });

    const results = await prisma.result.findMany({
      where: { teamId, athleteId: { in: athletes.map((a) => a.id) }, race: { season: seasonYear } },
      include: { race: true },
    });

    const resultMap = new Map();
    results.forEach((result) => {
      if (!resultMap.has(result.athleteId)) resultMap.set(result.athleteId, []);
      resultMap.get(result.athleteId).push(result);
    });

    // An explicit roster for this season, if the coach has one.
    const seasonRow = await prisma.season.findFirst({
      where: { teamId, year: seasonYear },
      select: { id: true },
    });
    const rosterEntries = seasonRow
      ? await prisma.seasonRoster.findMany({ where: { seasonId: seasonRow.id } })
      : [];
    const rosterById = new Map(rosterEntries.map((entry) => [entry.athleteId, entry]));
    const hasExplicitRoster = rosterEntries.length > 0;

    // Invite status per athlete — lets the roster UI show "Invited" /
    // "Accepted" without a separate request per row.
    const invites = await prisma.athleteInvite.findMany({
      where: { athleteId: { in: athletes.map((a) => a.id) } },
    });
    const inviteByAthleteId = new Map(invites.map((i) => [i.athleteId, i]));

    const enriched = athletes.map((a) => {
      const races = resultMap.get(a.id) || [];
      const rosterEntry = rosterById.get(a.id);
      const invite = inviteByAthleteId.get(a.id);
      // Prefer the grade recorded on the roster (a coach may have corrected
      // it); otherwise derive it from the stable graduation year.
      const grade = rosterEntry?.grade ?? deriveGrade(a.graduationYear, seasonYear);
      return {
        ...a,
        // Old imports/scrapes wrote raw values like 'Men'/'Women' before
        // write-time normalization existed — normalize on read too so
        // already-bad rows don't vanish from gender-split views (Groups).
        gender: normalizeGender(a.gender),
        grade,
        races,
        raceCount: races.length,
        graduated: hasGraduated(a.graduationYear, seasonYear),
        onRoster: hasExplicitRoster
          ? Boolean(rosterEntry && rosterEntry.isActive)
          : races.length > 0 || isEnrolled(a.graduationYear, seasonYear),
        // Set by a roster sync (routes/teams.js POST /scrape-roster) when
        // this athlete no longer appears on Athletic.net — a review signal
        // for the coach, never an automatic removal.
        flaggedForRemoval: Boolean(rosterEntry?.flaggedForRemoval),
        // Truthy exactly when this roster row is linked to an account —
        // matches the roster UI's `if (athlete.user)` check.
        user: a.userId || undefined,
        invite: invite
          ? { status: invite.status, email: invite.email, sentAt: invite.createdAt, acceptedAt: invite.acceptedAt }
          : undefined,
        // T1: captain designation lives on the per-season SeasonRoster row.
        // seasonId is included so the roster UI can call
        // PATCH /api/seasons/:id/roster/:athleteId without a second request
        // just to look up which season it's looking at.
        isCaptain: Boolean(rosterEntry?.isCaptain),
        captainNotes: rosterEntry?.captainNotes ?? null,
        seasonId: seasonRow?.id ?? null,
      };
    });

    const filtered = onlyActive ? enriched.filter((a) => a.onRoster || a.raceCount > 0) : enriched;

    res.json(filtered);
  } catch (error) {
    console.error('Error in GET /athletes:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.get('/:athleteId', authenticate, requireTeam, async (req, res) => {
  const { season } = req.query;

  try {
    const athlete = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
    });

    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    const seasonYear = await resolveActiveSeason(req.user.teamId, season);

    const results = await prisma.result.findMany({
      where: { athleteId: athlete.id, race: { season: seasonYear } },
      include: { race: true },
    });

    const sortedResults = results.sort((a, b) => new Date(a.race?.date || 0) - new Date(b.race?.date || 0));

    res.json({
      ...athlete,
      gender: normalizeGender(athlete.gender),
      grade: deriveGrade(athlete.graduationYear, seasonYear),
      season: seasonYear,
      results: sortedResults,
    });
  } catch (error) {
    console.error('Error in GET /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/athletes/:athleteId/races?limit=5
//
// An athlete's most recent races, across all seasons — the VDOT/performance
// calculator seeds its predictions from whichever race the coach picks here.
// This endpoint didn't exist; the frontend called it unconditionally, so
// every request 404'd (compounding a separate bug where the athlete picker
// couldn't identify a specific athlete at all — see the `id` fix on the
// frontend). Distance is returned in miles, matching what the calculator's
// Riegel's-formula code expects.
router.get('/:athleteId/races', authenticate, requireTeam, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 5, 25);

  try {
    const athlete = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
    });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    const results = await prisma.result.findMany({
      where: { athleteId: athlete.id, status: 'FINISHED', time: { gt: 0 } },
      include: { race: true },
      orderBy: { race: { date: 'desc' } },
      take: limit,
    });

    const races = results
      .filter((r) => r.race && r.race.distanceMeters)
      .map((r) => ({
        id: r.id,
        // T5: race reflections key off the Race, not the Result — this
        // endpoint only ever returned Result.id before, which race
        // reflections have no use for. Purely additive field, existing
        // consumers (the VDOT calculator) only ever read the fields above.
        raceId: r.race.id,
        raceName: r.race.name,
        date: r.race.date,
        distance: r.race.distanceMeters / 1609.34,
        time: r.time,
      }));

    res.json(races);
  } catch (error) {
    console.error('Error in GET /athletes/:athleteId/races:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/athletes
// Accepts either an explicit graduationYear or a grade + season to derive it
// from — coaches think in grades ("she's a sophomore"), the data model thinks
// in graduation years, so translate at the edge rather than storing the grade.
router.post('/', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { firstName, lastName, name, preferredName, graduationYear, grade, season, gender } = req.body;
  const teamId = req.user.teamId;

  const fullName = (name || [firstName, lastName].filter(Boolean).join(' ')).trim();
  if (!fullName) {
    return res.status(400).json({ msg: 'Athlete name is required' });
  }

  try {
    const seasonYear = await resolveActiveSeason(teamId, season);
    const gradYear = graduationYear
      ? parseInt(graduationYear, 10)
      : deriveGraduationYear(grade, seasonYear);

    // No same-name rejection here (Build Spec Phase 2 step 5): a 120-person
    // roster having two "Jack Smith"s is normal, and athletes(team_id, name)
    // is no longer a unique constraint the database would enforce anyway.

    const athlete = await prisma.athlete.create({
      data: {
        teamId,
        name: fullName,
        preferredName: preferredName?.trim() || null,
        graduationYear: gradYear,
        gender: normalizeGender(gender),
      },
    });

    // Put the new athlete on the season roster straight away, so adding
    // someone mid-preseason (before any results exist) actually shows up.
    if (gradYear !== null && isEnrolled(gradYear, seasonYear)) {
      const seasonRow = await prisma.season.upsert({
        where: { teamId_year_sport: { teamId, year: seasonYear, sport: 'XC' } },
        update: {},
        create: { teamId, year: seasonYear, sport: 'XC' },
      });
      await prisma.seasonRoster.upsert({
        where: { seasonId_athleteId: { seasonId: seasonRow.id, athleteId: athlete.id } },
        update: { isActive: true, grade: deriveGrade(gradYear, seasonYear) },
        create: {
          seasonId: seasonRow.id,
          athleteId: athlete.id,
          grade: deriveGrade(gradYear, seasonYear),
          isActive: true,
        },
      });
    }

    // A new athlete changes the roster calculateAllMetrics derives its
    // grade/gender breakdowns from, even before they've raced — same
    // fire-and-forget trigger every other roster-affecting write uses.
    calculationService
      .calculateAllMetrics(teamId, seasonYear)
      .catch((calcError) => console.error(`Error recalculating metrics after adding athlete for season ${seasonYear}:`, calcError.message));

    res.status(201).json({ ...athlete, grade: deriveGrade(gradYear, seasonYear) });
  } catch (error) {
    console.error('Error in POST /athletes:', error.message);
    res.status(500).json({ msg: 'Error creating athlete' });
  }
});

// POST /api/athletes/import-roster
//
// For the athletes an Athletic.net scrape can't see: freshmen with no
// race history yet, or anyone the team hasn't gotten around to adding to
// Athletic.net at all — common in preseason, since a roster more often
// comes from FinalForms or a plain sheet before Athletic.net has
// anything on it. Reconciles against every athlete already on this team
// (from a prior Athletic.net import OR a prior roster-CSV import) using
// the exact same name/athleticAthleteId matching the scraper uses
// (lib/athleteMatching.js) — a matched row only ever backfills a field
// that's currently null, same "never overwrite what the scraper already
// verified" rule /scrape-roster follows for athleticAthleteId. Never
// writes athleticAthleteId itself (this source has no such id) or the
// deprecated Athlete.grade column — grade is per-season, on SeasonRoster.
router.post('/import-roster', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { season, csvData } = req.body;
  const teamId = req.user.teamId;
  const seasonYear = parseInt(season, 10);

  if (!Number.isFinite(seasonYear)) {
    return res.status(400).json({ msg: 'A valid season is required.' });
  }
  if (!csvData || typeof csvData !== 'string') {
    return res.status(400).json({ msg: 'csvData is required.' });
  }

  let rows;
  try {
    rows = parse(csvData, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    return res.status(400).json({ msg: `Could not parse CSV: ${err.message}` });
  }

  const { athletes: parsedRows, errors: parseErrors, skipped: parseSkipped } = parseRosterCsv(rows);

  if (parsedRows.length === 0) {
    return res.status(400).json({
      msg: 'No valid rows to import.',
      imported: 0,
      matched: 0,
      skipped: parseSkipped,
      warnings: parseErrors,
    });
  }

  try {
    const seasonRow = await prisma.season.upsert({
      where: { teamId_year_sport: { teamId, year: seasonYear, sport: 'XC' } },
      update: {},
      create: { teamId, year: seasonYear, sport: 'XC' },
    });

    const existingAthletes = await prisma.athlete.findMany({ where: { teamId } });
    const athleteByAthleticId = new Map(existingAthletes.filter((a) => a.athleticAthleteId).map((a) => [a.athleticAthleteId, a]));
    const athleteByName = new Map(existingAthletes.map((a) => [normalizeAthleteName(a.name), a]));

    let imported = 0;
    let matched = 0;
    const warnings = [...parseErrors];

    await prisma.$transaction(async (tx) => {
      for (const row of parsedRows) {
        const genderValue = row.genderRaw ? normalizeGender(row.genderRaw) : null;
        // Whichever the row gave (Grade or Graduation Year), derive the
        // other side of the same relationship — same round-trip
        // /scrape-roster uses (teams.js).
        const graduationYear = row.graduationYear ?? (row.grade != null ? deriveGraduationYear(row.grade, seasonYear) : null);
        const seasonGrade = row.grade ?? (row.graduationYear != null ? deriveGrade(row.graduationYear, seasonYear) : null);

        // No athleticAthleteId on a CSV row — matching falls through to
        // name only, exactly as it does for any athlete without one.
        const existing = matchAthlete({ athleticAthleteId: null, name: row.name }, { byAthleticId: athleteByAthleticId, byName: athleteByName });

        let athlete;
        if (existing) {
          const updates = {};
          if (genderValue && !existing.gender) updates.gender = genderValue;
          if (graduationYear != null && existing.graduationYear == null) updates.graduationYear = graduationYear;
          if (row.preferredName && !existing.preferredName) updates.preferredName = row.preferredName;
          athlete = Object.keys(updates).length > 0 ? await tx.athlete.update({ where: { id: existing.id }, data: updates }) : existing;
          matched++;
        } else {
          athlete = await tx.athlete.create({ data: { teamId, name: row.name, preferredName: row.preferredName || null, gender: genderValue, graduationYear } });
          imported++;
        }

        // Seed the maps so later rows in the same file match this athlete
        // instead of creating a duplicate — same as the scraper's own loop.
        athleteByName.set(normalizeAthleteName(athlete.name), athlete);
        if (athlete.athleticAthleteId) athleteByAthleticId.set(athlete.athleticAthleteId, athlete);

        await tx.seasonRoster.upsert({
          where: { seasonId_athleteId: { seasonId: seasonRow.id, athleteId: athlete.id } },
          update: { grade: seasonGrade, isActive: true },
          create: { seasonId: seasonRow.id, athleteId: athlete.id, grade: seasonGrade, isActive: true },
        });
      }
    });

    calculationService
      .calculateAllMetrics(teamId, seasonYear)
      .catch((calcError) => console.error(`Error recalculating metrics after roster import for season ${seasonYear}:`, calcError.message));

    res.status(201).json({
      msg: `Imported ${imported} new athlete${imported === 1 ? '' : 's'}, matched ${matched} already on the team.`,
      imported,
      matched,
      skipped: parseSkipped,
      warnings,
    });
  } catch (error) {
    console.error('Error importing roster:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

router.put('/:athleteId', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { firstName, lastName, name, preferredName, graduationYear, grade, season, gender } = req.body;
  const teamId = req.user.teamId;

  try {
    const existing = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId },
    });

    if (!existing) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    const seasonYear = await resolveActiveSeason(teamId, season);

    const updates = {};
    const fullName = (name || [firstName, lastName].filter(Boolean).join(' ')).trim();
    if (fullName) updates.name = fullName;
    // Present-but-empty clears it back to "no nickname" — same explicit-
    // presence convention as graduationYear just below.
    if (preferredName !== undefined) updates.preferredName = preferredName?.trim() || null;
    if (gender) updates.gender = normalizeGender(gender) ?? undefined;

    // Correcting a grade means correcting the graduation year it implies —
    // that keeps every other season's view of this athlete consistent.
    if (graduationYear !== undefined) {
      updates.graduationYear = graduationYear ? parseInt(graduationYear, 10) : null;
    } else if (grade !== undefined) {
      updates.graduationYear = deriveGraduationYear(grade, seasonYear);
    }

    const athlete = await prisma.athlete.update({ where: { id: existing.id }, data: updates });

    // Only gender/graduationYear feed calculationService's breakdowns —
    // a bare name edit doesn't need a recompute.
    if ('gender' in updates || 'graduationYear' in updates) {
      calculationService
        .calculateAllMetrics(teamId, seasonYear)
        .catch((calcError) => console.error(`Error recalculating metrics after editing athlete for season ${seasonYear}:`, calcError.message));
    }

    res.json({ ...athlete, grade: deriveGrade(athlete.graduationYear, seasonYear) });
  } catch (error) {
    console.error('Error in PUT /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Error updating athlete' });
  }
});

router.delete('/:athleteId', authenticate, requireTeam, requireRole(DESTRUCTIVE), async (req, res) => {
  const teamId = req.user.teamId;
  try {
    const existing = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId },
    });

    if (!existing) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    // The athlete's own AthleteSeasonMetrics rows cascade-delete with them
    // (schema FK), but TeamSeasonMetrics (team-wide totals/averages) has no
    // FK to Athlete at all — it would keep counting this athlete's results
    // in the team's numbers forever otherwise. Read which seasons they
    // actually raced in before the delete cascades their Results away.
    const seasonsRaced = await prisma.result.findMany({
      where: { athleteId: existing.id },
      select: { race: { select: { season: true } } },
    });
    const affectedSeasons = [...new Set(seasonsRaced.map((r) => r.race.season))];

    await prisma.athlete.delete({ where: { id: existing.id } });

    for (const season of affectedSeasons) {
      calculationService
        .calculateAllMetrics(teamId, season)
        .catch((calcError) => console.error(`Error recalculating metrics after deleting athlete for season ${season}:`, calcError.message));
    }

    res.json({ msg: 'Athlete deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /athletes/:athleteId:', error.message);
    res.status(500).json({ msg: 'Error deleting athlete' });
  }
});

// POST /api/athletes/merge
//
// Consolidates two Athlete rows that turned out to be the same real
// person — nothing in the schema prevents this from happening (no unique
// constraint on (teamId, name), see the Athlete model's own comment), so
// recovering from it has to actually work, not just avoid crashing.
// `keeperId` survives; every row across the schema that references
// `loserId` is either re-pointed to keeperId, or — where the keeper
// already has a row for the same key (same race, same season, same
// interval session, ...) — deliberately left on the loser to be swept
// away by the final cascade delete, never silently duplicated and never
// silently overwriting the keeper's own row. See lib/athleteMerge.js's
// header comment for why every table needs this explicit treatment:
// every one of them uses onDelete: Cascade, so anything not re-pointed
// is destroyed the instant the loser Athlete row is deleted — not
// blocked by a constraint, just gone.
//
// Head-coach-only — comparable in blast radius to Clear Team Data
// (routes/teams.js), not a routine roster edit.
router.post('/merge', authenticate, requireTeam, requireRole(DESTRUCTIVE), async (req, res) => {
  const { keeperId, loserId } = req.body;
  const teamId = req.user.teamId;

  if (!keeperId || !loserId) {
    return res.status(400).json({ msg: 'keeperId and loserId are required.' });
  }
  if (keeperId === loserId) {
    return res.status(400).json({ msg: 'Cannot merge an athlete with themselves.' });
  }

  try {
    const [keeper, loser] = await Promise.all([
      prisma.athlete.findFirst({ where: { id: keeperId, teamId } }),
      prisma.athlete.findFirst({ where: { id: loserId, teamId } }),
    ]);
    if (!keeper || !loser) {
      return res.status(404).json({ msg: 'One or both athletes were not found on this team.' });
    }
    // Athlete.userId is unique — if both are linked to DIFFERENT accounts,
    // that's a real conflict (two logins each claiming to be this
    // person) this endpoint refuses to silently resolve one way.
    if (keeper.userId && loser.userId && keeper.userId !== loser.userId) {
      return res.status(409).json({
        msg: 'Both athletes have a different linked account. Unlink one first before merging.',
      });
    }

    // TeamSeasonMetrics has no Athlete FK at all — it never auto-
    // recomputes, so read which seasons either athlete actually raced in
    // before anything moves (same pattern DELETE /:athleteId already
    // uses just above).
    const [keeperResultRaces, loserResultRaces] = await Promise.all([
      prisma.result.findMany({ where: { athleteId: keeperId }, select: { race: { select: { season: true } } } }),
      prisma.result.findMany({ where: { athleteId: loserId }, select: { race: { select: { season: true } } } }),
    ]);
    const affectedSeasons = [...new Set([...keeperResultRaces, ...loserResultRaces].map((r) => r.race.season))];

    await prisma.$transaction(async (tx) => {
      // GuardianLink — @@unique([userId, athleteId]); dedupe key: userId.
      const [keeperGuardianLinks, loserGuardianLinks] = await Promise.all([
        tx.guardianLink.findMany({ where: { athleteId: keeperId } }),
        tx.guardianLink.findMany({ where: { athleteId: loserId } }),
      ]);
      const guardianPlan = planDedup(keeperGuardianLinks, loserGuardianLinks, (r) => r.userId);
      if (guardianPlan.repoint.length > 0) {
        await tx.guardianLink.updateMany({ where: { id: { in: guardianPlan.repoint.map((r) => r.id) } }, data: { athleteId: keeperId } });
      }

      // AthleteInvite — athleteId itself is unique (at most one per athlete).
      const [keeperInvite, loserInvite] = await Promise.all([
        tx.athleteInvite.findUnique({ where: { athleteId: keeperId } }),
        tx.athleteInvite.findUnique({ where: { athleteId: loserId } }),
      ]);
      if (loserInvite && !keeperInvite) {
        await tx.athleteInvite.update({ where: { id: loserInvite.id }, data: { athleteId: keeperId } });
      }

      // AthleteClaim — @@unique([athleteId, userId]); dedupe key: userId.
      const [keeperClaims, loserClaims] = await Promise.all([
        tx.athleteClaim.findMany({ where: { athleteId: keeperId } }),
        tx.athleteClaim.findMany({ where: { athleteId: loserId } }),
      ]);
      const claimPlan = planDedup(keeperClaims, loserClaims, (r) => r.userId);
      if (claimPlan.repoint.length > 0) {
        await tx.athleteClaim.updateMany({ where: { id: { in: claimPlan.repoint.map((r) => r.id) } }, data: { athleteId: keeperId } });
      }

      // TrainingLog — no unique constraint on athleteId; plain repoint.
      await tx.trainingLog.updateMany({ where: { athleteId: loserId }, data: { athleteId: keeperId } });

      // RaceReflection — @@unique([athleteId, raceId]); dedupe key: raceId.
      const [keeperReflections, loserReflections] = await Promise.all([
        tx.raceReflection.findMany({ where: { athleteId: keeperId } }),
        tx.raceReflection.findMany({ where: { athleteId: loserId } }),
      ]);
      const reflectionPlan = planDedup(keeperReflections, loserReflections, (r) => r.raceId);
      if (reflectionPlan.repoint.length > 0) {
        await tx.raceReflection.updateMany({ where: { id: { in: reflectionPlan.repoint.map((r) => r.id) } }, data: { athleteId: keeperId } });
      }

      // MeetEntry — @@unique([raceId, athleteId]); dedupe key: raceId.
      const [keeperEntries, loserEntries] = await Promise.all([
        tx.meetEntry.findMany({ where: { athleteId: keeperId } }),
        tx.meetEntry.findMany({ where: { athleteId: loserId } }),
      ]);
      const entryPlan = planDedup(keeperEntries, loserEntries, (r) => r.raceId);
      if (entryPlan.repoint.length > 0) {
        await tx.meetEntry.updateMany({ where: { id: { in: entryPlan.repoint.map((r) => r.id) } }, data: { athleteId: keeperId } });
      }

      // Result — @@unique([athleteId, raceId]); dedupe key: raceId. The
      // table that matters most (race history) — its repointed ids feed
      // the RaceSplit step right after.
      const [keeperResultRows, loserResultRows] = await Promise.all([
        tx.result.findMany({ where: { athleteId: keeperId }, select: { id: true, raceId: true } }),
        tx.result.findMany({ where: { athleteId: loserId }, select: { id: true, raceId: true } }),
      ]);
      const resultPlan = planDedup(keeperResultRows, loserResultRows, (r) => r.raceId);
      const repointedResultIds = resultPlan.repoint.map((r) => r.id);
      if (repointedResultIds.length > 0) {
        await tx.result.updateMany({ where: { id: { in: repointedResultIds } }, data: { athleteId: keeperId } });
      }

      // RaceSplit — carries its own athleteId alongside a unique
      // resultId; follows wherever its Result ended up. A split on a
      // DROPPED loser Result cascades away naturally once that Result is
      // (via the loser Athlete's final cascade delete below) — nothing
      // to do for those here.
      if (repointedResultIds.length > 0) {
        await tx.raceSplit.updateMany({ where: { resultId: { in: repointedResultIds } }, data: { athleteId: keeperId } });
      }

      // SeasonRoster — @@unique([seasonId, athleteId]); dedupe key: seasonId.
      const [keeperRoster, loserRoster] = await Promise.all([
        tx.seasonRoster.findMany({ where: { athleteId: keeperId } }),
        tx.seasonRoster.findMany({ where: { athleteId: loserId } }),
      ]);
      const rosterPlan = planDedup(keeperRoster, loserRoster, (r) => r.seasonId);
      if (rosterPlan.repoint.length > 0) {
        await tx.seasonRoster.updateMany({ where: { id: { in: rosterPlan.repoint.map((r) => r.id) } }, data: { athleteId: keeperId } });
      }

      // GroupMembership — no unique constraint; plain repoint. (If both
      // athletes had an open, same-group membership, the keeper ends up
      // with two open rows for that group — a pre-existing app-level
      // invariant lib/groups.js assumes, not something the database
      // enforces; harmless duplication a coach can clean up in Groups.)
      await tx.groupMembership.updateMany({ where: { athleteId: loserId }, data: { athleteId: keeperId } });

      // IntervalSessionEntry — @@unique([intervalSessionId, athleteId]).
      const [keeperIntervalEntries, loserIntervalEntries] = await Promise.all([
        tx.intervalSessionEntry.findMany({ where: { athleteId: keeperId } }),
        tx.intervalSessionEntry.findMany({ where: { athleteId: loserId } }),
      ]);
      const intervalPlan = planDedup(keeperIntervalEntries, loserIntervalEntries, (r) => r.intervalSessionId);
      if (intervalPlan.repoint.length > 0) {
        await tx.intervalSessionEntry.updateMany({ where: { id: { in: intervalPlan.repoint.map((r) => r.id) } }, data: { athleteId: keeperId } });
      }

      // AttendanceRecord — @@unique([attendanceSessionId, athleteId]); dedupe key: attendanceSessionId.
      const [keeperAttendance, loserAttendance] = await Promise.all([
        tx.attendanceRecord.findMany({ where: { athleteId: keeperId } }),
        tx.attendanceRecord.findMany({ where: { athleteId: loserId } }),
      ]);
      const attendancePlan = planDedup(keeperAttendance, loserAttendance, (r) => r.attendanceSessionId);
      if (attendancePlan.repoint.length > 0) {
        await tx.attendanceRecord.updateMany({ where: { id: { in: attendancePlan.repoint.map((r) => r.id) } }, data: { athleteId: keeperId } });
      }

      // CoachUpAcknowledgement — @@unique([teamId, athleteId, category, season]).
      const [keeperAcks, loserAcks] = await Promise.all([
        tx.coachUpAcknowledgement.findMany({ where: { athleteId: keeperId } }),
        tx.coachUpAcknowledgement.findMany({ where: { athleteId: loserId } }),
      ]);
      const ackPlan = planDedup(keeperAcks, loserAcks, (r) => `${r.category}::${r.season}`);
      if (ackPlan.repoint.length > 0) {
        await tx.coachUpAcknowledgement.updateMany({ where: { id: { in: ackPlan.repoint.map((r) => r.id) } }, data: { athleteId: keeperId } });
      }

      // AthleteSeasonMetrics — pre-calculated aggregates, not source
      // data. Deleting both and recomputing below (affectedSeasons) is
      // simpler and more correct than trying to average two averages.
      await tx.athleteSeasonMetrics.deleteMany({ where: { athleteId: { in: [keeperId, loserId] } } });

      // MeetPerformanceMetrics.bestAthleteId — nullable, no athlete-
      // inclusive unique constraint; plain repoint.
      await tx.meetPerformanceMetrics.updateMany({ where: { bestAthleteId: loserId }, data: { bestAthleteId: keeperId } });

      // EquipmentAssignment — no unique constraint; plain repoint.
      await tx.equipmentAssignment.updateMany({ where: { athleteId: loserId }, data: { athleteId: keeperId } });

      // Athlete.userId is itself unique (checked before the transaction
      // started — see the 409 above). Null the loser's first so the two
      // updates never collide mid-transaction.
      if (loser.userId && !keeper.userId) {
        await tx.athlete.update({ where: { id: loserId }, data: { userId: null } });
        await tx.athlete.update({ where: { id: keeperId }, data: { userId: loser.userId } });
      }

      // Backfill-only, same rule as everywhere else a duplicate source
      // might know something the keeper doesn't — never overwrites a
      // nickname the keeper already has.
      if (loser.preferredName && !keeper.preferredName) {
        await tx.athlete.update({ where: { id: keeperId }, data: { preferredName: loser.preferredName } });
      }

      // Everything still pointing at loserId at this point is exactly
      // what was deliberately left behind above (dropped duplicates) —
      // this cascades all of it away, RaceSplit/Split included.
      await tx.athlete.delete({ where: { id: loserId } });
    });

    for (const season of affectedSeasons) {
      calculationService
        .calculateAllMetrics(teamId, season)
        .catch((calcError) => console.error(`Error recalculating metrics after merging athletes for season ${season}:`, calcError.message));
    }

    res.json({ msg: `Merged into ${keeper.name}.`, keeperId, deletedId: loserId });
  } catch (error) {
    console.error('Error merging athletes:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Coach-initiated invite: unlike a claim (routes/team.js), the coach already
// knows exactly which athlete this is, so accepting the token IS the
// approval — no separate review step.
// ---------------------------------------------------------------------------

const INVITE_TTL_DAYS = 30;

// POST /api/athletes/:athleteId/invite
router.post('/:athleteId/invite', authenticate, requireTeam, requireRole(FULL_COACH), requireActivePlan, async (req, res) => {
  const { email } = req.body;
  const teamId = req.user.teamId;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ msg: 'A valid email is required.' });
  }

  try {
    const athlete = await prisma.athlete.findFirst({ where: { id: req.params.athleteId, teamId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }
    if (athlete.userId) {
      return res.status(409).json({ msg: 'This athlete is already linked to an account.' });
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    // One invite per athlete — resending overwrites the token (a fresh link)
    // rather than accumulating history.
    const invite = await prisma.athleteInvite.upsert({
      where: { athleteId: athlete.id },
      update: { email, status: 'pending', expiresAt, acceptedAt: null },
      create: { athleteId: athlete.id, teamId, email, expiresAt },
    });

    // Best-effort send — the coach still gets the token/link back either
    // way, so a down or unconfigured eusend never blocks creating the
    // invite; the frontend's existing copy-link fallback covers it.
    const inviteLink = `${FRONTEND_URL}/invite/${invite.token}`;
    let emailSent = false;
    try {
      const result = await sendEmail({
        to: email,
        subject: `You're invited to join ${req.user.team.name} on LeadPack XC`,
        html: `<p>${req.user.name || 'Your coach'} invited you to join <strong>${req.user.team.name}</strong> on LeadPack XC and link your account to <strong>${athlete.name}</strong>'s roster profile.</p>`
          + `<p><a href="${inviteLink}">${inviteLink}</a></p>`
          + `<p>This invite expires on ${expiresAt.toDateString()}.</p>`,
      });
      emailSent = result.sent;
    } catch (error) {
      console.error('Error sending athlete invite email:', error.message);
    }

    res.status(201).json({
      msg: emailSent ? `Invite emailed for ${athlete.name}.` : `Invite ready for ${athlete.name}.`,
      token: invite.token,
      emailSent,
      invite: { token: invite.token, email: invite.email, expiresAt: invite.expiresAt },
    });
  } catch (error) {
    console.error('Error creating invite:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/athletes/accept-invite
// Authenticated: the token identifies the athlete; the session identifies
// who is claiming them.
router.post('/accept-invite', authenticate, async (req, res) => {
  const { token } = req.body;
  const userId = req.user.id;

  if (!token) {
    return res.status(400).json({ msg: 'Invite token is required.' });
  }

  try {
    const invite = await prisma.athleteInvite.findUnique({
      where: { token },
      include: { athlete: true, team: true },
    });

    if (!invite || invite.status !== 'pending') {
      return res.status(404).json({ msg: 'This invite is no longer valid.' });
    }
    if (invite.expiresAt < new Date()) {
      return res.status(410).json({ msg: 'This invite has expired. Ask your coach to resend it.' });
    }
    if (invite.athlete.userId && invite.athlete.userId !== userId) {
      return res.status(409).json({ msg: 'This athlete is already linked to a different account.' });
    }

    // Identity guard: `authenticate` only proves someone is signed in, not
    // that they're the person this invite was meant for. Without this, a
    // super admin who opens an invite link while already logged in gets
    // silently converted into that athlete — their own account's teamId
    // reassigned, a TeamMember(ATHLETE) row created — which is exactly the
    // bug this closes. See lib/athleteInvites.js.
    const existingLinkedAthlete = await prisma.athlete.findFirst({
      where: { userId },
      select: { id: true },
    });
    const canAccept = decideCanAcceptAthleteInvite({
      isSuperAdmin: Boolean(req.user.isSuperAdmin),
      inviteAthleteId: invite.athleteId,
      existingLinkedAthleteId: existingLinkedAthlete?.id ?? null,
    });
    if (!canAccept.allowed) {
      return res.status(403).json({ msg: canAccept.reason });
    }

    const [athlete] = await prisma.$transaction([
      prisma.athlete.update({ where: { id: invite.athleteId }, data: { userId } }),
      prisma.athleteInvite.update({
        where: { id: invite.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      }),
      prisma.user.update({ where: { id: userId }, data: { teamId: invite.teamId } }),
      prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: invite.teamId, userId } },
        update: {},
        create: { teamId: invite.teamId, userId, role: 'ATHLETE' },
      }),
    ]);

    res.json({
      msg: `Welcome to ${invite.team.name}!`,
      athleteId: athlete.id,
      athleteName: athlete.name,
      teamId: invite.teamId,
      athleticTeamId: invite.team.athleticTeamId,
    });
  } catch (error) {
    console.error('Error accepting invite:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Athlete self-service: logging your own training runs. Deliberately a
// separate model from Result/Race (see schema.prisma) — a self-reported run
// must never be able to corrupt race history or team-wide meet aggregates.
// Every route here is scoped by req.user.linkedAthlete.id, never a param, so
// there's no way to read or write another athlete's training log.
// ---------------------------------------------------------------------------

const VALID_LOG_TYPES = new Set(['easy', 'long', 'tempo', 'interval', 'race', 'other']);

// GET /api/athletes/me/training-logs?limit=
router.get('/me/training-logs', authenticate, requireLinkedAthlete, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  try {
    const logs = await prisma.trainingLog.findMany({
      where: { athleteId: req.user.linkedAthlete.id },
      orderBy: { date: 'desc' },
      take: limit,
    });
    res.json(logs);
  } catch (error) {
    console.error('Error in GET /athletes/me/training-logs:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/athletes/me/training-logs
// sharedWithCoach/sharedWithTeam default false — a log is private unless
// the athlete opts it in, at creation or later via the PUT below.
router.post('/me/training-logs', authenticate, requireLinkedAthlete, async (req, res) => {
  const { date, type, distanceMi, durationSec, notes, sharedWithCoach, sharedWithTeam } = req.body;

  if (!date || Number.isNaN(new Date(date).getTime())) {
    return res.status(400).json({ msg: 'A valid date is required.' });
  }
  if (!type || !VALID_LOG_TYPES.has(type)) {
    return res.status(400).json({ msg: `Type must be one of: ${[...VALID_LOG_TYPES].join(', ')}` });
  }
  if (distanceMi !== undefined && distanceMi !== null && (typeof distanceMi !== 'number' || distanceMi < 0)) {
    return res.status(400).json({ msg: 'Distance must be a non-negative number.' });
  }
  if (durationSec !== undefined && durationSec !== null && (!Number.isInteger(durationSec) || durationSec < 0)) {
    return res.status(400).json({ msg: 'Duration must be a non-negative whole number of seconds.' });
  }

  try {
    const log = await prisma.trainingLog.create({
      data: {
        athleteId: req.user.linkedAthlete.id,
        date: new Date(date),
        type,
        distanceMi: distanceMi ?? null,
        durationSec: durationSec ?? null,
        notes: notes || null,
        sharedWithCoach: Boolean(sharedWithCoach),
        sharedWithTeam: Boolean(sharedWithTeam),
      },
    });
    res.status(201).json(log);
  } catch (error) {
    console.error('Error in POST /athletes/me/training-logs:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/athletes/me/training-logs/:logId/sharing — change who can see a
// log already saved, without re-entering the whole thing.
router.put('/me/training-logs/:logId/sharing', authenticate, requireLinkedAthlete, async (req, res) => {
  const { sharedWithCoach, sharedWithTeam } = req.body;
  if (typeof sharedWithCoach !== 'boolean' || typeof sharedWithTeam !== 'boolean') {
    return res.status(400).json({ msg: 'sharedWithCoach and sharedWithTeam must both be booleans.' });
  }

  try {
    const log = await prisma.trainingLog.findFirst({
      where: { id: req.params.logId, athleteId: req.user.linkedAthlete.id },
    });
    if (!log) {
      return res.status(404).json({ msg: 'Training log not found.' });
    }
    const updated = await prisma.trainingLog.update({
      where: { id: log.id },
      data: { sharedWithCoach, sharedWithTeam },
    });
    res.json(updated);
  } catch (error) {
    console.error('Error in PUT /athletes/me/training-logs/:logId/sharing:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/athletes/me/training-logs/:logId
router.delete('/me/training-logs/:logId', authenticate, requireLinkedAthlete, async (req, res) => {
  try {
    const log = await prisma.trainingLog.findFirst({
      where: { id: req.params.logId, athleteId: req.user.linkedAthlete.id },
    });
    if (!log) {
      return res.status(404).json({ msg: 'Training log not found.' });
    }
    await prisma.trainingLog.delete({ where: { id: log.id } });
    res.json({ msg: 'Deleted' });
  } catch (error) {
    console.error('Error in DELETE /athletes/me/training-logs/:logId:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/athletes/me/training-logs/import
//
// The athlete drops a file from their watch or a platform export; the
// browser parses it (web/src/lib/activityFiles) and posts summary rows
// here. See lib/trainingLogImport.js for why the validation lives
// server-side even though our own code produced the payload.
//
// There is deliberately NO coach-facing counterpart to this route, and
// there should never be one. TrainingLog's schema comment establishes the
// posture — "private by default (the original design: 'yours alone')" —
// and a coach importing an athlete's health data would invert it: the
// athlete would find their own runs already in the app, shared, without
// having done anything. If a coach needs the data, the athlete shares it.
router.post('/me/training-logs/import', authenticate, requireLinkedAthlete, async (req, res) => {
  const athleteId = req.user.linkedAthlete.id;

  // Nothing predating high school is a plausible training log for this
  // roster, and an archive that far back is a sign the athlete picked the
  // wrong export. Five years covers a senior's full career with room to
  // spare.
  const earliestAllowed = new Date();
  earliestAllowed.setFullYear(earliestAllowed.getFullYear() - 5);

  const parsed = validateImportRequest(req.body, { earliestAllowed });
  if (parsed.error) {
    return res.status(400).json({ msg: parsed.error });
  }

  const sharedWithCoach = Boolean(req.body.sharedWithCoach);
  const sharedWithTeam = Boolean(req.body.sharedWithTeam);

  try {
    // The batch row is created first so every log can point at it, and the
    // whole thing is one transaction: a half-applied import that the undo
    // button cannot reach is worse than a failed one.
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.trainingLogImportBatch.create({
        data: {
          athleteId,
          source: parsed.source,
          fileName: parsed.fileName,
          rowsParsed: parsed.parsed,
          rowsCreated: 0,
          rowsSkipped: 0,
        },
      });

      // skipDuplicates leans on the (athleteId, source, externalId) unique
      // index, which is what makes re-dropping the same file a no-op
      // instead of a second copy of the season.
      const created = await tx.trainingLog.createMany({
        data: parsed.rows.map((row) => ({
          athleteId,
          date: row.date,
          type: row.type,
          distanceMi: row.distanceMi,
          durationSec: row.durationSec,
          notes: row.notes,
          sharedWithCoach,
          sharedWithTeam,
          source: parsed.source,
          externalId: row.externalId,
          startedAt: row.startedAt,
          avgHrBpm: row.avgHrBpm,
          elevationFt: row.elevationFt,
          importBatchId: batch.id,
        })),
        skipDuplicates: true,
      });

      const alreadyPresent = parsed.rows.length - created.count;
      const rowsSkipped =
        Object.values(parsed.skipped).reduce((sum, n) => sum + n, 0) + alreadyPresent;

      const finalBatch = await tx.trainingLogImportBatch.update({
        where: { id: batch.id },
        data: { rowsCreated: created.count, rowsSkipped },
      });

      return { batch: finalBatch, created: created.count, alreadyPresent };
    });

    res.status(201).json({
      batchId: result.batch.id,
      parsed: parsed.parsed,
      created: result.created,
      skipped: { ...parsed.skipped, alreadyImported: result.alreadyPresent },
    });
  } catch (error) {
    console.error('Error in POST /athletes/me/training-logs/import:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/athletes/me/training-logs/imports — the athlete's own import
// history, so "undo" has something to point at.
router.get('/me/training-logs/imports', authenticate, requireLinkedAthlete, async (req, res) => {
  try {
    const batches = await prisma.trainingLogImportBatch.findMany({
      where: { athleteId: req.user.linkedAthlete.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(batches);
  } catch (error) {
    console.error('Error in GET /athletes/me/training-logs/imports:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/athletes/me/training-logs/imports/:batchId
//
// Undo one import. The logs are deleted explicitly here rather than by
// cascade (the FK is SetNull on purpose — see the model comment), so the
// destructive step is visible in one place. Scoped by athleteId in the
// same query as the id: a batch belonging to someone else must 404, not
// delete.
router.delete('/me/training-logs/imports/:batchId', authenticate, requireLinkedAthlete, async (req, res) => {
  const athleteId = req.user.linkedAthlete.id;

  try {
    const batch = await prisma.trainingLogImportBatch.findFirst({
      where: { id: req.params.batchId, athleteId },
    });
    if (!batch) {
      return res.status(404).json({ msg: 'Import not found.' });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      // athleteId is repeated here rather than trusting importBatchId
      // alone — the batch is already known to be this athlete's, and this
      // way no future bug in batch ownership can widen a delete.
      const { count } = await tx.trainingLog.deleteMany({
        where: { importBatchId: batch.id, athleteId },
      });
      await tx.trainingLogImportBatch.delete({ where: { id: batch.id } });
      return count;
    });

    res.json({ msg: 'Import undone', deleted });
  } catch (error) {
    console.error('Error in DELETE /athletes/me/training-logs/imports/:batchId:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
