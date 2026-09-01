import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ArrowRight, Check, Loader2, Mail, UserCheck } from 'lucide-react';
import { axiosInstance } from '@/api/axios';
import { teamService, type GuardianLookupAthlete } from '@/api/teamService';
import { authClient } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { readIntent, clearIntent, type SignupIntent } from '@/lib/signupIntent';
import { getApiErrorMessage } from '@/lib/apiError';

// What happens after the account exists.
//
// This used to be where EVERYTHING was asked, as a two-button fork: "join
// with a code" or "need a team set up". An assistant coach joining a team
// that already existed matched neither, so they used the athlete join code
// and silently became an ATHLETE.
//
// Now StartPage asks who you are and which team you mean before the
// account is created, and this page is mostly a resolver: it reads that
// intent (lib/signupIntent.ts) and opens on the one step that applies. The
// old fork still exists as a fallback for anyone who arrived without going
// through the wizard — an invite link, a bookmark, an older session — but
// it has the missing third option now.

type Step = 'choice' | 'join' | 'claim' | 'request' | 'staff-access' | 'parent';

const OnboardingPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [intent, setIntent] = useState<SignupIntent | null>(null);
  const [step, setStep] = useState<Step>('choice');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [sent, setSent] = useState(false);

  // Roster rows nobody has claimed on the team just joined — the step the
  // old flow skipped entirely, which left athletes joined to a team but
  // never linked to their own results.
  const [profiles, setProfiles] = useState<Array<{ _id: string; name: string }>>([]);
  const [joinedTeamName, setJoinedTeamName] = useState('');
  const [claimed, setClaimed] = useState(false);

  // Guardian flow. A parent looks the roster up with the team's join code
  // and picks their children — plural, because a family with two runners
  // on one team is ordinary.
  const [guardianTeam, setGuardianTeam] = useState<string | null>(null);
  const [guardianAthletes, setGuardianAthletes] = useState<GuardianLookupAthlete[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    const stored = readIntent();
    if (!stored) return;
    setIntent(stored);
    if (stored.role === 'coach') setStep(stored.teamId ? 'staff-access' : 'request');
    else if (stored.role === 'athlete') setStep('join');
    else if (stored.role === 'parent') setStep('parent');
  }, []);

  // Onboarding has no nav chrome — without this, someone stuck here (wrong
  // account, needs to re-authenticate) has no way back to /login short of
  // clearing cookies.
  const handleSignOut = () => {
    clearIntent();
    authClient.signOut();
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!joinCode.trim()) {
      setError('Please enter a join code.');
      return;
    }
    setLoading(true);
    try {
      // POST /team/join, not /profile/join-team. Both add the membership,
      // but only this one returns the unclaimed roster rows — and without
      // that step an athlete ends up on the team with no results, no PRs
      // and a My Progress page that does not know who they are.
      const result = await teamService.joinTeam(joinCode.trim());
      setJoinedTeamName(result.teamName);
      setProfiles(result.availableProfiles ?? []);
      clearIntent();
      setStep('claim');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not join with that code.'));
    }
    setLoading(false);
  };

  const handleClaimProfile = async (athleteId: string) => {
    setError('');
    setLoading(true);
    try {
      await teamService.claimProfile(athleteId);
      setClaimed(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send that claim.'));
    }
    setLoading(false);
  };

  const handleGuardianLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!joinCode.trim()) {
      setError('Please enter the join code.');
      return;
    }
    setLoading(true);
    try {
      const result = await teamService.guardianLookup(joinCode.trim());
      setGuardianTeam(result.teamName);
      setGuardianAthletes(result.athletes);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No team found for that code.'));
    }
    setLoading(false);
  };

  const handleGuardianRequest = async () => {
    setError('');
    setLoading(true);
    try {
      // Straight to the guardian pipeline, NOT to /team-requests. A parent
      // following their child is the coach's decision, not LeadPack's —
      // routing it to the platform queue meant the coach never saw it and
      // the only available action was "create a team", which is nonsense
      // for a parent.
      await teamService.requestGuardianLinks(joinCode.trim(), picked);
      clearIntent();
      setSent(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send that request.'));
    }
    setLoading(false);
  };

  const submitRequest = async (extra: Partial<SignupIntent> = {}) => {
    setError('');
    setLoading(true);
    try {
      const merged = { ...intent, ...extra };
      await axiosInstance.post('/team-requests', {
        message: contactMessage.trim() || defaultMessage(merged),
        role: merged.role ?? undefined,
        teamName: merged.teamName ?? undefined,
        wantsTeamId: merged.teamId ?? undefined,
      });
      clearIntent();
      setSent(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send that — try again.'));
    }
    setLoading(false);
  };

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-50 via-white to-secondary p-4">
      {currentUser && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Signed in as {currentUser.email}
          <button type="button" onClick={handleSignOut} className="text-primary underline underline-offset-4">
            Not you? Sign out
          </button>
        </div>
      )}
      <Card className="mx-auto w-full max-w-md">{children}</Card>
    </div>
  );

  const errorBox = error ? (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  // --- a coach whose team is already on LeadPack -------------------------
  // The case the old flow had no answer for at all.
  if (step === 'staff-access') {
    return shell(
      <>
        <CardHeader>
          <CardTitle>Get added to {intent?.teamName ?? 'your team'}</CardTitle>
          <CardDescription>
            Coach access is granted by the team's head coach, not by a join code — a join code
            would make you an athlete. Send a request and we'll pass it on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorBox}
          {sent ? (
            <Alert>
              <Check className="h-4 w-4" />
              <AlertDescription>
                Request sent. We'll email {currentUser?.email ?? 'you'} once you've been added.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="staff-note">Anything they should know? (optional)</Label>
                <Textarea
                  id="staff-note"
                  rows={3}
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="Assistant coach, distance squad"
                />
              </div>
              <Button className="w-full" disabled={loading} onClick={() => submitRequest()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Mail className="mr-2 h-4 w-4" />
                Ask to be added
              </Button>
              <button
                type="button"
                onClick={() => { setStep('choice'); setError(''); }}
                className="w-full text-center text-sm text-muted-foreground underline underline-offset-4"
              >
                That's not my team
              </button>
            </>
          )}
        </CardContent>
      </>
    );
  }

  // --- a coach whose team is not on LeadPack yet -------------------------
  if (step === 'request') {
    return shell(
      <>
        <CardHeader>
          <CardTitle>Get your team set up</CardTitle>
          <CardDescription>
            We set teams up by hand, which is what keeps every team tied to a real coach at a real
            school.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorBox}
          {sent ? (
            <Alert>
              <Check className="h-4 w-4" />
              <AlertDescription>
                Request received. We'll email {currentUser?.email ?? 'your account'} with a setup
                link once your team is created — usually within a day.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="team-name">Your school and team name</Label>
                <Input
                  id="team-name"
                  autoFocus
                  defaultValue={intent?.teamName ?? intent?.searchedFor ?? ''}
                  onChange={(e) => setIntent((p) => ({ ...(p ?? { role: 'coach' }), teamName: e.target.value }))}
                  placeholder="Ellensburg High School — Boys & Girls XC"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="request-note">Anything else? (optional)</Label>
                <Textarea
                  id="request-note"
                  rows={2}
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="We compete in the CWAC, about 40 runners"
                />
              </div>
              <Button
                className="w-full"
                disabled={loading || !(intent?.teamName ?? '').trim()}
                onClick={() => submitRequest()}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send request
              </Button>
            </>
          )}
        </CardContent>
      </>
    );
  }

  // --- an athlete entering their join code -------------------------------
  if (step === 'join') {
    return shell(
      <>
        <CardHeader>
          <CardTitle>Join {intent?.teamName ?? 'your team'}</CardTitle>
          <CardDescription>Enter the join code your coach gave you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorBox}
          <form onSubmit={handleJoinTeam} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="join-code">Join code</Label>
              <Input
                id="join-code"
                autoFocus
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ABC123"
                className="font-mono tracking-widest uppercase"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Join team
            </Button>
          </form>
          <button
            type="button"
            onClick={() => { setStep('choice'); setError(''); }}
            className="w-full text-center text-sm text-muted-foreground underline underline-offset-4"
          >
            I don't have a code
          </button>
        </CardContent>
      </>
    );
  }

  // --- pick your name off the roster -------------------------------------
  if (step === 'claim') {
    return shell(
      <>
        <CardHeader>
          <CardTitle>You're on {joinedTeamName}</CardTitle>
          <CardDescription>
            {claimed
              ? 'Your coach will approve this shortly.'
              : profiles.length > 0
                ? "Which one is you? Picking your name links your races and training to you."
                : 'There are no unclaimed roster spots right now — your coach can link you.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {errorBox}
          {claimed ? (
            <Alert>
              <UserCheck className="h-4 w-4" />
              <AlertDescription>
                Claim sent. Once a coach approves it, your results and training log are yours.
              </AlertDescription>
            </Alert>
          ) : (
            profiles.map((profile) => (
              <button
                key={profile._id}
                type="button"
                disabled={loading}
                onClick={() => handleClaimProfile(profile._id)}
                className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 disabled:opacity-50"
              >
                <span className="font-medium">{profile.name}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          )}
          <Button
            variant={claimed ? 'default' : 'outline'}
            className="w-full"
            onClick={() => navigate('/login')}
          >
            {claimed ? 'Go to LeadPack' : "I'm not on this list — continue anyway"}
          </Button>
        </CardContent>
      </>
    );
  }

  // --- a parent ----------------------------------------------------------
  if (step === 'parent') {
    return shell(
      <>
        <CardHeader>
          <CardTitle>{guardianTeam ? `Who are your athletes at ${guardianTeam}?` : 'Follow your athlete'}</CardTitle>
          <CardDescription>
            {sent
              ? 'A coach reviews every parent link — we never connect a parent to a student without that.'
              : guardianTeam
                ? 'Pick everyone who is yours. You can select more than one.'
                : "Enter your team's join code — your athlete or their coach can give it to you."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorBox}

          {sent ? (
            <>
              <Alert>
                <Check className="h-4 w-4" />
                <AlertDescription>
                  Request sent to the coaches at {guardianTeam}. We'll email{' '}
                  {currentUser?.email ?? 'you'} once it's approved.
                </AlertDescription>
              </Alert>
              <Button className="w-full" onClick={() => navigate('/login')}>
                Done
              </Button>
            </>
          ) : !guardianTeam ? (
            <form onSubmit={handleGuardianLookup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="guardian-code">Join code</Label>
                <Input
                  id="guardian-code"
                  autoFocus
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="ABC123"
                  className="font-mono uppercase tracking-widest"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Find my athlete
              </Button>
            </form>
          ) : (
            <>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {guardianAthletes.map((athlete) => {
                  const already = athlete.existingStatus;
                  const checked = picked.includes(athlete.id);
                  return (
                    <label
                      key={athlete.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border p-3',
                        already && 'cursor-not-allowed opacity-60',
                        checked && 'border-primary bg-primary/5'
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={Boolean(already)}
                        onCheckedChange={(next) =>
                          setPicked((prev) =>
                            next === true
                              ? [...prev, athlete.id]
                              : prev.filter((id) => id !== athlete.id)
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {athlete.name}
                      </span>
                      {/* Shown rather than hidden: a parent who already
                          asked should see why they cannot ask again. */}
                      {already && (
                        <Badge variant="secondary" className="shrink-0 capitalize">
                          {already}
                        </Badge>
                      )}
                    </label>
                  );
                })}
              </div>

              <Button
                className="w-full"
                disabled={loading || picked.length === 0}
                onClick={handleGuardianRequest}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {picked.length > 1
                  ? `Request access for ${picked.length} athletes`
                  : 'Request access'}
              </Button>
              <button
                type="button"
                onClick={() => { setGuardianTeam(null); setGuardianAthletes([]); setPicked([]); }}
                className="w-full text-center text-sm text-muted-foreground underline underline-offset-4"
              >
                Wrong team
              </button>
            </>
          )}
        </CardContent>
      </>
    );
  }

  // --- fallback fork, for anyone who skipped the wizard ------------------
  return shell(
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome to LeadPack XC</CardTitle>
        <CardDescription>Which of these is you?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {errorBox}
        <Button variant="outline" className="h-auto w-full py-4" onClick={() => setStep('join')}>
          <span className="text-center">
            <span className="block font-semibold">I'm an athlete with a join code</span>
            <span className="block text-sm font-normal text-muted-foreground">
              Join the team and pick your name off the roster
            </span>
          </span>
        </Button>

        {/* The option the old fork was missing. Without it, an assistant
            coach used the athlete join code and became an ATHLETE. */}
        <Button
          variant="outline"
          className="h-auto w-full py-4"
          onClick={() => { setIntent({ role: 'coach' }); setStep('choice'); navigate('/start'); }}
        >
          <span className="text-center">
            <span className="block font-semibold">I'm a coach and my team is already here</span>
            <span className="block text-sm font-normal text-muted-foreground">
              Find your team — coach access comes from your head coach, not a code
            </span>
          </span>
        </Button>

        <Button variant="outline" className="h-auto w-full py-4" onClick={() => setStep('request')}>
          <span className="text-center">
            <span className="block font-semibold">I'm a coach and need a team set up</span>
            <span className="block text-sm font-normal text-muted-foreground">
              We'll create it and send you a setup link
            </span>
          </span>
        </Button>
      </CardContent>
    </>
  );
};

/** What the admin sees when nobody typed a note. Built from the intent so
 *  a request is never just an email address with no context. */
function defaultMessage(intent: Partial<SignupIntent>): string {
  if (intent.role === 'coach' && intent.teamId) {
    return `Coach requesting staff access to ${intent.teamName ?? 'an existing team'}.`;
  }
  if (intent.role === 'coach') {
    return `Coach requesting a new team: ${intent.teamName ?? intent.searchedFor ?? 'unnamed'}.`;
  }
  if (intent.role === 'parent') {
    return `Parent requesting access${intent.teamName ? ` at ${intent.teamName}` : ''}.`;
  }
  return 'Requesting access.';
}

export default OnboardingPage;
