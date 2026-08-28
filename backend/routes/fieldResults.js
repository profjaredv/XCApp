// Manual field-results upload — see lib/fieldResultsCsv.js for the "why":
// scrape_meet_playwright.js (the automated full-field scraper) is blocked
// in this environment, so this is how Race.fieldMeanSec/fieldMedianSec/
// fieldFinisherCount get populated today. A coach exports or copies a
// meet's full results from Athletic.net into a CSV and uploads it for one
// of the team's own races; this computes and stores the field's aggregate
// stats. Once the scraper exists, this stays as the fallback/manual-fix
// path for races it can't reach — not replaced.
//
// Authorization: same tier as the season scraper's /scrape (data-entry
// action, not head-coach-only) — authenticate, requireTeam, requireRole
// (['HEAD_COACH', 'COACH']) on the write endpoints; read-only status is
// requireTeam-only (any team member can see whether a race has field data).
//
// Privacy/ToS posture (schema comment on FieldResult, Build Spec "Core
// measurement decisions"): individual FieldResult rows — other schools'
// athletes — are never returned by any endpoint here, only the aggregate
// (fieldMeanSec/fieldMedianSec/fieldFinisherCount). A coach reviews what
// they're about to upload by looking at their own CSV before submitting,
// not by round-tripping through this API.
//
// Cross-team sharing: the same real meet is scraped/imported separately by
// every XCApp team that attends it (deliberate multi-tenancy — see NOTES.md
// "Duplicate strategy" on Meet), so once one team uploads a meet's field,
// every other team's Race row for that same meet+race (joined on
// Race.athleticMeetId + name, see findSharedFieldSource below) can adopt
// the same aggregate numbers instead of re-pasting an identical CSV. This
// is a one-time copy of arithmetic, not a live sync and not a shared
// FieldResult roster — see copy-from-meet below for why.

const express = require('express');
const router = express.Router();
const { parse } = require('csv-parse/sync');
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { FULL_COACH } = require('../lib/teamRoles');
const { computeFieldStats } = require('../lib/fieldNormalization');
const { parseFieldResultsCsv } = require('../lib/fieldResultsCsv');
const { computeRacePlacements } = require('../lib/fieldPlacement');
const perfCache = require('../services/performance/cache');

// A meet's full field is the same real-world data no matter which XCApp
// team uploaded it — 20 different teams at the same invitational shouldn't
// each have to paste the identical results CSV. `athleticMeetId` (Phase 2
// step 1) plus the race's own `name` is the join key: same meet, same named
// race (Athletic.net already splits boys/girls/JV into separate races, so
// name is enough to disambiguate within one meet). Only ever copies the
// three AGGREGATE fields — never a FieldResult row, never a source team's
// identity — so the no-named-rows-across-teams invariant on FieldResult
// itself is untouched; this is sharing arithmetic, not roster data.
async function findSharedFieldSource(race) {
  if (!race.athleticMeetId) return null;
  return prisma.race.findFirst({
    where: {
      athleticMeetId: race.athleticMeetId,
      name: race.name,
      teamId: { not: race.teamId },
      fieldFinisherCount: { not: null },
    },
    select: { fieldMeanSec: true, fieldMedianSec: true, fieldFinisherCount: true },
    orderBy: { updatedAt: 'desc' },
  });
}

// Race place / division / overall place (lib/fieldPlacement.js, Result
// schema comments) are recomputed for THIS race only — Race stays scoped to
// (team, meet, distance) same as ORIGIN already creates it, so every
// division/gender for that distance already lives on one race's own
// FieldResult set. No meet-wide sibling-race lookup needed.
async function recomputeRacePlacements(raceId) {
  const race = await prisma.race.findUnique({
    where: { id: raceId },
    include: {
      fieldResults: true,
      results: { include: { athlete: { select: { id: true, name: true, gender: true } } } },
    },
  });
  if (!race) return;

  const placements = computeRacePlacements(race);
  const affectedAthleteIds = new Set();
  const updates = [];

  race.results.forEach((result) => {
    const entry = placements.get(result.id) || { division: null, place: null, overallPlace: null, overallFieldSize: null };
    updates.push(
      prisma.result.update({
        where: { id: result.id },
        data: entry,
      })
    );
    affectedAthleteIds.add(result.athleteId);
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }

  // Best-effort: a coach re-uploading a CSV a moment later shouldn't have
  // to wait on cache infrastructure, and PerformanceCache already no-ops
  // safely when Redis isn't configured (dev/test).
  await perfCache.invalidate([...affectedAthleteIds].map((id) => `athlete:${id}:all-seasons`));
}

// GET /api/field-results/races?season=YYYY
// Every race the team has for a season, with its current field-data status
// — the coach's "what still needs uploading" view. Aggregate fields only.
router.get('/races', authenticate, requireTeam, async (req, res) => {
  const teamId = req.user.teamId;
  const season = parseInt(req.query.season, 10);

  if (!Number.isFinite(season)) {
    return res.status(400).json({ success: false, message: 'season is required.' });
  }

  try {
    const races = await prisma.race.findMany({
      where: { teamId, season },
      select: {
        id: true,
        teamId: true,
        name: true,
        date: true,
        distance: true,
        athleticMeetId: true,
        meetId: true,
        sourceUrl: true,
        fieldMeanSec: true,
        fieldMedianSec: true,
        fieldFinisherCount: true,
      },
      orderBy: { date: 'asc' },
    });

    const result = await Promise.all(
      races.map(async (r) => {
        const hasFieldData = r.fieldFinisherCount != null && r.fieldFinisherCount > 0;
        // Only bother checking for a sharable source when this race has
        // nothing of its own yet — once a team has real data, its own
        // upload always wins.
        const sharedSource = hasFieldData ? null : await findSharedFieldSource(r);
        return {
          id: r.id,
          name: r.name,
          date: r.date,
          distance: r.distance,
          // Frontend groups races into "one meet, multiple divisions" using
          // meetId when the T4 grouping has run, falling back to
          // athleticMeetId (same meet, ungrouped) and finally the race's own
          // id (no known meet — a singleton group of one). Never send
          // athleticMeetId itself: resultsAllUrl already encodes it, and the
          // raw id has no other use on the client.
          meetId: r.meetId || r.athleticMeetId || r.id,
          // The one place a coach needs to land to copy the full field: the
          // athletic.net results/all page. Built from athleticMeetId (a
          // known, stable URL shape) when we have it; sourceUrl (whatever
          // meet-page link the season scraper captured) is the best
          // available fallback otherwise.
          resultsAllUrl: r.athleticMeetId
            ? `https://www.athletic.net/CrossCountry/meet/${r.athleticMeetId}/results/all`
            : r.sourceUrl || null,
          fieldMeanSec: r.fieldMeanSec,
          fieldMedianSec: r.fieldMedianSec,
          fieldFinisherCount: r.fieldFinisherCount,
          // MIN_FIELD_SIZE (lib/fieldNormalization.js) — mirrors the same
          // 40-finisher confidence threshold computeFieldStats itself
          // enforces, so the UI's badge always agrees with what the field
          // math actually did.
          hasFieldData,
          normalizationMet: r.fieldMeanSec != null,
          availableFromOtherTeam: sharedSource != null,
          otherTeamFieldFinisherCount: sharedSource?.fieldFinisherCount ?? null,
        };
      })
    );

    res.json({ success: true, races: result });
  } catch (err) {
    console.error('Error listing field-result races:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/field-results/:raceId
// Body: { csvData: string }. A race now legitimately holds MULTIPLE
// divisions' worth of field data at once — one race per (team, meet,
// distance), same as ORIGIN already creates it, holding every gender and
// every ability-tiered heat of that distance (see the Result/FieldResult
// schema comments). So a re-upload only replaces the division(s) actually
// present in this CSV, not the whole race's field — uploading "Boys Gold
// Varsity" no longer wipes out an already-uploaded "Girls Gold Varsity" on
// the same race. Recomputes the race's aggregate field stats over its full,
// combined FieldResult set (every division), not just this upload's rows.
router.post('/:raceId', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const teamId = req.user.teamId;
  const { csvData } = req.body;

  if (!csvData || typeof csvData !== 'string') {
    return res.status(400).json({ success: false, message: 'csvData is required.' });
  }

  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId } });
    if (!race) {
      return res.status(404).json({ success: false, message: 'Race not found.' });
    }

    let rows;
    try {
      rows = parse(csvData, { columns: true, skip_empty_lines: true, trim: true });
    } catch (parseErr) {
      return res.status(400).json({ success: false, message: `Could not parse CSV: ${parseErr.message}` });
    }

    const { results, errors, skipped } = parseFieldResultsCsv(rows);

    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No usable rows found in this CSV.',
        errors,
        skipped,
      });
    }

    // Replace only the division(s) this batch actually covers (usually just
    // one — the Field Results upload dialog sends one division per call).
    // A CSV with no Division column at all (division: null for every row,
    // e.g. an old-format manual paste) replaces the race's undivided field.
    const divisionsInBatch = [...new Set(results.map((r) => r.division))];

    await prisma.$transaction([
      ...divisionsInBatch.map((division) => prisma.fieldResult.deleteMany({ where: { raceId: race.id, division } })),
      prisma.fieldResult.createMany({
        data: results.map((r) => ({ ...r, raceId: race.id })),
      }),
    ]);

    // Known gap, not fixed here: fieldMeanSec/fieldMedianSec now blend every
    // division on this race — both genders, every ability tier — into one
    // number. That's a real regression in what "the field" means for band
    // analytics' normalization once a race legitimately spans divisions;
    // scoping those stats by gender (the same way lib/fieldPlacement.js
    // scopes overallPlace) is a follow-up, not attempted in this pass.
    const allFieldResults = await prisma.fieldResult.findMany({ where: { raceId: race.id } });
    const finishedTimes = allFieldResults
      .filter((r) => r.status === 'FINISHED' && r.timeSec != null)
      .map((r) => r.timeSec);
    const stats = computeFieldStats(finishedTimes);

    await prisma.race.update({
      where: { id: race.id },
      data: {
        fieldMeanSec: stats.fieldMeanSec,
        fieldMedianSec: stats.fieldMedianSec,
        fieldFinisherCount: stats.fieldFinisherCount,
      },
    });

    await recomputeRacePlacements(race.id);

    res.json({
      success: true,
      rowsUploaded: results.length,
      skipped,
      errors,
      fieldFinisherCount: stats.fieldFinisherCount,
      normalizationMet: stats.fieldMeanSec != null,
      fieldMeanSec: stats.fieldMeanSec,
      fieldMedianSec: stats.fieldMedianSec,
    });
  } catch (err) {
    console.error('Error uploading field results:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/field-results/:raceId/copy-from-meet
// Adopts another team's already-uploaded field stats for the same meet+race
// (see findSharedFieldSource above) instead of re-pasting an identical CSV.
// Re-derives the source itself server-side via the athleticMeetId+name join
// — never trusts a client-supplied source race, so this can't be used to
// probe another team's race IDs. Copies only the three aggregate numbers;
// creates no FieldResult rows (there's no per-team roster of other schools'
// finishers to own here, just borrowed arithmetic). A later real upload to
// this race overwrites these with the team's own computed stats as normal.
router.post('/:raceId/copy-from-meet', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const teamId = req.user.teamId;

  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId } });
    if (!race) {
      return res.status(404).json({ success: false, message: 'Race not found.' });
    }

    const source = await findSharedFieldSource(race);
    if (!source) {
      return res.status(404).json({
        success: false,
        message: 'No other team has uploaded field results for this meet yet.',
      });
    }

    await prisma.race.update({
      where: { id: race.id },
      data: {
        fieldMeanSec: source.fieldMeanSec,
        fieldMedianSec: source.fieldMedianSec,
        fieldFinisherCount: source.fieldFinisherCount,
      },
    });

    res.json({
      success: true,
      fieldFinisherCount: source.fieldFinisherCount,
      normalizationMet: source.fieldMeanSec != null,
      fieldMeanSec: source.fieldMeanSec,
      fieldMedianSec: source.fieldMedianSec,
    });
  } catch (err) {
    console.error('Error copying shared field results:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/field-results/:raceId — undo an upload (bad file, wrong
// race, etc.): clears this race's FieldResult rows and resets its
// aggregate fields back to null (the pre-upload, "no field data yet"
// state band analytics already handles gracefully).
router.delete('/:raceId', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  const teamId = req.user.teamId;

  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId } });
    if (!race) {
      return res.status(404).json({ success: false, message: 'Race not found.' });
    }

    await prisma.$transaction([
      prisma.fieldResult.deleteMany({ where: { raceId: race.id } }),
      prisma.race.update({
        where: { id: race.id },
        data: { fieldMeanSec: null, fieldMedianSec: null, fieldFinisherCount: null },
      }),
    ]);

    // Field is gone for the whole race, so every division's overall
    // place/field-size on it collapses back to null too.
    await recomputeRacePlacements(race.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing field results:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
