// LeadPack Track & Field handoff (docs/leadpack-track-field-handoff.md).
//
// Every route in this file is gated on the platform super-admin allowlist
// (lib/superAdmin.js, SUPER_ADMIN_EMAILS) — the same mechanism
// routes/admin.js uses, not a new one. This is a deliberate, temporary
// build-time gate: Track & Field ships incrementally straight into
// production so Jared can click through real, in-progress work as phases
// land, without a separate preview environment. It must come off (or be
// replaced by Section 1b's real sport-scoped TeamMember permissions)
// before this goes live to actual coaches — flagged again once the
// feature is demo-ready, not silently left in place. See NOTES.md.
//
// requireSuperAdmin here is the actual security boundary. The frontend's
// /tf/ route guard is UX only — it redirects so a non-admin never sees a
// half-loaded screen, but every request below re-checks server-side
// regardless of what the frontend did or didn't gate.
const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

// authenticate + requireSuperAdmin are applied per-route below, not via
// router.use() — test/routeAuth.test.js's guard check only reads
// middleware attached directly to each route (it can't see router-level
// .use() layers), so every route here repeats both explicitly. This keeps
// a future route that forgets the gate from silently passing that test.

// GET /api/track/events — the seeded Event catalog (see
// scripts/seedTrackEvents.js), ordered for display. Deliberately simple:
// this is reference data, not team-scoped, same as Course. Doubles as the
// first real, non-placeholder thing the /tf/ demo gate can render end to
// end — an empty list here means the seed script hasn't been run yet,
// which the frontend should say plainly rather than pretending otherwise.
router.get('/events', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const events = await prisma.event.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json(events);
  } catch (err) {
    console.error('Error fetching track events:', err.message);
    res.status(500).json({ message: 'Could not load the event catalog.' });
  }
});

// GET /api/track/status — a coach's own team's track readiness: whether
// any Track season exists yet, and how much has actually been imported.
// Exists so the /tf/dashboard shell has something real to show rather
// than a static "coming soon" — every number here is a live count, never
// invented.
router.get('/status', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    if (!req.user.teamId) {
      return res.json({ hasTeam: false, trackSeasons: [], trackMeetCount: 0, trackResultCount: 0 });
    }

    const [trackSeasons, trackMeetCount, trackResultCount, eventCount] = await Promise.all([
      prisma.season.findMany({
        where: { teamId: req.user.teamId, sport: 'TRACK' },
        orderBy: { year: 'desc' },
        select: { id: true, year: true, isActive: true },
      }),
      prisma.trackMeet.count({ where: { teamId: req.user.teamId } }),
      prisma.trackResult.count({ where: { teamId: req.user.teamId } }),
      prisma.event.count(),
    ]);

    res.json({
      hasTeam: true,
      trackSeasons,
      trackMeetCount,
      trackResultCount,
      eventCatalogSize: eventCount,
    });
  } catch (err) {
    console.error('Error fetching track status:', err.message);
    res.status(500).json({ message: 'Could not load track status.' });
  }
});

module.exports = router;
