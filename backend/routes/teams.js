const express = require('express');
const router = express.Router();
const { customAlphabet } = require('nanoid');
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireOwnTeam } = require('../middleware/auth');
const calculationService = require('../services/performance/calculationServiceSupabase');

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
      data: { role: 'coach', teamId: newTeam.id },
    });

    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: newTeam.id, userId } },
      update: { role: 'coach' },
      create: { teamId: newTeam.id, userId, role: 'coach' },
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

// POST /api/teams/join
router.post('/join', authenticate, async (req, res) => {
  const { joinCode } = req.body;
  const userId = req.user.id;

  if (!joinCode) {
    return res.status(400).json({ message: 'Join code is required.' });
  }

  try {
    const team = await prisma.team.findUnique({ where: { joinCode } });
    if (!team) {
      return res.status(404).json({ message: 'Team not found for this join code.' });
    }

    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId } },
      update: {},
      create: { teamId: team.id, userId, role: 'athlete' },
    });

    await prisma.user.update({ where: { id: userId }, data: { teamId: team.id } });

    const updatedUser = await prisma.user.findUnique({ where: { id: userId }, include: { team: true } });

    res.status(200).json({
      success: true,
      message: `Successfully joined team: ${team.name}`,
      user: updatedUser,
      team,
    });
  } catch (error) {
    console.error('Error joining team:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /api/teams/scrape
// Scrapes Athletic.net for the CALLER'S OWN team (requireOwnTeam — the
// original had an explicit coach_uid check here too, this preserves it).
router.post('/scrape', authenticate, requireOwnTeam, async (req, res) => {
  const { year } = req.body;
  const { spawn } = require('child_process');
  const path = require('path');
  const { parse } = require('csv-parse/sync');
  const moment = require('moment');

  try {
    const team = req.user.team;
    const yearNum = parseInt(year, 10) || new Date().getFullYear();

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

        const parseTimeToSeconds = (timeStr) => {
          if (!timeStr) return null;
          const parts = timeStr.split(':').map((p) => parseFloat(p));
          if (parts.length === 2) return parts[0] * 60 + parts[1];
          if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
          return null;
        };

        const parseDistanceToMeters = (distStr) => {
          if (!distStr) return null;
          const cleanStr = distStr.replace(/,/g, '');
          const match = cleanStr.match(/(\d+\.?\d*)\s*(miles?|meters?|mi|km|k|m)/i);
          if (!match) return null;
          const value = parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          if (unit === 'k' || unit === 'km') return value * 1000;
          if (unit === 'miles' || unit === 'mile' || unit === 'mi') return value * 1609.34;
          if (unit === 'meters' || unit === 'meter' || unit === 'm') return value;
          return null;
        };

        const calculateGraduationYear = (grade, currentYear) => {
          const gradeNum = parseInt(grade, 10);
          if (isNaN(gradeNum)) return null;
          return currentYear + (12 - gradeNum);
        };

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

          const athlete = await prisma.athlete.upsert({
            where: { teamId_name: { teamId: team.id, name: athleteName } },
            update: { gender, grade: gradeNum, graduationYear },
            create: { name: athleteName, teamId: team.id, gender, grade: gradeNum, graduationYear },
          });

          const race = await prisma.race.upsert({
            where: {
              teamId_name_date_distance: {
                teamId: team.id,
                name: raceName,
                date: parsedDate.startOf('day').toDate(),
                distance,
              },
            },
            update: { distance, distanceMeters: parseDistanceToMeters(distance), season: yearNum },
            create: {
              name: raceName,
              date: parsedDate.startOf('day').toDate(),
              teamId: team.id,
              distance,
              distanceMeters: parseDistanceToMeters(distance),
              season: yearNum,
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
        await prisma.team.update({ where: { id: team.id }, data: { importedSeasons: updatedSeasons } });

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

// GET /api/teams/seasons
router.get('/seasons', authenticate, requireTeam, async (req, res) => {
  try {
    const races = await prisma.race.findMany({
      where: { teamId: req.user.teamId },
      select: { season: true },
      distinct: ['season'],
    });

    const seasons = races.map((r) => r.season).sort((a, b) => b - a);
    res.status(200).json(seasons);
  } catch (error) {
    console.error('Error fetching seasons:', error.message);
    res.status(500).json({ message: 'Internal Server Error' });
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

module.exports = router;
