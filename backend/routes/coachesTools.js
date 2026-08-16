const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { paceSecPerMile } = require('../lib/groupAnalytics');
const { resolveActiveSeason } = require('../lib/season');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// No fallback literal here on purpose — a hardcoded key was committed to
// this file previously (see MIGRATION_STATUS.md). AI insights are simply
// unavailable until GEMINI_API_KEY is set, rather than silently using a
// shared embedded key.
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const trainingGroupsCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * @route   GET /api/coaches-tools/athlete-performance/:season
 */
router.get('/athlete-performance/:season', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const season = parseInt(req.params.season, 10);

    const athletes = await prisma.athlete.findMany({
      where: { teamId },
      select: { id: true, name: true, grade: true, gender: true },
    });

    const athletePerformance = await Promise.all(
      athletes.map(async (athlete) => {
        const races = await prisma.result.findMany({
          where: { athleteId: athlete.id, teamId, status: 'FINISHED', time: { gt: 0 }, race: { season } },
          select: { id: true, time: true, place: true, race: { select: { id: true, name: true, date: true } } },
          orderBy: { race: { date: 'desc' } },
          take: 3,
        });

        let meetOverMeetImprovement = null;
        let seasonImprovement = null;

        if (races.length >= 2) {
          const mostRecent = races[0];
          const previous = races[1];
          const first = races[races.length - 1];
          meetOverMeetImprovement = ((previous.time - mostRecent.time) / previous.time) * 100;
          seasonImprovement = ((first.time - mostRecent.time) / first.time) * 100;
        }

        return {
          athlete: { id: athlete.id, name: athlete.name, grade: athlete.grade, gender: athlete.gender },
          races: races.map((r) => ({ id: r.id, time: r.time, place: r.place, raceName: r.race.name, raceDate: r.race.date })),
          metrics: {
            meetOverMeetImprovement,
            seasonImprovement,
            avgTime: races.length > 0 ? races.reduce((sum, r) => sum + r.time, 0) / races.length : null,
            raceCount: races.length,
          },
        };
      })
    );

    const validAthletes = athletePerformance.filter((a) => a && a.races.length > 0);
    res.json({ success: true, data: validAthletes });
  } catch (error) {
    logger.error(`Error fetching athlete performance: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch athlete performance' });
  }
});

/**
 * @route   POST /api/coaches-tools/generate-training-groups/:season
 * @desc    Rule-based training groups from recent performance (no AI involved).
 */
router.post('/generate-training-groups/:season', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const targetSeason = await resolveActiveSeason(teamId, req.params.season);

    const seasonRaces = await prisma.race.findMany({ where: { teamId, season: targetSeason }, select: { id: true } });
    const raceIds = seasonRaces.map((r) => r.id);

    if (raceIds.length === 0) {
      return res.json({ success: true, data: { groups: [], rationale: `No races found for the ${targetSeason} season.` } });
    }

    const resultRows = await prisma.result.findMany({
      where: { raceId: { in: raceIds }, teamId },
      select: { athleteId: true },
      distinct: ['athleteId'],
    });
    const athleteIds = resultRows.map((r) => r.athleteId);

    const athletes = await prisma.athlete.findMany({
      where: { id: { in: athleteIds } },
      select: { id: true, name: true, grade: true, gender: true },
    });

    const athleteData = await Promise.all(
      athletes.map(async (athlete) => {
        const results = await prisma.result.findMany({
          where: { athleteId: athlete.id, teamId, raceId: { in: raceIds }, status: 'FINISHED', time: { gt: 0 } },
          select: { time: true, race: { select: { date: true, distanceMeters: true } } },
        });

        const sortedResults = results.sort((a, b) => new Date(b.race.date) - new Date(a.race.date)).slice(0, 3);
        if (sortedResults.length === 0) return null;

        const times = sortedResults.map((r) => r.time);
        const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
        // F1 fix: was avgTime / 3.10686 — assumed every race was a 5K
        // regardless of its real distance. Each race's pace is computed
        // through its own distance first, then averaged (not the other
        // way around — averaging raw times across different distances
        // before converting would still be wrong).
        const racePaces = sortedResults
          .map((r) => paceSecPerMile(r.time, r.race.distanceMeters))
          .filter((p) => p != null);
        const avgPacePerMile = racePaces.length > 0 ? racePaces.reduce((sum, p) => sum + p, 0) / racePaces.length : null;

        const mean = avgTime;
        const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length;
        const stdDev = Math.sqrt(variance);
        const consistency = (stdDev / mean) * 100;

        const trend = times.length >= 2 ? ((times[times.length - 1] - times[0]) / times[times.length - 1]) * 100 : 0;

        return {
          id: athlete.id,
          name: athlete.name,
          gender: athlete.gender,
          grade: athlete.grade || 12,
          avgTime,
          avgPacePerMile,
          consistency,
          trend,
          raceCount: times.length,
        };
      })
    );

    // avgPacePerMile can now be null (a race with no parseable distance) —
    // excluded here rather than defaulted to 0, which would otherwise sort
    // that athlete as if they had the fastest pace on the team (null - n
    // coerces to 0 in the sort below).
    const validAthletes = athleteData.filter((a) => a !== null && a.avgPacePerMile != null);

    if (validAthletes.length === 0) {
      return res.json({ success: true, data: { groups: [], rationale: `No athlete data available for the ${targetSeason} season.` } });
    }

    const groups = [];
    const boys = validAthletes.filter((a) => ['M', 'Male', 'Boys', 'Men'].includes(a.gender));
    const girls = validAthletes.filter((a) => ['F', 'Female', 'Girls', 'Women'].includes(a.gender));

    const createGroups = (athletes, genderLabel) => {
      if (athletes.length === 0) return [];

      const sorted = [...athletes].sort((a, b) => a.avgPacePerMile - b.avgPacePerMile);

      const paceRanges = [];
      const minPace = Math.floor(sorted[0].avgPacePerMile / 15) * 15;
      const maxPace = Math.ceil(sorted[sorted.length - 1].avgPacePerMile / 15) * 15;

      for (let pace = minPace; pace <= maxPace; pace += 15) {
        paceRanges.push({ min: pace, max: pace + 15, athletes: [] });
      }

      sorted.forEach((athlete) => {
        const range = paceRanges.find((r) => athlete.avgPacePerMile >= r.min && athlete.avgPacePerMile < r.max);
        if (range) range.athletes.push(athlete);
      });

      let filledRanges = paceRanges.filter((r) => r.athletes.length > 0);

      const mergedRanges = [];
      for (let i = 0; i < filledRanges.length; i++) {
        const current = filledRanges[i];
        if (current.athletes.length === 1) {
          if (mergedRanges.length > 0) {
            mergedRanges[mergedRanges.length - 1].athletes.push(...current.athletes);
            mergedRanges[mergedRanges.length - 1].max = current.max;
          } else if (i + 1 < filledRanges.length) {
            filledRanges[i + 1].athletes.unshift(...current.athletes);
            filledRanges[i + 1].min = current.min;
          } else {
            mergedRanges.push(current);
          }
        } else {
          mergedRanges.push(current);
        }
      }

      return mergedRanges.map((range, idx) => {
        const groupAthletes = range.athletes;
        const avgPaceSeconds = groupAthletes.reduce((sum, a) => sum + a.avgPacePerMile, 0) / groupAthletes.length;
        const paceMin = Math.floor(avgPaceSeconds / 60);
        const paceSec = Math.floor(avgPaceSeconds % 60);

        let tier = '';
        if (idx === 0) tier = 'Elite';
        else if (idx === 1) tier = 'Varsity';
        else if (idx === 2) tier = 'Development';
        else tier = 'Training';

        const avgConsistency = groupAthletes.reduce((sum, a) => sum + a.consistency, 0) / groupAthletes.length;
        const avgTrend = groupAthletes.reduce((sum, a) => sum + a.trend, 0) / groupAthletes.length;

        let focus = '';
        if (avgConsistency > 5) focus = 'Focus on consistency and pacing strategy';
        else if (avgTrend < -3) focus = 'Building on strong improvement trend';
        else if (avgTrend > 3) focus = 'Recovery and rebuilding confidence';
        else focus = 'Maintaining performance and pushing limits';

        return {
          name: `${genderLabel} ${tier} (${paceMin}:${paceSec.toString().padStart(2, '0')}/mi)`,
          athletes: groupAthletes.map((a) => a.name),
          focus,
          stats: {
            avgPace: `${paceMin}:${paceSec.toString().padStart(2, '0')}`,
            size: groupAthletes.length,
            gradeRange: `${Math.min(...groupAthletes.map((a) => a.grade))}-${Math.max(...groupAthletes.map((a) => a.grade))}`,
          },
        };
      });
    };

    groups.push(...createGroups(boys, 'Boys'));
    groups.push(...createGroups(girls, 'Girls'));

    const rationale = `Groups created using pace-based ranges (15-second intervals). Athletes are grouped by average pace from their last ${validAthletes[0]?.raceCount || 3} races, separated by gender. Tighter pace ranges ensure athletes train with similar-ability teammates.`;

    res.json({ success: true, data: { groups, rationale, method: 'rule-based' } });
  } catch (error) {
    logger.error(`Error generating training groups: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to generate training groups' });
  }
});

/**
 * @route   POST /api/coaches-tools/ai-insights/:season
 */
router.post('/ai-insights/:season', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  if (!genAI) {
    return res.status(503).json({ success: false, message: 'AI insights are not configured (GEMINI_API_KEY is not set).' });
  }

  try {
    const teamId = req.user.teamId;
    const season = req.params.season;
    const cacheKey = `ai-insights-${teamId}-${season}`;

    const cached = trainingGroupsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({ success: true, data: cached.data, cached: true });
    }

    const targetSeason = await resolveActiveSeason(teamId, season);

    const seasonRaces = await prisma.race.findMany({ where: { teamId, season: targetSeason }, select: { id: true } });
    const raceIds = seasonRaces.map((r) => r.id);

    if (raceIds.length === 0) {
      return res.json({ success: true, data: { insights: [], summary: 'No race data available for analysis.' } });
    }

    const resultRows = await prisma.result.findMany({
      where: { raceId: { in: raceIds }, teamId },
      select: { athleteId: true },
      distinct: ['athleteId'],
    });
    const athleteIds = resultRows.map((r) => r.athleteId);

    const athletes = await prisma.athlete.findMany({
      where: { id: { in: athleteIds } },
      select: { id: true, name: true, grade: true, gender: true },
    });

    const athleteData = await Promise.all(
      athletes.map(async (athlete) => {
        const results = await prisma.result.findMany({
          where: { athleteId: athlete.id, teamId, raceId: { in: raceIds }, status: 'FINISHED', time: { gt: 0 } },
          select: { time: true, place: true, race: { select: { date: true } } },
        });

        const sortedResults = results.sort((a, b) => new Date(a.race.date) - new Date(b.race.date));
        if (sortedResults.length < 2) return null;

        const times = sortedResults.map((r) => r.time);
        const places = sortedResults.map((r) => r.place).filter((p) => p != null);
        const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
        const improvement = ((times[0] - times[times.length - 1]) / times[0]) * 100;

        const variance = times.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / times.length;
        const consistency = Math.sqrt(variance);

        return {
          name: athlete.name,
          gender: athlete.gender,
          grade: athlete.grade,
          raceCount: times.length,
          avgTime: Math.round(avgTime),
          improvement: Math.round(improvement * 10) / 10,
          consistency: Math.round(consistency),
          avgPlace: places.length ? Math.round(places.reduce((sum, p) => sum + p, 0) / places.length) : null,
          bestTime: Math.min(...times),
          worstTime: Math.max(...times),
        };
      })
    );

    const validAthletes = athleteData.filter((a) => a !== null);

    if (validAthletes.length === 0) {
      return res.json({ success: true, data: { insights: [], summary: 'Insufficient data for AI analysis.' } });
    }

    const prompt = `Analyze this cross country team's performance data and identify 3-5 key insights or patterns that a coach might not immediately notice. Focus on:
- Unusual improvement or decline patterns
- Athletes with breakthrough potential
- Consistency issues that need attention
- Correlation between factors
- Strategic recommendations

Team Data Summary:
${validAthletes.slice(0, 20).map((a) => `${a.name}: ${a.raceCount} races, ${a.improvement > 0 ? '+' : ''}${a.improvement}% improvement, consistency: ${a.consistency}s variance`).join('\n')}

Return JSON only:
{
  "insights": [
    {
      "title": "Brief insight title",
      "description": "1-2 sentence explanation",
      "athletes": ["Athlete names if relevant"],
      "priority": "high|medium|low"
    }
  ],
  "summary": "2-3 sentence overview of team's overall performance patterns"
}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }

    const aiResponse = JSON.parse(jsonMatch[0]);
    trainingGroupsCache.set(cacheKey, { data: aiResponse, timestamp: Date.now() });

    res.json({ success: true, data: aiResponse, cached: false });
  } catch (error) {
    logger.error(`Error generating AI insights: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to generate AI insights' });
  }
});

/**
 * @route   GET /api/coaches-tools/improvement-tracking/:season
 */
router.get('/improvement-tracking/:season', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const targetSeason = await resolveActiveSeason(teamId, req.params.season);

    const seasonRaces = await prisma.race.findMany({
      where: { teamId, season: targetSeason },
      select: { id: true },
    });
    const raceIds = seasonRaces.map((r) => r.id);

    if (raceIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const athletes = await prisma.athlete.findMany({
      where: { teamId },
      select: { id: true, name: true, grade: true, gender: true },
    });

    const improvements = await Promise.all(
      athletes.map(async (athlete) => {
        const results = await prisma.result.findMany({
          where: { athleteId: athlete.id, teamId, raceId: { in: raceIds }, status: 'FINISHED', time: { gt: 0 } },
          select: { time: true, place: true, race: { select: { name: true, date: true, distance: true } } },
        });

        const sortedResults = results.sort((a, b) => new Date(a.race.date) - new Date(b.race.date));
        if (sortedResults.length < 2) return null;

        const racesByDistance = sortedResults.reduce((acc, r) => {
          const distance = r.race.distance || '5000';
          if (!acc[distance]) acc[distance] = [];
          acc[distance].push(r);
          return acc;
        }, {});

        const primaryDistance = Object.entries(racesByDistance).sort((a, b) => b[1].length - a[1].length)[0]?.[0];
        if (!primaryDistance) return null;

        const comparableRaces = racesByDistance[primaryDistance];
        if (comparableRaces.length < 2) return null;

        const firstRace = comparableRaces[0];
        const mostRecentRace = comparableRaces[comparableRaces.length - 1];
        const previous = comparableRaces.length > 1 ? comparableRaces[comparableRaces.length - 2] : null;
        const bestRace = comparableRaces.reduce((best, current) => (current.time < best.time ? current : best));

        const meetOverMeet = previous ? ((previous.time - mostRecentRace.time) / previous.time) * 100 : null;
        const seasonImprovement = ((firstRace.time - bestRace.time) / firstRace.time) * 100;

        const toRaceView = (r) => ({ name: r.race.name, date: r.race.date, time: r.time, place: r.place, distance: r.race.distance });

        return {
          athlete: { id: athlete.id, name: athlete.name, grade: athlete.grade, gender: athlete.gender },
          firstRace: toRaceView(firstRace),
          bestRace: toRaceView(bestRace),
          mostRecentRace: toRaceView(mostRecentRace),
          metrics: {
            meetOverMeetImprovement: meetOverMeet,
            seasonImprovement,
            totalRaces: comparableRaces.length,
            comparisonDistance: primaryDistance,
          },
        };
      })
    );

    const validImprovements = improvements.filter((i) => i !== null).sort((a, b) => b.metrics.seasonImprovement - a.metrics.seasonImprovement);

    res.json({ success: true, data: validImprovements });
  } catch (error) {
    logger.error(`Error fetching improvement tracking: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch improvement tracking' });
  }
});

module.exports = router;
