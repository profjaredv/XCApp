const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam } = require('../middleware/auth');

// F4 (LeadPack Master Build Handoff): checkout runs entirely off a Stripe
// Payment Link (static, configured in the Stripe dashboard — see
// web/src/pages/CheckoutPage.tsx for how the team is attached via
// client_reference_id). No session-creation route needed here; the webhook
// (lib/stripeWebhook.js) is what actually flips plan.

// GET /api/billing/status
// The webhook, not the browser tab returning from Stripe, is what actually
// flips plan to 'active' — this lets the post-checkout screen poll for that
// rather than trusting the redirect alone, since the two can race.
router.get('/status', authenticate, requireTeam, async (req, res) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.user.teamId },
      select: { plan: true, checkoutCompletedAt: true },
    });
    res.json({ plan: team?.plan ?? 'pending', checkoutCompletedAt: team?.checkoutCompletedAt ?? null });
  } catch (error) {
    console.error('Error fetching billing status:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
