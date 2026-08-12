const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole, requireLinkedAthlete } = require('../middleware/auth');
const { seasonBestSec, decideEntryCapWarning, VALID_ENTRY_STATUSES } = require('../lib/meetEntries');
const { buildMeetMappingProposal } = require('../lib/meetMapping');

// T4 (Team Management handoff): meet operations — the Meet parent entity,
// per-race entry management, and meet-day logistics. Mounted at
// /api/meet-ops, deliberately NOT /api/meets — that path already serves
// routes/meets.js, a legacy analytics endpoint that treats each Race row
// as its own "meet" (the exact "Race but no parent" gap this file fills).
// See the Meet model's comment in schema.prisma for the full story; that
// file is left alone since renaming it isn't in scope here.
//
// Per TeamRole's own doc comment ("COACH: paid assistant: full athlete
// read/write, plans, meet entry"), meet entry/logistics management is
// head/paid-coach territory — unlike T2/T3, the doc never scopes any part
// of this domain to VOLUNTEER_COACH, so it isn't included below.
const COACH_ROLES = ['HEAD_COACH', 'COACH'];

// GET /api/meet-ops?seasonId=
router.get('/', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const meets = await prisma.meet.findMany({
      where: { seasonId },
      include: {
        races: { select: { id: true, name: true, distance: true } },
        plan: { select: { published: true } },
      },
      orderBy: { date: 'asc' },
    });

    res.json(
      meets.map((m) => ({
        id: m.id,
        name: m.name,
        date: m.date,
        location: m.location,
        races: m.races,
        planPublished: m.plan?.published ?? false,
      }))
    );
  } catch (error) {
    console.error('Error fetching meets:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/meet-ops — most Meet rows come from the coach-confirmed
// scripts/applyMeetMapping.js backfill; this covers an upcoming meet that
// hasn't been scraped yet and needs entries/logistics set up in advance.
router.post('/', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId, name, date, location } = req.body;
  if (!seasonId || !name || !date) {
    return res.status(400).json({ msg: 'seasonId, name, and date are required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const meet = await prisma.meet.create({
      data: {
        teamId: req.user.teamId,
        seasonId,
        name: name.trim(),
        date: new Date(date),
        location: location || null,
      },
    });
    res.status(201).json(meet);
  } catch (error) {
    console.error('Error creating meet:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/meet-ops/import/propose?seasonId= — groups this season's races
// that don't already belong to a Meet by an exact (team, season, date)
// match (lib/meetMapping.js — the same logic scripts/proposeMeetMapping.js
// uses for a whole-team, all-seasons CLI pass, scoped here to one season
// and reachable without shell access). Read-only: proposes, writes
// nothing. A coach reviews and edits names in the UI, then POSTs the
// confirmed list to /import below — never auto-created.
router.get('/import/propose', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const races = await prisma.race.findMany({
      where: { teamId: req.user.teamId, season: season.year, meetId: null },
      select: { id: true, name: true, date: true, location: true },
    });

    const { meets } = buildMeetMappingProposal({
      races: races.map((r) => ({ ...r, teamId: req.user.teamId, seasonId: season.id })),
    });

    res.json(
      meets.map((m) => ({
        proposedName: m.proposedName,
        location: m.location,
        date: m.date,
        raceNames: m.raceNames,
        raceCount: m.raceCount,
        raceIds: m.raceIds,
      }))
    );
  } catch (error) {
    console.error('Error proposing meet import:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/meet-ops/import — creates a Meet per confirmed entry and links
// its races. Only ever called with what a coach reviewed from the
// propose step above; nothing here re-derives groupings on its own.
router.post('/import', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { seasonId, meets } = req.body;
  if (!seasonId || !Array.isArray(meets) || meets.length === 0) {
    return res.status(400).json({ msg: 'seasonId and a non-empty meets array are required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const results = await prisma.$transaction(async (tx) => {
      const applied = [];
      for (const entry of meets) {
        if (!entry.name || !String(entry.name).trim() || !entry.date || !Array.isArray(entry.raceIds) || entry.raceIds.length === 0) {
          continue;
        }
        const meet = await tx.meet.create({
          data: {
            teamId: req.user.teamId,
            seasonId,
            name: String(entry.name).trim(),
            date: new Date(entry.date),
            location: entry.location || null,
          },
        });
        const updateResult = await tx.race.updateMany({
          where: { id: { in: entry.raceIds }, teamId: req.user.teamId, meetId: null },
          data: { meetId: meet.id },
        });
        applied.push({ id: meet.id, name: meet.name, raceCount: updateResult.count });
      }
      return applied;
    });

    res.status(201).json({ msg: `Imported ${results.length} meet(s).`, meets: results });
  } catch (error) {
    console.error('Error importing meets:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/meet-ops/mine — the athlete meet card: the next upcoming meet
// for their team, their own entry status for it, and (only once
// published) meet-day logistics. "A non-entered athlete sees that they
// are not entered rather than a blank screen" — entry always resolves to
// a real object, defaulting to NOT_ENTERED with no race attached, never
// null/undefined.
router.get('/mine', authenticate, requireLinkedAthlete, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const meet = await prisma.meet.findFirst({
      where: { teamId: req.user.teamId, date: { gte: today } },
      orderBy: { date: 'asc' },
      include: { races: true, plan: true },
    });

    if (!meet) {
      return res.json({ meet: null, race: null, entry: null, plan: null });
    }

    const raceIds = meet.races.map((r) => r.id);
    const entryRow = await prisma.meetEntry.findFirst({
      where: { raceId: { in: raceIds }, athleteId: req.user.linkedAthlete.id },
    });
    const race = entryRow ? meet.races.find((r) => r.id === entryRow.raceId) : null;

    res.json({
      meet: { id: meet.id, name: meet.name, date: meet.date, location: meet.location },
      race: race ? { id: race.id, name: race.name, distance: race.distance } : null,
      entry: {
        status: entryRow?.status ?? 'NOT_ENTERED',
        bibNumber: entryRow?.bibNumber ?? null,
        seedTimeSec: entryRow?.seedTimeSec ?? null,
        notes: entryRow?.notes ?? null,
      },
      plan: meet.plan?.published
        ? {
            departureTime: meet.plan.departureTime,
            returnTime: meet.plan.returnTime,
            departureLoc: meet.plan.departureLoc,
            transportNotes: meet.plan.transportNotes,
            uniformNotes: meet.plan.uniformNotes,
            bringList: meet.plan.bringList,
            itinerary: meet.plan.itinerary,
          }
        : null,
    });
  } catch (error) {
    console.error('Error fetching athlete meet card:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/meet-ops/races/:raceId/entries — every active-roster athlete
// for the race's season, each with their current entry (or a synthesized,
// not-yet-persisted NOT_ENTERED row) and their season-best time pre-
// populated as the default seed time — "nobody types 40 seed times."
router.get('/races/:raceId/entries', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId: req.user.teamId } });
    if (!race) {
      return res.status(404).json({ msg: 'Race not found.' });
    }

    const season = await prisma.season.findFirst({ where: { teamId: req.user.teamId, year: race.season } });

    const [rosterRows, entries, results] = await Promise.all([
      season
        ? prisma.seasonRoster.findMany({ where: { seasonId: season.id, isActive: true }, include: { athlete: true } })
        : Promise.resolve([]),
      prisma.meetEntry.findMany({ where: { raceId: race.id } }),
      prisma.result.findMany({
        where: { athlete: { teamId: req.user.teamId }, race: { season: race.season }, status: 'FINISHED', time: { not: null } },
        select: { athleteId: true, time: true },
      }),
    ]);

    const entryByAthlete = new Map(entries.map((e) => [e.athleteId, e]));
    const resultsByAthlete = new Map();
    for (const r of results) {
      if (!resultsByAthlete.has(r.athleteId)) resultsByAthlete.set(r.athleteId, []);
      resultsByAthlete.get(r.athleteId).push(r);
    }

    const rows = rosterRows.map((row) => {
      const entry = entryByAthlete.get(row.athleteId);
      const best = seasonBestSec(resultsByAthlete.get(row.athleteId) || []);
      return {
        athleteId: row.athleteId,
        name: row.athlete.name,
        gender: row.athlete.gender,
        grade: row.grade ?? row.athlete.grade,
        seasonBestSec: best,
        status: entry?.status ?? 'NOT_ENTERED',
        seedTimeSec: entry?.seedTimeSec ?? best,
        bibNumber: entry?.bibNumber ?? null,
        notes: entry?.notes ?? null,
      };
    });

    const enteredCount = rows.filter((r) => r.status === 'ENTERED').length;
    res.json({
      raceId: race.id,
      raceName: race.name,
      entries: rows,
      enteredCount,
      entryCapWarning: decideEntryCapWarning(enteredCount),
    });
  } catch (error) {
    console.error('Error fetching meet entries:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/meet-ops/races/:raceId/entries — bulk save, one transaction.
// Same shape as T2's bulk group assignment: the coach reviews a whole
// screen, then saves every change at once.
router.put('/races/:raceId/entries', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ msg: 'entries array is required.' });
  }

  try {
    const race = await prisma.race.findFirst({ where: { id: req.params.raceId, teamId: req.user.teamId } });
    if (!race) {
      return res.status(404).json({ msg: 'Race not found.' });
    }

    const athleteIds = entries.map((e) => e.athleteId);
    const validAthletes = await prisma.athlete.findMany({
      where: { id: { in: athleteIds }, teamId: req.user.teamId },
      select: { id: true },
    });
    const validIds = new Set(validAthletes.map((a) => a.id));

    const toSave = entries.filter((e) => validIds.has(e.athleteId) && VALID_ENTRY_STATUSES.includes(e.status));

    const saved = await prisma.$transaction(
      toSave.map((e) =>
        prisma.meetEntry.upsert({
          where: { raceId_athleteId: { raceId: race.id, athleteId: e.athleteId } },
          update: {
            status: e.status,
            seedTimeSec: e.seedTimeSec ?? null,
            bibNumber: e.bibNumber || null,
            notes: e.notes || null,
            updatedById: req.user.id,
          },
          create: {
            raceId: race.id,
            athleteId: e.athleteId,
            status: e.status,
            seedTimeSec: e.seedTimeSec ?? null,
            bibNumber: e.bibNumber || null,
            notes: e.notes || null,
            updatedById: req.user.id,
          },
        })
      )
    );

    const enteredCount = saved.filter((e) => e.status === 'ENTERED').length;
    res.json({
      msg: `Saved ${saved.length} entries.`,
      count: saved.length,
      skipped: entries.length - toSave.length,
      enteredCount,
      entryCapWarning: decideEntryCapWarning(enteredCount),
    });
  } catch (error) {
    console.error('Error saving meet entries:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/meet-ops/:meetId/roster — coach-facing printable roster:
// entered/alternate athletes by race, with bib numbers. The "blank column
// for hand-recorded splits" is a print-layout concern for the frontend —
// nothing new to store for it.
router.get('/:meetId/roster', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  try {
    const meet = await prisma.meet.findFirst({
      where: { id: req.params.meetId, teamId: req.user.teamId },
      include: { races: true },
    });
    if (!meet) {
      return res.status(404).json({ msg: 'Meet not found.' });
    }

    const raceIds = meet.races.map((r) => r.id);
    const entries = await prisma.meetEntry.findMany({
      where: { raceId: { in: raceIds }, status: { in: ['ENTERED', 'ALTERNATE'] } },
      include: { athlete: { select: { id: true, name: true, grade: true } } },
      orderBy: { bibNumber: 'asc' },
    });

    const entriesByRace = new Map(raceIds.map((id) => [id, []]));
    for (const e of entries) {
      entriesByRace.get(e.raceId)?.push({
        athleteId: e.athleteId,
        name: e.athlete.name,
        grade: e.athlete.grade,
        bibNumber: e.bibNumber,
        seedTimeSec: e.seedTimeSec,
        status: e.status,
      });
    }

    res.json({
      meet: { id: meet.id, name: meet.name, date: meet.date, location: meet.location },
      races: meet.races.map((r) => ({ id: r.id, name: r.name, entries: entriesByRace.get(r.id) || [] })),
    });
  } catch (error) {
    console.error('Error building printable roster:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/meet-ops/:meetId/plan
router.get('/:meetId/plan', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  try {
    const meet = await prisma.meet.findFirst({ where: { id: req.params.meetId, teamId: req.user.teamId } });
    if (!meet) {
      return res.status(404).json({ msg: 'Meet not found.' });
    }
    const plan = await prisma.meetPlan.findUnique({ where: { meetId: meet.id } });
    res.json(plan);
  } catch (error) {
    console.error('Error fetching meet plan:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/meet-ops/:meetId/plan — upsert.
router.put('/:meetId/plan', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { departureTime, returnTime, departureLoc, transportNotes, uniformNotes, bringList, itinerary, published } = req.body;

  try {
    const meet = await prisma.meet.findFirst({ where: { id: req.params.meetId, teamId: req.user.teamId } });
    if (!meet) {
      return res.status(404).json({ msg: 'Meet not found.' });
    }

    const data = {
      departureTime: departureTime ? new Date(departureTime) : null,
      returnTime: returnTime ? new Date(returnTime) : null,
      departureLoc: departureLoc || null,
      transportNotes: transportNotes || null,
      uniformNotes: uniformNotes || null,
      bringList: bringList || null,
      itinerary: itinerary ?? null,
      published: Boolean(published),
    };

    const plan = await prisma.meetPlan.upsert({
      where: { meetId: meet.id },
      update: data,
      create: { meetId: meet.id, ...data },
    });
    res.json(plan);
  } catch (error) {
    console.error('Error saving meet plan:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/meet-ops/:meetId — detail (races + plan). Placed after the more
// specific /:meetId/* routes above so it doesn't shadow them.
router.get('/:meetId', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  try {
    const meet = await prisma.meet.findFirst({
      where: { id: req.params.meetId, teamId: req.user.teamId },
      include: { races: true, plan: true },
    });
    if (!meet) {
      return res.status(404).json({ msg: 'Meet not found.' });
    }
    res.json(meet);
  } catch (error) {
    console.error('Error fetching meet:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/meet-ops/:meetId
router.put('/:meetId', authenticate, requireTeam, requireRole(COACH_ROLES), async (req, res) => {
  const { name, date, location } = req.body;
  try {
    const meet = await prisma.meet.findFirst({ where: { id: req.params.meetId, teamId: req.user.teamId } });
    if (!meet) {
      return res.status(404).json({ msg: 'Meet not found.' });
    }
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (date !== undefined) updates.date = new Date(date);
    if (location !== undefined) updates.location = location;
    const updated = await prisma.meet.update({ where: { id: meet.id }, data: updates });
    res.json(updated);
  } catch (error) {
    console.error('Error updating meet:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
