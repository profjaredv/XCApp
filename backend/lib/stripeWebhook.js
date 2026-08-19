// F4 (LeadPack Master Build Handoff): Stripe client + webhook handler.
// "Leave unset to disable" pattern, same as lib/email.js's EUSEND_API_KEY —
// getStripeClient() returns null when STRIPE_SECRET_KEY isn't configured,
// so a dev/preview environment without Stripe keys degrades to "checkout
// isn't configured yet" rather than crashing at boot.
const Stripe = require('stripe');
const prisma = require('./db');

function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

// Mounted in server.js with express.raw() BEFORE the global express.json()
// middleware — Stripe's signature check needs the exact raw request body,
// which a JSON-parsed-and-reserialized body would not reproduce byte for
// byte. A rejected/unsigned request is never processed.
async function handleStripeWebhook(req, res) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    console.error('Stripe webhook received but STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET is not configured.');
    return res.status(500).send('Stripe not configured.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // The only event that unlocks a team (F4) — a $0 promo-code session
      // and a $199 one complete identically and unlock identically.
      // Regardless of resulting charge amount, this is what flips plan.
      case 'checkout.session.completed': {
        const session = event.data.object;
        const teamId = session.metadata?.teamId;
        if (teamId) {
          await prisma.team.update({
            where: { id: teamId },
            data: {
              plan: 'active',
              stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
              stripeSubscriptionId:
                typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null,
              checkoutCompletedAt: new Date(),
            },
          });
        } else {
          console.error('checkout.session.completed with no teamId in metadata:', session.id);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const team = await prisma.team.findFirst({ where: { stripeSubscriptionId: subscription.id } });
        if (team) {
          const nextPlan =
            event.type === 'customer.subscription.deleted'
              ? 'canceled'
              : subscription.status === 'past_due'
                ? 'past_due'
                : subscription.status === 'active'
                  ? 'active'
                  : team.plan;
          if (nextPlan !== team.plan) {
            await prisma.team.update({ where: { id: team.id }, data: { plan: nextPlan } });
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Error processing Stripe webhook event', event.type, ':', err.message);
    return res.status(500).send('Webhook handler error.');
  }

  res.json({ received: true });
}

module.exports = { getStripeClient, handleStripeWebhook };
