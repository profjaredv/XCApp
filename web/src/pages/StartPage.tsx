import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft, ArrowRight, Building2, Check, GraduationCap, ClipboardList, Loader2, Search, Users,
} from 'lucide-react';
import { teamDirectoryService, type DirectoryTeam } from '@/api/teamDirectoryService';
import { saveIntent, type SignupRole } from '@/lib/signupIntent';
import { accentFor } from '@/lib/sectionAccent';
import { cn } from '@/lib/utils';

// Sign-up, reordered.
//
// The old flow created an account first and only then asked anything —
// and what it asked was a two-button fork ("join with a code" / "need a
// team set up") that had no answer for an assistant coach joining a team
// that already exists. So they used the athlete join code, which made
// them an ATHLETE, and then wondered where the coach menus went.
//
// This asks the two questions that actually decide everything, in the
// order that makes each one answerable:
//
//   1. Who are you?  — coach, athlete or parent
//   2. Which team?   — searched by school name, not a code you may not have
//
// Only then does it hand off to Neon Auth. The answers ride along in
// sessionStorage (lib/signupIntent.ts) and OnboardingPage resolves them
// once the account exists, so nobody is asked the same thing twice.

type Step = 'role' | 'team' | 'confirm';

const ROLES: Array<{
  value: SignupRole;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  section: Parameters<typeof accentFor>[0];
}> = [
  {
    value: 'coach',
    label: "I'm a coach",
    detail: 'Head coach, assistant, or volunteer.',
    icon: ClipboardList,
    section: 'season',
  },
  {
    value: 'athlete',
    label: "I'm an athlete",
    detail: 'I run for a team that uses LeadPack.',
    icon: GraduationCap,
    section: 'athletes',
  },
  {
    value: 'parent',
    label: "I'm a parent or guardian",
    detail: "I want to follow my athlete's meets.",
    icon: Users,
    section: 'groups',
  },
];

const StartPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<SignupRole | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryTeam[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [picked, setPicked] = useState<DirectoryTeam | null>(null);
  const [notListed, setNotListed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced so typing a school name is a handful of requests rather than
  // one per keystroke — the endpoint is rate-limited and unauthenticated.
  useEffect(() => {
    if (step !== 'team') return;
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const data = await teamDirectoryService.search(q, controller.signal);
        setResults(data.results);
        setSearched(true);
      } catch {
        // A failed lookup must not be a dead end — "I don't see my team"
        // below is always available and leads somewhere useful.
        setResults([]);
        setSearched(true);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, step]);

  const chooseRole = (value: SignupRole) => {
    setRole(value);
    setStep('team');
  };

  const goToAuth = useCallback(
    (target: 'register' | 'login') => {
      if (!role) return;
      saveIntent({
        role,
        teamId: picked?.id,
        teamName: picked?.name ?? (query.trim() || undefined),
        athleticTeamId: picked?.athleticTeamId,
        teamNotListed: notListed || (!picked && searched),
        searchedFor: query.trim() || undefined,
      });
      navigate(`/${target}`);
    },
    [role, picked, notListed, searched, query, navigate]
  );

  const roleMeta = ROLES.find((r) => r.value === role);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-secondary p-4">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6">
        <Link to="/" className="flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-base font-bold text-white shadow-lg">
            LP
          </div>
          <span className="bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-2xl font-bold text-transparent">
            LeadPack XC
          </span>
        </Link>

        {step === 'role' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Let's get you to the right place</CardTitle>
              <CardDescription>Two quick questions, then you can make an account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {ROLES.map((option) => {
                const accent = accentFor(option.section);
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => chooseRole(option.value)}
                    className="flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:bg-muted/60"
                  >
                    <span
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
                        accent.bg
                      )}
                      aria-hidden
                    >
                      <Icon className={cn('h-6 w-6', accent.on)} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{option.label}</span>
                      <span className="block text-sm text-muted-foreground">{option.detail}</span>
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
              <p className="pt-2 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="underline underline-offset-4">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
        )}

        {step === 'team' && (
          <Card>
            <CardHeader>
              <Button
                variant="ghost"
                size="sm"
                className="mb-2 -ml-2 w-fit"
                onClick={() => { setStep('role'); setPicked(null); setNotListed(false); }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <CardTitle className="text-2xl">Find your team</CardTitle>
              <CardDescription>
                Search by school or program name — you don't need a code yet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team-search">School or team name</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="team-search"
                    autoFocus
                    className="pl-9"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setPicked(null); setNotListed(false); }}
                    placeholder="Ellensburg High School"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              {results.length > 0 && (
                <ul className="space-y-2">
                  {results.map((team) => (
                    <li key={team.id}>
                      <button
                        type="button"
                        onClick={() => { setPicked(team); setNotListed(false); }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60',
                          picked?.id === team.id && 'border-primary bg-primary/5'
                        )}
                      >
                        <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-medium">{team.name}</span>
                        {picked?.id === team.id && <Check className="h-5 w-5 shrink-0 text-primary" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {searched && results.length === 0 && !searching && (
                <Alert>
                  <AlertDescription>
                    No team matching “{query.trim()}” yet.
                    {role === 'coach'
                      ? " That's fine — we set teams up by hand, and you can ask for yours on the next step."
                      : ' Ask your coach whether they use LeadPack yet.'}
                  </AlertDescription>
                </Alert>
              )}

              {query.trim().length >= 3 && (
                <button
                  type="button"
                  onClick={() => { setPicked(null); setNotListed(true); setStep('confirm'); }}
                  className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  I don't see my team
                </button>
              )}

              <Button
                className="w-full"
                disabled={!picked}
                onClick={() => setStep('confirm')}
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'confirm' && roleMeta && (
          <Card>
            <CardHeader>
              <Button
                variant="ghost"
                size="sm"
                className="mb-2 -ml-2 w-fit"
                onClick={() => setStep('team')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <CardTitle className="text-2xl">
                {picked ? picked.name : 'Getting your team set up'}
              </CardTitle>
              <CardDescription>{whatHappensNext(role, picked, notListed)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={() => goToAuth('register')}>
                Create my account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="outline" className="w-full" onClick={() => goToAuth('login')}>
                I already have an account
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

/** The sentence that tells someone what they are about to get. Each branch
 *  is a real, different outcome — this is the screen the old flow was
 *  missing entirely for an assistant coach. */
function whatHappensNext(
  role: SignupRole | null,
  team: DirectoryTeam | null,
  notListed: boolean
): string {
  if (role === 'coach' && team) {
    return team.hasHeadCoach
      ? `${team.name} is already on LeadPack. Make an account and we'll ask their head coach to add you as staff — that's what gives you coach access rather than an athlete's view.`
      : `${team.name} is on LeadPack but has no head coach yet. Make an account and we'll get you set up as one.`;
  }
  if (role === 'coach') {
    return "We set teams up by hand so every one is tied to a real coach at a real school. Make an account and we'll take your details — usually sorted within a day.";
  }
  if (role === 'athlete' && team) {
    return `Make an account, then enter the join code from your coach. You'll pick your name off the roster so your races and training are yours.`;
  }
  if (role === 'athlete') {
    return notListed
      ? "Your team isn't on LeadPack yet. You can still make an account, but your coach will need to set the team up first."
      : 'Make an account and enter the join code your coach gave you.';
  }
  if (role === 'parent' && team) {
    return `Make an account, then ask to be linked to your athlete. A coach at ${team.name} approves it — we never link a parent without that.`;
  }
  return 'Make an account and we will help you find your athlete from there.';
}

export default StartPage;
