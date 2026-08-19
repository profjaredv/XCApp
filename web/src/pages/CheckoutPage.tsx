import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { billingService, type BillingStatus } from '@/api/billingService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Loader2 } from 'lucide-react';

const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 2500;

// F4 (LeadPack Master Build Handoff): the required-every-time checkout
// step, even at $0. Not gated by requireActivePlan itself — a
// claimed-but-not-yet-checked-out coach must be able to reach this page —
// but every action that exposes the app to athletes (join codes, invites)
// stays 402'd server-side until plan flips to 'active'.
const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const [searchParams] = useSearchParams();
  const returnedFromStripe = searchParams.has('session_id');

  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(returnedFromStripe);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const check = async () => {
      try {
        const data = await billingService.getStatus();
        if (cancelled) return;
        setStatus(data);
        setLoadingStatus(false);

        // The webhook, not this redirect, is the source of truth — it can
        // land a few seconds after Stripe sends the browser back here.
        if (returnedFromStripe && data.plan !== 'active' && attempts < POLL_ATTEMPTS) {
          attempts += 1;
          setTimeout(check, POLL_INTERVAL_MS);
        } else {
          setPolling(false);
        }
      } catch {
        if (!cancelled) {
          setLoadingStatus(false);
          setPolling(false);
        }
      }
    };

    check();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartCheckout = async () => {
    setStartingCheckout(true);
    setError(null);
    try {
      const { url } = await billingService.createCheckoutSession();
      window.location.href = url;
    } catch {
      setError('Could not start checkout. Try again, or contact LeadPack.');
      setStartingCheckout(false);
    }
  };

  if (loadingStatus || polling) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Checkout</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {polling ? 'Finishing up checkout…' : 'Loading…'}
        </div>
      </div>
    );
  }

  if (status?.plan === 'active') {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Checkout</h1>
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <CardTitle>You're all set</CardTitle>
            </div>
            <CardDescription>Checkout is complete — join codes and invites are unlocked.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate(teamPath('/today'))}>Continue to Today</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Complete Checkout</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardDescription>
            One step left — this unlocks join codes and invites so athletes can get on the team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 text-center">
            <p className="text-3xl font-bold">$199</p>
            <p className="text-sm text-muted-foreground">per year</p>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Have a promo code? There's a field for it on the checkout page.
          </p>
          <p className="text-xs text-muted-foreground text-center">
            Full refund available on request within 30 days of your first charge.
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button onClick={handleStartCheckout} disabled={startingCheckout} className="w-full">
            {startingCheckout && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Continue to Checkout
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            You can still explore the app before completing this — it only unlocks the actions that add athletes.
          </p>
          <Button variant="ghost" onClick={() => navigate(teamPath('/today'))} className="w-full">
            I'll do this later
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CheckoutPage;
