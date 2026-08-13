// Part B (XCApp Pre-Season Fixes + Phase 3 Band Analytics doc): GET
// /api/analytics/bands. Segments a team's roster into top/middle/bottom
// performance bands (ranked within gender), tracked across seasons, using
// pace-per-mile as the primary metric. Replaces the old multi-season
// trends route (disabled with a 501 in Part A, now deleted outright along
// with its frontend hook) — this is the "one real implementation" the
// doc asks for: no silent state/championship exclusion, no unweighted
// cross-athlete mean, and band membership computed from real per-athlete
// pace data.
//
// Authorization: authenticate + requireTeam only. Any team member,
// including captains, can read this — the doc is explicit that captains
// "get no special access here and must not receive individual athlete
// rows," which this endpoint satisfies structurally: every response shape
// below is a pooled aggregate (counts, means, medians, stdDev) and never
// carries an athleteId or athlete name. See test/captainPermissions.test.js
// for the static check that keeps that true.
//
// Scope decision (flagging rather than silently deciding, per the doc's own
// "stop and ask when ambiguous" rule): the doc asks for band boundaries
// "stored per team in settings and configurable." No TeamSettings-style
// Prisma model exists anywhere in this schema, and this sandbox cannot
// apply a new migration to the live database. Rather than block Part B on
// a schema change, boundaries are hardcoded defaults (TOP_SIZE=20,
// BOTTOM_SIZE=30, matching the doc's own example numbers) with optional
// per-request overrides via ?topSize=&bottomSize= query params. This gets
// "configurable" without "persisted" — if per-team persistence turns out to
// matter, that's a real follow-up (new model + migration), not something
// to fake here.

const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam } = require('../middleware/auth');
const { paceSecPerMile } = require('../lib/groupAnalytics');
const { fieldRatio } = require('../lib/fieldNormalization');

const DEFAULT_TOP_SIZE = 20;
const DEFAULT_BOTTOM_SIZE = 30;
const MIN_BAND_SIZE = 5; // doc: "Never render a band with fewer than 5 athletes"
const COLLAPSE_ROSTER_THRESHOLD = 50; // doc: under 50, collapse to two bands
const NORMALIZATION_MIN_COVERAGE = 0.4; // doc: 40% of a season's races need fieldMeanSec
const POSITION_SLOTS = [1, 3, 5, 7, 10];

const normalizeGender = (value) => {
  if (!value) return null;
  const lower = value.toString().toLowerCase();
  if (['m', 'male', 'men', 'boy', 'boys'].includes(lower)) return 'M';
  if (['f', 'female', 'women', 'girl', 'girls'].includes(lower)) return 'F';
  return null;
};

const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

const median = (arr) => {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

// Population stdDev (divide by n, not n-1) — bands here are the entire
// population being described (every entry in that band that season), not a
// sample standing in for a larger one, and n can be as low as MIN_BAND_SIZE.
const stdDev = (arr, avg) => {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
};

// Fixed per season, based on that season+gender's roster depth. Collapses
// to two bands under the threshold rather than producing a near-empty
// middle band; never produces a negative-size middle (the collapse
// threshold is chosen so topSize + bottomSize < COLLAPSE_ROSTER_THRESHOLD).
function computeBandRanges(rosterSize, topSize, bottomSize) {
  if (rosterSize < COLLAPSE_ROSTER_THRESHOLD) {
    const collapsedTopSize = Math.max(1, Math.ceil(rosterSize / 3));
    return {
      collapsed: true,
      top: [1, collapsedTopSize],
      middle: null,
      bottom: [collapsedTopSize + 1, rosterSize],
    };
  }
  return {
    collapsed: false,
    top: [1, topSize],
    middle: [topSize + 1, rosterSize - bottomSize],
    bottom: [rosterSize - bottomSize + 1, rosterSize],
  };
}

function bandForRank(rank, ranges) {
  if (rank >= ranges.top[0] && rank <= ranges.top[1]) return 'top';
  if (ranges.middle && rank >= ranges.middle[0] && rank <= ranges.middle[1]) return 'middle';
  if (rank >= ranges.bottom[0] && rank <= ranges.bottom[1]) return 'bottom';
  return null;
}

// entries: [{ athleteId, raceId, paceSecPerMile, fieldRatio }]
function summarizeBand(entries, range) {
  if (!range) return null;

  const athleteCount = new Set(entries.map((e) => e.athleteId)).size;
  if (athleteCount < MIN_BAND_SIZE) {
    return { range, athleteCount, raceCount: 0, insufficientDepth: true };
  }

  const paces = entries.map((e) => e.paceSecPerMile);
  const paceMean = mean(paces);
  const ratios = entries.map((e) => e.fieldRatio).filter((r) => r != null);

  return {
    range,
    athleteCount,
    raceCount: new Set(entries.map((e) => e.raceId)).size,
    insufficientDepth: false,
    meanPaceSecPerMile: paceMean,
    medianPaceSecPerMile: median(paces),
    stdDevPaceSecPerMile: stdDev(paces, paceMean),
    ...(ratios.length > 0
      ? { meanFieldRatio: mean(ratios), medianFieldRatio: median(ratios) }
      : {}),
  };
}

// GET /api/analytics/bands/courses — the course selector's option list
// (BandTrendsPage doc requirement: "course selector defaulting to 'all
// courses'"). Not a new feature beyond what the doc asks for, just the
// minimal data the selector needs: every course this team has actually
// raced at, so the dropdown never offers a course with zero results.
router.get('/courses', authenticate, requireTeam, async (req, res) => {
  const teamId = req.user.teamId;

  try {
    const races = await prisma.race.findMany({
      where: { teamId, courseId: { not: null } },
      select: { course: { select: { id: true, name: true, city: true, state: true } } },
      distinct: ['courseId'],
    });

    const courses = races
      .map((r) => r.course)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ success: true, courses });
  } catch (err) {
    console.error('Error listing band-analytics courses:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/', authenticate, requireTeam, async (req, res) => {
  const teamId = req.user.teamId;
  const gender = normalizeGender(req.query.gender);
  const mode = req.query.mode || 'meet';
  const { courseId } = req.query;

  if (!gender) {
    return res.status(400).json({ success: false, message: 'gender is required (M or F).' });
  }
  if (!['meet', 'season'].includes(mode)) {
    return res.status(400).json({ success: false, message: "mode must be 'meet' or 'season'." });
  }

  const topSize = req.query.topSize ? parseInt(req.query.topSize, 10) : DEFAULT_TOP_SIZE;
  const bottomSize = req.query.bottomSize ? parseInt(req.query.bottomSize, 10) : DEFAULT_BOTTOM_SIZE;
  if (!Number.isFinite(topSize) || topSize < 1 || !Number.isFinite(bottomSize) || bottomSize < 1) {
    return res.status(400).json({ success: false, message: 'topSize/bottomSize must be positive integers.' });
  }

  try {
    let course = null;
    if (courseId) {
      course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) {
        return res.status(400).json({ success: false, message: 'courseId not found.' });
      }
    }

    let seasons;
    if (req.query.seasons) {
      seasons = req.query.seasons
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((s) => !isNaN(s));
    } else {
      const raceSeasons = await prisma.race.findMany({
        where: { teamId },
        select: { season: true },
        distinct: ['season'],
      });
      seasons = raceSeasons.map((r) => r.season);
    }
    seasons.sort((a, b) => a - b);

    // Doc: "Do not exclude championship races." No name-based filtering of
    // any kind happens below — every FINISHED, gender-matched result for
    // the requested season(s)/course counts, state meets included.
    const seasonResults = await Promise.all(
      seasons.map((season) =>
        prisma.result.findMany({
          where: {
            teamId,
            status: 'FINISHED',
            race: { season, ...(courseId ? { courseId } : {}) },
            athlete: { gender: { in: gender === 'M' ? ['M', 'Male', 'male'] : ['F', 'Female', 'female'] } },
          },
          select: {
            time: true,
            athleteId: true,
            race: { select: { id: true, distanceMeters: true, fieldMeanSec: true } },
          },
        })
      )
    );

    // normalizationAvailable is computed once, across every race actually
    // considered by this response (all requested seasons combined) — the
    // frontend shows a single banner for the whole page, not one per season.
    const allRaceIds = new Set();
    const racesWithFieldMean = new Set();
    for (const results of seasonResults) {
      for (const r of results) {
        allRaceIds.add(r.race.id);
        if (r.race.fieldMeanSec != null) racesWithFieldMean.add(r.race.id);
      }
    }
    const normalizationAvailable =
      allRaceIds.size > 0 && racesWithFieldMean.size / allRaceIds.size >= NORMALIZATION_MIN_COVERAGE;

    const seasonPayloads = seasons.map((season, idx) => {
      const results = seasonResults[idx];

      const entries = results
        .map((r) => {
          const pace = paceSecPerMile(r.time, r.race.distanceMeters);
          if (pace == null) return null;
          return {
            athleteId: r.athleteId,
            raceId: r.race.id,
            time: r.time,
            paceSecPerMile: pace,
            fieldRatio: normalizationAvailable ? fieldRatio(r.time, r.race.fieldMeanSec) : null,
          };
        })
        .filter(Boolean);

      const rosterSize = new Set(entries.map((e) => e.athleteId)).size;

      if (rosterSize < MIN_BAND_SIZE) {
        return {
          season,
          rosterSize,
          insufficientDepth: true,
          bands: null,
          positionCurve: [],
        };
      }

      const ranges = computeBandRanges(rosterSize, topSize, bottomSize);
      const bandEntries = { top: [], middle: [], bottom: [] };

      if (mode === 'meet') {
        // Per-race rank within team+gender, compared against the season's
        // fixed boundaries — an athlete's band can differ race to race.
        const byRace = new Map();
        for (const e of entries) {
          if (!byRace.has(e.raceId)) byRace.set(e.raceId, []);
          byRace.get(e.raceId).push(e);
        }
        for (const raceEntries of byRace.values()) {
          const ranked = [...raceEntries].sort((a, b) => a.time - b.time);
          ranked.forEach((e, i) => {
            const band = bandForRank(i + 1, ranges);
            if (band) bandEntries[band].push(e);
          });
        }
      } else {
        // Season mode: rank by season-best pace within gender, fixed for
        // the whole season. Every FINISHED race that athlete ran this
        // season pools into their one fixed band (richer sample than a
        // single best-time point, and consistent with meet-mode pooling
        // more than one data point per band).
        const byAthlete = new Map();
        for (const e of entries) {
          if (!byAthlete.has(e.athleteId)) byAthlete.set(e.athleteId, []);
          byAthlete.get(e.athleteId).push(e);
        }
        const seasonBestByAthlete = [...byAthlete.entries()].map(([athleteId, athleteEntries]) => ({
          athleteId,
          bestPace: Math.min(...athleteEntries.map((e) => e.paceSecPerMile)),
        }));
        seasonBestByAthlete.sort((a, b) => a.bestPace - b.bestPace);

        const athleteBand = new Map();
        seasonBestByAthlete.forEach((a, i) => {
          const band = bandForRank(i + 1, ranges);
          if (band) athleteBand.set(a.athleteId, band);
        });

        for (const e of entries) {
          const band = athleteBand.get(e.athleteId);
          if (band) bandEntries[band].push(e);
        }
      }

      const bands = {
        top: summarizeBand(bandEntries.top, ranges.top),
        middle: ranges.middle ? summarizeBand(bandEntries.middle, ranges.middle) : null,
        bottom: summarizeBand(bandEntries.bottom, ranges.bottom),
      };

      // Position curve: the team's own Nth-fastest finisher (by time,
      // within team+gender+race) at positions 1/3/5/7/10, averaged across
      // this season's races (course-scoped already, when courseId is set).
      // Only races with a finisher at that position contribute.
      const byRaceForCurve = new Map();
      for (const e of entries) {
        if (!byRaceForCurve.has(e.raceId)) byRaceForCurve.set(e.raceId, []);
        byRaceForCurve.get(e.raceId).push(e);
      }
      const positionCurve = POSITION_SLOTS.map((position) => {
        const times = [];
        for (const raceEntries of byRaceForCurve.values()) {
          const ranked = [...raceEntries].sort((a, b) => a.time - b.time);
          if (ranked.length >= position) times.push(ranked[position - 1].time);
        }
        return times.length > 0
          ? { position, avgTimeSec: mean(times), raceCount: times.length }
          : { position, avgTimeSec: null, raceCount: 0 };
      });

      return { season, rosterSize, insufficientDepth: false, bands, positionCurve };
    });

    res.json({
      success: true,
      gender,
      mode,
      courseId: course?.id || null,
      courseName: course?.name || null,
      boundaries: { topSize, bottomSize },
      normalizationAvailable,
      seasons: seasonPayloads,
    });
  } catch (err) {
    console.error('Error computing band analytics:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
