// Race prediction: for an athlete's next race, project their course-
// adjusted pace trend this season (lib/courseDifficulty.js), add back the
// target race's own course-difficulty rating when this team has one, shape
// the result into a predicted split profile from their own recent splits,
// and correct for their own historical prediction error once they have
// one. See lib/racePrediction.js for the actual math — everything here is
// data access (what Prisma query feeds which pure function) and the
// freeze-on-first-view policy.
//
// Keyed on Meet, not Race (see RacePrediction's own schema comment for the
// full reasoning): this team's races only exist once the season scraper
// imports results, which happens AFTER the meet, so there is nothing to
// attach a prediction to beforehand if this were keyed on Race. A
// prediction made before the race exists uses this athlete's own most
// recent race distance as a stand-in (distanceEstimated: true) and is
// corrected once the real race shows up — see
// calculationService.reconcilePendingPredictions, which runs as part of
// the same recalculation pass that scores a prediction.
//
// This also never reads MeetEntry — this team doesn't track entries
// either. "Who gets a prediction" is the current season roster (the same
// rule routes/athletes.js's GET / and lib/season.js's
// isAthleteOnSeasonRoster use), not who was specifically entered.
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
const { isEnrolled } = require('../lib/season');

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

// This team's difficulty rating for the course a (real) race is run on,
// from every OTHER race (any season) this team has run there. Null when
// the race isn't linked to a Course yet (a coach-confirmed mapping, never
// inferred — see Course's own schema comment) or no visit there could be
// rated — the caller then uses the fitness trend unadjusted, flagged as
// such rather than silently treated as a 0 adjustment. Never called for a
// still-estimated target (see buildTargetFromMeet) — there's no course to
// rate before a real race exists.
async function resolveCourseDifficultyForRace(teamId, race) {
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
// prediction's error (excluding the meet being predicted now, in case it
// was already scored and is somehow being recomputed).
async function getAthletePredictionErrors(athleteId, excludeMeetId) {
  const rows = await prisma.racePrediction.findMany({
    where: { athleteId, scoredAt: { not: null }, meetId: { not: excludeMeetId } },
    select: { errorSecPerMile: true },
  });
  return rows.map((r) => r.errorSecPerMile).filter((e) => e != null);
}

// Every athlete this team currently considers on the roster for `season`
// — the same rule routes/athletes.js's GET / and lib/season.js's
// isAthleteOnSeasonRoster use: an explicit SeasonRoster row when the team
// keeps one, otherwise inferred from having raced this season or still
// being enrolled by grade.
async function getCurrentSeasonRosterAthleteIds(teamId, season) {
  const seasonRow = await prisma.season.findFirst({ where: { teamId, year: season }, select: { id: true } });
  if (seasonRow) {
    const rosterEntries = await prisma.seasonRoster.findMany({
      where: { seasonId: seasonRow.id },
      select: { athleteId: true, isActive: true },
    });
    if (rosterEntries.length > 0) {
      return rosterEntries.filter((r) => r.isActive).map((r) => r.athleteId);
    }
  }

  const [athletes, racedThisSeason] = await Promise.all([
    prisma.athlete.findMany({ where: { teamId }, select: { id: true, graduationYear: true } }),
    prisma.result.findMany({
      where: { teamId, race: { season } },
      select: { athleteId: true },
      distinct: ['athleteId'],
    }),
  ]);
  const racedIds = new Set(racedThisSeason.map((r) => r.athleteId));
  return athletes.filter((a) => racedIds.has(a.id) || isEnrolled(a.graduationYear, season)).map((a) => a.id);
}

// This athlete's most recent FINISHED race's distance — the stand-in used
// to (a) disambiguate which of several same-day races is theirs when a
// meet offers more than one distance, and (b) estimate a distance to
// predict against at all when no race exists yet for the next meet. Null
// when they have no race history; the caller then has nothing to
// disambiguate or estimate with.
async function getAthleteMostRecentDistance(teamId, athleteId) {
  const result = await prisma.result.findFirst({
    where: { teamId, athleteId, status: 'FINISHED', time: { gt: 0 }, race: { distanceMeters: { not: null } } },
    orderBy: { race: { date: 'desc' } },
    select: { race: { select: { distanceMeters: true } } },
  });
  return result?.race?.distanceMeters ?? null;
}

// Almost always a no-op (one race per meet day is the normal case — see
// Race's own schema comment: one row covers every gender and ability
// tier of a given distance). When a meet genuinely offers more than one
// distance that day, picks whichever is closest to this athlete's own
// most recent race distance rather than guessing the first one.
function pickRaceForAthlete(racesThatDay, preferredDistanceMeters) {
  if (racesThatDay.length <= 1 || preferredDistanceMeters == null) return racesThatDay[0];
  return racesThatDay.reduce((best, r) => {
    if (r.distanceMeters == null) return best;
    if (best.distanceMeters == null) return r;
    return Math.abs(r.distanceMeters - preferredDistanceMeters) < Math.abs(best.distanceMeters - preferredDistanceMeters)
      ? r
      : best;
  }, racesThatDay[0]);
}

// The next meet on this team's schedule, today or later — meets are
// imported/created ahead of time regardless of whether this team tracks
// entries, so this (unlike a Race lookup) reliably finds something before
// the race itself has happened.
async function findNextMeet(teamId) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return prisma.meet.findFirst({
    where: { teamId, date: { gte: startOfToday } },
    orderBy: { date: 'asc' },
    include: { races: true, season: { select: { year: true } } },
  });
}

// Builds the uniform shape computeAndSavePrediction works from, whether
// or not a real Race exists for this meet yet. Null when there isn't
// even a distance to estimate from (no race, and this athlete has no
// prior race to borrow a distance from) — the caller reports
// insufficient-history rather than guessing a number out of nowhere.
function buildTargetFromMeet(meet, preferredDistanceMeters) {
  const race = meet.races.length > 0 ? pickRaceForAthlete(meet.races, preferredDistanceMeters) : null;

  if (race && race.distanceMeters != null) {
    return {
      raceId: race.id,
      meetId: meet.id,
      name: race.name,
      date: race.date,
      season: race.season,
      distanceMeters: race.distanceMeters,
      distanceEstimated: false,
      courseId: race.courseId,
      splitMarkerScheme: race.splitMarkerScheme,
      splitMarkersMeters: race.splitMarkersMeters,
    };
  }

  // No race yet (or one exists but its distance hasn't parsed) — this
  // team's races only exist once the scraper imports results, after the
  // meet. A coach-confirmed meet distance (Meet.distance/distanceMeters —
  // known ahead of time for a dual meet's course or a conference's
  // standard distance) outranks guessing from one athlete's own history:
  // it's a real, shared fact, not a stand-in.
  if (meet.distanceMeters != null) {
    return {
      raceId: null,
      meetId: meet.id,
      name: meet.name,
      date: meet.date,
      season: meet.season.year,
      distanceMeters: meet.distanceMeters,
      distanceEstimated: false,
      courseId: null,
      splitMarkerScheme: null,
      splitMarkersMeters: [],
    };
  }

  // Last resort: estimate from this athlete's own most recent race
  // distance (usually stable all season). Both this and the meet-distance
  // case above are corrected once the real race shows up — see
  // calculationService.reconcilePendingPredictions /
  // applyMeetDistanceToPendingPredictions.
  if (preferredDistanceMeters == null) return null;
  return {
    raceId: null,
    meetId: meet.id,
    name: meet.name,
    date: meet.date,
    season: meet.season.year,
    distanceMeters: preferredDistanceMeters,
    distanceEstimated: true,
    courseId: null,
    splitMarkerScheme: null,
    splitMarkersMeters: [],
  };
}

// Builds and freezes a fresh prediction row for one athlete/meet. The
// only two callers are getOrCreatePrediction (first view) and the
// /recompute route (an explicit, deliberate overwrite) — never called a
// second time for the same (athleteId, meetId) just because a page
// reloaded.
async function computeAndSavePrediction(teamId, athleteId, target) {
  const trendHistory = await getAthleteSeasonTrendHistory(teamId, athleteId, target.season);
  const trend = projectSeasonFitness(trendHistory, target.date);
  if (!trend) {
    return { prediction: null, reason: 'insufficient-history' };
  }

  const [courseDifficultySecPerMile, splitShape, pastErrors] = await Promise.all([
    target.courseId ? resolveCourseDifficultyForRace(teamId, { id: target.raceId, courseId: target.courseId }) : Promise.resolve(null),
    getMostRecentSplitShape(teamId, athleteId, target.date),
    getAthletePredictionErrors(athleteId, target.meetId),
  ]);

  const bias = computeBiasAndMargin(pastErrors);
  const markers = markersForRace(target.distanceMeters, target.splitMarkerScheme, target.splitMarkersMeters);
  const closingLabel = closingSegmentLabel(target.distanceMeters, target.splitMarkerScheme, markers);

  const built = buildRacePrediction({
    trend,
    courseDifficultySecPerMile,
    bias,
    distanceMeters: target.distanceMeters,
    markers,
    splitShape,
    closingLabel,
  });

  const saved = await prisma.racePrediction.upsert({
    where: { athleteId_meetId: { athleteId, meetId: target.meetId } },
    create: {
      teamId,
      athleteId,
      meetId: target.meetId,
      raceId: target.raceId,
      season: target.season,
      distanceMeters: target.distanceMeters,
      distanceEstimated: target.distanceEstimated,
      ...built,
    },
    update: {
      raceId: target.raceId,
      season: target.season,
      distanceMeters: target.distanceMeters,
      distanceEstimated: target.distanceEstimated,
      ...built,
    },
  });

  return { prediction: saved, reason: null };
}

// Returns the frozen prediction for (athleteId, target.meetId), computing
// and freezing it on first request. `force` (used only by POST
// /recompute) overwrites an existing one instead of returning it as-is —
// the one deliberate exception to "frozen on first view."
async function getOrCreatePrediction(teamId, athleteId, target, force = false) {
  if (!force) {
    const existing = await prisma.racePrediction.findUnique({
      where: { athleteId_meetId: { athleteId, meetId: target.meetId } },
    });
    if (existing) return { prediction: existing, reason: null };
  }
  return computeAndSavePrediction(teamId, athleteId, target);
}

function serializePrediction(prediction, target) {
  return {
    id: prediction.id,
    meetId: prediction.meetId,
    raceId: prediction.raceId,
    raceName: target.name,
    raceDate: target.date,
    distanceMeters: prediction.distanceMeters,
    distanceEstimated: prediction.distanceEstimated,
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

    const meet = await findNextMeet(teamId);
    if (!meet) {
      return res.json({ success: true, prediction: null, reason: 'no-upcoming-race' });
    }

    const rosterAthleteIds = await getCurrentSeasonRosterAthleteIds(teamId, meet.season.year);
    if (!rosterAthleteIds.includes(athleteId)) {
      return res.json({
        success: true,
        prediction: null,
        reason: 'not-on-roster',
        race: { id: meet.id, name: meet.name, date: meet.date },
      });
    }

    const preferredDistance = await getAthleteMostRecentDistance(teamId, athleteId);
    const target = buildTargetFromMeet(meet, preferredDistance);
    if (!target) {
      return res.json({
        success: true,
        prediction: null,
        reason: 'insufficient-history',
        race: { id: meet.id, name: meet.name, date: meet.date },
      });
    }

    const { prediction, reason } = await getOrCreatePrediction(teamId, athleteId, target);
    if (!prediction) {
      return res.json({
        success: true,
        prediction: null,
        reason,
        race: { id: meet.id, name: meet.name, date: meet.date },
      });
    }

    res.json({ success: true, prediction: serializePrediction(prediction, target) });
  } catch (err) {
    console.error('Error getting race prediction:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/race-predictions/athlete/:athleteId/recompute
// Body: { meetId? } — defaults to the athlete's next upcoming meet.
router.post('/athlete/:athleteId/recompute', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const { athleteId } = req.params;
    const { meetId } = req.body || {};

    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId } });
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found.' });
    }

    const meet = meetId
      ? await prisma.meet.findFirst({
          where: { id: meetId, teamId },
          include: { races: true, season: { select: { year: true } } },
        })
      : await findNextMeet(teamId);

    if (!meet) {
      return res.status(404).json({ success: false, message: 'No matching meet found.' });
    }

    const preferredDistance = await getAthleteMostRecentDistance(teamId, athleteId);
    const target = buildTargetFromMeet(meet, preferredDistance);
    if (!target) {
      return res.json({ success: true, prediction: null, reason: 'insufficient-history' });
    }

    const { prediction, reason } = await computeAndSavePrediction(teamId, athleteId, target);
    if (!prediction) {
      return res.json({ success: true, prediction: null, reason });
    }

    res.json({ success: true, prediction: serializePrediction(prediction, target) });
  } catch (err) {
    console.error('Error recomputing race prediction:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/race-predictions/meet/:meetId
// Every current-season-roster athlete's predicted time for this meet,
// computing (and freezing) any prediction that doesn't exist yet. When a
// meet offers more than one race (different distances in one day),
// pickRaceForAthlete assigns each athlete the one closest to their own
// recent race distance.
router.get('/meet/:meetId', authenticate, requireTeam, async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const meet = await prisma.meet.findFirst({
      where: { id: req.params.meetId, teamId },
      include: { races: true, season: { select: { year: true } } },
    });
    if (!meet) {
      return res.status(404).json({ success: false, message: 'Meet not found.' });
    }

    const rosterAthleteIds = await getCurrentSeasonRosterAthleteIds(teamId, meet.season.year);
    const athletes = await prisma.athlete.findMany({
      where: { id: { in: rosterAthleteIds } },
      select: { id: true, name: true, preferredName: true },
    });

    const predictions = await Promise.all(
      athletes.map(async (athlete) => {
        const preferredDistance = await getAthleteMostRecentDistance(teamId, athlete.id);
        const target = buildTargetFromMeet(meet, preferredDistance);
        if (!target) {
          return {
            athleteId: athlete.id,
            athleteName: athlete.preferredName || athlete.name,
            raceId: null,
            raceName: meet.name,
            prediction: null,
            reason: 'insufficient-history',
          };
        }

        const { prediction, reason } = await getOrCreatePrediction(teamId, athlete.id, target);
        return {
          athleteId: athlete.id,
          athleteName: athlete.preferredName || athlete.name,
          raceId: target.raceId,
          raceName: target.name,
          prediction: prediction ? serializePrediction(prediction, target) : null,
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
