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
const { checkEventProgressCsv } = require('../lib/trackEventProgressCsv');
const { importEventProgressCsv } = require('../lib/trackEventProgressImport');

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

// POST /api/track/seasons/:year/import-event-progress-csv  { csv }
// Section 4's scraper fallback: Athletic.net's team hub is a Cloudflare-
// protected, Angular-rendered page a server-side scraper can't reach (see
// NOTES.md), so this reads the same CSV shape web/src/lib/
// trackEventProgressPaste.ts produces from the Event Progress page the
// coach copies out of their own browser — same reasoning as the XC
// Results Grid's browser-based import. Nothing here contacts
// Athletic.net, and a paste never deletes anything it doesn't mention.
//
// requireSuperAdmin, not a sport-scoped TeamMember check, for the same
// reason every other route in this file is gated that way right now —
// see this file's header comment. Swap for real sport-scoped
// authorization before this reaches an actual coach.
router.post('/seasons/:year/import-event-progress-csv', authenticate, requireSuperAdmin, async (req, res) => {
  const yearNum = parseInt(req.params.year, 10);
  const { csv } = req.body || {};
  const check = checkEventProgressCsv(csv, yearNum);
  if (!check.ok) return res.status(400).json({ message: check.message });

  try {
    const summary = await importEventProgressCsv(req.user.team, yearNum, csv);
    const unmatchedNote = summary.unmatchedEvents.length
      ? ` ${summary.unmatchedEvents.length} event name${summary.unmatchedEvents.length === 1 ? '' : 's'} weren't in the catalog and were skipped: ${summary.unmatchedEvents.join(', ')}.`
      : '';
    res.status(200).json({
      success: true,
      message: `Imported ${summary.recordsProcessed} results for season ${yearNum}.${unmatchedNote}`,
      ...summary,
    });
  } catch (error) {
    console.error('Error importing track Event Progress CSV:', error.message);
    res.status(500).json({ message: 'Could not finish importing those results. Paste and import them again: rows update in place, so a second run is safe.' });
  }
});

module.exports = router;
