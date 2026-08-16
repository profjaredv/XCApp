import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, UserPlus, Loader2 } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
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
import type { RosterAthleteWithRaces } from '@/api/groupService';
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
  onSave: (reps: RepUpdateInput) => void;
  onRemove: () => void;
  removing: boolean;
}> = ({ entry, suggestedSec, onSave, onRemove, removing }) => {
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
      {reps.map((val, i) => (
        <TableCell key={i} className="p-1">
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

  const rosterById = useMemo(() => new Map(roster.map((a) => [a.id, a])), [roster]);
  const enteredIds = useMemo(() => new Set(session.entries.map((e) => e.athleteId)), [session.entries]);
  const available = roster.filter((a) => !enteredIds.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));

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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Athlete</TableHead>
                  {Array.from({ length: REP_COUNT }, (_, i) => (
                    <TableHead key={i} className="text-center">
                      Rep {i + 1}
                    </TableHead>
                  ))}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    suggestedSec={suggestedSplitSeconds(rosterById.get(entry.athleteId), session.zone, session.repDistanceM)}
                    removing={removeEntry.isPending}
                    onSave={(reps) => updateEntry.mutate({ entryId: entry.id, input: reps })}
                    onRemove={() => removeEntry.mutate(entry.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
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
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Interval Sessions</h1>
        <p className="text-muted-foreground">No season set up yet — set one up from the Groups screen first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Interval Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">
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
  );
};

export default IntervalSessionsPage;
