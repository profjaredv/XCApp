// Post Season — the same questions the Season screens answer, asked only of
// the races that mattered at the end of the year.
//
// Everything here is computed live from races a coach has tagged. Nothing
// is inferred from a meet name (see lib/postseason.js for why: "Penn State
// Invitational" is not a state meet), so a season with nothing tagged
// reports itself as untagged rather than as a season nobody qualified in —
// those are different facts and only one of them is about the team.

const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { ANY_COACH, FULL_COACH } = require('../lib/teamRoles');
const { LEVELS, suggestLevel, isValidLevel } = require('../lib/postseason');
const { paceSecPerMile } = require('../lib/groupAnalytics');
const { parseDistanceToMeters } = require('../lib/distance');
const { normalizeGender } = require('../lib/gender');
const { deriveGrade } = require('../lib/season');
const { resolveActiveSeason } = require('../lib/season');
const calculationService = require('../services/performance/calculationService');

const LEVEL_ORDER = new Map(LEVELS.map((level, index) => [level, index]));

function furthestOf(levels) {
  let best = null;
  for (const level of levels) {
    if (best === null || LEVEL_ORDER.get(level) > LEVEL_ORDER.get(best)) best = level;
  }
  return best;
}

// GET /api/analytics/postseason?season=YYYY
//
// One season's postseason: the races, the athletes who ran them, and what
// still needs tagging. Coach-tier — this is whole-team, athlete-by-athlete
// detail, the same tier the Season screens sit behind.
router.get('/', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const teamId = req.user.teamId;

  try {
    const season = await resolveActiveSeason(teamId, req.query.season);

    const [races, meets] = await Promise.all([
      prisma.race.findMany({
        where: { teamId, season },
        select: {
          id: true,
          name: true,
          date: true,
          distance: true,
          distanceMeters: true,
          postseasonLevel: true,
          meetId: true,
          results: {
            where: { status: 'FINISHED', time: { gt: 0 } },
            select: {
              time: true,
              place: true,
              overallPlace: true,
              overallFieldSize: true,
              division: true,
              athleteId: true,
              athlete: { select: { id: true, name: true, preferredName: true, gender: true, graduationYear: true } },
            },
          },
        },
        orderBy: { date: 'asc' },
      }),
      // Every meet this season. Note this is only half the worklist —
      // most historical races have no Meet row at all (the season scraper
      // writes Race rows and leaves meetId null; Meet rows come from the
      // calendar import or from a coach creating one), so a meet-only
      // worklist is empty for exactly the imported seasons a coach most
      // wants to tag. The races themselves fill the rest in below.
      prisma.meet.findMany({
        where: { teamId, season: { year: season } },
        select: { id: true, name: true, date: true, races: { select: { id: true, postseasonLevel: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);

    const postseasonRaces = races.filter((r) => r.postseasonLevel);

    // Season bests across every race, postseason or not — the comparison
    // that answers "did they run their best race when it counted", which
    // is the whole reason a coach looks at this screen in November.
    const seasonBestByAthlete = new Map();
    for (const race of races) {
      const meters = race.distanceMeters ?? parseDistanceToMeters(race.distance);
      for (const result of race.results) {
        const pace = paceSecPerMile(result.time, meters);
        if (pace == null) continue;
        const current = seasonBestByAthlete.get(result.athleteId);
        if (current === undefined || pace < current) seasonBestByAthlete.set(result.athleteId, pace);
      }
    }

    const raceRows = postseasonRaces.map((race) => {
      const meters = race.distanceMeters ?? parseDistanceToMeters(race.distance);
      const times = race.results.map((r) => r.time).sort((a, b) => a - b);
      const paces = race.results.map((r) => paceSecPerMile(r.time, meters)).filter((p) => p != null);
      return {
        id: race.id,
        meetId: race.meetId,
        name: race.name,
        date: race.date,
        level: race.postseasonLevel,
        distance: race.distance,
        distanceMeters: meters,
        entrants: race.results.length,
        bestTimeSec: times[0] ?? null,
        // Five is the scoring pack; a spread over fewer is not a team result.
        packSpreadSec: times.length >= 5 ? times[4] - times[0] : null,
        avgPaceSecPerMile: paces.length > 0 ? paces.reduce((a, b) => a + b, 0) / paces.length : null,
      };
    });

    // One row per athlete who ran anything postseason, carrying every
    // postseason race they ran.
    const athleteRows = new Map();
    for (const race of postseasonRaces) {
      const meters = race.distanceMeters ?? parseDistanceToMeters(race.distance);
      for (const result of race.results) {
        if (!result.athlete) continue;
        if (!athleteRows.has(result.athleteId)) {
          athleteRows.set(result.athleteId, {
            athleteId: result.athleteId,
            name: result.athlete.preferredName || result.athlete.name,
            gender: normalizeGender(result.athlete.gender),
            grade: deriveGrade(result.athlete.graduationYear, season),
            seasonBestPaceSecPerMile: seasonBestByAthlete.get(result.athleteId) ?? null,
            races: [],
          });
        }
        athleteRows.get(result.athleteId).races.push({
          raceId: race.id,
          raceName: race.name,
          date: race.date,
          level: race.postseasonLevel,
          timeSec: result.time,
          paceSecPerMile: paceSecPerMile(result.time, meters),
          // Place is only known once a full field has been uploaded; null
          // is "we don't know", never "unplaced".
          place: result.place ?? null,
          overallPlace: result.overallPlace ?? null,
          overallFieldSize: result.overallFieldSize ?? null,
          division: result.division ?? null,
        });
      }
    }

    const athletes = [...athleteRows.values()]
      .map((athlete) => {
        const paces = athlete.races.map((r) => r.paceSecPerMile).filter((p) => p != null);
        const bestPostseasonPace = paces.length > 0 ? Math.min(...paces) : null;
        return {
          ...athlete,
          furthestLevel: furthestOf(athlete.races.map((r) => r.level)),
          bestPostseasonPaceSecPerMile: bestPostseasonPace,
          // Positive = their postseason best was faster than their best
          // anywhere else that season. Null when either is unknown rather
          // than a zero that would read as "exactly the same".
          peakedSec:
            bestPostseasonPace != null && athlete.seasonBestPaceSecPerMile != null
              ? parseFloat((athlete.seasonBestPaceSecPerMile - bestPostseasonPace).toFixed(1))
              : null,
          races: athlete.races.sort((a, b) => new Date(a.date) - new Date(b.date)),
        };
      })
      .sort((a, b) => {
        const levelDiff = (LEVEL_ORDER.get(b.furthestLevel) ?? -1) - (LEVEL_ORDER.get(a.furthestLevel) ?? -1);
        if (levelDiff !== 0) return levelDiff;
        return (a.bestPostseasonPaceSecPerMile ?? Infinity) - (b.bestPostseasonPaceSecPerMile ?? Infinity);
      });

    const counts = {};
    for (const level of LEVELS) {
      const inLevel = athletes.filter((a) => a.races.some((r) => r.level === level));
      counts[level] = {
        total: inLevel.length,
        men: inLevel.filter((a) => a.gender === 'M').length,
        women: inLevel.filter((a) => a.gender === 'F').length,
        raceCount: raceRows.filter((r) => r.level === level).length,
      };
    }

    // The tagging worklist: everything in this season a coach can put a
    // level on, whether or not it has a Meet row. A scraped season is
    // races with meetId null — tagging by meet alone leaves those
    // untaggable, which is the case a coach hits first, since the seasons
    // worth tagging are usually the imported ones.
    const racesWithMeet = new Set(meets.flatMap((meet) => meet.races.map((r) => r.id)));

    const meetItems = meets.map((meet) => {
      const levels = [...new Set(meet.races.map((r) => r.postseasonLevel ?? null))];
      return {
        kind: 'meet',
        id: meet.id,
        name: meet.name,
        date: meet.date,
        raceCount: meet.races.length,
        level: levels.length === 1 ? levels[0] : null,
        mixed: levels.length > 1,
        suggestedLevel: suggestLevel(meet.name),
      };
    });

    // Loose races grouped by (name, date): the scraper writes one Race per
    // distance/heat, so "Districts" is commonly two or three rows that are
    // one afternoon to a coach and should be tagged as one thing.
    const looseByDay = new Map();
    for (const race of races) {
      if (racesWithMeet.has(race.id)) continue;
      const day = new Date(race.date).toISOString().slice(0, 10);
      const key = `${race.name}::${day}`;
      if (!looseByDay.has(key)) looseByDay.set(key, { name: race.name, date: race.date, races: [] });
      looseByDay.get(key).races.push(race);
    }

    const looseItems = [...looseByDay.values()].map((group) => {
      const levels = [...new Set(group.races.map((r) => r.postseasonLevel ?? null))];
      return {
        kind: 'races',
        // The race ids this row stands for — the tag write takes them
        // directly, so nothing has to invent a Meet row just to store a
        // level on races that never had one.
        id: group.races.map((r) => r.id).join(','),
        raceIds: group.races.map((r) => r.id),
        name: group.name,
        date: group.date,
        raceCount: group.races.length,
        level: levels.length === 1 ? levels[0] : null,
        mixed: levels.length > 1,
        suggestedLevel: suggestLevel(group.name),
      };
    });

    const meetRows = [...meetItems, ...looseItems].sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      season,
      counts,
      furthestLevel: furthestOf(postseasonRaces.map((r) => r.postseasonLevel)),
      taggedRaceCount: postseasonRaces.length,
      totalRaceCount: races.length,
      races: raceRows,
      athletes,
      meets: meetRows,
    });
  } catch (error) {
    console.error('Error building postseason view:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PATCH /api/analytics/postseason/tags
//
// Tag several meets at once and recompute. Tagging one meet at a time from
// its own page works, but a coach catching up on four imported seasons
// would open forty pages to do it — so this is the bulk path, and it is
// the one the Post Season screen uses.
//
// Recalculation runs after the write, for every season touched. The
// postseason views themselves read live and don't need it; the season and
// athlete dashboards read cached metrics, and a coach who just told the
// app something about their races should not have to know which screens
// are which.
router.patch('/tags', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const { tags } = req.body;
  if (!Array.isArray(tags) || tags.length === 0) {
    return res.status(400).json({ msg: 'tags must be a non-empty array of { meetId | raceIds, level }.' });
  }
  for (const tag of tags) {
    // A tag names either a meet or a set of races. Both exist because
    // most imported races have no Meet row — see the worklist above.
    const hasMeet = tag && typeof tag.meetId === 'string';
    const hasRaces = tag && Array.isArray(tag.raceIds) && tag.raceIds.length > 0;
    if (!hasMeet && !hasRaces) {
      return res.status(400).json({ msg: 'Every tag needs a meetId or raceIds.' });
    }
    const level = tag.level === '' ? null : tag.level ?? null;
    if (!isValidLevel(level)) {
      return res.status(400).json({ msg: `level must be null or one of: ${LEVELS.join(', ')}.` });
    }
  }

  try {
    const teamId = req.user.teamId;
    const meetIds = [...new Set(tags.filter((t) => t.meetId).map((t) => t.meetId))];
    const looseRaceIds = [...new Set(tags.flatMap((t) => t.raceIds ?? []))];

    const [meets, looseRaces] = await Promise.all([
      meetIds.length > 0
        ? prisma.meet.findMany({
            where: { id: { in: meetIds }, teamId },
            select: { id: true, races: { select: { id: true, season: true } } },
          })
        : [],
      looseRaceIds.length > 0
        ? prisma.race.findMany({ where: { id: { in: looseRaceIds }, teamId }, select: { id: true, season: true } })
        : [],
    ]);
    const meetById = new Map(meets.map((m) => [m.id, m]));
    const raceById = new Map(looseRaces.map((r) => [r.id, r]));

    if (meetIds.some((id) => !meetById.has(id))) {
      return res.status(404).json({ msg: 'One or more meets were not found on this team.' });
    }
    if (looseRaceIds.some((id) => !raceById.has(id))) {
      return res.status(404).json({ msg: 'One or more races were not found on this team.' });
    }

    const seasonsTouched = new Set();
    let racesUpdated = 0;

    await prisma.$transaction(async (tx) => {
      for (const tag of tags) {
        const rows = tag.meetId ? meetById.get(tag.meetId).races : (tag.raceIds ?? []).map((id) => raceById.get(id));
        const raceIds = rows.map((r) => r.id);
        if (raceIds.length === 0) continue;
        for (const race of rows) seasonsTouched.add(race.season);
        const level = tag.level === '' ? null : tag.level ?? null;
        const updated = await tx.race.updateMany({
          where: { id: { in: raceIds }, teamId },
          data: { postseasonLevel: level },
        });
        racesUpdated += updated.count;
      }
    });

    // Fire-and-forget, same as every other roster/results write that
    // changes what the dashboards are computed from.
    for (const season of seasonsTouched) {
      calculationService
        .calculateAllMetrics(teamId, season)
        .catch((error) => console.error(`Error recalculating after postseason tagging (${season}): ${error.message}`));
    }

    res.json({
      meetsUpdated: meetIds.length + looseRaceIds.length,
      racesUpdated,
      seasonsRecalculated: [...seasonsTouched].sort((a, b) => a - b),
    });
  } catch (error) {
    console.error('Error tagging postseason meets:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
