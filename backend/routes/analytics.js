const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, hasTeamRole } = require('../middleware/auth');
const { paceSecPerMile } = require('../lib/groupAnalytics');
const {
  rankAthletesBySeasonBestPace,
  bandForSeasonRank,
  computeSeasonBest,
  computeCourseBests,
  computePRs,
} = require('../lib/athleteJourney');
const { decideCanViewAthleteJourney } = require('../lib/athleteJourneyPermissions');

const JOURNEY_COACH_ROLES = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'];

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

    // Season-best (bestTime5k above) is scoped to this one season; PR is the
    // athlete's best 5k across every season they've ever run — a single
    // groupBy across AthleteSeasonMetrics rather than N per-athlete queries.
    const allTimeBests = await prisma.athleteSeasonMetrics.groupBy({
      by: ['athleteId'],
      where: { teamId, athleteId: { in: athleteMetrics.map((am) => am.athleteId) } },
      _min: { bestTime5k: true },
    });
    const prBestByAthleteId = new Map(
      allTimeBests.map((row) => [row.athleteId, row._min.bestTime5k || 0])
    );

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
        prBest5K: prBestByAthleteId.get(am.athleteId) || am.bestTime5k || 0,
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

    // Team-wide aggregates above (mostImproved, teamOverview, men/women
    // overview) intentionally still run over the full `athletes` array —
    // an athlete's dashboard should still show real team totals. Only the
    // Athletes-tab roster itself narrows to "just me" for an ATHLETE-role
    // caller, same self-scoping convention as /athletes/me/training-logs.
    const isCoachTier = await hasTeamRole(req.user, ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH']);
    const athletesForResponse = isCoachTier
      ? athletes
      : athletes.filter((a) => a.id === req.user.linkedAthlete?.id);

    res.json({
      athletes: athletesForResponse,
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

    // F3 (pre-season fix): totalRaces counts every entry (a DNF still
    // means they raced), but bestTime/avgTime must never include a
    // non-finish — split rather than picking one filter for both.
    const finishedResults = results.filter((r) => r.status === 'FINISHED');
    const stats = {
      totalRaces: results.length,
      bestTime: finishedResults.length > 0 ? Math.min(...finishedResults.map((r) => r.time)) : 0,
      avgTime: finishedResults.length > 0 ? finishedResults.reduce((sum, r) => sum + r.time, 0) / finishedResults.length : 0,
    };

    res.json({ athlete, results, stats });
  } catch (err) {
    console.error('Error fetching athlete analytics:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/analytics/athlete/:athleteId/journey — Workstream E1 (LeadPack
// Master Build Handoff). Reachable by the athlete themselves, any coach on
// their team, or an approved guardian — deliberately NOT gated behind
// requireTeam, since a guardian isn't a team member (same reasoning as
// routes/guardian.js's GET /athletes/:athleteId). Computed live from
// Result/Race rows, not the AthleteSeasonMetrics cache table, so it works
// before a coach has ever run "Calculate Metrics" for a season.
router.get('/athlete/:athleteId/journey', authenticate, async (req, res) => {
  const { athleteId } = req.params;

  try {
    const athlete = await prisma.athlete.findUnique({
      where: { id: athleteId },
      select: { id: true, name: true, gender: true, teamId: true, graduationYear: true },
    });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found' });
    }

    const isSelf = req.user.linkedAthlete?.id === athleteId;
    const isTeamCoach = req.user.teamId === athlete.teamId && JOURNEY_COACH_ROLES.includes(req.user.teamRole);

    let hasApprovedGuardianLink = false;
    if (!isSelf && !isTeamCoach) {
      const link = await prisma.guardianLink.findUnique({
        where: { userId_athleteId: { userId: req.user.id, athleteId } },
      });
      hasApprovedGuardianLink = Boolean(link && link.status === 'approved');
    }

    if (!decideCanViewAthleteJourney({ isSelf, isTeamCoach, hasApprovedGuardianLink })) {
      return res.status(403).json({ msg: 'Access denied.' });
    }

    const ownResults = await prisma.result.findMany({
      where: { athleteId, status: 'FINISHED', time: { gt: 0 } },
      select: {
        time: true,
        race: {
          select: {
            id: true,
            name: true,
            date: true,
            season: true,
            distanceMeters: true,
            courseId: true,
            course: { select: { name: true } },
          },
        },
      },
    });

    const seasonYears = [...new Set(ownResults.map((r) => r.race.season))].sort((a, b) => a - b);

    const [teamGenderResults, seasonRosterRows] = await Promise.all([
      seasonYears.length
        ? prisma.result.findMany({
            where: {
              teamId: athlete.teamId,
              status: 'FINISHED',
              time: { gt: 0 },
              race: { season: { in: seasonYears } },
              athlete: { gender: athlete.gender },
            },
            select: { athleteId: true, time: true, race: { select: { season: true, distanceMeters: true } } },
          })
        : [],
      seasonYears.length
        ? prisma.seasonRoster.findMany({
            where: { athleteId, season: { teamId: athlete.teamId, year: { in: seasonYears } } },
            select: { isCaptain: true, season: { select: { year: true } } },
          })
        : [],
    ]);

    const captainBySeasonYear = new Map(seasonRosterRows.map((r) => [r.season.year, r.isCaptain]));

    const teamGenderBySeasonYear = new Map();
    for (const r of teamGenderResults) {
      const pace = paceSecPerMile(r.time, r.race.distanceMeters);
      if (pace == null) continue;
      const year = r.race.season;
      if (!teamGenderBySeasonYear.has(year)) teamGenderBySeasonYear.set(year, []);
      teamGenderBySeasonYear.get(year).push({ athleteId: r.athleteId, paceSecPerMile: pace });
    }

    const ownResultsBySeasonYear = new Map();
    for (const r of ownResults) {
      const year = r.race.season;
      if (!ownResultsBySeasonYear.has(year)) ownResultsBySeasonYear.set(year, []);
      ownResultsBySeasonYear.get(year).push({
        raceId: r.race.id,
        raceName: r.race.name,
        date: r.race.date,
        time: r.time,
        distanceMeters: r.race.distanceMeters,
      });
    }

    const seasons = seasonYears.map((year) => {
      const genderEntries = teamGenderBySeasonYear.get(year) || [];
      const { byAthleteId, rosterSize } = rankAthletesBySeasonBestPace(genderEntries);
      const mine = byAthleteId.get(athleteId) || null;

      return {
        year,
        rank: mine?.rank ?? null,
        rosterSize,
        band: mine ? bandForSeasonRank(mine.rank, rosterSize) : null,
        seasonBest: computeSeasonBest(ownResultsBySeasonYear.get(year) || []),
        isCaptain: captainBySeasonYear.get(year) ?? false,
      };
    });

    const allOwnResultsFlat = ownResults.map((r) => ({
      raceId: r.race.id,
      raceName: r.race.name,
      date: r.race.date,
      time: r.time,
      distanceMeters: r.race.distanceMeters,
      courseId: r.race.courseId,
      courseName: r.race.course?.name ?? null,
    }));

    res.json({
      athlete: { id: athlete.id, name: athlete.name, gender: athlete.gender, graduationYear: athlete.graduationYear },
      seasons,
      courseBests: computeCourseBests(allOwnResultsFlat),
      prs: computePRs(allOwnResultsFlat),
    });
  } catch (err) {
    console.error('Error building athlete journey:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
