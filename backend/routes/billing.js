const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { getStripeClient } = require('../lib/stripeWebhook');

const FRONTEND_URL = process.env.FRONTEND_URL
  || (process.env.NODE_ENV === 'production' ? 'https://www.leadpack.cc' : 'http://localhost:5173');

// POST /api/billing/checkout-session
// F4: the required-every-time checkout step, even at $0 via a promo code.
// HEAD_COACH-only — this changes what the whole team can do, same tier as
// staff-invite/generate-join-code. allow_promotion_codes puts the code
// field on Stripe's own hosted page, so the owner-issued 100%-off code
// applies there rather than needing custom UI here. No trial_period_days —
// the 30-day guarantee (F4) is a promised refund on a completed charge, not
// a delayed one, which is the whole point of requiring checkout at all.
router.post('/checkout-session', authenticate, requireTeam, requireRole(['HEAD_COACH']), async (req, res) => {
  const stripe = getStripeClient();
  if (!stripe || !process.env.STRIPE_PRICE_ID) {
    return res.status(500).json({ message: 'Checkout is not configured yet — contact LeadPack.' });
  }

  try {
    const team = await prisma.team.findUnique({ where: { id: req.user.teamId } });
    if (!team) {
      return res.status(404).json({ message: 'Team not found.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...(team.stripeCustomerId ? { customer: team.stripeCustomerId } : { customer_email: req.user.email }),
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      metadata: { teamId: team.id },
      subscription_data: { metadata: { teamId: team.id } },
      success_url: `${FRONTEND_URL}/t/${team.athleticTeamId}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/t/${team.athleticTeamId}/checkout`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error.message);
    res.status(500).json({ message: 'Could not start checkout.' });
  }
});

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
