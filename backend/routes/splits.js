const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { markersForRace, segments, splitAnalysis, validateSplitEntries } = require('../lib/splitMath');

// C5 (LeadPack Master Build Handoff): rewritten against the marker-based
// Split model. The authorization pattern from the old RaceSplit-based file
// is preserved verbatim on every write: collect resultIds, verify every one
// belongs to req.user.teamId, 403 on any mismatch, derive athleteId/raceId
// from the verified Result row — never trust a client-supplied one — and
// run in a transaction.

function buildRaceView(race, results) {
  const markers = markersForRace(race.distanceMeters, race.splitMarkerScheme, race.splitMarkersMeters);
  const markerLabelBySequence = new Map(markers.map((m) => [m.sequence, m.label]));

  const rows = results.map((r) => {
    const splitInputs = r.splits.map((s) => ({ sequence: s.sequence, markerMeters: s.markerMeters, elapsedSec: s.elapsedSec }));
    const segs = race.distanceMeters ? segments(splitInputs, r.time, race.distanceMeters) : [];
    const analysis = splitAnalysis(segs);

    return {
      resultId: r.id,
      athleteId: r.athlete.id,
      athleteName: r.athlete.name,
      gender: r.athlete.gender,
      place: r.place,
      finishSec: r.time,
      splits: r.splits
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
        .map((s) => ({ id: s.id, sequence: s.sequence, elapsedSec: s.elapsedSec, label: markerLabelBySequence.get(s.sequence) ?? `Marker ${s.sequence}` })),
      segments: segs,
      analysis,
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
// client-side math.
router.get('/race/:raceId', authenticate, requireTeam, async (req, res) => {
  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId: req.user.teamId } });
    if (!race) {
      return res.status(404).json({ msg: 'Race not found' });
    }

    const results = await prisma.result.findMany({
      where: { raceId: race.id, teamId: req.user.teamId },
      include: {
        athlete: { select: { id: true, name: true, gender: true } },
        splits: true,
      },
    });
    results.sort((a, b) => {
      if (a.place != null && b.place != null) return a.place - b.place;
      if (a.time != null && b.time != null) return a.time - b.time;
      return 0;
    });

    res.json(buildRaceView(race, results));
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

    const rows = results.map((r) => {
      const splitInputs = r.splits.map((s) => ({ sequence: s.sequence, markerMeters: s.markerMeters, elapsedSec: s.elapsedSec }));
      const segs = r.race.distanceMeters ? segments(splitInputs, r.time, r.race.distanceMeters) : [];
      return {
        resultId: r.id,
        raceId: r.race.id,
        raceName: r.race.name,
        date: r.race.date,
        distanceMeters: r.race.distanceMeters,
        finishSec: r.time,
        segments: segs,
        analysis: splitAnalysis(segs),
      };
    });

    res.json(rows);
  } catch (err) {
    console.error('Error fetching athlete splits:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/splits/batch
// { raceId, entries: [{ resultId, splits: [{ sequence, elapsedSec }] }] }
// An empty splits array for a resultId deletes that athlete's splits —
// that is how a coach clears a bad entry. Validation warns, it does not
// block: an invalid row for one athlete never loses the other 39.
router.post('/batch', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
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

    const allFlags = [];
    const writes = [];
    // Per resultId, the saved splits after this write — computed from
    // validEntries directly (that's exactly what deleteMany/upsert leave in
    // place), so the response can carry each row's derived segments/analysis
    // without a second query. This is what lets the frontend patch just the
    // edited row from the save response instead of duplicating splitMath.js
    // in the browser or refetching the whole grid on every autosave (C4).
    const savedSplitsByResultId = new Map();

    for (const entry of entries) {
      const result = resultById.get(entry.resultId);
      const rawSplits = Array.isArray(entry.splits) ? entry.splits : [];

      const withMarkers = rawSplits
        .filter((s) => markerBySequence.has(s.sequence))
        .map((s) => ({ sequence: s.sequence, markerMeters: markerBySequence.get(s.sequence), elapsedSec: s.elapsedSec }));

      const { validEntries, flags } = validateSplitEntries(withMarkers, { finishSec: result.time, distanceMeters: race.distanceMeters });
      for (const f of flags) allFlags.push({ resultId: entry.resultId, ...f });

      const validSequences = validEntries.map((e) => e.sequence);
      savedSplitsByResultId.set(entry.resultId, validEntries);

      writes.push(
        prisma.split.deleteMany({
          where: {
            resultId: entry.resultId,
            ...(validSequences.length ? { sequence: { notIn: validSequences } } : {}),
          },
        })
      );
      for (const ve of validEntries) {
        writes.push(
          prisma.split.upsert({
            where: { resultId_sequence: { resultId: entry.resultId, sequence: ve.sequence } },
            update: { elapsedSec: ve.elapsedSec, markerMeters: ve.markerMeters },
            create: {
              resultId: entry.resultId,
              sequence: ve.sequence,
              markerMeters: ve.markerMeters,
              elapsedSec: ve.elapsedSec,
              teamId,
              createdById: userId,
            },
          })
        );
      }
    }

    await prisma.$transaction(writes);

    const resultRows = entries.map((entry) => {
      const result = resultById.get(entry.resultId);
      const validEntries = savedSplitsByResultId.get(entry.resultId) ?? [];
      const segs = race.distanceMeters ? segments(validEntries, result.time, race.distanceMeters) : [];
      return {
        resultId: entry.resultId,
        splits: validEntries
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map((e) => ({ sequence: e.sequence, elapsedSec: e.elapsedSec })),
        segments: segs,
        analysis: splitAnalysis(segs),
      };
    });

    res.json({ success: true, entriesSaved: entries.length, flags: allFlags, results: resultRows });
  } catch (err) {
    console.error('Error saving splits:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/splits/:splitId — clears one marker's value for one athlete.
router.delete('/:splitId', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
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
