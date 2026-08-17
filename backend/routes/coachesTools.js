const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { resolveActiveSeason, listSeasonsWithData } = require('../lib/season');
const { anonymizeAthletesForAnalysis } = require('../lib/kippwitAnonymize');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// No fallback literal here on purpose — a hardcoded key was committed to
// this file previously (see MIGRATION_STATUS.md). AI insights are simply
// unavailable until GEMINI_API_KEY is set, rather than silently using a
// shared embedded key.
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const aiInsightsCache = new Map();
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
 * @route   POST /api/coaches-tools/ai-insights/:season
 * @desc    AI-generated read on the roster, focused on three things a coach
 *          actually wants from this: who's consistent vs. erratic, who's
 *          trending faster or slower, and a short watch list. If the
 *          requested season has no races yet (preseason), falls back to the
 *          most recent season that has data and says so in the response.
 */
router.post('/ai-insights/:season', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  if (!genAI) {
    return res.status(503).json({ success: false, message: 'AI insights are not configured (GEMINI_API_KEY is not set).' });
  }

  try {
    const teamId = req.user.teamId;
    const season = req.params.season;
    const cacheKey = `ai-insights-${teamId}-${season}`;

    const cached = aiInsightsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({ success: true, data: cached.data, cached: true });
    }

    const requestedSeason = await resolveActiveSeason(teamId, season);

    let usingSeason = requestedSeason;
    let isPreseasonFallback = false;
    let seasonRaces = await prisma.race.findMany({ where: { teamId, season: requestedSeason }, select: { id: true } });

    if (seasonRaces.length === 0) {
      const seasonsWithData = await listSeasonsWithData(teamId);
      const fallbackSeason = seasonsWithData.find((s) => s < requestedSeason) ?? seasonsWithData[0];
      if (Number.isFinite(fallbackSeason)) {
        usingSeason = fallbackSeason;
        isPreseasonFallback = true;
        seasonRaces = await prisma.race.findMany({ where: { teamId, season: fallbackSeason }, select: { id: true } });
      }
    }

    const raceIds = seasonRaces.map((r) => r.id);

    if (raceIds.length === 0) {
      return res.json({ success: true, data: { insights: [], summary: 'No race data available yet — import a season to get started.' } });
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
        const stdDev = Math.sqrt(variance);
        // As a % of average time, so a fast and a slow athlete with the same
        // absolute variance don't get misread as differently consistent.
        const consistencyPct = Math.round((stdDev / avgTime) * 1000) / 10;

        return {
          name: athlete.name,
          gender: athlete.gender,
          grade: athlete.grade,
          raceCount: times.length,
          avgTime: Math.round(avgTime),
          improvement: Math.round(improvement * 10) / 10,
          consistency: consistencyPct,
          avgPlace: places.length ? Math.round(places.reduce((sum, p) => sum + p, 0) / places.length) : null,
          bestTime: Math.min(...times),
          worstTime: Math.max(...times),
        };
      })
    );

    const validAthletes = athleteData.filter((a) => a !== null);

    if (validAthletes.length === 0) {
      return res.json({ success: true, data: { insights: [], summary: 'Insufficient data for AI analysis — athletes need at least 2 races.' } });
    }

    // Real names never reach the prompt below — see lib/kippwitAnonymize.js.
    const { anonymized, deanonymize } = anonymizeAthletesForAnalysis(validAthletes);

    const preseasonNote = isPreseasonFallback
      ? `This team has no races yet in the ${requestedSeason} season, so this analysis uses their ${usingSeason} season instead — frame it as "who to watch as the new season starts," not current-season form.\n\n`
      : '';

    const prompt = `You are analyzing a high school cross country team's race results for the coach. Athlete identities have been replaced with anonymous tokens in the format ATHLETE_XXXXXX. Follow these rules exactly or the output will be unusable:
1. NEVER guess, infer, or invent a real name for any token.
2. Reproduce every token EXACTLY as written — same prefix, same underscore, same characters. ATHLETE_K3X9MQ must appear as ATHLETE_K3X9MQ, never "the first athlete", "Athlete K3", or any paraphrase.
3. Do not bold, italicize, or wrap tokens in backticks — plain text only.
4. Do not use a possessive or pronoun that drops the token. Write "ATHLETE_K3X9MQ's pace" not "their pace".

Focus ONLY on three things:
1. CONSISTENCY — who races reliably close to their own average vs. who is erratic from meet to meet.
2. GROWTH — who is trending faster over the season and who is trending slower or plateauing.
3. WATCH LIST — up to 5 athletes the coach should keep an eye on right now: breakout candidates, athletes at risk of plateauing or regressing, or athletes whose inconsistency needs coaching attention. Give a specific, concrete reason for each, grounded in the numbers below.

${preseasonNote}Team Data (times in seconds; improvement is season-long % change, positive = faster; consistency is standard deviation as a % of average time — lower is more consistent):
${anonymized.slice(0, 30).map((a) => `${a.name}: ${a.raceCount} races, avg ${a.avgTime}s, ${a.improvement > 0 ? '+' : ''}${a.improvement}% season improvement, ${a.consistency}% consistency variance, avg place ${a.avgPlace ?? 'n/a'}`).join('\n')}

Return JSON only, with every insight tagged by which of the three focus areas it belongs to. Use tokens (not real names — you don't know them) everywhere an athlete is referenced:
{
  "insights": [
    {
      "title": "Brief insight title",
      "description": "1-2 sentence explanation with specifics from the data",
      "athletes": ["ATHLETE_XXXXXX tokens if relevant"],
      "priority": "high|medium|low",
      "category": "consistency|growth|watch"
    }
  ],
  "summary": "2-3 sentence overview focused on consistency, growth, and who to watch"
}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }

    const aiResponse = JSON.parse(jsonMatch[0]);
    // Restore real names everywhere a token could have landed — the
    // summary and each insight's title/description, not just the
    // structured athletes array.
    aiResponse.summary = deanonymize(aiResponse.summary);
    if (Array.isArray(aiResponse.insights)) {
      aiResponse.insights = aiResponse.insights.map((insight) => ({
        ...insight,
        title: deanonymize(insight.title),
        description: deanonymize(insight.description),
        athletes: Array.isArray(insight.athletes) ? insight.athletes.map(deanonymize) : insight.athletes,
      }));
    }
    aiResponse.usingSeason = usingSeason;
    aiResponse.isPreseasonFallback = isPreseasonFallback;
    aiResponse.anonymization = { poweredBy: 'Kippwit', url: 'https://kippwit.com' };

    aiInsightsCache.set(cacheKey, { data: aiResponse, timestamp: Date.now() });

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
