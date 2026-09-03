const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { FULL_COACH } = require('../lib/teamRoles');
const { markersForRace, segments, splitAnalysis, overallPaceSecPerMile, planSplitBatchWrite } = require('../lib/splitMath');
const { normalizeDistanceMeters, aggregateSplitsByDistance } = require('../lib/splitAggregates');
// Shared with routes/analytics.js's strategy session — one shape, one set
// of answers about how an athlete paces themselves.
const { buildAthleteSplitRows } = require('../lib/splitRows');

// C5 (LeadPack Master Build Handoff): rewritten against the marker-based
// Split model. The authorization pattern from the old RaceSplit-based file
// is preserved verbatim on every write: collect resultIds, verify every one
// belongs to req.user.teamId, 403 on any mismatch, derive athleteId/raceId
// from the verified Result row — never trust a client-supplied one — and
// run in a transaction.

// previousByAthleteId: Map<athleteId, { raceId, raceName, date, finishSec }
// | undefined> — this athlete's most recent OTHER result at roughly the
// same distance, before this race's date. Passed in rather than queried
// per-row to keep this one query for the whole race, not N.
function buildRaceView(race, results, previousByAthleteId) {
  const markers = markersForRace(race.distanceMeters, race.splitMarkerScheme, race.splitMarkersMeters);
  const markerLabelBySequence = new Map(markers.map((m) => [m.sequence, m.label]));

  const rows = results.map((r) => {
    const splitInputs = r.splits.map((s) => ({ sequence: s.sequence, markerMeters: s.markerMeters, elapsedSec: s.elapsedSec }));
    const segs = race.distanceMeters ? segments(splitInputs, r.time, race.distanceMeters) : [];
    const analysis = splitAnalysis(segs);
    const previous = previousByAthleteId?.get(r.athlete.id) ?? null;

    return {
      resultId: r.id,
      athleteId: r.athlete.id,
      athleteName: r.athlete.preferredName || r.athlete.name,
      gender: r.athlete.gender,
      place: r.place,
      finishSec: r.time,
      splits: r.splits
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => ({ id: s.id, sequence: s.sequence, elapsedSec: s.elapsedSec, label: markerLabelBySequence.get(s.sequence) ?? `Marker ${s.sequence}` })),
      segments: segs,
      analysis,
      overallPaceSecPerMile: race.distanceMeters ? overallPaceSecPerMile(r.time, race.distanceMeters) : null,
      previousSameDistance:
        previous && r.time != null
          ? {
              raceId: previous.raceId,
              raceName: previous.raceName,
              date: previous.date,
              finishSec: previous.finishSec,
              deltaSec: r.time - previous.finishSec,
            }
          : null,
    };
  });

  return {
    raceId: race.id,
    raceName: race.name,
    distanceMeters: race.distanceMeters,
    splitMarkerScheme: race.splitMarkerScheme,
    splitMarkersMeters: race.splitMarkersMeters,
    markers,
    results: rows,
  };
}

// GET /api/splits/race/:raceId — results in finish order, splits and
// derived segments computed server-side so the grid renders without
// client-side math. Each row also carries previousSameDistance — this
// athlete's most recent other result at roughly the same distance before
// this race's date — so the grid can flag a finish as faster/slower than
// last time without the coach doing that math themselves.
router.get('/race/:raceId', authenticate, requireTeam, async (req, res) => {
  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId: req.user.teamId } });
    if (!race) {
      return res.status(404).json({ msg: 'Race not found' });
    }

    const results = await prisma.result.findMany({
      where: { raceId: race.id, teamId: req.user.teamId },
      include: {
        athlete: { select: { id: true, name: true, preferredName: true, gender: true } },
        splits: true,
      },
    });
    results.sort((a, b) => {
      if (a.place != null && b.place != null) return a.place - b.place;
      if (a.time != null && b.time != null) return a.time - b.time;
      return 0;
    });

    let previousByAthleteId = null;
    if (race.distanceMeters) {
      const targetBucket = normalizeDistanceMeters(race.distanceMeters);
      const athleteIds = results.map((r) => r.athlete.id);
      const priorResults = await prisma.result.findMany({
        where: {
          athleteId: { in: athleteIds },
          teamId: req.user.teamId,
          raceId: { not: race.id },
          time: { not: null },
          race: { date: { lt: race.date }, distanceMeters: { not: null } },
        },
        select: { athleteId: true, time: true, race: { select: { id: true, name: true, date: true, distanceMeters: true } } },
        orderBy: { race: { date: 'desc' } },
      });
      previousByAthleteId = new Map();
      for (const pr of priorResults) {
        if (previousByAthleteId.has(pr.athleteId)) continue; // already have this athlete's most recent (results are date-desc)
        if (normalizeDistanceMeters(pr.race.distanceMeters) !== targetBucket) continue;
        previousByAthleteId.set(pr.athleteId, {
          raceId: pr.race.id,
          raceName: pr.race.name,
          date: pr.race.date,
          finishSec: pr.time,
        });
      }
    }

    res.json(buildRaceView(race, results, previousByAthleteId));
  } catch (err) {
    console.error('Error fetching race splits:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/splits/athlete/:athleteId — this athlete's own races with
// derived segments, newest first (used by My Progress / athlete race
// history, C9).
router.get('/athlete/:athleteId', authenticate, requireTeam, async (req, res) => {
  try {
    const results = await prisma.result.findMany({
      where: { athleteId: req.params.athleteId, teamId: req.user.teamId },
      include: {
        race: true,
        splits: true,
      },
      orderBy: { race: { date: 'desc' } },
    });

    res.json(buildAthleteSplitRows(results));
  } catch (err) {
    console.error('Error fetching athlete splits:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/splits/athlete/:athleteId/aggregate — C10: "how does this
// athlete typically pace themselves," averaged per distance bucket (never
// mixing a 5K with an 8K — see lib/splitAggregates.js). Same broad
// requireTeam visibility as the routes above: race splits are public
// results within the team, same as everywhere else in this file.
router.get('/athlete/:athleteId/aggregate', authenticate, requireTeam, async (req, res) => {
  try {
    const results = await prisma.result.findMany({
      where: { athleteId: req.params.athleteId, teamId: req.user.teamId },
      include: {
        race: true,
        splits: true,
      },
      orderBy: { race: { date: 'desc' } },
    });

    const rows = buildAthleteSplitRows(results);
    res.json({ athleteId: req.params.athleteId, aggregates: aggregateSplitsByDistance(rows) });
  } catch (err) {
    console.error('Error aggregating athlete splits:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/splits/batch
// { raceId, entries: [{ resultId, splits: [{ sequence, elapsedSec }] }] }
// elapsedSec: null clears that one sequence. Validation warns, it does not
// block: an invalid row for one athlete never loses the other 39.
//
// Only the sequences an entry actually mentions are touched — everything
// else for that resultId is left exactly as it already is in the
// database, read fresh in this same request rather than trusted from
// whatever the client's payload implies about the rest of the row. Two
// coaches entering different markers for the same athlete around the same
// time — one saving marker 1 a moment after the other started typing
// marker 2 — must not have either save silently delete the other's,
// which a blanket "replace this row's whole split set" would risk if the
// two saves' client-side snapshots of "the current row" were built from
// different points in time. (Same fix needed for a resave of an old CSV
// export that's missing a marker column added since — see the frontend's
// CSV import, which already only sends the columns actually present.)
router.post('/batch', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  try {
    const { raceId, entries } = req.body;
    const teamId = req.user.teamId;
    const userId = req.user.id;

    if (!raceId || !Array.isArray(entries)) {
      return res.status(400).json({ msg: 'raceId and entries are required.' });
    }

    const race = await prisma.race.findFirst({ where: { id: raceId, teamId } });
    if (!race) {
      return res.status(404).json({ msg: 'Race not found' });
    }
    if (!race.distanceMeters) {
      return res.status(400).json({ msg: "This race's distance isn't set — fix it before entering splits." });
    }

    const markers = markersForRace(race.distanceMeters, race.splitMarkerScheme, race.splitMarkersMeters);
    const markerBySequence = new Map(markers.map((m) => [m.sequence, m.markerMeters]));

    const resultIds = [...new Set(entries.map((e) => e.resultId))];
    const results = await prisma.result.findMany({
      where: { id: { in: resultIds }, teamId, raceId },
      select: { id: true, time: true },
    });
    if (results.length !== resultIds.length) {
      return res.status(403).json({ msg: 'One or more results do not belong to this race/team.' });
    }
    const resultById = new Map(results.map((r) => [r.id, r]));

    // Fresh, same-request read of what's already saved — the merge base
    // for validation below. Deliberately not derived from anything the
    // client sent; a stale client snapshot is exactly the case this guards
    // against.
    const existingSplitRows = await prisma.split.findMany({ where: { resultId: { in: resultIds } } });
    const existingByResultId = new Map();
    for (const row of existingSplitRows) {
      if (!existingByResultId.has(row.resultId)) existingByResultId.set(row.resultId, new Map());
      existingByResultId.get(row.resultId).set(row.sequence, row);
    }

    const allFlags = [];
    const writes = [];
    // Per resultId, the saved splits after this write — every existing
    // sequence not touched by this request, plus each touched sequence
    // that validated (untouched sequences are never re-validated against
    // the new merged context; they were already valid when they were
    // saved and this request isn't allowed to alter or drop them anyway).
    // This is what lets the frontend patch just the edited row from the
    // save response instead of duplicating splitMath.js in the browser or
    // refetching the whole grid on every autosave (C4).
    const savedSplitsByResultId = new Map();

    for (const entry of entries) {
      const result = resultById.get(entry.resultId);
      const existingMap = existingByResultId.get(entry.resultId) ?? new Map();
      const existingEntries = [...existingMap.values()].map((row) => ({ sequence: row.sequence, markerMeters: row.markerMeters, elapsedSec: row.elapsedSec }));
      const touchedEntries = (Array.isArray(entry.splits) ? entry.splits : [])
        .filter((s) => markerBySequence.has(s.sequence))
        .map((s) => ({ sequence: s.sequence, markerMeters: markerBySequence.get(s.sequence), elapsedSec: s.elapsedSec ?? null }));

      const { upserts, deletes, finalEntries, flags } = planSplitBatchWrite(existingEntries, touchedEntries, {
        finishSec: result.time,
        distanceMeters: race.distanceMeters,
      });
      for (const f of flags) allFlags.push({ resultId: entry.resultId, ...f });

      for (const valid of upserts) {
        writes.push(
          prisma.split.upsert({
            where: { resultId_sequence: { resultId: entry.resultId, sequence: valid.sequence } },
            update: { elapsedSec: valid.elapsedSec, markerMeters: valid.markerMeters },
            create: {
              resultId: entry.resultId,
              sequence: valid.sequence,
              markerMeters: valid.markerMeters,
              elapsedSec: valid.elapsedSec,
              teamId,
              createdById: userId,
            },
          })
        );
      }
      for (const sequence of deletes) {
        writes.push(prisma.split.delete({ where: { resultId_sequence: { resultId: entry.resultId, sequence } } }));
      }

      savedSplitsByResultId.set(entry.resultId, finalEntries);
    }

    await prisma.$transaction(writes);

    const resultRows = entries.map((entry) => {
      const result = resultById.get(entry.resultId);
      const savedEntries = savedSplitsByResultId.get(entry.resultId) ?? [];
      const segs = race.distanceMeters ? segments(savedEntries, result.time, race.distanceMeters) : [];
      return {
        resultId: entry.resultId,
        splits: savedEntries
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map((e) => ({ sequence: e.sequence, elapsedSec: e.elapsedSec })),
        segments: segs,
        analysis: splitAnalysis(segs),
        overallPaceSecPerMile: race.distanceMeters ? overallPaceSecPerMile(result.time, race.distanceMeters) : null,
      };
    });

    res.json({ success: true, entriesSaved: entries.length, flags: allFlags, results: resultRows });
  } catch (err) {
    console.error('Error saving splits:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/splits/:splitId — clears one marker's value for one athlete.
router.delete('/:splitId', authenticate, requireTeam, requireRole(FULL_COACH), async (req, res) => {
  try {
    const existing = await prisma.split.findFirst({
      where: { id: req.params.splitId, teamId: req.user.teamId },
    });
    if (!existing) {
      return res.status(404).json({ msg: 'Split not found' });
    }

    await prisma.split.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting split:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
