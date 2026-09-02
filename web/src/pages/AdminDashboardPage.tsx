import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Activity, Building2, Check, Copy, Inbox, Loader2, Plus, Users, X, MailWarning,
} from 'lucide-react';
import { adminService, type TeamRequest } from '@/api/adminService';
import { UsageCard } from '@/components/admin/UsageCard';
import { PageHeader } from '@/components/PageHeader';
import { accentFor, type SectionKey } from '@/lib/sectionAccent';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getApiErrorMessage } from '@/lib/apiError';
import { formatDateShort } from '@/lib/formatUtils';

// The platform dashboard — the one screen that answers "what is happening
// on LeadPack" without opening the database.
//
// It exists mostly because team requests had no home. A coach asking for a
// team filed a Feedback row that emailed nobody, so requests were only
// discoverable by scrolling the feedback list and noticing one. The
// pending-requests card here IS the notification: it is the thing to check,
// and unlike an email it can be acted on in place.

// A tile is a hero number, not a chart: one value, no plot, so it carries
// no axis and no legend. The accent is a bar across the top rather than a
// tinted background — the number has to stay the most legible thing on it,
// and colouring the fill behind a large numeral fights that.
const StatTile: React.FC<{
  label: string;
  value: number | string;
  hint?: string;
  section?: SectionKey;
}> = ({ label, value, hint, section = 'neutral' }) => {
  const accent = accentFor(section);
  return (
    <div className="relative overflow-hidden rounded-lg border p-4">
      <div className={cn('absolute inset-x-0 top-0 h-1', accent.rail)} aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
};

/** Approve or create — the same three fields either way, so one dialog
 *  serves both rather than two that drift apart. */
const TeamSetupDialog: React.FC<{
  request: TeamRequest | null;
  createMode: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ request, createMode, open, onOpenChange }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [athleticTeamId, setAthleticTeamId] = useState('');
  const [email, setEmail] = useState('');
  const [claimLink, setClaimLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(true);

  // Prefill from the request the first time it opens, without clobbering
  // edits on re-render.
  React.useEffect(() => {
    if (!open) return;
    setClaimLink(null);
    setAthleticTeamId('');
    setEmail(request?.email ?? '');
    // Prefilled from what the coach typed in the sign-up wizard, so
    // approving is one field (the Athletic.net id) rather than three.
    setName(request?.teamName ?? '');
  }, [open, request?.id, request?.email, request?.teamName]);

  const submit = useMutation({
    mutationFn: () => {
      const input = { name: name.trim(), athleticTeamId: athleticTeamId.trim(), email: email.trim() };
      return request && !createMode
        ? adminService.approveRequest(request.id, input)
        : adminService.createTeam(input);
    },
    onSuccess: (result) => {
      setClaimLink(result.claimLink);
      setEmailSent(result.emailSent);
      queryClient.invalidateQueries({ queryKey: ['adminTeamRequests'] });
      queryClient.invalidateQueries({ queryKey: ['adminOverview'] });
      queryClient.invalidateQueries({ queryKey: ['adminActivity'] });
      queryClient.invalidateQueries({ queryKey: ['adminTeams'] });
      toast.success(`${result.team.name} created.`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not create that team.')),
  });

  const ready = name.trim() && athleticTeamId.trim() && email.includes('@');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{createMode ? 'Create a team' : 'Approve and create the team'}</DialogTitle>
          <DialogDescription>
            {createMode
              ? 'Sets up the team and emails the head coach a setup link.'
              : 'Creates the team and emails this coach a setup link. The request is closed as approved.'}
          </DialogDescription>
        </DialogHeader>

        {request && !createMode && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{request.user?.name || request.email}</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{request.message}</p>
          </div>
        )}

        {claimLink ? (
          <div className="space-y-3">
            {!emailSent && (
              <Alert variant="destructive">
                <MailWarning className="h-4 w-4" />
                <AlertDescription>
                  The team was created but the email did not send. Copy the link below and send it
                  yourself.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>Setup link</Label>
              <div className="flex gap-2">
                <Input readOnly value={claimLink} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(claimLink);
                    toast.success('Copied.');
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ellensburg High School"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="athletic-id">Athletic.net team ID</Label>
              <Input
                id="athletic-id"
                value={athleticTeamId}
                onChange={(e) => setAthleticTeamId(e.target.value)}
                placeholder="e.g. 12345"
              />
              <p className="text-xs text-muted-foreground">
                The number in the team's Athletic.net URL. Used to sync the roster and results.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coach-email">Head coach email</Label>
              <Input
                id="coach-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {claimLink ? 'Done' : 'Cancel'}
          </Button>
          {!claimLink && (
            <Button onClick={() => submit.mutate()} disabled={!ready || submit.isPending}>
              {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create team
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AdminDashboardPage: React.FC = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [dialogRequest, setDialogRequest] = useState<TeamRequest | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['adminOverview'],
    queryFn: () => adminService.overview(),
  });
  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['adminTeamRequests'],
    queryFn: () => adminService.teamRequests(),
  });
  const { data: activity = [] } = useQuery({
    queryKey: ['adminActivity'],
    queryFn: () => adminService.activity(),
  });

  const decline = useMutation({
    mutationFn: (id: string) => adminService.declineRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminTeamRequests'] });
      queryClient.invalidateQueries({ queryKey: ['adminOverview'] });
      toast.success('Request declined.');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not decline that.')),
  });

  // Server-side requireSuperAdmin is the real gate; this is so a
  // mistyped URL shows a sentence instead of a wall of failed requests.
  if (!currentUser?.isSuperAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Not available</h1>
        <p className="mt-2 text-muted-foreground">This page is for platform administrators.</p>
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const resolved = requests.filter((r) => r.status !== 'pending').slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <PageHeader
        section="neutral"
        icon={Building2}
        title="Platform"
        description="Everything happening across LeadPack."
        actions={
          <Button
            onClick={() => {
              setDialogRequest(null);
              setCreateMode(true);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create a team
          </Button>
        }
      />

      {/* Requests first: this is the queue that used to be invisible. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Inbox className="h-5 w-5" />
            Team requests
            {pending.length > 0 && <Badge>{pending.length} waiting</Badge>}
          </CardTitle>
          <CardDescription>
            Coaches who have signed up and asked for a team. Approving creates the team and emails
            them a setup link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {requestsLoading && <Skeleton className="h-20 w-full" />}

          {!requestsLoading && pending.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No requests waiting.
            </p>
          )}

          {pending.map((request) => (
            <div key={request.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{request.user?.name || request.email}</p>
                    {request.role && (
                      <Badge variant="outline" className="capitalize">{request.role}</Badge>
                    )}
                    {/* The distinction that decides what to do: someone
                        asking to join a team that exists needs their head
                        coach nudged, not a second team created. */}
                    {request.wantsTeamId && <Badge variant="secondary">wants access to an existing team</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{request.email}</p>
                  {request.teamName && <p className="mt-1 text-sm font-medium">{request.teamName}</p>}
                  {request.role === 'parent' && (
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-500">
                      This now appears on the coach's Roster page, where they can match the
                      parent to an athlete. Nothing to do here.
                    </p>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDateShort(request.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {/* "Approve" here means "create a team", which is the
                      wrong and only action for a parent — they need a
                      coach to link them to their child, not a new team.
                      Parent requests filed before that flow existed are
                      shown so they can be closed, never approved. */}
                  {request.role !== 'parent' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setDialogRequest(request);
                        setCreateMode(false);
                        setDialogOpen(true);
                      }}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decline.isPending}
                    onClick={() => decline.mutate(request.id)}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Decline
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {resolved.length > 0 && (
            <details className="pt-2">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {resolved.length} already handled
              </summary>
              <ul className="mt-3 space-y-2">
                {resolved.map((request) => (
                  <li key={request.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {request.email} — {request.message}
                    </span>
                    <Badge variant={request.status === 'approved' ? 'secondary' : 'outline'}>
                      {request.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Numbers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Where things stand
          </CardTitle>
        </CardHeader>
        <CardContent>
          {overviewLoading || !overview ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                  section="season"
                  label="Teams"
                  value={overview.totals.teams}
                  hint={`${overview.recent.activeTeamsWeek} active this week`}
                />
                <StatTile
                  section="athletes"
                  label="People"
                  value={overview.totals.users}
                  hint={`${overview.recent.newUsersWeek} new this week`}
                />
                <StatTile section="athletes" label="Athletes" value={overview.totals.athletes} />
                <StatTile
                  section="program"
                  label="Paying teams"
                  value={overview.recent.paidTeams}
                  hint={`${overview.recent.newTeamsMonth} teams added in 30 days`}
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <StatTile section="meets" label="Race results" value={overview.totals.results.toLocaleString()} />
                <StatTile section="training" label="Training logs" value={overview.totals.trainingLogs.toLocaleString()} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <UsageCard />

      {/* Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5" />
            Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="divide-y">
              {activity.map((event, i) => (
                <li key={`${event.kind}-${i}`} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{event.title}</p>
                    <p className="text-sm text-muted-foreground">{event.detail}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateShort(event.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center justify-center gap-2 pb-4 text-xs text-muted-foreground">
        <Users className="h-3 w-3" />
        Signed in as {currentUser.email}
      </p>

      <TeamSetupDialog
        request={dialogRequest}
        createMode={createMode}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
};

export default AdminDashboardPage;
