const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { normalizeRoute, normalizeUi } = require('../lib/pageViewLogging');
const { resolveLoggingRole } = require('../lib/loggingRole');

// POST /api/page-views — E2 (LeadPack Master Build Handoff). Fire-and-
// forget from the frontend on every route change; failures here must never
// surface to the user, so this stays about as simple as a route can be.
// authenticate only (no requireTeam) — this fires on pages a signed-in
// user without a team yet can still land on (onboarding, join-team).
router.post('/', authenticate, async (req, res) => {
  const { route, ui } = req.body;

  try {
    await prisma.pageView.create({
      data: {
        route: normalizeRoute(route),
        role: await resolveLoggingRole(prisma, req.user),
        ui: normalizeUi(ui),
      },
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Error logging page view:', error.message);
    // Never block or error out the page over a logging failure.
    res.status(200).json({ ok: false });
  }
});

module.exports = router;
