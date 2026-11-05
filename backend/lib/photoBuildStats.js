// The running-stats block printed onto a collage (Build module) — name,
// career PR, this season's miles/avg pace/race count, best time per
// distance this season, and the season's full race list with times. Also
// backs the Build module's on-screen pace chart (web/src/pages/photos/
// components/BuildPaceChart.tsx): grade (to decide career vs. season-only
// view) and the athlete's full career race history.
//
// Deliberately reuses the app's own existing computations rather than
// re-deriving them: AthleteSeasonMetrics (services/performance/calculationService.js)
// for the season totals, lib/athleteJourney.js's computePRs for "best per
// distance" (the exact same per-distance-bucket logic the Athlete
// Journey page already shows), and the same career-PR definition
// routes/analytics.js uses (the min bestTime5k across every season row) —
// so a number on a printed collage never disagrees with the same number
// shown anywhere else in the app.

const { randomUUID } = require('crypto');
const { resolveActiveSeason, deriveGrade } = require('./season');
const { computePRs } = require('./athleteJourney');
const { canManageAthlete } = require('./photoTagRules');
const { mergeStaffRoster } = require('./teamStaff');
const { decideCanHaveAccount } = require('./minorPolicy');
const { parseDistanceToMeters } = require('./distance');

// Head coach first, then paid assistants, then volunteers — mergeStaffRoster
// itself returns insertion order (owner, then whatever order the
// TeamMember query came back in), which doesn't promise this. Sorted
// locally here, not inside mergeStaffRoster, since that function is also
// used by routes/teams.js and routes/today.js for an unrelated staff
// count/list display that has no reason to share this ordering.
const COACH_ROLE_ORDER = { HEAD_COACH: 0, COACH: 1, VOLUNTEER_COACH: 2 };

// The collage's QR code target: the same /invite/:token an athlete-invite
// (routes/athletes.js's POST /:athleteId/invite) already accepts via POST
// /accept-invite. Reused rather than duplicated — accepting either kind of
// row works identically, since acceptance never looks at the invite's
// email. Gets-or-creates a token with no email prompt (there's no coach UI
// moment here to ask for one, and the printed QR must work with none),
// and never rotates a token that's already live — a coach may have already
// printed and handed out a collage carrying it.
const INVITE_TTL_DAYS = 30; // matches routes/athletes.js's own constant

async function getOrCreateCollageInviteToken(prisma, { teamId, athleteId, graduationYear, userId, season }) {
  if (userId) return null; // already has an account — nothing to invite
  const eligibility = decideCanHaveAccount({ graduationYear, season });
  if (!eligibility.allowed) return null; // below the minimum account grade

  const existing = await prisma.athleteInvite.findUnique({ where: { athleteId } });
  if (existing && existing.status === 'pending' && existing.expiresAt > new Date()) {
    return existing.token;
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const invite = existing
    ? await prisma.athleteInvite.update({
        where: { athleteId },
        data: { status: 'pending', expiresAt, acceptedAt: null, token: randomUUID() },
      })
    : await prisma.athleteInvite.create({
        // No real email known at collage-build time, and this never sends
        // one (no sendEmail call here) — the placeholder only satisfies
        // the column's NOT NULL constraint. A coach who later sends a real
        // invite via POST /:athleteId/invite overwrites this row with the
        // real address, same as it would overwrite any other pending one.
        data: { athleteId, teamId, email: `no-reply+${athleteId}@invite.leadpack.cc`, expiresAt },
      });
  return invite.token;
}

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
    select: { id: true, name: true, preferredName: true, graduationYear: true, userId: true },
  });
  if (!athlete) {
    const err = new Error('Athlete not found.');
    err.statusCode = 404;
    throw err;
  }

  const season = await resolveActiveSeason(teamId);

  const [metrics, seasonResults, careerResults, careerBest, teamOwner, coachTeamMembers, inviteToken] = await Promise.all([
    prisma.athleteSeasonMetrics.findUnique({
      where: { athleteId_teamId_season: { athleteId, teamId, season } },
    }),
    prisma.result.findMany({
      where: { athleteId, teamId, status: 'FINISHED', time: { gt: 0 }, race: { season } },
      select: { time: true, race: { select: { id: true, name: true, date: true, distanceMeters: true, distance: true } } },
      orderBy: { race: { date: 'asc' } },
    }),
    // Every FINISHED result this athlete has, any season — the pace
    // chart's "whole career" view (web/src/pages/photos/components/
    // BuildPaceChart.tsx). No `race: { season }` filter, unlike
    // seasonResults above; includes `season` per race so the chart can
    // tell seasons apart (and tell a freshman with only this season's
    // data from a returning athlete).
    prisma.result.findMany({
      where: { athleteId, teamId, status: 'FINISHED', time: { gt: 0 } },
      select: {
        time: true,
        race: { select: { id: true, name: true, date: true, distanceMeters: true, distance: true, season: true } },
      },
      orderBy: { race: { date: 'asc' } },
    }),
    // Career PR, not season-best: the same "min bestTime5k across every
    // season this athlete has a row for" routes/analytics.js's overview
    // endpoint computes.
    prisma.athleteSeasonMetrics.aggregate({
      where: { teamId, athleteId },
      _min: { bestTime5k: true },
    }),
    // The back page's small-print coach credit line — same merge
    // (owner + TeamMember rows) routes/today.js's staff list already
    // uses, so "who coaches this team" never disagrees between the two.
    prisma.team.findUnique({ where: { id: teamId }, select: { coach: { select: { id: true, name: true, email: true } } } }),
    prisma.teamMember.findMany({
      where: { teamId, active: true, role: { in: ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'] } },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    }),
    getOrCreateCollageInviteToken(prisma, {
      teamId,
      athleteId,
      graduationYear: athlete.graduationYear,
      userId: athlete.userId,
      season,
    }),
  ]);

  const rankedCoaches = mergeStaffRoster(
    teamOwner?.coach ?? null,
    coachTeamMembers.map((m) => ({ userId: m.userId, role: m.role, name: m.user.name, email: m.user.email })),
  ).sort((a, b) => (COACH_ROLE_ORDER[a.role] ?? 99) - (COACH_ROLE_ORDER[b.role] ?? 99));

  // Grouped by role, not flattened — the back page's "HEAD COACH /
  // COACHES / VOLUNTEER COACHES" three-way split (lib/collageRender.ts).
  const coaches = {
    headCoach: rankedCoaches.find((c) => c.role === 'HEAD_COACH')?.name || rankedCoaches.find((c) => c.role === 'HEAD_COACH')?.email || null,
    coaches: rankedCoaches.filter((c) => c.role === 'COACH').map((c) => c.name || c.email),
    volunteers: rankedCoaches.filter((c) => c.role === 'VOLUNTEER_COACH').map((c) => c.name || c.email),
  };

  // Falls back to parsing the scraped text distance when distanceMeters
  // itself is null — same fallback routes/analytics.js's athlete-journey
  // endpoint and routes/groups.js already apply. Without it, a race
  // scraped with only "distance" set (no numeric field parsed out of it
  // yet) silently drops out of computePRs below (it requires a number)
  // and the career/season pace charts (collageRender.ts filters on
  // distanceMeters too) — a PR or a plotted race going missing isn't an
  // edge case worth risking just to skip this one extra lookup.
  const seasonResultsFlat = seasonResults.map((r) => ({
    raceId: r.race.id,
    raceName: r.race.name,
    date: r.race.date,
    time: r.time,
    distanceMeters: r.race.distanceMeters ?? parseDistanceToMeters(r.race.distance),
    distanceLabel: r.race.distance,
  }));

  return {
    name: athlete.preferredName || athlete.name,
    season,
    // Null when graduationYear itself is unknown — the pace chart falls
    // back to "treat as season-only" rather than guessing a grade (same
    // "render nothing rather than something confidently wrong" choice
    // deriveGrade's own callers elsewhere in the app already make).
    grade: deriveGrade(athlete.graduationYear, season),
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
    careerRaces: careerResults.map((r) => ({
      raceName: r.race.name,
      date: r.race.date,
      distanceMeters: r.race.distanceMeters ?? parseDistanceToMeters(r.race.distance),
      distanceLabel: r.race.distance,
      timeSec: r.time,
      season: r.race.season,
    })),
    coaches,
    inviteToken,
  };
}

module.exports = { getAthleteBuildStats };
