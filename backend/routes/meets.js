const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam } = require('../middleware/auth');
const { resolveActiveSeason } = require('../lib/season');
const { computeTeamPlaces } = require('../lib/teamPlace');
const { computeMeetScoring } = require('../lib/meetScoring');
const { compareByFinishTime } = require('../lib/raceResults');

router.get('/', authenticate, requireTeam, async (req, res) => {
  const { season } = req.query;
  const teamId = req.user.teamId;

  try {
    const seasonYear = await resolveActiveSeason(teamId, season);

    const races = await prisma.race.findMany({
      where: { teamId, season: seasonYear },
      include: { results: true },
      orderBy: { date: 'asc' },
    });

    const meetData = races.map((race) => {
      const results = race.results || [];
      const runnerCount = results.length;
      const avgPace =
        results.length > 0 ? results.reduce((sum, r) => sum + (r.pace || 0), 0) / results.length : 0;

      return { ...race, results: undefined, runnerCount, avgPace };
    });

    res.json(meetData);
  } catch (err) {
    console.error('Error fetching meets:', err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// Scoped by teamId in the WHERE clause, not just fetched by :id then
// trusted — a race that belongs to another team simply doesn't match and
// 404s, same as if it didn't exist.
router.get('/:id', authenticate, requireTeam, async (req, res) => {
  try {
    const meet = await prisma.race.findFirst({
      where: { id: req.params.id, teamId: req.user.teamId },
    });

    if (!meet) {
      return res.status(404).json({ msg: 'Meet not found' });
    }

    const [rawResults, fieldResults] = await Promise.all([
      prisma.result.findMany({
        where: { raceId: meet.id },
        include: { athlete: { select: { id: true, name: true, preferredName: true, gender: true } } },
      }),
      prisma.fieldResult.findMany({ where: { raceId: meet.id } }),
    ]);
    // orderBy: {time: 'asc'} put a DNS/DNF/DQ row ahead of every real
    // finisher whenever its time was null (SQL sorts null first
    // ascending) — or, worse, ahead of everyone if it had a stale
    // nonzero time left over from before it was marked a non-finish (see
    // lib/raceResults.js's decideResultWrite). compareByFinishTime checks
    // status alongside time, so neither case can rank as a "fastest"
    // finisher.
    const results = [...rawResults].sort(compareByFinishTime);

    // Team place (rank among just our own team's same-gender finishers) is
    // always computable from ORIGIN data alone — no field-results upload
    // needed — and distinct from place/overallPlace, which are FIELD's.
    // See lib/teamPlace.js for why this can't just be an array index.
    const teamPlaces = computeTeamPlaces(results);

    // Team scoring (points, standings) needs the whole field, not just our
    // own results — see lib/meetScoring.js. Empty array when no field
    // upload exists yet for this race.
    const scoring = computeMeetScoring({ results, fieldResults });

    const meetWithResults = {
      ...meet,
      results: results.map((r) => ({
        ...r,
        athlete: r.athlete ? { ...r.athlete, grade: r.grade } : null,
        teamPlace: teamPlaces.get(r.id) ?? null,
      })),
      scoring,
    };

    res.json(meetWithResults);
  } catch (err) {
    console.error('Error fetching meet:', err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

module.exports = router;
