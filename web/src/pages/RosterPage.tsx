import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { UserPlus, CalendarPlus, GraduationCap, Users, KeyRound, Mail, RefreshCw, AlertTriangle, Star, Eye, Upload, Loader2, Merge } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { rosterService, type RosterAthlete, type RosterImportResult } from '@/api/rosterService';
import { athleteService } from '@/api/athleteService';
import { teamService } from '@/api/teamService';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { gradeLabel } from '@/lib/seasonUtils';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useAuth } from '@/contexts/AuthContext';
import { PendingClaimsCard } from '@/components/PendingClaimsCard';
import { setPreviewAthlete } from '@/lib/impersonation';

// The roster is the thing a coach actually manages day to day: who is on the
// team this season, what grade they're in, who just graduated. Before this
// page the only way an athlete could exist was to be scraped out of a results
// page, so a team couldn't be set up before its first race.

const RosterPage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  // Carries the season currently being viewed along to the athlete's
  // profile — without this, clicking into an athlete while looking at a
  // past season silently dropped back to the team's default/current
  // season on the profile page (which may have no results at all yet,
  // e.g. a fresh preseason), making it look like the athlete had no data.
  const teamAthletePath = (athleteId: string) =>
    teamPath(`/team/athlete/${athleteId}${season !== undefined ? `?season=${season}` : ''}`);
  const { currentUser } = useAuth();
  const isCoach = currentUser?.role === 'coach';

  const queryClient = useQueryClient();
  const { data: context } = useTeamContext();
  const { seasons, activeYear, setSelectedYear } = useSeasonSelection();
  const season = activeYear ?? undefined;

  const [showGraduated, setShowGraduated] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [startSeasonOpen, setStartSeasonOpen] = useState(false);
  const [importRosterOpen, setImportRosterOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState<string>('9');
  const [newGender, setNewGender] = useState<string>('M');

  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<RosterAthlete | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const {
    data: roster = [],
    isLoading,
  } = useQuery({
    queryKey: ['roster', season, showGraduated],
    queryFn: () => rosterService.getRoster(season, { activeOnly: !showGraduated }),
    enabled: season !== undefined,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['roster'] });
    queryClient.invalidateQueries({ queryKey: ['teamContext'] });
    queryClient.invalidateQueries({ queryKey: ['availableSeasons'] });
    // Participants/attrition on the Program tab are computed straight from
    // the roster — a sync or add/remove here changes those numbers too.
    queryClient.invalidateQueries({ queryKey: ['programAnalytics'] });
  };

  const addAthlete = useMutation({
    mutationFn: () =>
      rosterService.addAthlete({
        name: newName.trim(),
        grade: parseInt(newGrade, 10),
        gender: newGender,
        season,
      }),
    onSuccess: () => {
      toast.success(`${newName.trim()} added to the ${season} roster`);
      setNewName('');
      setAddOpen(false);
      invalidate();
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ??
        'Could not add athlete';
      toast.error(message);
    },
  });

  const nextSeason = (context?.activeSeason ?? new Date().getFullYear()) + 1;
  // "Start next season" rolls the active roster forward (seniors graduate,
  // everyone else moves up a grade) — that's only meaningful once the active
  // season has actually happened. Without this, activeSeason+1 is available
  // the instant a season is created, so starting 2026 immediately offered
  // "Start 2027" before a single 2026 race had been run.
  const canStartNextSeason = !context?.activeSeasonSummary?.isPreseason;
  const startSeason = useMutation({
    mutationFn: () => rosterService.startSeason(nextSeason),
    onSuccess: (result) => {
      toast.success(result.message);
      setStartSeasonOpen(false);
      setSelectedYear(result.season);
      invalidate();
    },
    onError: () => toast.error('Could not start the new season'),
  });

  const removeFromRoster = useMutation({
    mutationFn: (athleteId: string) => rosterService.removeFromRoster(season!, athleteId),
    onSuccess: () => {
      toast.success('Removed from roster (results kept)');
      invalidate();
    },
    onError: () => toast.error('Could not update roster'),
  });

  const syncRoster = useMutation({
    mutationFn: () => rosterService.syncFromAthleticNet(season!),
    onSuccess: (result) => {
      toast.success(result.message);
      invalidate();
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not sync from Athletic.net';
      toast.error(message);
    },
  });

  const clearRemovalFlag = useMutation({
    mutationFn: (athleteId: string) => rosterService.clearRemovalFlag(season!, athleteId),
    onSuccess: () => {
      toast.success('Kept on roster');
      invalidate();
    },
    onError: () => toast.error('Could not update roster'),
  });

  // T1: captain designation — coach-only, no action required from the
  // athlete's side at all. isCaptain toggles instantly; captainNotes gets
  // its own small dialog since it's optional detail, not the common case.
  const setCaptain = useMutation({
    mutationFn: ({ athlete, isCaptain }: { athlete: RosterAthlete; isCaptain: boolean }) =>
      rosterService.setCaptain(athlete.seasonId!, athlete.id, isCaptain),
    onSuccess: (_data, { athlete, isCaptain }) => {
      toast.success(isCaptain ? `${athlete.name} is now a captain` : `${athlete.name} is no longer a captain`);
      invalidate();
    },
    onError: () => toast.error('Could not update captain status'),
  });

  const [captainNotesTarget, setCaptainNotesTarget] = useState<RosterAthlete | null>(null);
  const [captainNotesDraft, setCaptainNotesDraft] = useState('');
  const saveCaptainNotes = useMutation({
    mutationFn: () =>
      rosterService.setCaptain(captainNotesTarget!.seasonId!, captainNotesTarget!.id, true, captainNotesDraft.trim()),
    onSuccess: () => {
      toast.success('Captain notes saved');
      setCaptainNotesTarget(null);
      invalidate();
    },
    onError: () => toast.error('Could not save captain notes'),
  });

  const byGrade = useMemo(() => {
    const groups = new Map<number | null, RosterAthlete[]>();
    for (const athlete of roster) {
      const key = athlete.grade ?? null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(athlete);
    }
    return [...groups.entries()].sort((a, b) => (b[0] ?? -1) - (a[0] ?? -1));
  }, [roster]);

  const summary = context?.activeSeasonSummary;
  const isPreseason = season === context?.activeSeason && summary?.isPreseason;

  const handleGenerateJoinCode = async () => {
    setIsGeneratingCode(true);
    setJoinCodeError(null);
    try {
      const response = await teamService.generateJoinCode();
      setJoinCode(response.joinCode);
    } catch (err) {
      setJoinCodeError(err instanceof Error ? err.message : 'Failed to generate join code');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCopyJoinCode = async () => {
    if (!joinCode || typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(joinCode);
    toast.success('Join code copied to clipboard');
  };

  const openInviteDialog = (athlete: RosterAthlete) => {
    setInviteTarget(athlete);
    setInviteEmail(athlete.invite?.email || '');
    setInviteError(null);
    setInviteNotice(null);
    setInviteLink(null);
    setInviteDialogOpen(true);
  };

  const closeInviteDialog = () => {
    setInviteDialogOpen(false);
    setInviteTarget(null);
    setInviteEmail('');
    setInviteLoading(false);
  };

  const handleInviteSubmit = async () => {
    if (!inviteTarget || !inviteEmail) {
      setInviteError('Please provide an email to send the invitation.');
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    try {
      const response = await athleteService.inviteAthlete(inviteTarget.id, inviteEmail);
      const tokenFromResponse = response?.token || response?.invite?.token;
      setInviteNotice(
        response?.emailSent
          ? `Invitation emailed to ${inviteEmail}.`
          : `Invitation ready for ${inviteEmail} — email wasn't sent, share the link below.`
      );
      setInviteLink(
        tokenFromResponse && typeof window !== 'undefined'
          ? `${window.location.origin}/invite/${tokenFromResponse}`
          : null
      );
      invalidate();
      closeInviteDialog();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink || typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied to clipboard');
  };

  const inviteBadgeFor = (athlete: RosterAthlete) => {
    if (athlete.user) return { label: 'Accepted', variant: 'default' as const };
    switch (athlete.invite?.status) {
      case 'pending':
        return { label: 'Invited', variant: 'outline' as const };
      case 'accepted':
        return { label: 'Accepted', variant: 'default' as const };
      case 'expired':
        return { label: 'Expired', variant: 'secondary' as const };
      case 'revoked':
        return { label: 'Revoked', variant: 'secondary' as const };
      default:
        return null;
    }
  };

  const inviteButtonLabel = (athlete: RosterAthlete) => {
    if (athlete.user) return 'Invite Sent';
    if (athlete.invite?.status && athlete.invite.status !== 'not_invited') return 'Resend Invite';
    return 'Invite';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Athletes</h1>
          <p className="text-muted-foreground">
            Manage who is on the team, season by season.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={season?.toString() ?? ''}
            onValueChange={(v) => setSelectedYear(parseInt(v, 10))}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Season" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.year} value={s.year.toString()}>
                  {s.year}
                  {s.isActive ? ' (Active)' : ''}
                  {!s.hasData && s.rosterCount > 0 ? ' — preseason' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => setStartSeasonOpen(true)}
            disabled={!canStartNextSeason}
            title={
              canStartNextSeason
                ? undefined
                : `Available once ${context?.activeSeason} has race results — it's still preseason`
            }
          >
            <CalendarPlus className="mr-2 h-4 w-4" />
            Start {nextSeason}
          </Button>
          {isCoach && (
            <Button
              variant="outline"
              onClick={() => syncRoster.mutate()}
              disabled={syncRoster.isPending || season === undefined}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncRoster.isPending ? 'animate-spin' : ''}`} />
              {syncRoster.isPending ? 'Syncing…' : 'Sync from Athletic.net'}
            </Button>
          )}
          {isCoach && (
            <Button variant="outline" onClick={() => setImportRosterOpen(true)} disabled={season === undefined}>
              <Upload className="mr-2 h-4 w-4" />
              Import Roster
            </Button>
          )}
          {(currentUser?.isSuperAdmin || currentUser?.teamRole === 'HEAD_COACH') && (
            <Button variant="outline" onClick={() => setMergeOpen(true)}>
              <Merge className="mr-2 h-4 w-4" />
              Merge Duplicates
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add athlete
          </Button>
        </div>
      </div>

      {isPreseason && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              {season} preseason
            </CardTitle>
            <CardDescription>
              You have {summary?.rosterCount} athletes on the roster and no races yet. Analytics
              will fill in once results are imported — the roster below is ready to go.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {isCoach && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5" />
                Team Join Code
              </CardTitle>
              <CardDescription>
                Generate a code athletes can use to join the team and claim their roster profile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {joinCode ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                    <span className="font-mono text-lg font-semibold">{joinCode}</span>
                    <Button size="sm" variant="outline" onClick={handleCopyJoinCode}>
                      Copy Code
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share this code with athletes so they can join the team and claim their profile.
                  </p>
                </div>
              ) : (
                <Button onClick={handleGenerateJoinCode} disabled={isGeneratingCode}>
                  {isGeneratingCode ? 'Generating…' : 'Generate Join Code'}
                </Button>
              )}
              {joinCodeError && (
                <Alert variant="destructive" className="mt-3">
                  <AlertDescription>{joinCodeError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <PendingClaimsCard onClaimProcessed={invalidate} />
        </div>
      )}

      {inviteNotice && (
        <Alert>
          <div className="space-y-2">
            <AlertDescription>{inviteNotice}</AlertDescription>
            {inviteLink && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="break-all font-mono">{inviteLink}</span>
                <Button size="sm" variant="outline" onClick={handleCopyInviteLink}>
                  Copy Link
                </Button>
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setInviteNotice(null);
                setInviteLink(null);
              }}
            >
              Dismiss
            </Button>
          </div>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant={showGraduated ? 'outline' : 'secondary'}
          size="sm"
          onClick={() => setShowGraduated(false)}
        >
          Current roster
        </Button>
        <Button
          variant={showGraduated ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowGraduated(true)}
        >
          <GraduationCap className="mr-2 h-4 w-4" />
          Include past athletes
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : roster.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-semibold">No athletes on the {season} roster yet</p>
              <p className="text-sm text-muted-foreground">
                Add them by hand, or import a season from Athletic.net to build the roster
                automatically.
              </p>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add your first athlete
            </Button>
          </CardContent>
        </Card>
      ) : (
        byGrade.map(([grade, athletes]) => (
          <Card key={grade ?? 'unknown'}>
            <CardHeader>
              <CardTitle className="text-lg">
                {gradeLabel(grade)}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  ({athletes.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {athletes.map((athlete) => (
                <div
                  key={athlete.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium flex items-center gap-2">
                      <span>{athlete.name}</span>
                      {athlete.isCaptain && (
                        <Badge variant="default" className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          Captain
                        </Badge>
                      )}
                      {inviteBadgeFor(athlete) && (
                        <Badge variant={inviteBadgeFor(athlete)!.variant}>
                          {inviteBadgeFor(athlete)!.label}
                        </Badge>
                      )}
                      {athlete.flaggedForRemoval && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Not on Athletic.net
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {athlete.graduationYear ? `Class of ${athlete.graduationYear}` : 'No class year'}
                      {athlete.raceCount > 0 ? ` • ${athlete.raceCount} races in ${season}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {athlete.graduated && <Badge variant="secondary">Graduated</Badge>}
                    {!athlete.graduationYear && <Badge variant="outline">Needs class year</Badge>}
                    {isCoach && athlete.seasonId && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCaptain.mutate({ athlete, isCaptain: !athlete.isCaptain })}
                        disabled={setCaptain.isPending}
                      >
                        <Star className="mr-2 h-4 w-4" />
                        {athlete.isCaptain ? 'Remove Captain' : 'Make Captain'}
                      </Button>
                    )}
                    {isCoach && athlete.isCaptain && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCaptainNotesTarget(athlete);
                          setCaptainNotesDraft(athlete.captainNotes ?? '');
                        }}
                      >
                        Notes
                      </Button>
                    )}
                    {isCoach && !athlete.user && (
                      <Button variant="outline" size="sm" onClick={() => openInviteDialog(athlete)}>
                        <Mail className="mr-2 h-4 w-4" />
                        {inviteButtonLabel(athlete)}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(teamAthletePath(athlete.id))}
                    >
                      View Profile
                    </Button>
                    {isCoach && (
                      <Button
                        variant="outline"
                        size="sm"
                        title="See the app as this athlete would — their own profile, log-a-run, race reflections, etc."
                        onClick={() => setPreviewAthlete(athlete.id, athlete.name, teamPath)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Preview as athlete
                      </Button>
                    )}
                    {isCoach && athlete.flaggedForRemoval && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => clearRemovalFlag.mutate(athlete.id)}
                        disabled={clearRemovalFlag.isPending}
                      >
                        Keep
                      </Button>
                    )}
                    {athlete.onRoster && !athlete.graduated && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFromRoster.mutate(athlete.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add athlete</DialogTitle>
            <DialogDescription>
              Adds them to the {season} roster. Grade is stored as a class year, so they move up
              automatically each season.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="athleteName">Name</Label>
              <Input
                id="athleteName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="First Last"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Grade</Label>
                <Select value={newGrade} onValueChange={setNewGrade}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[9, 10, 11, 12].map((g) => (
                      <SelectItem key={g} value={g.toString()}>
                        {gradeLabel(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={newGender} onValueChange={setNewGender}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Boys</SelectItem>
                    <SelectItem value="F">Girls</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addAthlete.mutate()}
              disabled={!newName.trim() || addAthlete.isPending}
            >
              {addAthlete.isPending ? 'Adding…' : 'Add athlete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={startSeasonOpen} onOpenChange={setStartSeasonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start the {nextSeason} season</DialogTitle>
            <DialogDescription>
              Returning athletes move up a grade and carry over to {nextSeason}. Seniors graduate
              off the active roster — their races, PRs and trends stay in the app permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartSeasonOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => startSeason.mutate()} disabled={startSeason.isPending}>
              {startSeason.isPending ? 'Starting…' : `Start ${nextSeason}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={inviteDialogOpen}
        onOpenChange={(open) => (open ? setInviteDialogOpen(true) : closeInviteDialog())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite {inviteTarget?.name}</DialogTitle>
            <DialogDescription>
              Send an invitation so this athlete can access analytics, results, and their profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Athlete Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="runner@example.com"
              />
            </div>
            {inviteError && (
              <Alert variant="destructive">
                <AlertDescription>{inviteError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeInviteDialog} disabled={inviteLoading}>
              Cancel
            </Button>
            <Button onClick={handleInviteSubmit} disabled={inviteLoading}>
              {inviteLoading ? 'Sending…' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!captainNotesTarget} onOpenChange={(open) => !open && setCaptainNotesTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Captain notes — {captainNotesTarget?.name}</DialogTitle>
            <DialogDescription>Private to coaching staff. Not visible to the athlete.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={captainNotesDraft}
            onChange={(e) => setCaptainNotesDraft(e.target.value)}
            rows={4}
            placeholder="e.g. leads the Boys Blue group's warmup"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCaptainNotesTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => saveCaptainNotes.mutate()} disabled={saveCaptainNotes.isPending}>
              {saveCaptainNotes.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {season !== undefined && (
        <ImportRosterDialog open={importRosterOpen} onOpenChange={setImportRosterOpen} season={season} />
      )}
      <MergeAthletesDialog open={mergeOpen} onOpenChange={setMergeOpen} roster={roster} />
    </div>
  );
};

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// For the athletes an Athletic.net scrape can't see: freshmen with no
// race history yet, or anyone not on Athletic.net at all — a roster more
// often comes from FinalForms or a plain sheet before Athletic.net has
// anything on it. Reconciles against the team's existing athletes by
// name before creating anyone new (routes/athletes.js's POST
// /import-roster), so re-running this on an updated sheet doesn't
// create duplicates for the people already matched last time.
const ImportRosterDialog: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void; season: number }> = ({
  open,
  onOpenChange,
  season,
}) => {
  const queryClient = useQueryClient();
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<RosterImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importRoster = useMutation({
    mutationFn: (csv: string) => rosterService.importRoster(season, csv),
    onSuccess: (res) => {
      setResult(res);
      toast.success(res.msg);
      queryClient.invalidateQueries({ queryKey: ['roster'] });
    },
    onError: (err: unknown) => {
      // A 400 (e.g. every row failed to parse) still carries the same
      // { msg, imported, matched, skipped, warnings } shape as a success —
      // show it in the same warnings list instead of a dead-end toast.
      const data = (
        err as { response?: { data?: RosterImportResult } }
      )?.response?.data;
      if (data?.warnings) setResult(data);
      toast.error(data?.msg ?? 'Could not import that roster.');
    },
  });

  const handleClose = () => {
    onOpenChange(false);
    setCsvText('');
    setResult(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvText(await readFileAsText(file));
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import roster for {season}</DialogTitle>
          <DialogDescription>
            Columns: Name (required), Grade or Graduation Year (one required), Gender (optional). An athlete already
            on the team (matched by name) is never duplicated — only a missing gender or graduation year gets filled
            in; anything the scraper already verified is left alone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="text-sm" />
          <Textarea
            rows={8}
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setResult(null);
            }}
            placeholder="Or paste CSV text here…"
            className="font-mono text-xs"
          />
          {result && (
            <div className="text-sm space-y-1">
              <p>
                {result.imported} new, {result.matched} matched to an existing athlete, {result.skipped} skipped.
              </p>
              {result.warnings.length > 0 && (
                <ul className="text-xs text-amber-700 list-disc pl-4 max-h-32 overflow-y-auto">
                  {result.warnings.map((w, i) => (
                    <li key={i}>
                      Row {w.row}: {w.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button onClick={() => importRoster.mutate(csvText)} disabled={!csvText.trim() || importRoster.isPending}>
            {importRoster.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// The "odd event" recovery tool: two Athlete rows that turned out to be
// the same person (nothing in the schema stops this from happening — see
// backend/prisma/schema.prisma's comment on the Athlete model). Picking
// "Keep" moves everything the other one has — results, season rosters,
// training logs, group history, all of it — onto the kept athlete, then
// deletes the other row. Head-coach only; gated at the button above too,
// but the backend is the real enforcement.
const MergeAthletesDialog: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void; roster: RosterAthlete[] }> = ({
  open,
  onOpenChange,
  roster,
}) => {
  const queryClient = useQueryClient();
  const [keeperId, setKeeperId] = useState<string>('');
  const [loserId, setLoserId] = useState<string>('');

  const merge = useMutation({
    mutationFn: () => rosterService.mergeAthletes(keeperId, loserId),
    onSuccess: (res) => {
      toast.success(res.msg);
      queryClient.invalidateQueries({ queryKey: ['roster'] });
      handleClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg;
      toast.error(msg ?? 'Could not merge those athletes.');
    },
  });

  const handleClose = () => {
    onOpenChange(false);
    setKeeperId('');
    setLoserId('');
  };

  const keeper = roster.find((a) => a.id === keeperId);
  const loser = roster.find((a) => a.id === loserId);

  const handleMerge = () => {
    if (!keeper || !loser) return;
    if (
      !window.confirm(
        `This will move all of ${loser.name}'s results, season history, and every other record onto ${keeper.name}, then permanently delete ${loser.name}. This cannot be undone. Continue?`
      )
    ) {
      return;
    }
    merge.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge duplicate athletes</DialogTitle>
          <DialogDescription>
            Showing athletes from the currently selected season/view. Switch seasons or toggle "show graduated" first
            if the duplicate you're looking for isn't listed below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Keep this athlete</Label>
            <Select value={keeperId} onValueChange={setKeeperId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose an athlete…" /></SelectTrigger>
              <SelectContent>
                {roster.map((a) => (
                  <SelectItem key={a.id} value={a.id} disabled={a.id === loserId}>
                    {a.name} — {a.raceCount} race{a.raceCount === 1 ? '' : 's'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Merge in and delete this one</Label>
            <Select value={loserId} onValueChange={setLoserId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose an athlete…" /></SelectTrigger>
              <SelectContent>
                {roster.map((a) => (
                  <SelectItem key={a.id} value={a.id} disabled={a.id === keeperId}>
                    {a.name} — {a.raceCount} race{a.raceCount === 1 ? '' : 's'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {keeper && loser && (
            <Alert>
              <AlertDescription>
                {loser.name}'s history moves onto {keeper.name}. {loser.name} is permanently deleted. This cannot be
                undone.
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleMerge} disabled={!keeperId || !loserId || merge.isPending}>
            {merge.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RosterPage;
