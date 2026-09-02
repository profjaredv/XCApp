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
import { UserPlus, GraduationCap, Users, KeyRound, Mail, RefreshCw, AlertTriangle, Star, Eye, Upload, Loader2, Merge, ClipboardList, Search, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { rosterService, type RosterAthlete, type RosterImportResult } from '@/api/rosterService';
import { athleteService } from '@/api/athleteService';
import { teamService } from '@/api/teamService';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useGroups, useAllGroupMembers } from '@/hooks/useGroups';
import { matchesQuery } from '@/lib/athleteSearch';
import { gradeLabel, deriveGraduationYear } from '@/lib/seasonUtils';
import { PageHeader } from '@/components/PageHeader';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useAuth } from '@/contexts/AuthContext';
import { getApiErrorMessage } from '@/lib/apiError';
import { PendingClaimsCard } from '@/components/PendingClaimsCard';
import { PendingGuardianLinksCard } from '@/components/PendingGuardianLinksCard';
import { PendingParentRequestsCard } from '@/components/PendingParentRequestsCard';
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
  // TeamMember.role, not currentUser.role — every button this gates
  // (sync, import, join code, captain, nickname, invite/resend,
  // preview-as-athlete, keep) hits a route guarded by
  // requireRole(['HEAD_COACH', 'COACH']) or tighter, and none of them
  // accept VOLUNTEER_COACH.
  //
  // currentUser.role is the sticky 'coach'|'athlete' UX hint, and
  // middleware/auth.js sets it to 'coach' for a VOLUNTEER_COACH too (its
  // promotion list includes all three staff roles on purpose, so real
  // staff get the coach sidebar). Gating on it therefore showed a
  // volunteer coach the entire roster-editing toolbar, every button of
  // which could only answer 403 — the "I can't resend an invite, 403"
  // report. Super admin gets in the same way requireRole lets them:
  // only while actually impersonating a team.
  const isCoach =
    currentUser?.teamRole === 'HEAD_COACH' ||
    currentUser?.teamRole === 'COACH' ||
    Boolean(currentUser?.isSuperAdmin && currentUser?.isImpersonating);

  const queryClient = useQueryClient();
  const { data: context } = useTeamContext();
  const { seasons, activeYear, setSelectedYear } = useSeasonSelection();
  const [athleteQuery, setAthleteQuery] = useState('');
  const season = activeYear ?? undefined;

  const [showGraduated, setShowGraduated] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importRosterOpen, setImportRosterOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const [newName, setNewName] = useState('');
  const [newPreferredName, setNewPreferredName] = useState('');
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
        ...(newPreferredName.trim() ? { preferredName: newPreferredName.trim() } : {}),
        grade: parseInt(newGrade, 10),
        gender: newGender,
        season,
      }),
    onSuccess: () => {
      toast.success(`${newName.trim()} added to the ${season} roster`);
      setNewName('');
      setNewPreferredName('');
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
      const displayName = athlete.preferredName || athlete.name;
      toast.success(isCaptain ? `${displayName} is now a captain` : `${displayName} is no longer a captain`);
      invalidate();
    },
    onError: () => toast.error('Could not update captain status'),
  });

  const [captainNotesTarget, setCaptainNotesTarget] = useState<RosterAthlete | null>(null);
  const [captainNotesDraft, setCaptainNotesDraft] = useState('');
  const saveCaptainNotes = useMutation({
    mutationFn: () =>
      // isCaptain omitted deliberately — this dialog only ever opens for an
      // athlete who's already a captain, and saving a note shouldn't also
      // re-assert captaincy (see rosterService.setCaptain's doc comment).
      rosterService.setCaptain(captainNotesTarget!.seasonId!, captainNotesTarget!.id, undefined, captainNotesDraft.trim()),
    onSuccess: () => {
      toast.success('Captain notes saved');
      setCaptainNotesTarget(null);
      invalidate();
    },
    onError: () => toast.error('Could not save captain notes'),
  });

  // What the athlete actually goes by — shown throughout the app instead of
  // their legal name wherever set. Its own small dialog, same shape as
  // captain notes above, since it's an occasional edit, not the common case.
  const [nicknameTarget, setNicknameTarget] = useState<RosterAthlete | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const saveNickname = useMutation({
    mutationFn: () => rosterService.updateAthlete(nicknameTarget!.id, { preferredName: nicknameDraft.trim() }),
    onSuccess: () => {
      toast.success('Preferred name saved');
      setNicknameTarget(null);
      invalidate();
    },
    onError: () => toast.error('Could not save preferred name'),
  });

  // Class year. The roster has always BADGED "Needs class year" without
  // offering any way to set one — nickname was the only inline edit — so an
  // athlete an import created without a grade stayed ungraded forever.
  // Grade is derived from graduationYear everywhere (lib/seasonUtils), so
  // that is what gets stored; coaches think in grades, so that is what they
  // pick, and the year is worked back from the season on screen.
  const [classYearTarget, setClassYearTarget] = useState<RosterAthlete | null>(null);
  const [classYearGrade, setClassYearGrade] = useState<string>('');
  const saveClassYear = useMutation({
    mutationFn: () => {
      const grade = parseInt(classYearGrade, 10);
      const graduationYear = deriveGraduationYear(grade, season ?? null);
      if (graduationYear === null) throw new Error('Pick a grade first.');
      return rosterService.updateAthlete(classYearTarget!.id, { graduationYear });
    },
    onSuccess: () => {
      toast.success('Class year saved');
      setClassYearTarget(null);
      invalidate();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not save class year')),
  });

  // "What group am I in?" is the question athletes actually ask at
  // practice, and answering it used to mean opening the roster, scrolling
  // ninety names, opening a profile and scrolling again. Showing it on the
  // row itself makes the roster the answer rather than a step toward it.
  //
  // Reuses the hooks the groups board already has rather than widening the
  // roster payload — group membership changes on a different cadence from
  // the roster, and keeping the queries separate means editing a group
  // does not invalidate the roster.
  const selectedSeason = seasons.find((s) => s.year === season) ?? null;
  const seasonId = selectedSeason?.id ?? null;
  const { data: teamGroups = [] } = useGroups(seasonId);
  const groupIds = useMemo(() => teamGroups.map((g) => g.id), [teamGroups]);
  const { data: membersByGroup = {} } = useAllGroupMembers(seasonId, groupIds);

  const groupsByAthlete = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string; type: string }>>();
    for (const group of teamGroups) {
      if (group.archived) continue;
      for (const member of membersByGroup[group.id] ?? []) {
        const list = map.get(member.athleteId) ?? [];
        list.push({ id: group.id, name: group.name, type: group.type });
        map.set(member.athleteId, list);
      }
    }
    // Training group first — it is the one a coach means by "your group".
    for (const list of map.values()) {
      list.sort((a, b) => (a.type === 'TRAINING' ? -1 : b.type === 'TRAINING' ? 1 : 0));
    }
    return map;
  }, [teamGroups, membersByGroup]);

  // Search matches the legal name as well as the preferred one: a coach
  // looking up "Katherine" should find the athlete who goes by "Kate".
  const visibleRoster = useMemo(
    () =>
      roster.filter(
        (a) =>
          matchesQuery(a.preferredName || a.name, athleteQuery) ||
          matchesQuery(a.name, athleteQuery)
      ),
    [roster, athleteQuery]
  );

  const byGrade = useMemo(() => {
    const groups = new Map<number | null, RosterAthlete[]>();
    for (const athlete of visibleRoster) {
      const key = athlete.grade ?? null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(athlete);
    }
    return [...groups.entries()].sort((a, b) => (b[0] ?? -1) - (a[0] ?? -1));
  }, [visibleRoster]);

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
      setInviteError(getApiErrorMessage(err, 'Failed to send invitation.'));
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
      <PageHeader
        section="athletes"
        icon={ClipboardList}
        title="Roster"
        description="Manage who is on the team, season by season."
        actions={<>
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
        </>}
      />

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

      {/* Roster search. The page is named Roster and lists every athlete on
          the team, and until now had no way to find one — the single most
          common thing a coach does here, standing at practice with a phone,
          is look up one name. */}
      {roster.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={athleteQuery}
            onChange={(e) => setAthleteQuery(e.target.value)}
            placeholder="Find an athlete…"
            className="pl-9"
          />
          {athleteQuery.trim() && (
            <button
              type="button"
              onClick={() => setAthleteQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {athleteQuery.trim() && visibleRoster.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No athlete matching “{athleteQuery.trim()}” on the {season} roster.
        </p>
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
          <PendingGuardianLinksCard />
          <PendingParentRequestsCard roster={roster} />
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
                      <span>{athlete.preferredName || athlete.name}</span>
                      {athlete.preferredName && (
                        <span className="text-xs font-normal text-muted-foreground">({athlete.name})</span>
                      )}
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
                    {/* The answer to "what group am I in?", on the row, so
                        nobody has to open a profile to find it. Silent when
                        there are no groups this season rather than showing
                        an empty rail on every athlete. */}
                    {(groupsByAthlete.get(athlete.id)?.length ?? 0) > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {groupsByAthlete.get(athlete.id)!.map((g) => (
                          <Badge
                            key={g.id}
                            variant={g.type === 'TRAINING' ? 'secondary' : 'outline'}
                            className="font-normal"
                          >
                            {g.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {teamGroups.length > 0 &&
                      (groupsByAthlete.get(athlete.id)?.length ?? 0) === 0 && (
                        <p className="mt-1 text-xs text-muted-foreground italic">No group yet</p>
                      )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {athlete.graduated && <Badge variant="secondary">Graduated</Badge>}
                    {!athlete.graduationYear &&
                      (isCoach ? (
                        // Actionable rather than just a complaint: this is
                        // the fix for an athlete showing up with no grade in
                        // meet analysis.
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setClassYearTarget(athlete);
                            setClassYearGrade('');
                          }}
                        >
                          <GraduationCap className="mr-2 h-4 w-4" />
                          Set class year
                        </Button>
                      ) : (
                        <Badge variant="outline">Needs class year</Badge>
                      ))}
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
                    {isCoach && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setNicknameTarget(athlete);
                          setNicknameDraft(athlete.preferredName ?? '');
                        }}
                      >
                        {athlete.preferredName ? 'Edit Nickname' : 'Add Nickname'}
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
                    {/* Icon-only: this row already carries up to eight
                        actions and "Preview as athlete" was the longest
                        label on it, for the one action a coach reaches for
                        least. Kept rather than deleted because this is the
                        only entry point to the preview feature — removing
                        the button would strand a working full-stack path
                        (lib/impersonation.ts's preview half,
                        ImpersonationBanner, axios's X-Preview-Athlete-Id
                        header, and the server middleware behind it). */}
                    {isCoach && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-11 w-11 p-0 sm:h-8 sm:w-8"
                        title="Preview as athlete — see the app as they would: their own profile, log-a-run, race reflections"
                        aria-label={`Preview the app as ${athlete.preferredName || athlete.name}`}
                        onClick={() => setPreviewAthlete(athlete.id, athlete.preferredName || athlete.name, teamPath)}
                      >
                        <Eye className="h-4 w-4" />
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
            <div className="space-y-2">
              <Label htmlFor="athletePreferredName">Preferred name / nickname (optional)</Label>
              <Input
                id="athletePreferredName"
                value={newPreferredName}
                onChange={(e) => setNewPreferredName(e.target.value)}
                placeholder="What they go by, if different"
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

      <Dialog
        open={inviteDialogOpen}
        onOpenChange={(open) => (open ? setInviteDialogOpen(true) : closeInviteDialog())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite {inviteTarget?.preferredName || inviteTarget?.name}</DialogTitle>
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
            <DialogTitle>Captain notes — {captainNotesTarget?.preferredName || captainNotesTarget?.name}</DialogTitle>
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

      <Dialog open={!!nicknameTarget} onOpenChange={(open) => !open && setNicknameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preferred name — {nicknameTarget?.name}</DialogTitle>
            <DialogDescription>
              Shown everywhere in place of their full name — the roster, meet entries, AI insights,
              and everywhere else. Leave blank to just use "{nicknameTarget?.name}".
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nicknameDraft}
            onChange={(e) => setNicknameDraft(e.target.value)}
            placeholder="What they go by"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNicknameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => saveNickname.mutate()} disabled={saveNickname.isPending}>
              {saveNickname.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!classYearTarget} onOpenChange={(open) => !open && setClassYearTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Class year — {classYearTarget?.name}</DialogTitle>
            <DialogDescription>
              What grade are they in for the {season} season? Their class year is worked out from
              that, so every past and future season shows the right grade automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Grade in {season}</Label>
            <Select value={classYearGrade} onValueChange={setClassYearGrade}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a grade" />
              </SelectTrigger>
              <SelectContent>
                {[9, 10, 11, 12].map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    {gradeLabel(g)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {classYearGrade && season !== undefined && (
              <p className="text-xs text-muted-foreground">
                Saved as class of {deriveGraduationYear(parseInt(classYearGrade, 10), season)}.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassYearTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => saveClassYear.mutate()} disabled={!classYearGrade || saveClassYear.isPending}>
              {saveClassYear.isPending ? 'Saving…' : 'Save'}
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
            Columns: Name, or First Name / Last Name (one or the other required), Grade or Graduation Year (one
            required), Gender (optional), and Preferred Name, Nickname, or Preferred First Name (optional — a
            preferred first name is paired with the last name automatically). An athlete already on the team
            (matched by name) is never duplicated — only a missing gender, graduation year, or nickname gets filled
            in; anything already verified is left alone.
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

// Legal name first here, not preferred name — a coach picking apart two
// duplicate rows needs to see what actually distinguishes them, and the
// nickname (if any) is shown alongside as a secondary cue, not swapped in.
function mergeOptionLabel(a: RosterAthlete): string {
  return a.preferredName ? `${a.name} ("${a.preferredName}")` : a.name;
}

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
                    {mergeOptionLabel(a)} — {a.raceCount} race{a.raceCount === 1 ? '' : 's'}
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
                    {mergeOptionLabel(a)} — {a.raceCount} race{a.raceCount === 1 ? '' : 's'}
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
