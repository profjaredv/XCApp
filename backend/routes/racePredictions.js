// Race prediction: for an athlete's next race, project their course-
// adjusted pace trend this season (lib/courseDifficulty.js), add back the
// target race's own course-difficulty rating when this team has one, shape
// the result into a predicted split profile from their own recent splits,
// and correct for their own historical prediction error once they have
// one. See lib/racePrediction.js for the actual math — everything here is
// data access (what Prisma query feeds which pure function) and the
// freeze-on-first-view policy.
//
// Authorization: same tier as the rest of this team's results/analytics —
// any authenticated team member can VIEW a prediction (results and PRs are
// already team-visible; a prediction built from them isn't more sensitive).
// Forcing a recompute is FULL_COACH-only — a deterministic recompute can't
// be "gamed," but it's still a deliberate overwrite of a frozen comparison
// point, kept to the same role tier as other data-affecting actions.

const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { FULL_COACH } = require('../lib/teamRoles');
const { paceSecPerMile } = require('../lib/groupAnalytics');
const { markersForRace, closingSegmentLabel, segments, overallPaceSecPerMile } = require('../lib/splitMath');
const {
  buildRaceContributors,
  averageDelta,
  computeCourseDifficulty,
  computeSeasonAdjustedPaces,
} = require('../lib/courseDifficulty');
const {
  projectSeasonFitness,
  computeBiasAndMargin,
  buildSplitShape,
  buildRacePrediction,
} = require('../lib/racePrediction');

// ---------------------------------------------------------------------
// Data-access helpers. The math itself (what these feed into) lives in
// lib/courseDifficulty.js and lib/racePrediction.js and is unit-tested
// there without a database; these just shape Prisma reads into what that
// math expects.
// ---------------------------------------------------------------------

// Every FINISHED result this team has in one season, paced, with that
// race's own date — the shape lib/courseDifficulty.js's functions expect,
// plus the date so a caller building one athlete's adjusted-pace history
// doesn't need a second query.
async function getSeasonPacedResults(teamId, season) {
  const results = await prisma.result.findMany({
    where: { teamId, status: 'FINISHED', time: { gt: 0 }, race: { season, distanceMeters: { not: null } } },
    select: { athleteId: true, raceId: true, time: true, race: { select: { date: true, distanceMeters: true } } },
  });
  return results
    .map((r) => ({
      athleteId: r.athleteId,
      raceId: r.raceId,
      date: r.race.date,
      paceSecPerMile: paceSecPerMile(r.time, r.race.distanceMeters),
    }))
    .filter((r) => r.paceSecPerMile != null);
}

// This team's difficulty rating for the course `race` is run on, from
// every OTHER race (any season) this team has run there. Null when the
// race isn't linked to a Course yet (a coach-confirmed mapping, never
// inferred — see Course's own schema comment) or no visit there could be
// rated — the caller then uses the fitness trend unadjusted, flagged as
// such rather than silently treated as a 0 adjustment.
async function resolveCourseDifficultyForRace(teamId, race) {
  if (!race.courseId) return null;

  const siblingRaces = await prisma.race.findMany({
    where: { teamId, courseId: race.courseId, id: { not: race.id } },
    select: { id: true, season: true },
  });
  if (siblingRaces.length === 0) return null;

  const seasonsNeeded = [...new Set(siblingRaces.map((r) => r.season))];
  const resultsBySeason = new Map(
    await Promise.all(seasonsNeeded.map(async (season) => [season, await getSeasonPacedResults(teamId, season)]))
  );

  const visits = [];
  for (const sibling of siblingRaces) {
    const contributorsByRace = buildRaceContributors(resultsBySeason.get(sibling.season) || []);
    const contributors = contributorsByRace.get(sibling.id) || [];
    // No leave-one-out here (second arg null) — this rates the COURSE in
    // general, not one athlete's own performance at it.
    const { difficultySecPerMile } = averageDelta(contributors, null);
    if (difficultySecPerMile != null) {
      visits.push({ difficultySecPerMile, contributingCount: contributors.length });
    }
  }

  return computeCourseDifficulty(visits);
}

// This athlete's course-adjusted pace trend input for `season` — built
// from the WHOLE team's results that season (computeSeasonAdjustedPaces
// needs the full field to rate each race, not just this one athlete),
// then filtered down to their own rated races.
async function getAthleteSeasonTrendHistory(teamId, athleteId, season) {
  const seasonResults = await getSeasonPacedResults(teamId, season);
  const dateByRaceId = new Map(seasonResults.map((r) => [r.raceId, r.date]));
  const adjusted = computeSeasonAdjustedPaces(seasonResults);
  return adjusted
    .filter((r) => r.athleteId === athleteId && r.adjustedPaceSecPerMile != null)
    .map((r) => ({ date: dateByRaceId.get(r.raceId), adjustedPaceSecPerMile: r.adjustedPaceSecPerMile }));
}

// This athlete's most recent FINISHED race before `beforeDate` with real
// marker splits recorded — the reference race lib/racePrediction.js's
// buildSplitShape derives a pacing shape from. Null (not an error) when
// they have no split data yet; the caller falls back to even pacing.
async function getMostRecentSplitShape(teamId, athleteId, beforeDate) {
  const result = await prisma.result.findFirst({
    where: {
      teamId,
      athleteId,
      status: 'FINISHED',
      time: { gt: 0 },
      race: { date: { lt: beforeDate }, distanceMeters: { not: null } },
      splits: { some: {} },
    },
    orderBy: { race: { date: 'desc' } },
    select: {
      time: true,
      splits: { select: { sequence: true, markerMeters: true, elapsedSec: true } },
      race: { select: { distanceMeters: true } },
    },
  });
  if (!result) return null;

  const segs = segments(result.splits, result.time, result.race.distanceMeters);
  const overallPace = overallPaceSecPerMile(result.time, result.race.distanceMeters);
  return buildSplitShape(segs, overallPace, result.race.distanceMeters);
}

// This athlete's own prediction track record: every previously SCORED
// prediction's error (excluding the race being predicted now, in case
// it was already scored and is somehow being recomputed).
async function getAthletePredictionErrors(athleteId, excludeRaceId) {
  const rows = await prisma.racePrediction.findMany({
    where: { athleteId, scoredAt: { not: null }, raceId: { not: excludeRaceId } },
    select: { errorSecPerMile: true },
  });
  return rows.map((r) => r.errorSecPerMile).filter((e) => e != null);
}

// The next race this athlete is actually entered in, for this team, today
// or later. Only EntryStatus.ENTERED counts as "the next race to predict"
// — an alternate or scratched entry isn't one they're actually running.
async function findNextEnteredRace(teamId, athleteId) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const entry = await prisma.meetEntry.findFirst({
    where: { athleteId, status: 'ENTERED', race: { teamId, date: { gte: startOfToday } } },
    orderBy: { race: { date: 'asc' } },
    include: { race: true },
  });
  return entry?.race ?? null;
}

// Builds and freezes a fresh prediction row for one athlete/race. The only
// two callers are getOrCreatePrediction (first view) and the /recompute
// route (an explicit, deliberate overwrite) — never called a second time
// for the same (athleteId, raceId) just because a page reloaded.
async function computeAndSavePrediction(teamId, athleteId, race) {
  const trendHistory = await getAthleteSeasonTrendHistory(teamId, athleteId, race.season);
  const trend = projectSeasonFitness(trendHistory, race.date);
  if (!trend) {
    return { prediction: null, reason: 'insufficient-history' };
  }

  const [courseDifficultySecPerMile, splitShape, pastErrors] = await Promise.all([
    resolveCourseDifficultyForRace(teamId, race),
    getMostRecentSplitShape(teamId, athleteId, race.date),
    getAthletePredictionErrors(athleteId, race.id),
  ]);

  const bias = computeBiasAndMargin(pastErrors);
  const markers = markersForRace(race.distanceMeters, race.splitMarkerScheme, race.splitMarkersMeters);
  const closingLabel = closingSegmentLabel(race.distanceMeters, race.splitMarkerScheme, markers);

  const built = buildRacePrediction({
    trend,
    courseDifficultySecPerMile,
    bias,
    distanceMeters: race.distanceMeters,
    markers,
    splitShape,
    closingLabel,
  });

  const saved = await prisma.racePrediction.upsert({
    where: { athleteId_raceId: { athleteId, raceId: race.id } },
    create: { teamId, athleteId, raceId: race.id, season: race.season, ...built },
    update: { season: race.season, ...built },
  });

  return { prediction: saved, reason: null };
}

// Returns the frozen prediction for (athleteId, race), computing and
// freezing it on first request. `force` (used only by POST /recompute)
// overwrites an existing one instead of returning it as-is — the one
// deliberate exception to "frozen on first view."
async function getOrCreatePrediction(teamId, athleteId, race, force = false) {
  if (!force) {
    const existing = await prisma.racePrediction.findUnique({
      where: { athleteId_raceId: { athleteId, raceId: race.id } },
    });
    if (existing) return { prediction: existing, reason: null };
  }
  return computeAndSavePrediction(teamId, athleteId, race);
}

function serializePrediction(prediction, race) {
  return {
    id: prediction.id,
    raceId: prediction.raceId,
    raceName: race.name,
    raceDate: race.date,
    distanceMeters: race.distanceMeters,
    predictedTimeSec: prediction.predictedTimeSec,
    predictedPaceSecPerMile: prediction.predictedPaceSecPerMile,
    trendPaceSecPerMile: prediction.trendPaceSecPerMile,
    courseDifficultySecPerMile: prediction.courseDifficultySecPerMile,
    basedOnRaceCount: prediction.basedOnRaceCount,
    biasAppliedSecPerMile: prediction.biasAppliedSecPerMile,
    marginSecPerMile: prediction.marginSecPerMile,
    predictedSplits: prediction.predictedSplits,
    actualTimeSec: prediction.actualTimeSec,
    actualPaceSecPerMile: prediction.actualPaceSecPerMile,
    errorSecPerMile: prediction.errorSecPerMile,
    scoredAt: prediction.scoredAt,
    createdAt: prediction.createdAt,
  };
}

// GET /api/race-predictions/athlete/:athleteId/next
router.get('/athlete/:athleteId/next', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const { athleteId } = req.params;

    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId } });
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found.' });
    }

    const race = await findNextEnteredRace(teamId, athleteId);
    if (!race) {
      return res.json({ success: true, prediction: null, reason: 'no-upcoming-entry' });
    }

    const { prediction, reason } = await getOrCreatePrediction(teamId, athleteId, race);
    if (!prediction) {
      return res.json({
        success: true,
        prediction: null,
        reason,
        race: { id: race.id, name: race.name, date: race.date },
      });
    }

    res.json({ success: true, prediction: serializePrediction(prediction, race) });
  } catch (err) {
    console.error('Error getting race prediction:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/race-predictions/athlete/:athleteId/recompute
// Body: { raceId? } — defaults to the athlete's next entered race.
router.post('/athlete/:athleteId/recompute', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const { athleteId } = req.params;
    const { raceId } = req.body || {};

    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId } });
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found.' });
    }

    const race = raceId
      ? await prisma.race.findFirst({ where: { id: raceId, teamId } })
      : await findNextEnteredRace(teamId, athleteId);

    if (!race) {
      return res.status(404).json({ success: false, message: 'No matching race found.' });
    }

    const { prediction, reason } = await computeAndSavePrediction(teamId, athleteId, race);
    if (!prediction) {
      return res.json({ success: true, prediction: null, reason });
    }

    res.json({ success: true, prediction: serializePrediction(prediction, race) });
  } catch (err) {
    console.error('Error recomputing race prediction:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/race-predictions/meet/:meetId
// Every ENTERED athlete's predicted time for an upcoming meet, computing
// (and freezing) any prediction that doesn't exist yet — the Meets page's
// whole-roster view.
router.get('/meet/:meetId', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const meet = await prisma.meet.findFirst({ where: { id: req.params.meetId, teamId }, include: { races: true } });
    if (!meet) {
      return res.status(404).json({ success: false, message: 'Meet not found.' });
    }

    const raceIds = meet.races.map((r) => r.id);
    const entries = await prisma.meetEntry.findMany({
      where: { raceId: { in: raceIds }, status: 'ENTERED' },
      select: { athleteId: true, raceId: true, athlete: { select: { id: true, name: true, preferredName: true } } },
    });

    const raceById = new Map(meet.races.map((r) => [r.id, r]));
    const predictions = await Promise.all(
      entries.map(async (entry) => {
        const race = raceById.get(entry.raceId);
        const { prediction, reason } = await getOrCreatePrediction(teamId, entry.athleteId, race);
        return {
          athleteId: entry.athleteId,
          athleteName: entry.athlete.preferredName || entry.athlete.name,
          raceId: race.id,
          raceName: race.name,
          prediction: prediction ? serializePrediction(prediction, race) : null,
          reason: prediction ? null : reason,
        };
      })
    );

    res.json({ success: true, predictions });
  } catch (err) {
    console.error('Error getting meet race predictions:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
