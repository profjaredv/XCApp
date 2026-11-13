// An athlete's own Track & Field record. Separate from routes/track.js on
// purpose: everything there is the coach's view of the whole team, gated to
// coaches. This is one athlete reading their own marks and relays, and
// nothing about anyone else beyond the names on their own relay squads.
const express = require('express');
const router = express.Router();
const { authenticate, requireTeam, requireLinkedAthlete } = require('../middleware/auth');
const { requireFeature } = require('../middleware/teamFeatures');
const prisma = require('../lib/db');
const { loadTrackAthlete } = require('./track');

// GET /api/track-me — always the caller's own linked athlete; there is no id to pass.
router.get('/', authenticate, requireTeam, requireFeature('track'), requireLinkedAthlete, async (req, res) => {
  try {
    const a = req.user.linkedAthlete;
    if (a.teamId !== req.user.teamId) return res.status(403).json({ message: 'Access denied.' });
    res.json(await loadTrackAthlete(req.user.teamId, { id: a.id, name: a.name, gender: a.gender, graduationYear: a.graduationYear }));
  } catch (err) {
    console.error('Error fetching own track record:', err.message);
    res.status(500).json({ message: 'Could not load your track results.' });
  }
});

// GET /api/track-me/upcoming — the meets still to come, the coach's plan
// for each, and what this athlete is entered in. Their own entries only:
// for a relay they are on, the squad's names; nothing about who else is
// entered in anything.
router.get('/upcoming', authenticate, requireTeam, requireFeature('track'), requireLinkedAthlete, async (req, res) => {
  try {
    const me = req.user.linkedAthlete;
    if (me.teamId !== req.user.teamId) return res.status(403).json({ message: 'Access denied.' });
    const teamId = req.user.teamId;
    const today = new Date(new Date().toISOString().slice(0, 10));
    const meets = await prisma.trackMeet.findMany({
      where: { teamId, date: { gte: today } },
      orderBy: { date: 'asc' },
      select: { id: true, name: true, date: true, location: true, notes: true },
    });
    const rows = await prisma.trackResult.findMany({
      where: { teamId, trackMeetId: { in: meets.map((m) => m.id) }, OR: [{ athleteId: me.id }, { relayAthleteIds: { has: me.id } }] },
      select: { trackMeetId: true, status: true, relayTeam: true, relayAthleteIds: true, event: { select: { name: true, sortOrder: true } } },
    });
    const legIds = [...new Set(rows.flatMap((r) => r.relayAthleteIds))];
    const names = new Map(
      (legIds.length ? await prisma.athlete.findMany({ where: { teamId, id: { in: legIds } }, select: { id: true, name: true } }) : []).map((a) => [a.id, a.name])
    );
    res.json(
      meets.map((m) => ({
        ...m,
        entries: rows
          .filter((r) => r.trackMeetId === m.id)
          .sort((a, b) => a.event.sortOrder - b.event.sortOrder)
          .map((r) => ({
            event: r.event.name,
            relayTeam: r.relayTeam,
            leg: r.relayAthleteIds.length ? r.relayAthleteIds.indexOf(me.id) + 1 : null,
            squad: r.relayAthleteIds.map((id) => names.get(id) || 'Unknown'),
          })),
      }))
    );
  } catch (err) {
    console.error('Error fetching own upcoming meets:', err.message);
    res.status(500).json({ message: 'Could not load your meets.' });
  }
});

module.exports = router;
