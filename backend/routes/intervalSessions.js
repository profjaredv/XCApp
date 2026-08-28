const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { ANY_COACH } = require('../lib/teamRoles');
const { isUsableZoneKey, parseZoneKey } = require('../lib/paceZoneRules');

// Coach-adoption pass item 6: coach-led interval/tempo capture, replacing
// the printed sheet a coach fills in by hand at the track. Any real coach
// can run one of these for whatever group they're supervising that day —
// unlike practice plans (T3), there's no group-leader-only carve-out here;
// a volunteer coach running a workout needs exactly the same access as a
// paid one.

// A session's `zone` is a stable pace-zone KEY — 'mcm-vo2' for one of the
// default zones, 'team:DIS' for one the team defined (see
// lib/paceZoneRules.js for why it is never a PaceZone.id). Validating a
// team key means checking the team actually defined that zone, which needs
// a query, so unlike the old fixed list this is async.
//
// Every zone is offered, not just the fast ones. The previous three-zone
// list existed because Daniels' Easy/Marathon paces have no meaningful
// repeat split — but a coach who defines their own vocabulary and wants
// 6 x 1000m at their steady-state pace is not making a mistake, and it is
// not this endpoint's job to tell them otherwise.
async function zoneKeyError(zone, teamId) {
  if (!parseZoneKey(zone)) {
    return 'zone must be a pace-zone key like "mcm-vo2" or "team:DIS".';
  }
  const teamZones = await prisma.paceZone.findMany({ where: { teamId }, select: { abbreviation: true } });
  if (!isUsableZoneKey(zone, teamZones.map((z) => z.abbreviation))) {
    return 'That pace zone is not defined for this team.';
  }
  return null;
}

function serializeEntry(entry) {
  return {
    id: entry.id,
    athleteId: entry.athleteId,
    athleteName: entry.athlete.preferredName || entry.athlete.name,
    addedManually: entry.addedManually,
    rep1: entry.rep1,
    rep2: entry.rep2,
    rep3: entry.rep3,
    rep4: entry.rep4,
    rep5: entry.rep5,
    rep6: entry.rep6,
    notes: entry.notes,
  };
}

function serializeSession(session) {
  return {
    id: session.id,
    seasonId: session.seasonId,
    groupId: session.groupId,
    groupName: session.group?.name ?? null,
    date: session.date,
    title: session.title,
    repDistanceM: session.repDistanceM,
    zone: session.zone,
    // The zone's name as it was when the session was created. The client
    // prefers the live definition (so a rename shows through on an active
    // session) and falls back to this, which is what keeps a session
    // readable after its zone is renamed or deleted outright.
    zoneLabel: session.zoneLabel ?? null,
    archived: session.archived,
    entries: (session.entries ?? []).map(serializeEntry),
  };
}

// A row with nothing recorded shouldn't leave a phantom entry in the
// athlete's training log — sync deletes the derived log if every rep is
// now blank, upserts it otherwise. Keyed off the unique
// sourceIntervalSessionEntryId, so re-saving the same entry updates in
// place rather than accumulating duplicate log rows.
async function syncEntryToTrainingLog(tx, entry, session, actingUserId) {
  const reps = [entry.rep1, entry.rep2, entry.rep3, entry.rep4, entry.rep5, entry.rep6].filter(
    (v) => typeof v === 'number' && v > 0
  );

  if (reps.length === 0) {
    await tx.trainingLog.deleteMany({ where: { sourceIntervalSessionEntryId: entry.id } });
    return;
  }

  const durationSec = Math.round(reps.reduce((sum, v) => sum + v, 0));
  const distanceMi = (reps.length * session.repDistanceM) / 1609.34;
  const repSplits = reps.map((seconds, i) => ({ rep: i + 1, seconds }));
  const notes = `${session.title} — ${reps.length} x ${session.repDistanceM}m`;

  await tx.trainingLog.upsert({
    where: { sourceIntervalSessionEntryId: entry.id },
    update: { distanceMi, durationSec, notes, repSplits, createdById: actingUserId },
    create: {
      athleteId: entry.athleteId,
      date: session.date,
      type: 'interval',
      distanceMi,
      durationSec,
      notes,
      repSplits,
      createdById: actingUserId,
      sourceIntervalSessionEntryId: entry.id,
    },
  });
}

// GET /api/interval-sessions?seasonId=&from=&to=
router.get('/', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { seasonId, from, to } = req.query;
  if (!seasonId) {
    return res.status(400).json({ msg: 'seasonId is required.' });
  }

  try {
    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }

    const sessions = await prisma.intervalSession.findMany({
      where: {
        seasonId,
        ...(from && to ? { date: { gte: new Date(from), lte: new Date(to) } } : {}),
      },
      include: {
        group: { select: { name: true } },
        entries: { include: { athlete: { select: { name: true, preferredName: true } } } },
      },
      orderBy: { date: 'desc' },
    });

    res.json(sessions.map(serializeSession));
  } catch (error) {
    console.error('Error fetching interval sessions:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/interval-sessions/:id
router.get('/:id', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  try {
    const session = await prisma.intervalSession.findFirst({
      where: { id: req.params.id, teamId: req.user.teamId },
      include: {
        group: { select: { name: true } },
        entries: { include: { athlete: { select: { name: true, preferredName: true } } } },
      },
    });
    if (!session) {
      return res.status(404).json({ msg: 'Session not found.' });
    }
    res.json(serializeSession(session));
  } catch (error) {
    console.error('Error fetching interval session:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/interval-sessions — one-shot create: the session shell plus an
// entry (all reps blank) for every athlete on the group's current roster
// (or, with no group, whoever's named in athleteIds), so the grid is ready
// to fill in immediately. Athletes added later (the "wasn't in their
// group" case) go through POST /:id/entries instead.
//
// groupId's membership is looked up here, server-side, rather than trusting
// the client-sent athleteIds for it — the frontend used to fetch the
// group's members itself and pass that list in, which raced against its
// own membership query (select a group, hit Create before that fetch
// resolves) and could silently create a session with zero entries even
// though a group was picked. Same fix POST /:id/duplicate already needed
// for the same reason. athleteIds is still honored for the no-group (ad
// hoc) case, where there's no roster to derive from.
router.post('/', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { seasonId, groupId, date, title, repDistanceM, zone, zoneLabel, athleteIds } = req.body;

  if (!seasonId || !date || !title || !repDistanceM || !zone) {
    return res.status(400).json({ msg: 'seasonId, date, title, repDistanceM, and zone are required.' });
  }
  if (!(Number(repDistanceM) > 0)) {
    return res.status(400).json({ msg: 'repDistanceM must be a positive number.' });
  }

  try {
    const zoneError = await zoneKeyError(zone, req.user.teamId);
    if (zoneError) return res.status(400).json({ msg: zoneError });

    const season = await prisma.season.findFirst({ where: { id: seasonId, teamId: req.user.teamId } });
    if (!season) {
      return res.status(404).json({ msg: 'Season not found.' });
    }
    let ids;
    if (groupId) {
      const group = await prisma.group.findFirst({ where: { id: groupId, teamId: req.user.teamId } });
      if (!group) {
        return res.status(404).json({ msg: 'Group not found.' });
      }
      const members = await prisma.groupMembership.findMany({ where: { groupId, endDate: null }, select: { athleteId: true } });
      ids = members.map((m) => m.athleteId);
    } else {
      ids = Array.isArray(athleteIds) ? [...new Set(athleteIds)] : [];
    }
    if (ids.length > 0) {
      const validCount = await prisma.athlete.count({ where: { id: { in: ids }, teamId: req.user.teamId } });
      if (validCount !== ids.length) {
        return res.status(400).json({ msg: 'One or more athletes were not found on this team.' });
      }
    }

    const session = await prisma.intervalSession.create({
      data: {
        teamId: req.user.teamId,
        seasonId,
        groupId: groupId || null,
        date: new Date(date),
        title,
        repDistanceM: Math.round(Number(repDistanceM)),
        zone,
        // Snapshotted from what the client displayed, so the session keeps
        // reading correctly after a rename. Trimmed and length-capped
        // because it is client-supplied text that goes straight back out.
        zoneLabel: typeof zoneLabel === 'string' && zoneLabel.trim() ? zoneLabel.trim().slice(0, 60) : null,
        createdById: req.user.id,
        entries: { create: ids.map((athleteId) => ({ athleteId })) },
      },
      include: {
        group: { select: { name: true } },
        entries: { include: { athlete: { select: { name: true, preferredName: true } } } },
      },
    });

    res.status(201).json(serializeSession(session));
  } catch (error) {
    console.error('Error creating interval session:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/interval-sessions/:id/duplicate — Schedule rework: "one
// interval sheet gets created, then when another coach is ready to track,
// they duplicate it and select their group." Copies title/repDistanceM/
// zone into a fully independent new session (own entries, not shared with
// the source), seeded from the target group's current roster — same
// seeding the create-flow does. duplicatedFromId is traceability only.
router.post('/:id/duplicate', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { groupId, date } = req.body;

  try {
    const source = await prisma.intervalSession.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!source) {
      return res.status(404).json({ msg: 'Session not found.' });
    }

    let athleteIds = [];
    if (groupId) {
      const group = await prisma.group.findFirst({ where: { id: groupId, teamId: req.user.teamId } });
      if (!group) {
        return res.status(404).json({ msg: 'Group not found.' });
      }
      const members = await prisma.groupMembership.findMany({ where: { groupId, endDate: null }, select: { athleteId: true } });
      athleteIds = members.map((m) => m.athleteId);
    }

    const duplicate = await prisma.intervalSession.create({
      data: {
        teamId: req.user.teamId,
        seasonId: source.seasonId,
        groupId: groupId || null,
        date: date ? new Date(date) : source.date,
        title: source.title,
        repDistanceM: source.repDistanceM,
        zone: source.zone,
        zoneLabel: source.zoneLabel,
        duplicatedFromId: source.id,
        createdById: req.user.id,
        entries: { create: athleteIds.map((athleteId) => ({ athleteId })) },
      },
      include: {
        group: { select: { name: true } },
        entries: { include: { athlete: { select: { name: true, preferredName: true } } } },
      },
    });

    res.status(201).json(serializeSession(duplicate));
  } catch (error) {
    console.error('Error duplicating interval session:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/interval-sessions/:id — session-level fields only; date/group
// are part of its identity, so change those by deleting and recreating.
router.put('/:id', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { title, repDistanceM, zone, zoneLabel, archived } = req.body;

  try {
    if (zone !== undefined) {
      const zoneError = await zoneKeyError(zone, req.user.teamId);
      if (zoneError) return res.status(400).json({ msg: zoneError });
    }
    const session = await prisma.intervalSession.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!session) {
      return res.status(404).json({ msg: 'Session not found.' });
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (repDistanceM !== undefined) updates.repDistanceM = Math.round(Number(repDistanceM));
    if (zone !== undefined) {
      updates.zone = zone;
      // Re-snapshot alongside the key. Leaving a stale label attached to a
      // new zone would be worse than having none.
      updates.zoneLabel =
        typeof zoneLabel === 'string' && zoneLabel.trim() ? zoneLabel.trim().slice(0, 60) : null;
    }
    if (archived !== undefined) updates.archived = Boolean(archived);

    const updated = await prisma.intervalSession.update({
      where: { id: session.id },
      data: updates,
      include: {
        group: { select: { name: true } },
        entries: { include: { athlete: { select: { name: true, preferredName: true } } } },
      },
    });
    res.json(serializeSession(updated));
  } catch (error) {
    console.error('Error updating interval session:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/interval-sessions/:id — also removes every entry's derived
// TrainingLog row; those exist only because this session did.
router.delete('/:id', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  try {
    const session = await prisma.intervalSession.findFirst({
      where: { id: req.params.id, teamId: req.user.teamId },
      include: { entries: { select: { id: true } } },
    });
    if (!session) {
      return res.status(404).json({ msg: 'Session not found.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.trainingLog.deleteMany({
        where: { sourceIntervalSessionEntryId: { in: session.entries.map((e) => e.id) } },
      });
      await tx.intervalSession.delete({ where: { id: session.id } });
    });

    res.json({ msg: 'Deleted.' });
  } catch (error) {
    console.error('Error deleting interval session:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/interval-sessions/:id/entries — "an athlete not normally in
// this group, because sometimes that happens."
router.post('/:id/entries', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { athleteId } = req.body;
  if (!athleteId) {
    return res.status(400).json({ msg: 'athleteId is required.' });
  }

  try {
    const session = await prisma.intervalSession.findFirst({ where: { id: req.params.id, teamId: req.user.teamId } });
    if (!session) {
      return res.status(404).json({ msg: 'Session not found.' });
    }
    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId: req.user.teamId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }

    let addedManually = true;
    if (session.groupId) {
      const membership = await prisma.groupMembership.findFirst({
        where: { groupId: session.groupId, athleteId, endDate: null },
      });
      addedManually = !membership;
    }

    const entry = await prisma.intervalSessionEntry.create({
      data: { intervalSessionId: session.id, athleteId, addedManually },
      include: { athlete: { select: { name: true, preferredName: true } } },
    });
    res.status(201).json(serializeEntry(entry));
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ msg: 'That athlete already has a row in this session.' });
    }
    console.error('Error adding interval session entry:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/interval-sessions/entries/:entryId — save rep times; writes
// straight through to the athlete's training log in the same request, per
// the request that these "get logged AND recorded back" in one action.
router.put('/entries/:entryId', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  const { rep1, rep2, rep3, rep4, rep5, rep6, notes } = req.body;

  try {
    const entry = await prisma.intervalSessionEntry.findFirst({
      where: { id: req.params.entryId, intervalSession: { teamId: req.user.teamId } },
      include: { intervalSession: true },
    });
    if (!entry) {
      return res.status(404).json({ msg: 'Entry not found.' });
    }

    const toRep = (v) => (v === undefined ? undefined : v === null || v === '' ? null : Number(v));
    const updates = {
      rep1: toRep(rep1),
      rep2: toRep(rep2),
      rep3: toRep(rep3),
      rep4: toRep(rep4),
      rep5: toRep(rep5),
      rep6: toRep(rep6),
      ...(notes !== undefined ? { notes } : {}),
    };
    Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.intervalSessionEntry.update({
        where: { id: entry.id },
        data: updates,
        include: { athlete: { select: { name: true, preferredName: true } } },
      });
      await syncEntryToTrainingLog(tx, saved, entry.intervalSession, req.user.id);
      return saved;
    });

    res.json(serializeEntry(updated));
  } catch (error) {
    console.error('Error updating interval session entry:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/interval-sessions/entries/:entryId
router.delete('/entries/:entryId', authenticate, requireTeam, requireRole(ANY_COACH), async (req, res) => {
  try {
    const entry = await prisma.intervalSessionEntry.findFirst({
      where: { id: req.params.entryId, intervalSession: { teamId: req.user.teamId } },
    });
    if (!entry) {
      return res.status(404).json({ msg: 'Entry not found.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.trainingLog.deleteMany({ where: { sourceIntervalSessionEntryId: entry.id } });
      await tx.intervalSessionEntry.delete({ where: { id: entry.id } });
    });

    res.json({ msg: 'Deleted.' });
  } catch (error) {
    console.error('Error deleting interval session entry:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
