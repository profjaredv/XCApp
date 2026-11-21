import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart, Hourglass, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { authClient } from '@/lib/auth';
import { clearIntent, saveIntent } from '@/lib/signupIntent';
import { parentService, type GuardianLinkSummary } from '@/api/parentService';
import { FootstepsCard } from '@/components/analytics/FootstepsCard';
import { formatDateShort, formatTime } from '@/lib/formatUtils';
import { gradeLabel } from '@/lib/seasonUtils';

// Where a parent lands. A parent belongs to no team, so the team app
// (/t/<team>/...) is not theirs; this page is: every runner they follow,
// this season's races, and Footsteps — which the server already shows to a
// guardian by class year only, never another student's name.
//
// Read-only on purpose. It shows what GET /guardian/athletes/:id returns
// and nothing else: no training log, no reflections.

const RunnerCard: React.FC<{ link: GuardianLinkSummary }> = ({ link }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['guardian-athlete', link.athleteId],
    queryFn: () => parentService.athlete(link.athleteId),
  });

  const finished = (data?.results ?? []).filter((r) => r.status === 'FINISHED' && r.time);
  const recent = [...finished].reverse();

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold">{link.athleteName}</h2>
        <p className="text-sm text-muted-foreground">
          {[link.teamName, data?.grade != null ? gradeLabel(data.grade) : null, data ? `${data.season} season` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Races this season</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : isError ? (
            <p className="text-sm text-muted-foreground">Couldn’t load races right now.</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No finished races yet this season.</p>
          ) : (
            <ul className="divide-y text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.race.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateShort(r.race.date)}
                      {r.race.distance ? ` · ${r.race.distance}` : ''}
                      {r.place ? ` · ${r.place}${ordinal(r.place)} place` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatTime(r.time as number)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {finished.length > 0 && <FootstepsCard athleteId={link.athleteId} />}
    </section>
  );
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

const MyRunnersPage: React.FC = () => {
  const { currentUser, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !currentUser) {
      sessionStorage.setItem('redirectUrl', '/my-runners');
      navigate('/login', { replace: true });
    }
  }, [loading, currentUser, navigate]);

  const { data: links, isLoading } = useQuery({
    queryKey: ['guardian-my-links'],
    queryFn: () => parentService.myLinks(),
    enabled: Boolean(currentUser),
  });

  if (loading || !currentUser || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const approved = (links ?? []).filter((l) => l.status === 'approved');
  const pending = (links ?? []).filter((l) => l.status === 'pending');

  const findRunner = () => {
    saveIntent({ role: 'parent' });
    navigate('/onboarding');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-4 py-3">
          <span className="flex items-center gap-2 font-bold">
            <Heart className="h-4 w-4 text-primary" /> My runners
          </span>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden truncate sm:inline">{currentUser.email}</span>
            <button
              type="button"
              className="text-primary underline underline-offset-4"
              onClick={() => {
                clearIntent();
                authClient.signOut();
              }}
            >
              Sign out
            </button>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-8 px-4 py-6 pb-16">
        {currentUser.team && (
          <p className="text-sm text-muted-foreground">
            You’re also on a team.{' '}
            <Link to="/login" className="text-primary underline underline-offset-4">
              Open the team app
            </Link>
          </p>
        )}

        {pending.length > 0 && (
          <Card>
            <CardContent className="flex gap-3 p-4">
              <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm">
                Waiting for a coach to approve:{' '}
                <span className="font-medium">
                  {pending.map((l) => `${l.athleteName}${l.teamName ? ` (${l.teamName})` : ''}`).join(', ')}
                </span>
                . We’ll email {currentUser.email} when it’s done.
              </p>
            </CardContent>
          </Card>
        )}

        {approved.map((link) => (
          <RunnerCard key={link.athleteId} link={link} />
        ))}

        {approved.length === 0 && pending.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>You’re not following a runner yet</CardTitle>
              <CardDescription>
                Use your team’s join code, or the invite link a coach sent you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={findRunner}>Find my runner</Button>
            </CardContent>
          </Card>
        )}

        {approved.length > 0 && (
          <Button variant="outline" onClick={findRunner}>
            Add another runner
          </Button>
        )}
      </main>
    </div>
  );
};

export default MyRunnersPage;
