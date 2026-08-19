import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, UserPlus, Loader2, X, Check } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { useGroups, useGroupMembers, useRosterWithRaces } from '@/hooks/useGroups';
import {
  useIntervalSessions,
  useCreateIntervalSession,
  useDeleteIntervalSession,
  useAddIntervalEntry,
  useUpdateIntervalEntry,
  useRemoveIntervalEntry,
} from '@/hooks/useIntervalSessions';
import { bestPaceSecPerMile, type RosterAthleteWithRaces } from '@/api/groupService';
import type { IntervalSession, IntervalSessionEntry, IntervalZone, RepUpdateInput } from '@/api/intervalSessionService';
import { trainingPacesFromRace, splitTimeSec } from '@/lib/vdotPaces';
import { formatTime, formatDateShort, parseTimeToSeconds } from '@/lib/formatUtils';

// Coach-adoption pass item 6: replaces the printed sheet a coach fills in
// by hand at the track — a grid of athletes x up to 6 rep times, saved
// straight to each athlete's training log (see routes/intervalSessions.js's
// syncEntryToTrainingLog). Suggested per-rep splits reuse the same VDOT
// engine as TrainingPacesCard, computed here from each athlete's own most
// recent race rather than duplicating that logic server-side.

const ZONE_LABEL: Record<IntervalZone, string> = {
  threshold: 'Threshold',
  interval: 'Interval',
  repetition: 'Repetition',
};

const AD_HOC = '__ad_hoc__';
const REP_COUNT = 6;

interface NewSessionForm {
  groupId: string; // AD_HOC or a group id
  date: string;
  title: string;
  repDistanceM: string;
  zone: IntervalZone;
}

const EMPTY_NEW_SESSION: NewSessionForm = {
  groupId: AD_HOC,
  date: new Date().toISOString().slice(0, 10),
  title: '',
  repDistanceM: '800',
  zone: 'interval',
};

function suggestedSplitSeconds(
  athlete: RosterAthleteWithRaces | undefined,
  zone: IntervalZone,
  repDistanceM: number
): number | null {
  if (!athlete) return null;
  const validRaces = athlete.races.filter(
    (r): r is { time: number; race: { date: string; distanceMeters: number } } =>
      r.time != null && r.race.distanceMeters != null
  );
  if (validRaces.length === 0) return null;
  const mostRecent = [...validRaces].sort(
    (a, b) => new Date(b.race.date).getTime() - new Date(a.race.date).getTime()
  )[0];
  const result = trainingPacesFromRace(mostRecent.race.distanceMeters / 1609.34, mostRecent.time);
  if (!result) return null;
  const paceZone = result.paces.find((p) => p.key === zone);
  if (!paceZone) return null;
  return splitTimeSec(paceZone.paceSecPerMile, repDistanceM);
}

const EntryRow: React.FC<{
  entry: IntervalSessionEntry;
  suggestedSec: number | null;
  activeRep: number;
  onSave: (reps: RepUpdateInput) => void;
  onRemove: () => void;
  removing: boolean;
}> = ({ entry, suggestedSec, activeRep, onSave, onRemove, removing }) => {
  const [reps, setReps] = useState<string[]>(
    [entry.rep1, entry.rep2, entry.rep3, entry.rep4, entry.rep5, entry.rep6].map((v) =>
      v != null ? formatTime(v) : ''
    )
  );

  const handleBlur = () => {
    const parsed = reps.map((r) => {
      const trimmed = r.trim();
      if (!trimmed) return null;
      const sec = parseTimeToSeconds(trimmed);
      return Number.isFinite(sec) ? sec : null;
    });
    onSave({ rep1: parsed[0], rep2: parsed[1], rep3: parsed[2], rep4: parsed[3], rep5: parsed[4], rep6: parsed[5] });
  };

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {entry.athleteName}
        {entry.addedManually && (
          <Badge variant="outline" className="ml-2 text-[10px] align-middle">
            not in group
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
        {suggestedSec ? formatTime(suggestedSec) : '—'}
      </TableCell>
      {reps.map((val, i) => (
        <TableCell key={i} className={`p-1 ${i === activeRep ? '' : 'hidden md:table-cell'}`}>
          <Input
            className="h-8 w-20 text-xs text-center"
            placeholder={suggestedSec ? formatTime(suggestedSec) : '—'}
            value={val}
            onChange={(e) => setReps((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))}
            onBlur={handleBlur}
          />
        </TableCell>
      ))}
      <TableCell className="p-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove} disabled={removing}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
};

const SessionCard: React.FC<{
  session: IntervalSession;
  roster: RosterAthleteWithRaces[];
  seasonId: string | null;
}> = ({ session, roster, seasonId }) => {
  const updateEntry = useUpdateIntervalEntry(seasonId);
  const removeEntry = useRemoveIntervalEntry(seasonId);
  const addEntry = useAddIntervalEntry(seasonId);
  const deleteSession = useDeleteIntervalSession(seasonId);
  const [addAthleteId, setAddAthleteId] = useState('');
  const [activeRep, setActiveRep] = useState(0);

  const rosterById = useMemo(() => new Map(roster.map((a) => [a.id, a])), [roster]);
  const enteredIds = useMemo(() => new Set(session.entries.map((e) => e.athleteId)), [session.entries]);
  const available = roster.filter((a) => !enteredIds.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));

  // Fastest-to-slowest by each athlete's best distance-normalized pace this
  // season, so the group runs in the order they'll actually line up on the
  // track. Athletes with no race data yet sort to the end, ties by name.
  const sortedEntries = useMemo(() => {
    const withPace = session.entries.map((entry) => {
      const athlete = rosterById.get(entry.athleteId);
      return { entry, pace: athlete ? bestPaceSecPerMile(athlete) : null };
    });
    withPace.sort((a, b) => {
      if (a.pace == null && b.pace == null) return a.entry.athleteName.localeCompare(b.entry.athleteName);
      if (a.pace == null) return 1;
      if (b.pace == null) return -1;
      return a.pace - b.pace;
    });
    return withPace.map((w) => w.entry);
  }, [session.entries, rosterById]);

  const handleAdd = async () => {
    if (!addAthleteId) return;
    try {
      await addEntry.mutateAsync({ sessionId: session.id, athleteId: addAthleteId });
      setAddAthleteId('');
    } catch {
      toast.error('Could not add that athlete.');
    }
  };

  const handleDeleteSession = async () => {
    try {
      await deleteSession.mutateAsync(session.id);
      toast.success('Session deleted.');
    } catch {
      toast.error('Could not delete that session.');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 py-4">
        <div>
          <CardTitle className="text-base">{session.title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDateShort(session.date)} · {session.groupName ?? 'Ad hoc'} · {session.repDistanceM}m ·{' '}
            {ZONE_LABEL[session.zone]} pace
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleDeleteSession} disabled={deleteSession.isPending}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {session.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No athletes yet — add one below.</p>
        ) : (
          <>
            <div className="flex md:hidden items-center gap-1.5 pb-3">
              <span className="text-xs text-muted-foreground mr-1">Active rep:</span>
              {Array.from({ length: REP_COUNT }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveRep(i)}
                  className={`h-7 w-7 rounded-full text-xs font-medium border transition-colors ${
                    i === activeRep
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Athlete</TableHead>
                    <TableHead className="text-center whitespace-nowrap">Target</TableHead>
                    {Array.from({ length: REP_COUNT }, (_, i) => (
                      <TableHead
                        key={i}
                        className={`text-center ${i === activeRep ? '' : 'hidden md:table-cell'}`}
                      >
                        Rep {i + 1}
                      </TableHead>
                    ))}
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      suggestedSec={suggestedSplitSeconds(rosterById.get(entry.athleteId), session.zone, session.repDistanceM)}
                      activeRep={activeRep}
                      removing={removeEntry.isPending}
                      onSave={(reps) => updateEntry.mutate({ entryId: entry.id, input: reps })}
                      onRemove={() => removeEntry.mutate(entry.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        <div className="flex items-center gap-2 pt-3">
          <Select value={addAthleteId} onValueChange={setAddAthleteId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Add an athlete not in this group…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleAdd} disabled={!addAthleteId || addEntry.isPending}>
            {addEntry.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5 mr-1" />
            )}
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const IntervalSessionsPage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { data: context } = useTeamContext();
  const { data: seasons = [] } = useAvailableSeasons(context?.team?.id);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const activeYear = selectedYear ?? context?.activeSeason ?? seasons[0]?.year ?? null;
  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;

  const { data: groups = [] } = useGroups(seasonId);
  const trainingGroups = groups.filter((g) => g.type === 'TRAINING' && !g.archived);
  const { data: sessions = [], isLoading } = useIntervalSessions(seasonId);
  const { data: roster = [] } = useRosterWithRaces(activeYear ?? undefined);

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [form, setForm] = useState<NewSessionForm>(EMPTY_NEW_SESSION);
  const { data: groupMembers = [] } = useGroupMembers(form.groupId !== AD_HOC ? form.groupId : null);

  const createSession = useCreateIntervalSession(seasonId);

  // Opened full screen from Coaches Tools (see router/index.tsx — this
  // route is deliberately outside <Layout>, no sidebar/header). Close just
  // navigates back; Save has nothing to batch (every field here already
  // persists on its own blur — see EntryRow/CheckoutCell-style handlers
  // below), so it just flushes whichever input is currently focused and
  // confirms.
  const handleClose = () => navigate(teamPath('/coaches-tools'));
  const handleSave = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    toast.success('All changes saved.');
  };

  const topBar = (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background px-6 py-3">
      <h1 className="text-lg font-semibold">Interval Sessions</h1>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleSave}>
          <Check className="h-4 w-4 mr-1" />
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={handleClose}>
          <X className="h-4 w-4 mr-1" />
          Close
        </Button>
      </div>
    </div>
  );

  const handleCreate = async () => {
    if (!seasonId || !form.title.trim() || !form.repDistanceM) return;
    try {
      await createSession.mutateAsync({
        seasonId,
        groupId: form.groupId === AD_HOC ? null : form.groupId,
        date: form.date,
        title: form.title.trim(),
        repDistanceM: Number(form.repDistanceM),
        zone: form.zone,
        athleteIds: form.groupId !== AD_HOC ? groupMembers.map((m) => m.athleteId) : [],
      });
      toast.success('Session created.');
      setNewDialogOpen(false);
      setForm(EMPTY_NEW_SESSION);
    } catch {
      toast.error('Could not create that session.');
    }
  };

  if (!activeYear || !seasonId) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-6 space-y-6">
          <p className="text-muted-foreground">No season set up yet — set one up from the Groups screen first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {topBar}
      <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Capture reps on a grid instead of paper — saved times log straight to each athlete's training log.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(activeYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.year} value={String(s.year)}>
                  {s.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setNewDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New session
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <p className="text-muted-foreground">No interval sessions yet this season.</p>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} roster={roster} seasonId={seasonId} />
          ))}
        </div>
      )}

      <Dialog
        open={newDialogOpen}
        onOpenChange={(open) => {
          setNewDialogOpen(open);
          if (!open) setForm(EMPTY_NEW_SESSION);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New interval session</DialogTitle>
            <DialogDescription>Picking a group seeds the grid with its current roster — add anyone else after.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                className="mt-1"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="5 x 800m Tempo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input type="date" className="mt-1" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <Label>Group</Label>
                <Select value={form.groupId} onValueChange={(v) => setForm({ ...form, groupId: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AD_HOC}>Ad hoc (add athletes manually)</SelectItem>
                    {trainingGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Rep distance (m)</Label>
                <Input
                  type="number"
                  min="1"
                  className="mt-1"
                  value={form.repDistanceM}
                  onChange={(e) => setForm({ ...form, repDistanceM: e.target.value })}
                />
              </div>
              <div>
                <Label>Suggested-pace zone</Label>
                <Select value={form.zone} onValueChange={(v) => setForm({ ...form, zone: v as IntervalZone })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ZONE_LABEL) as IntervalZone[]).map((z) => (
                      <SelectItem key={z} value={z}>
                        {ZONE_LABEL[z]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!form.title.trim() || createSession.isPending}>
              {createSession.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default IntervalSessionsPage;
