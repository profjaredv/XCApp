const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { resolveActiveSeason, listSeasonsWithData } = require('../lib/season');
const { anonymizeAthletesForAnalysis } = require('../lib/kippwitAnonymize');
const { computeCoachUpAnalysis } = require('../lib/coachUpAnalysis');
const { computeBandRanges, bandForRank } = require('../lib/bandAnalytics');
const { paceSecPerMile } = require('../lib/groupAnalytics');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// No fallback literal here on purpose — a hardcoded key was committed to
// this file previously (see MIGRATION_STATUS.md). AI insights are simply
// unavailable until GEMINI_API_KEY is set, rather than silently using a
// shared embedded key.
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Same top/middle/bottom split the Program tab's band charts use
// (routes/bandAnalytics.js's own DEFAULT_TOP_SIZE/DEFAULT_BOTTOM_SIZE) —
// "middle tier" means the same thing everywhere in this app.
const TIER_TOP_SIZE = 20;
const TIER_BOTTOM_SIZE = 30;

function formatPaceForPrompt(secPerMile) {
  // Round the total first, then split — rounding minutes and seconds
  // separately can land on e.g. "6:60" (59.6s rounds to 60) instead of
  // "7:00".
  const totalSec = Math.round(secPerMile);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}/mi`;
}

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
 * @desc    AI-generated read on the roster: pattern-matched storytelling
 *          about who's trending where, with a specific focus on middle-
 *          tier athletes closing the gap to the top tier — not just a
 *          stats dump. If the requested season has no races yet
 *          (preseason), falls back to the most recent season that has
 *          data and says so in the response.
 *
 *          Regeneration is gated on the underlying data actually having
 *          changed (see AiInsightSnapshot's schema comment) — a coach
 *          clicking "Generate Insights" again on unchanged data gets the
 *          existing snapshot back, not a new Gemini call. ?force=true
 *          bypasses that, but only for a superadmin (testing).
 */
router.post('/ai-insights/:season', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  if (!genAI) {
    return res.status(503).json({ success: false, message: 'AI insights are not configured (GEMINI_API_KEY is not set).' });
  }

  try {
    const teamId = req.user.teamId;
    const season = req.params.season;
    const forceRegenerate = req.query.force === 'true' && req.user.isSuperAdmin === true;

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

    // Data fingerprint for the (team, usingSeason) pair: if neither has
    // moved since the stored snapshot, a fresh Gemini call would just be
    // paying to re-derive the same analysis from the same numbers — and
    // an LLM re-run isn't even guaranteed to phrase it the same way twice,
    // so "regenerating for no reason" can actively look like the tool
    // contradicting itself. Return the snapshot instead.
    const raceCount = raceIds.length;
    const resultCount = await prisma.result.count({
      where: { raceId: { in: raceIds }, teamId, status: 'FINISHED', time: { gt: 0 } },
    });

    const existingSnapshot = await prisma.aiInsightSnapshot.findUnique({
      where: { teamId_season: { teamId, season: usingSeason } },
    });
    if (
      existingSnapshot &&
      existingSnapshot.raceCount === raceCount &&
      existingSnapshot.resultCount === resultCount &&
      !forceRegenerate
    ) {
      return res.json({
        success: true,
        data: { ...existingSnapshot.data, usingSeason, isPreseasonFallback },
        cached: true,
        generatedAt: existingSnapshot.generatedAt,
      });
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
          select: { time: true, place: true, race: { select: { date: true, distanceMeters: true } } },
        });

        const sortedResults = results.sort((a, b) => new Date(a.race.date) - new Date(b.race.date));

        // Pace (sec/mile), not raw time — a season's races are rarely all
        // the same distance (dual meets vs. invites, one course vs.
        // another), and a raw-time comparison across distances is
        // meaningless: a "10% faster" swing that's really just a shorter
        // course used to read as a breakout or a collapse depending on
        // which way the distance happened to change. This was the actual
        // mechanism behind "wrong analysis against out-of-context
        // performers" — the AI wasn't being unreasonable, it was being fed
        // numbers that weren't comparable to begin with. A race whose
        // distance is missing is excluded from the pace numbers (never
        // treated as a zero), same as summarizeRaces in lib/groupAnalytics.js.
        const pacedResults = sortedResults
          .map((r) => ({ ...r, pace: paceSecPerMile(r.time, r.race.distanceMeters) }))
          .filter((r) => r.pace != null);

        if (pacedResults.length < 2) return null;

        const paces = pacedResults.map((r) => r.pace);
        const places = pacedResults.map((r) => r.place).filter((p) => p != null);
        const avgPace = paces.reduce((sum, p) => sum + p, 0) / paces.length;
        const improvement = ((paces[0] - paces[paces.length - 1]) / paces[0]) * 100;

        const variance = paces.reduce((sum, p) => sum + Math.pow(p - avgPace, 2), 0) / paces.length;
        const stdDev = Math.sqrt(variance);
        // As a % of average pace, so a fast and a slow athlete with the
        // same absolute variance don't get misread as differently
        // consistent.
        const consistencyPct = Math.round((stdDev / avgPace) * 1000) / 10;

        return {
          name: athlete.name,
          gender: athlete.gender,
          grade: athlete.grade,
          raceCount: paces.length,
          avgPaceSecPerMile: Math.round(avgPace),
          improvement: Math.round(improvement * 10) / 10,
          consistency: consistencyPct,
          avgPlace: places.length ? Math.round(places.reduce((sum, p) => sum + p, 0) / places.length) : null,
        };
      })
    );

    const validAthletes = athleteData.filter((a) => a !== null);

    if (validAthletes.length === 0) {
      return res.json({ success: true, data: { insights: [], summary: 'Insufficient data for AI analysis — athletes need at least 2 races.' } });
    }

    // Team tier (top/middle/bottom), ranked within gender by season avg
    // pace — the same split the Program tab's band charts use (a band is
    // always computed within one gender; see lib/bandAnalytics.js). This
    // is the context the model was previously missing entirely: without an
    // explicit tier, "who's mid-pack and closing the gap" had to be
    // guessed from a noisy avgPlace (a single race's field position, not a
    // team-relative rank), which is exactly how a genuinely mid-pack
    // athlete could get analyzed as if they were a front-runner or a
    // straggler. An athlete with no recorded gender is left untiered
    // rather than guessed into either group.
    for (const gender of ['M', 'F']) {
      const group = validAthletes
        .filter((a) => a.gender === gender)
        .sort((a, b) => a.avgPaceSecPerMile - b.avgPaceSecPerMile);
      const ranges = computeBandRanges(group.length, TIER_TOP_SIZE, TIER_BOTTOM_SIZE);
      group.forEach((athlete, idx) => {
        athlete.tier = bandForRank(idx + 1, ranges);
      });
    }

    // Real names never reach the prompt below — see lib/kippwitAnonymize.js.
    const { anonymized, deanonymize } = anonymizeAthletesForAnalysis(validAthletes);

    const preseasonNote = isPreseasonFallback
      ? `This team has no races yet in the ${requestedSeason} season, so this analysis uses their ${usingSeason} season instead — frame it as "who to watch as the new season starts," not current-season form.\n\n`
      : '';

    const prompt = `You are a cross country coach's analyst, writing scouting notes on your own team from race data. Athlete identities have been replaced with anonymous tokens in the format ATHLETE_XXXXXX. Follow these rules exactly or the output will be unusable:
1. NEVER guess, infer, or invent a real name for any token.
2. Reproduce every token EXACTLY as written — same prefix, same underscore, same characters. ATHLETE_K3X9MQ must appear as ATHLETE_K3X9MQ, never "the first athlete", "Athlete K3", or any paraphrase.
3. Do not bold, italicize, or wrap tokens in backticks — plain text only.
4. Do not use a possessive or pronoun that drops the token. Write "ATHLETE_K3X9MQ's pace" not "their pace".

Data notes — read these before analyzing, they prevent the most common mistakes:
- Pace (min:sec per mile) is already normalized for distance, so it's directly comparable across every race in the data below even though the races were different distances. Do not discount or second-guess a pace comparison because you don't know the distance — that's already been handled.
- "tier" (top / middle / bottom) is each athlete's rank against their OWN gender only, by season average pace — never compare a tier or a pace between genders, and don't recompute rank yourself from avgPlace (that's one race's field position, a noisier and different signal from tier).
- Treat a 2-race athlete's trend as tentative and say so if you lean on it ("early, but..."); a 4+ race trend can be stated with more confidence.
- Grade matters for framing, not for scoring: a freshman or sophomore improving fast is normal development, not necessarily a "breakout" — reserve that word for someone actually closing the gap to the top tier, at any grade.

Write like scouting notes, not a stats printout: connect the numbers into what's actually happening with each athlete or group of athletes, don't just restate the figures back with words like "avg pace of X" stitched around them.

Focus on exactly three things:
1. CONSISTENCY — who races reliably close to their own average vs. who is erratic meet to meet, and (when the data suggests why) what that pattern looks like — e.g. strong on the same course twice but volatile elsewhere, or steady early and erratic late in the season.
2. BREAKOUT WATCH — the team's real point of leverage: middle-tier athletes whose pace is trending toward the top tier's range, not the team's fastest runners (who are already known) and not athletes with no real trend yet. Say specifically how close the gap is and how fast it's closing. If nobody in the middle tier is trending up, say so plainly instead of forcing a candidate.
3. NEEDS ATTENTION — athletes, at any tier, who are regressing, plateauing after being on an upward trend, or newly erratic in a way that's worth a coaching conversation. Not a catch-all "watch list" — every entry here should name a specific concern, not just "keep an eye on this athlete."

${preseasonNote}Team Data (pace already normalized to min:sec/mile; pace change is season-long % change in pace, positive = faster; pace variance is standard deviation as a % of average pace — lower is more consistent):
${anonymized.slice(0, 30).map((a) => `${a.name}: ${a.tier ?? 'unranked'} tier (${a.gender === 'F' ? 'girls' : a.gender === 'M' ? 'boys' : 'gender unknown'}), grade ${a.grade ?? 'n/a'}, ${a.raceCount} races, avg pace ${formatPaceForPrompt(a.avgPaceSecPerMile)}, ${a.improvement > 0 ? '+' : ''}${a.improvement}% pace change over the season, ${a.consistency}% pace variance, avg finish place ${a.avgPlace ?? 'n/a'}`).join('\n')}

Return JSON only, with every insight tagged by which of the three focus areas it belongs to. Use tokens (not real names — you don't know them) everywhere an athlete is referenced:
{
  "insights": [
    {
      "title": "Brief insight title",
      "description": "2-3 sentence scouting note grounded in the numbers above — connect them into what's happening, not a restatement of the figures",
      "athletes": ["ATHLETE_XXXXXX tokens if relevant"],
      "priority": "high|medium|low",
      "category": "consistency|breakout|attention"
    }
  ],
  "summary": "2-3 sentence overview that tells the season's story so far, not a category-by-category recap"
}`;

    // Pinned model IDs go stale (gemini-2.0-flash-exp, this route's
    // original choice, has since been shut down along with GA
    // gemini-2.0-flash itself — that's what was surfacing as a bare 500
    // here). "-latest" is a Google-maintained alias that always resolves
    // to whatever the current flash model actually is, so this never
    // needs a manual bump again when a model gets retired.
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
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

    await prisma.aiInsightSnapshot.upsert({
      where: { teamId_season: { teamId, season: usingSeason } },
      update: { data: aiResponse, raceCount, resultCount, generatedAt: new Date() },
      create: { teamId, season: usingSeason, data: aiResponse, raceCount, resultCount },
    });

    res.json({ success: true, data: aiResponse, cached: false });
  } catch (error) {
    logger.error(`Error generating AI insights: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to generate AI insights' });
  }
});

/**
 * @route   GET /api/coaches-tools/coach-up/:season
 * @desc    Deterministic "who should we coach up" scoring — see
 *          lib/coachUpAnalysis.js. No AI, no anonymization, no API key:
 *          every athlete's consistency and season-long improvement is
 *          z-scored against their own gender group, combined into one
 *          score, and the team's already-fastest runners are excluded so
 *          what's left is the athletes flying under the radar. Same
 *          preseason fallback as ai-insights: no races yet this season
 *          falls back to the most recent season with data.
 */
router.get('/coach-up/:season', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const teamId = req.user.teamId;
    const requestedSeason = await resolveActiveSeason(teamId, req.params.season);

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
      return res.json({
        success: true,
        data: { athletes: [], watchList: [], consistencyConcerns: [], regressionRisks: [], usingSeason, isPreseasonFallback: false },
      });
    }

    const athletes = await prisma.athlete.findMany({
      where: { teamId },
      select: { id: true, name: true, grade: true, gender: true },
    });

    const athletesWithRaces = await Promise.all(
      athletes.map(async (athlete) => {
        const results = await prisma.result.findMany({
          where: { athleteId: athlete.id, teamId, raceId: { in: raceIds }, status: 'FINISHED', time: { gt: 0 } },
          select: { time: true, race: { select: { date: true, distanceMeters: true } } },
        });
        return {
          id: athlete.id,
          name: athlete.name,
          grade: athlete.grade,
          gender: athlete.gender,
          races: results.map((r) => ({ timeSec: r.time, distanceMeters: r.race.distanceMeters, date: r.race.date })),
        };
      })
    );

    const analysis = computeCoachUpAnalysis(athletesWithRaces);

    // Fold in this season's acknowledgments: dismissed (athlete, category)
    // pairs drop out of the three flagged lists, but every athlete keeps
    // showing up in the full `athletes` array (with which categories are
    // dismissed attached) so a coach can still look them up or undo it.
    const acknowledgements = await prisma.coachUpAcknowledgement.findMany({
      where: { teamId, season: usingSeason },
      select: { athleteId: true, category: true },
    });
    const acknowledgedKeys = new Set(acknowledgements.map((a) => `${a.athleteId}::${a.category}`));
    const isAcknowledged = (athleteId, category) => acknowledgedKeys.has(`${athleteId}::${category}`);
    const acknowledgedByAthlete = new Map();
    for (const a of acknowledgements) {
      if (!acknowledgedByAthlete.has(a.athleteId)) acknowledgedByAthlete.set(a.athleteId, []);
      acknowledgedByAthlete.get(a.athleteId).push(a.category);
    }

    const withAcknowledgements = {
      athletes: analysis.athletes.map((a) => ({ ...a, acknowledgedCategories: acknowledgedByAthlete.get(a.id) ?? [] })),
      watchList: analysis.watchList.filter((a) => !isAcknowledged(a.id, 'watch')),
      consistencyConcerns: analysis.consistencyConcerns.filter((a) => !isAcknowledged(a.id, 'consistency')),
      regressionRisks: analysis.regressionRisks.filter((a) => !isAcknowledged(a.id, 'regression')),
    };

    res.json({ success: true, data: { ...withAcknowledgements, usingSeason, isPreseasonFallback } });
  } catch (error) {
    logger.error(`Error computing coach-up analysis: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to compute coach-up analysis' });
  }
});

const COACH_UP_CATEGORIES = ['watch', 'consistency', 'regression'];

/**
 * @route   POST /api/coaches-tools/coach-up/acknowledge
 * @desc    Dismiss one athlete off one flagged list for one season —
 *          idempotent (re-acknowledging an already-acknowledged pair is a
 *          no-op, not an error).
 */
router.post('/coach-up/acknowledge', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { athleteId, category, season } = req.body;
  if (!athleteId || !COACH_UP_CATEGORIES.includes(category) || !Number.isFinite(Number(season))) {
    return res.status(400).json({ success: false, message: `athleteId, season, and category (one of ${COACH_UP_CATEGORIES.join(', ')}) are required.` });
  }

  try {
    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId: req.user.teamId } });
    if (!athlete) {
      return res.status(404).json({ success: false, message: 'Athlete not found.' });
    }

    const row = await prisma.coachUpAcknowledgement.upsert({
      where: { teamId_athleteId_category_season: { teamId: req.user.teamId, athleteId, category, season: Number(season) } },
      update: { acknowledgedById: req.user.id, acknowledgedAt: new Date() },
      create: { teamId: req.user.teamId, athleteId, category, season: Number(season), acknowledgedById: req.user.id },
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    logger.error(`Error acknowledging coach-up flag: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to acknowledge that flag' });
  }
});

/**
 * @route   DELETE /api/coaches-tools/coach-up/acknowledge
 * @desc    Undo a dismissal — idempotent (nothing to delete is not an error).
 */
router.delete('/coach-up/acknowledge', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { athleteId, category, season } = req.body;
  if (!athleteId || !COACH_UP_CATEGORIES.includes(category) || !Number.isFinite(Number(season))) {
    return res.status(400).json({ success: false, message: `athleteId, season, and category (one of ${COACH_UP_CATEGORIES.join(', ')}) are required.` });
  }

  try {
    await prisma.coachUpAcknowledgement.deleteMany({
      where: { teamId: req.user.teamId, athleteId, category, season: Number(season) },
    });
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error un-acknowledging coach-up flag: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to undo that acknowledgment' });
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
