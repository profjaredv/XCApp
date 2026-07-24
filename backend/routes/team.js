const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireCoach } = require('../middleware/auth');
const { resolveActiveSeason } = require('../lib/season');

// GET /api/team/performance
router.get('/performance', authenticate, requireTeam, async (req, res) => {
  const { season } = req.query;
  const teamId = req.user.teamId;

  try {
    const seasonYear = await resolveActiveSeason(teamId, season);

    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
    if (!team) {
      return res.status(404).json({ msg: 'Team not found.' });
    }

    const races = await prisma.race.findMany({
      where: { teamId, season: seasonYear },
      orderBy: { date: 'asc' },
    });

    const raceIds = races.map((r) => r.id);
    const results = await prisma.result.findMany({
      where: { raceId: { in: raceIds }, time: { gt: 0 } },
    });

    const parseDistanceToMiles = (distStr, distMeters) => {
      if (distMeters && distMeters > 0) return distMeters / 1609.34;
      if (!distStr) return 0;
      const label = distStr.toLowerCase();
      const kMatch = label.match(/([0-9]+(?:\.[0-9]+)?)\s*k/);
      if (kMatch) return (parseFloat(kMatch[1]) * 1000) / 1609.34;
      const miMatch = label.match(/([0-9]+(?:\.[0-9]+)?)\s*(mi|mile|miles)/);
      if (miMatch) return parseFloat(miMatch[1]);
      if (label.includes('5k')) return 3.10686;
      return 0;
    };

    const meetCount = races.length;
    const totalRaces = results.length;

    let totalMiles = 0;
    let totalTime = 0;
    const athleteSet = new Set();

    results.forEach((result) => {
      const race = races.find((r) => r.id === result.raceId);
      if (race) {
        const distMiles = parseDistanceToMiles(race.distance, race.distanceMeters);
        totalMiles += distMiles;
        totalTime += result.time;
        athleteSet.add(result.athleteId);
      }
    });

    const avgPace = totalMiles > 0 ? totalTime / totalMiles : 0;
    const totalRunners = athleteSet.size;

    let improvementPercent = 0;
    if (races.length >= 2) {
      const firstRace = races[0];
      const lastRace = races[races.length - 1];

      const firstRaceResults = results.filter((r) => r.raceId === firstRace.id && r.time > 0);
      const lastRaceResults = results.filter((r) => r.raceId === lastRace.id && r.time > 0);

      if (firstRaceResults.length > 0 && lastRaceResults.length > 0) {
        const firstDist = parseDistanceToMiles(firstRace.distance, firstRace.distanceMeters);
        const lastDist = parseDistanceToMiles(lastRace.distance, lastRace.distanceMeters);

        if (firstDist > 0 && lastDist > 0) {
          const firstAvgPace =
            firstRaceResults.reduce((sum, r) => sum + r.time, 0) / (firstRaceResults.length * firstDist);
          const lastAvgPace =
            lastRaceResults.reduce((sum, r) => sum + r.time, 0) / (lastRaceResults.length * lastDist);

          if (firstAvgPace > 0 && lastAvgPace > 0) {
            improvementPercent = ((firstAvgPace - lastAvgPace) / firstAvgPace) * 100;
          }
        }
      }
    }

    const firstMeet = races.length > 0 ? { name: races[0].name, date: races[0].date, avgPace: 0 } : null;
    const lastMeet =
      races.length > 0
        ? { name: races[races.length - 1].name, date: races[races.length - 1].date, avgPace: 0 }
        : null;

    res.json({
      id: teamId,
      name: team.name,
      totalRaces,
      totalMiles: parseFloat(totalMiles.toFixed(2)),
      avgMilePace: avgPace,
      meetCount,
      totalRunners,
      improvementPercent: parseFloat(improvementPercent.toFixed(1)),
      firstMeet,
      lastMeet,
    });
  } catch (err) {
    console.error('Error in /team/performance:', err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// GET /api/team/pending-claims
// Stub: this feature was never implemented against the old Supabase schema
// either (there is no pending_claims table). Kept so the frontend card
// doesn't error; remove both once the feature is built or the frontend
// card is dropped.
router.get('/pending-claims', authenticate, requireTeam, requireCoach, async (_req, res) => {
  res.json({ pendingClaims: [] });
});

module.exports = router;
