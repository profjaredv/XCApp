// The running-stats block printed onto a collage (Build module) — name,
// career PR, this season's miles/avg pace/race count, best time per
// distance this season, and the season's full race list with times.
//
// Deliberately reuses the app's own existing computations rather than
// re-deriving them: AthleteSeasonMetrics (services/performance/calculationService.js)
// for the season totals, lib/athleteJourney.js's computePRs for "best per
// distance" (the exact same per-distance-bucket logic the Athlete
// Journey page already shows), and the same career-PR definition
// routes/analytics.js uses (the min bestTime5k across every season row) —
// so a number on a printed collage never disagrees with the same number
// shown anywhere else in the app.

const { resolveActiveSeason } = require('./season');
const { computePRs } = require('./athleteJourney');
const { canManageAthlete } = require('./photoTagRules');

/**
 * Coach or the athlete's own linked account only — same authority as
 * picks/opt-out, and (like lib/photosAccess.js's listAthletePhotosForDownload)
 * deliberately not available to a volunteer session.
 */
async function getAthleteBuildStats(prisma, teamId, athleteId, actor) {
  if (!actor.isCoach && !canManageAthlete(actor, athleteId)) {
    const err = new Error('This account cannot view that athlete\'s stats.');
    err.statusCode = 403;
    throw err;
  }
  const athlete = await prisma.athlete.findFirst({
    where: { id: athleteId, teamId },
    select: { id: true, name: true, preferredName: true },
  });
  if (!athlete) {
    const err = new Error('Athlete not found.');
    err.statusCode = 404;
    throw err;
  }

  const season = await resolveActiveSeason(teamId);

  const [metrics, seasonResults, careerBest] = await Promise.all([
    prisma.athleteSeasonMetrics.findUnique({
      where: { athleteId_teamId_season: { athleteId, teamId, season } },
    }),
    prisma.result.findMany({
      where: { athleteId, teamId, status: 'FINISHED', time: { gt: 0 }, race: { season } },
      select: { time: true, race: { select: { id: true, name: true, date: true, distanceMeters: true, distance: true } } },
      orderBy: { race: { date: 'asc' } },
    }),
    // Career PR, not season-best: the same "min bestTime5k across every
    // season this athlete has a row for" routes/analytics.js's overview
    // endpoint computes.
    prisma.athleteSeasonMetrics.aggregate({
      where: { teamId, athleteId },
      _min: { bestTime5k: true },
    }),
  ]);

  const seasonResultsFlat = seasonResults.map((r) => ({
    raceId: r.race.id,
    raceName: r.race.name,
    date: r.race.date,
    time: r.time,
    distanceMeters: r.race.distanceMeters,
    distanceLabel: r.race.distance,
  }));

  return {
    name: athlete.preferredName || athlete.name,
    season,
    careerBest5kSec: careerBest._min.bestTime5k ?? null,
    totalMiles: metrics?.totalMiles ?? null,
    averagePaceSecPerMile: metrics?.averagePace ?? null,
    totalRaces: metrics?.totalRaces ?? seasonResultsFlat.length,
    bestByDistance: computePRs(seasonResultsFlat).map((pr) => ({
      distanceMeters: pr.distanceMeters,
      distanceLabel: seasonResultsFlat.find((r) => r.raceId === pr.raceId)?.distanceLabel ?? null,
      timeSec: pr.time,
      raceName: pr.raceName,
      date: pr.date,
    })),
    races: seasonResultsFlat.map((r) => ({
      raceName: r.raceName,
      date: r.date,
      distanceMeters: r.distanceMeters,
      distanceLabel: r.distanceLabel,
      timeSec: r.time,
    })),
  };
}

module.exports = { getAthleteBuildStats };
