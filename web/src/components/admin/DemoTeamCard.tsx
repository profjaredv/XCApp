import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, PlayCircle, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { adminService } from '@/api/adminService';
import { getApiErrorMessage } from '@/lib/apiError';
import { clearAdminTeam, getAdminTeamId, setAdminTeam } from '@/lib/impersonation';
import { formatDateShort } from '@/lib/formatUtils';

// A made-up program with eight seasons of data, for showing LeadPack to
// someone without showing them a real team. Head coach Ron McDonald, ~220
// invented athletes, real meets and distances, invented opponents. Building
// takes about a minute; the server does it in the background and this card
// polls. "Open" views it the same way the team switcher does, as head coach.

export const DemoTeamCard: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['adminDemoTeam'],
    queryFn: () => adminService.demoTeam(),
    // Poll only while something is being built.
    refetchInterval: (q) => (q.state.data?.job.state === 'running' ? 1500 : false),
  });

  const build = useMutation({
    mutationFn: () => adminService.buildDemoTeam(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminDemoTeam'] }),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not start building the demo team.')),
  });

  const remove = useMutation({
    mutationFn: () => adminService.deleteDemoTeam(),
    onSuccess: () => {
      if (data?.team && getAdminTeamId() === data.team.id) clearAdminTeam(false);
      queryClient.invalidateQueries({ queryKey: ['adminDemoTeam'] });
      queryClient.invalidateQueries({ queryKey: ['adminOverview'] });
      toast.success('Demo team deleted.');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not delete the demo team.')),
  });

  const job = data?.job;
  const running = job?.state === 'running' || build.isPending;
  const pct = job && job.seasonsTotal > 0 ? Math.round((job.seasonsDone / job.seasonsTotal) * 100) : 0;

  const startBuild = () => {
    if (data?.exists && !window.confirm('Rebuild the demo team? This replaces the current one with a fresh copy.')) return;
    build.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5" />
          Demo team
        </CardTitle>
        <CardDescription>
          A made-up program for showing LeadPack: Huckleberry Ridge High School, head coach Ron McDonald, eight seasons,
          about 220 invented athletes, real meets and distances, and invented opponents. It never counts toward the numbers above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <Skeleton className="h-16 w-full" />}

        {data?.exists && data.team && data.counts && (
          <p className="text-sm text-muted-foreground">
            Built {formatDateShort(data.team.createdAt)} · {data.counts.seasons} seasons · {data.counts.athletes} athletes · {data.counts.races} races ·{' '}
            {data.counts.results.toLocaleString()} results
          </p>
        )}
        {data && !data.exists && !running && <p className="text-sm text-muted-foreground">There is no demo team yet.</p>}

        {running && (
          <div className="space-y-2" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{job?.step ?? 'Starting'}…</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(pct, 6)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{(job?.rows ?? 0).toLocaleString()} rows written. This takes about a minute; you can leave this page open.</p>
          </div>
        )}

        {job?.state === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>The last build failed: {job.error}. Nothing is half-built that you need to clean up; just build it again.</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {data?.exists && data.team && !running && (
            <Button onClick={() => setAdminTeam(data.team!.id, data.team!.name, data.team!.slug ?? data.team!.athleticTeamId)}>
              <PlayCircle className="mr-2 h-4 w-4" />
              Open demo team
            </Button>
          )}
          <Button variant={data?.exists ? 'outline' : 'default'} disabled={running} onClick={startBuild}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {data?.exists ? 'Rebuild' : 'Build the demo team'}
          </Button>
          {data?.exists && (
            <Button
              variant="outline"
              disabled={running || remove.isPending}
              onClick={() => {
                if (window.confirm('Delete the demo team and everything in it? Real teams are never touched.')) remove.mutate();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
        {data?.exists && (
          <p className="text-xs text-muted-foreground">
            Once you open it you are the head coach of the demo team. Use “Preview as athlete” on any athlete to see the athlete screens. “Exit” in the banner brings you back.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
