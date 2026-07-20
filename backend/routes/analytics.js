const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam } = require('../middleware/auth');

const normalizeGender = (value) => {
  if (!value) return 'M';
  const lower = value.toString().toLowerCase();
  if (['m', 'male', 'men', 'boy', 'boys'].includes(lower)) return 'M';
  if (['f', 'female', 'women', 'girl', 'girls'].includes(lower)) return 'F';
  return 'M';
};

router.get('/overview', authenticate, requireTeam, async (req, res) => {
  const { seasons } = req.query;
  const teamId = req.user.teamId;

  if (!seasons) {
    return res.status(400).json({ msg: 'Seasons are required.' });
  }

  try {
    const seasonsArray = seasons
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((s) => !isNaN(s));

    if (seasonsArray.length === 0) {
      return res.status(400).json({ msg: 'Invalid seasons format.' });
    }

    const season = seasonsArray[0];

    const teamMetrics = await prisma.teamSeasonMetrics.findUnique({
      where: { teamId_season: { teamId, season } },
    });

    const athleteMetrics = await prisma.athleteSeasonMetrics.findMany({
      where: { teamId, season },
      include: { athlete: { select: { id: true, name: true, gender: true, grade: true } } },
      orderBy: { bestTime5k: { sort: 'asc', nulls: 'last' } },
    });

    const meetMetrics = await prisma.meetPerformanceMetrics.findMany({
      where: { teamId, season },
      orderBy: { meetDate: 'asc' },
    });

    const athletes = athleteMetrics.map((am) => {
      const athlete = am.athlete || {};
      const improvementPercent = am.improvementPercent || 0;
      const gender = normalizeGender(am.gender || athlete.gender);

      return {
        id: athlete.id || am.athleteId,
        name: athlete.name || 'Unknown',
        gender,
        currentGrade: athlete.grade || am.grade || 9,
        totalRaces: am.totalRaces || 0,
        bestTime: am.bestTime5k || 0,
        avgPace: am.averagePace || 0,
        improvementPercent: parseFloat(improvementPercent.toFixed(2)),
        raceCount: am.totalRaces || 0,
        races: [],
      };
    });

    const meets = meetMetrics.map((mm) => ({
      id: mm.raceId,
      name: mm.meetName,
      date: mm.meetDate,
      location: '',
      distance: mm.distance || 5000,
      avgPace: mm.averagePace || 0,
      runners: mm.participantCount || 0,
      conditions: '',
    }));

    const mostImproved = athletes
      .filter((a) => a.improvementPercent > 0)
      .sort((a, b) => b.improvementPercent - a.improvementPercent)
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        name: a.name,
        improvementPercent: a.improvementPercent,
        currentGrade: a.currentGrade,
        gender: a.gender,
        teamName: req.user.team?.name || '',
        bestTime: a.bestTime,
        bestTimeDate: '',
      }));

    const totalMeets = meets.length;
    const totalRaces = teamMetrics?.totalRaces || 0;
    const totalAthletes = athletes.length;
    const totalMilesRun = teamMetrics?.totalMiles || 0;
    const avgMilePace = teamMetrics?.averagePace || 0;
    const avgAthletesPerRace = totalMeets > 0 ? totalRaces / totalMeets : 0;

    const teamOverview = {
      totalMeets,
      totalRaces,
      totalAthletes,
      avgAthletesPerRace: parseFloat(avgAthletesPerRace.toFixed(1)),
      totalMilesRun: parseFloat(totalMilesRun.toFixed(2)),
      avgMilePace: parseFloat(avgMilePace.toFixed(2)),
      totalPRs: 0,
      top10Finishes: 0,
    };

    const maleAthletes = athletes.filter((a) => a.gender === 'M');
    const femaleAthletes = athletes.filter((a) => a.gender === 'F');

    const menOverview = {
      totalAthletes: maleAthletes.length,
      avgMilePace:
        maleAthletes.length > 0
          ? parseFloat((maleAthletes.reduce((sum, a) => sum + a.avgPace, 0) / maleAthletes.length).toFixed(2))
          : 0,
    };

    const womenOverview = {
      totalAthletes: femaleAthletes.length,
      avgMilePace:
        femaleAthletes.length > 0
          ? parseFloat((femaleAthletes.reduce((sum, a) => sum + a.avgPace, 0) / femaleAthletes.length).toFixed(2))
          : 0,
    };

    res.json({
      athletes,
      team: { overview: teamOverview, men: menOverview, women: womenOverview },
      mostImproved,
      meets,
    });
  } catch (err) {
    console.error('Error in analytics overview:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Scoped by teamId — a race id that belongs to another team 404s.
router.get('/races/:raceId', authenticate, requireTeam, async (req, res) => {
  try {
    const race = await prisma.race.findFirst({
      where: { id: req.params.raceId, teamId: req.user.teamId },
    });

    if (!race) {
      return res.status(404).json({ msg: 'Race not found' });
    }

    const results = await prisma.result.findMany({
      where: { raceId: race.id },
      include: { athlete: true },
      orderBy: { time: 'asc' },
    });

    res.json({ race, results });
  } catch (err) {
    console.error('Error fetching race analytics:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Scoped by teamId — an athlete id that belongs to another team 404s.
router.get('/athletes/:athleteId', authenticate, requireTeam, async (req, res) => {
  const { season } = req.query;

  try {
    const athlete = await prisma.athlete.findFirst({
      where: { id: req.params.athleteId, teamId: req.user.teamId },
    });

    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    const results = await prisma.result.findMany({
      where: {
        athleteId: athlete.id,
        ...(season ? { race: { season: parseInt(season, 10) } } : {}),
      },
      include: { race: true },
      orderBy: { race: { date: 'asc' } },
    });

    const stats = {
      totalRaces: results.length,
      bestTime: results.length > 0 ? Math.min(...results.map((r) => r.time)) : 0,
      avgTime: results.length > 0 ? results.reduce((sum, r) => sum + r.time, 0) / results.length : 0,
    };

    res.json({ athlete, results, stats });
  } catch (err) {
    console.error('Error fetching athlete analytics:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
