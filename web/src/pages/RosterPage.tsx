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
import { UserPlus, GraduationCap, Users, RefreshCw, AlertTriangle, Star, Upload, Loader2, Merge, ClipboardList, Search, X, Eye } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { rosterService, type RosterAthlete, type RosterImportResult, type ExistingAthleteConflict } from '@/api/rosterService';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useGroups, useAllGroupMembers } from '@/hooks/useGroups';
import { matchesQuery } from '@/lib/athleteSearch';
import { gradeLabel } from '@/lib/seasonUtils';
import { PageHeader } from '@/components/PageHeader';
import { setPreviewAthlete } from '@/lib/impersonation';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useAuth } from '@/contexts/AuthContext';

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
  const { seasons, activeYear } = useSeasonSelection();
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

  // An athlete who is already on the team under this name. Adding a second
  // record for a returning athlete is the single most damaging thing a
  // coach can do by accident here: the new record goes into groups and
  // shows no history, while every past race stays on a row nothing points
  // at. The backend refuses with a 409 and hands back who it found; this
  // holds that answer so the dialog can offer the existing record instead.
  const [nameConflict, setNameConflict] = useState<ExistingAthleteConflict | null>(null);

  const addAthlete = useMutation({
    mutationFn: (opts?: { allowDuplicate?: boolean }) =>
      rosterService.addAthlete({
        name: newName.trim(),
        ...(newPreferredName.trim() ? { preferredName: newPreferredName.trim() } : {}),
        grade: parseInt(newGrade, 10),
        gender: newGender,
        season,
        ...(opts?.allowDuplicate ? { allowDuplicate: true } : {}),
      }),
    onSuccess: () => {
      toast.success(`${newName.trim()} added to the ${season} roster`);
      setNewName('');
      setNewPreferredName('');
      setNameConflict(null);
      setAddOpen(false);
      invalidate();
    },
    onError: (err: unknown) => {
      const response = (err as { response?: { status?: number; data?: ExistingAthleteConflict & { msg?: string } } })
        ?.response;
      if (response?.status === 409 && response.data?.code === 'ATHLETE_EXISTS') {
        setNameConflict(response.data);
        return;
      }
      toast.error(response?.data?.msg ?? 'Could not add athlete');
    },
  });

  // Put the existing record on this season's roster — the fix for the case
  // that brings a coach here: a returning athlete whose races are all in a
  // past season, so the roster filtered them out and they looked missing.
  const putExistingOnRoster = useMutation({
    mutationFn: (athleteId: string) => rosterService.addToRoster(season as number, athleteId),
    onSuccess: () => {
      toast.success('Added to the roster — their history came with them.');
      setNewName('');
      setNewPreferredName('');
      setNameConflict(null);
      setAddOpen(false);
      invalidate();
    },
    onError: () => toast.error('Could not add them to this season.'),
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


  // T1: captain designation — coach-only, no action required from the
  // athlete's side at all. isCaptain toggles instantly; captainNotes gets
  // its own small dialog since it's optional detail, not the common case.


  // What the athlete actually goes by — shown throughout the app instead of
  // their legal name wherever set. Its own small dialog, same shape as
  // captain notes above, since it's an occasional edit, not the common case.

  // Class year. The roster has always BADGED "Needs class year" without
  // offering any way to set one — nickname was the only inline edit — so an
  // athlete an import created without a grade stayed ungraded forever.
  // Grade is derived from graduationYear everywhere (lib/seasonUtils), so
  // that is what gets stored; coaches think in grades, so that is what they
  // pick, and the year is worked back from the season on screen.

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


  return (
    <div className="space-y-6">
      <PageHeader
        section="athletes"
        icon={ClipboardList}
        title="Roster"
        description="Manage who is on the team, season by season."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add athlete
          </Button>
        }
        secondaryActions={<>
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
                  {/* A list is for seeing everyone and getting to one of
                      them. Every per-athlete admin action — nickname, class
                      year, captain, notes, invite, preview, remove — moved
                      to the athlete's own page (Admin tab, see
                      AthleteAdminPanel): nine buttons per row wrapped onto
                      three lines on a phone and pushed the actual roster
                      off the screen. What stays is status a coach scans
                      for, and the way in. */}
                  <div className="flex flex-wrap items-center gap-2">
                    {athlete.graduated && <Badge variant="secondary">Graduated</Badge>}
                    {athlete.isCaptain && <Badge><Star className="mr-1 h-3 w-3" />Captain</Badge>}
                    {!athlete.graduationYear && <Badge variant="outline">Needs class year</Badge>}
                    {athlete.flaggedForRemoval && <Badge variant="destructive">Flagged</Badge>}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(teamAthletePath(athlete.id))}
                    >
                      View Profile
                    </Button>
                    {/* Icon-only, and back on the row by request: this is
                        the one admin action a coach reaches for FROM the
                        list (pick a name, see the app as them) rather than
                        from that athlete's own page. Everything else moved
                        to the profile's Admin tab. */}
                    {isCoach && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 shrink-0 p-0"
                        title="Preview as athlete — see the app as they would: their own profile, log-a-run, race reflections"
                        aria-label={`Preview the app as ${athlete.preferredName || athlete.name}`}
                        onClick={() => setPreviewAthlete(athlete.id, athlete.preferredName || athlete.name, teamPath)}
                      >
                        <Eye className="h-4 w-4" />
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

            {/* Almost always a returning athlete rather than two people
                with the same name. Their races live in a season this
                screen isn't showing, so the roster filtered them out and
                they looked missing — adding a second record is how ten
                seasons of history ends up orphaned. */}
            {nameConflict && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-3">
                  <p>{nameConflict.msg} Is this them?</p>
                  {nameConflict.existing.map((existing) => (
                    <div key={existing.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">
                        <strong>{existing.preferredName || existing.name}</strong>
                        {existing.graduationYear ? ` · class of ${existing.graduationYear}` : ''}
                        {' · '}
                        {existing.careerRaceCount} career race{existing.careerRaceCount === 1 ? '' : 's'}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => putExistingOnRoster.mutate(existing.id)}
                        disabled={putExistingOnRoster.isPending}
                      >
                        {putExistingOnRoster.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add this one to {season}
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addAthlete.mutate({ allowDuplicate: true })}
                    disabled={addAthlete.isPending}
                  >
                    No — this is a different athlete with the same name
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNameConflict(null);
                setAddOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => addAthlete.mutate(undefined)}
              disabled={!newName.trim() || addAthlete.isPending || !!nameConflict}
            >
              {addAthlete.isPending ? 'Adding…' : 'Add athlete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {season !== undefined && (
        <ImportRosterDialog open={importRosterOpen} onOpenChange={setImportRosterOpen} season={season} />
      )}
      <MergeAthletesDialog open={mergeOpen} onOpenChange={setMergeOpen} season={season} />
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
const MergeAthletesDialog: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void; season?: number }> = ({
  open,
  onOpenChange,
  season,
}) => {
  const queryClient = useQueryClient();
  const [keeperId, setKeeperId] = useState<string>('');
  const [loserId, setLoserId] = useState<string>('');

  // Its own list, not the page's. The row a coach comes here to merge is by
  // definition the one that isn't showing on the roster — a returning
  // athlete whose races are all in a past season is filtered out of the
  // default view, which is what made them look missing in the first place.
  // Asking the coach to go set two other controls before this screen can
  // work is asking them to already know the answer.
  const { data: roster = [], isLoading } = useQuery({
    queryKey: ['roster', season, 'merge-candidates'],
    queryFn: () => rosterService.getRoster(season, { activeOnly: false }),
    enabled: open && season !== undefined,
  });

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
            Every athlete this team has ever had, with their career race count — including the ones the roster
            filters out. Keep the record you want, merge the other into it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading every athlete on this team…</p>}
          <div>
            <Label>Keep this athlete</Label>
            <Select value={keeperId} onValueChange={setKeeperId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose an athlete…" /></SelectTrigger>
              <SelectContent>
                {roster.map((a) => (
                  <SelectItem key={a.id} value={a.id} disabled={a.id === loserId}>
                    {mergeOptionLabel(a)} — {a.careerRaceCount ?? a.raceCount} career race
                    {(a.careerRaceCount ?? a.raceCount) === 1 ? '' : 's'}
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
                    {mergeOptionLabel(a)} — {a.careerRaceCount ?? a.raceCount} career race
                    {(a.careerRaceCount ?? a.raceCount) === 1 ? '' : 's'}
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
