import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { axiosInstance } from '@/api/axios';
import { authClient } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';

const OnboardingPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [step, setStep] = useState<'choice' | 'join' | 'create'>('choice');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [contactSent, setContactSent] = useState(false);
  const navigate = useNavigate();

  // Onboarding has no header/nav chrome — without this, someone stuck here
  // (wrong account, needs to re-authenticate) has no way back to /login
  // short of clearing cookies. signOut() redirects through Neon Auth, which
  // lands back on /login once there's no session.
  const handleSignOut = () => {
    authClient.signOut();
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!joinCode.trim()) {
      setError('Please enter a join code.');
      setLoading(false);
      return;
    }

    try {
      const response = await axiosInstance.post(
        '/profile/join-team',
        { joinCode }
      );

      if (response.data.success) {
        // Navigate straight off this response rather than the legacy /analytics
        // redirect (which reads currentUser.team from auth context) — that
        // context may not have re-synced yet the instant after joining, which
        // would bounce back to /onboarding instead of forward.
        const athleticTeamId = response.data.user?.team?.athleticTeamId;
        navigate(athleticTeamId ? `/t/${athleticTeamId}` : '/onboarding');
      } else {
        throw new Error(response.data.message || 'Failed to join team');
      }
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.data?.message?.includes('not found')) {
        setError('Invalid or expired join code. Would you like to create a new team instead?');
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to join team.');
      }
      console.error(err);
    }

    setLoading(false);
  };

  // F1/F5 (LeadPack Master Build Handoff): no self-serve team creation —
  // reuses the same working /api/feedback pipeline FeedbackWidget posts to
  // (open to any signed-in user regardless of team, per server.js's
  // ALLOWED_UNGUARDED) rather than routing to the team-scoped Feedback page,
  // which would just bounce back here via LegacyRedirect for a teamless user.
  const handleContactRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axiosInstance.post('/feedback', {
        route: '/onboarding',
        screen: 'Onboarding — needs a team',
        severity: 'blocker',
        message: contactMessage.trim() || 'Requesting a new team be set up.',
      });
      setContactSent(true);
    } catch (err) {
      const message =
        (typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined) ?? (err instanceof Error ? err.message : 'Could not send that — try again.');
      setError(message);
    }
    setLoading(false);
  };

  if (step === 'choice') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 gap-3">
        {currentUser && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            Signed in as {currentUser.email}
            <button type="button" onClick={handleSignOut} className="text-blue-600 hover:underline">
              Not you? Sign out
            </button>
          </div>
        )}
        <Card className="mx-auto max-w-lg w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Welcome to LeadPack XC!</CardTitle>
            <CardDescription>Let's get you set up with your team</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => setStep('join')}
              className="w-full h-20 text-lg"
              variant="outline"
            >
              <div className="text-center">
                <div className="font-semibold">Join an Existing Team</div>
                <div className="text-sm font-normal text-muted-foreground">I have a join code from my coach</div>
              </div>
            </Button>

            <Button
              onClick={() => setStep('create')}
              className="w-full h-20 text-lg"
              variant="outline"
            >
              <div className="text-center">
                <div className="font-semibold">Don't Have a Team Yet?</div>
                <div className="text-sm font-normal text-muted-foreground">I'm a coach and need one set up</div>
              </div>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'join') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 gap-3">
        {currentUser && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            Signed in as {currentUser.email}
            <button type="button" onClick={handleSignOut} className="text-blue-600 hover:underline">
              Not you? Sign out
            </button>
          </div>
        )}
        <Card className="mx-auto max-w-md w-full">
          <CardHeader>
            <CardTitle>Join Your Team</CardTitle>
            <CardDescription>Enter the join code provided by your coach</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleJoinTeam} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="join-code">Join Code</Label>
                <Input
                  id="join-code"
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter join code"
                  required
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setStep('choice'); setError(''); }}
                  className="w-full"
                >
                  Back
                </Button>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Joining...' : 'Join Team'}
                </Button>
              </div>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setStep('create'); setError(''); }}
                className="text-sm text-blue-600 hover:underline"
              >
                Don't have a team yet?
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // F1/F5 (LeadPack Master Build Handoff): teams are no longer created
  // self-serve. POST /api/teams let any signed-in user become HEAD_COACH of
  // any unclaimed Athletic.net team ID, with no check they had any real
  // connection to that school — a global namespace, first-come-first-served.
  // The owner now creates every team by hand and sends a claim link
  // (routes/teamClaims.js, /claim/:token) instead.
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 gap-3">
      {currentUser && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          Signed in as {currentUser.email}
          <button type="button" onClick={handleSignOut} className="text-blue-600 hover:underline">
            Not you? Sign out
          </button>
        </div>
      )}
      <Card className="mx-auto max-w-md w-full">
        <CardHeader>
          <CardTitle>Get Your Team Set Up</CardTitle>
          <CardDescription>
            Teams on LeadPack are set up by hand right now, not self-serve — this keeps every team
            connected to a real coach at a real school.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {contactSent ? (
            <>
              <div className="bg-green-100 text-green-700 p-3 rounded text-sm">
                Sent — we'll follow up at {currentUser?.email ?? 'your account email'} once your team is set up.
              </div>
              <Button variant="outline" onClick={() => setStep('choice')} className="w-full">
                Back
              </Button>
            </>
          ) : (
            <form onSubmit={handleContactRequest} className="space-y-4">
              {error && (
                <div className="bg-red-100 text-red-700 p-3 rounded text-sm">
                  {error}
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                We'll follow up at <strong>{currentUser?.email ?? 'the email on this account'}</strong>.
              </p>
              <div className="space-y-2">
                <Label htmlFor="contact-message">Your school and team name</Label>
                <Textarea
                  id="contact-message"
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="e.g. Lincoln High School — Lincoln XC"
                  rows={3}
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setStep('choice'); setError(''); }}
                  className="w-full"
                >
                  Back
                </Button>
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Sending...' : 'Send Request'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OnboardingPage;
