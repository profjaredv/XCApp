import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Trash2, UserPlus, Archive, Loader2, X, Check } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { useRosterWithRaces } from '@/hooks/useGroups';
import {
  useIntervalSession,
  useAddIntervalEntry,
  useUpdateIntervalEntry,
  useRemoveIntervalEntry,
  useSetIntervalSessionArchived,
} from '@/hooks/useIntervalSessions';
import { bestPaceSecPerMile, formatTime, type RosterAthleteWithRaces } from '@/api/groupService';
import type { IntervalSessionEntry, IntervalZone, RepUpdateInput } from '@/api/intervalSessionService';
import { trainingPacesFromRace, splitTimeSec } from '@/lib/vdotPaces';
import { formatDateShort, compactName } from '@/lib/formatUtils';
import { SplitCell, type CellNavigate } from '@/components/splits/SplitCell';

// The "manage entries" state of an interval session — its own full-screen
// route (not one card among many on the list page), so filling this in on
// a phone at the track isn't competing with every other session for
// screen space. Suggested per-rep splits reuse the same VDOT engine as
// TrainingPacesCard, computed here from each athlete's own most recent race.

const ZONE_LABEL: Record<IntervalZone, string> = {
  threshold: 'Threshold',
  interval: 'Interval',
  repetition: 'Repetition',
};

const REP_COUNT = 6;
const REPS: number[] = Array.from({ length: REP_COUNT }, (_, i) => i + 1);

function cellKey(entryId: string, rep: number) {
  return `${entryId}:${rep}`;
}

function repField(rep: number): 'rep1' | 'rep2' | 'rep3' | 'rep4' | 'rep5' | 'rep6' {
  return `rep${rep}` as 'rep1' | 'rep2' | 'rep3' | 'rep4' | 'rep5' | 'rep6';
}

// Explicit per-rep construction rather than a computed { [repField(rep)]: value }
// object literal — a computed key typed as a union of string literals makes
// TS infer an index signature, which doesn't structurally satisfy
// RepUpdateInput's named optional properties.
function repInput(rep: number, value: number | null): RepUpdateInput {
  switch (rep) {
    case 1: return { rep1: value };
    case 2: return { rep2: value };
    case 3: return { rep3: value };
    case 4: return { rep4: value };
    case 5: return { rep5: value };
    case 6: return { rep6: value };
    default: return {};
  }
}

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
  registerRef: (key: string, el: HTMLInputElement | null) => void;
  onComplete: (key: string, elapsedSec: number) => void;
  onClear: (key: string) => void;
  onNavigate: (key: string, direction: CellNavigate) => void;
  onRemove: () => void;
  removing: boolean;
}> = ({ entry, suggestedSec, activeRep, registerRef, onComplete, onClear, onNavigate, onRemove, removing }) => {
  const repValue = (rep: number): number | null => entry[repField(rep)];

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {compactName(entry.athleteName)}
        {entry.addedManually && (
          <Badge variant="outline" className="ml-2 text-[10px] align-middle">
            not in group
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-center text-sm md:text-xs text-muted-foreground whitespace-nowrap font-mono">
        {suggestedSec ? formatTime(suggestedSec) : '—'}
      </TableCell>
      {REPS.map((rep) => (
        <TableCell key={rep} className={`p-1 ${rep - 1 === activeRep ? '' : 'hidden md:table-cell'}`}>
          <SplitCell
            cellKey={cellKey(entry.id, rep)}
            value={repValue(rep)}
            registerRef={registerRef}
            onComplete={onComplete}
            onClear={onClear}
            onNavigate={onNavigate}
            className="text-base md:text-sm h-10 md:h-9"
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

const IntervalSessionManagePage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data: context } = useTeamContext();
  const { data: seasons = [] } = useAvailableSeasons(context?.team?.id);

  const { data: session, isLoading: isLoadingSession } = useIntervalSession(sessionId ?? null);
  const seasonId = session?.seasonId ?? null;
  const seasonYear = seasons.find((s) => s.id === seasonId)?.year;
  const { data: roster = [] } = useRosterWithRaces(seasonYear);

  const updateEntry = useUpdateIntervalEntry(seasonId);
  const removeEntry = useRemoveIntervalEntry(seasonId);
  const addEntry = useAddIntervalEntry(seasonId);
  const setArchived = useSetIntervalSessionArchived(seasonId);

  const [addAthleteId, setAddAthleteId] = useState('');
  const [activeRep, setActiveRep] = useState(0);
  const cellRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const registerRef = useCallback((key: string, el: HTMLInputElement | null) => {
    cellRefs.current.set(key, el);
  }, []);

  const rosterById = useMemo(() => new Map(roster.map((a) => [a.id, a])), [roster]);
  const enteredIds = useMemo(() => new Set((session?.entries ?? []).map((e) => e.athleteId)), [session?.entries]);
  const available = roster.filter((a) => !enteredIds.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));

  // Fastest-to-slowest by each athlete's best distance-normalized pace this
  // season, so the group runs in the order they'll actually line up on the
  // track — and so column-major Enter/arrow navigation below moves down
  // the roster in that same order. Athletes with no race data sort to the
  // end, ties by name.
  const sortedEntries = useMemo(() => {
    const entries = session?.entries ?? [];
    const withPace = entries.map((entry) => {
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
  }, [session?.entries, rosterById]);

  const entryById = useMemo(() => new Map(sortedEntries.map((e) => [e.id, e])), [sortedEntries]);

  const handleComplete = useCallback(
    (key: string, elapsedSec: number) => {
      const [entryId, repStr] = key.split(':');
      updateEntry.mutate({ entryId, input: repInput(Number(repStr), elapsedSec) });
    },
    [updateEntry]
  );

  const handleClear = useCallback(
    (key: string) => {
      const [entryId, repStr] = key.split(':');
      const rep = Number(repStr);
      const entry = entryById.get(entryId);
      if (!entry || entry[repField(rep)] == null) return;
      updateEntry.mutate({ entryId, input: repInput(rep, null) });
    },
    [entryById, updateEntry]
  );

  // Column-major: for a fixed rep (column), "down" moves to the next
  // athlete row in the fastest-to-slowest order above; running off the
  // bottom moves to the top of the next rep column. That's the natural
  // order for calling out times off a stopwatch — one rep at a time,
  // straight down the roster — same convention as the splits grid.
  const handleNavigate = useCallback(
    (key: string, direction: CellNavigate) => {
      const [entryId, repStr] = key.split(':');
      const rep = Number(repStr);
      const rowIdx = sortedEntries.findIndex((e) => e.id === entryId);
      const colIdx = REPS.indexOf(rep);
      if (rowIdx === -1 || colIdx === -1) return;

      let targetRow = rowIdx;
      let targetCol = colIdx;

      if (direction === 'left') {
        targetCol = colIdx - 1;
      } else if (direction === 'right') {
        targetCol = colIdx + 1;
      } else {
        const flat = colIdx * sortedEntries.length + rowIdx + (direction === 'down' ? 1 : -1);
        if (flat < 0 || flat >= sortedEntries.length * REPS.length) return;
        targetCol = Math.floor(flat / sortedEntries.length);
        targetRow = flat % sortedEntries.length;
      }

      if (targetCol < 0 || targetCol >= REPS.length || targetRow < 0 || targetRow >= sortedEntries.length) return;

      setActiveRep(targetCol);
      const targetKey = cellKey(sortedEntries[targetRow].id, REPS[targetCol]);
      const el = cellRefs.current.get(targetKey);
      if (el) {
        el.focus();
        el.select();
      }
    },
    [sortedEntries]
  );

  const handleClose = () => navigate(teamPath('/interval-sessions'));
  const handleSave = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    toast.success('All changes saved.');
  };

  const handleAdd = async () => {
    if (!addAthleteId || !session) return;
    try {
      await addEntry.mutateAsync({ sessionId: session.id, athleteId: addAthleteId });
      setAddAthleteId('');
    } catch {
      toast.error('Could not add that athlete.');
    }
  };

  const handleArchiveToggle = async () => {
    if (!session) return;
    try {
      await setArchived.mutateAsync({ id: session.id, archived: !session.archived });
      toast.success(session.archived ? 'Session restored.' : 'Session archived.');
      if (!session.archived) handleClose();
    } catch {
      toast.error('Could not update that session.');
    }
  };

  const topBar = (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background px-6 py-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold truncate">{session?.title ?? 'Interval Session'}</h1>
        {session && (
          <p className="text-xs text-muted-foreground truncate">
            {formatDateShort(session.date)} · {session.groupName ?? 'Ad hoc'} · {session.repDistanceM}m ·{' '}
            {ZONE_LABEL[session.zone]} pace
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {session && (
          <Button variant="outline" size="sm" onClick={handleArchiveToggle} disabled={setArchived.isPending}>
            <Archive className="h-4 w-4 mr-1" />
            {session.archived ? 'Restore' : 'Archive'}
          </Button>
        )}
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

  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-6 text-muted-foreground">Loading session…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-6 text-muted-foreground">Session not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {topBar}
      <div className="p-3 md:p-6">
        <Card>
          <CardContent className="pt-6">
            {session.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No athletes yet — add one below.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground pb-2">
                  Type 3 or 4 digits for minutes:seconds — e.g. <span className="font-mono">530</span> becomes{' '}
                  <span className="font-mono">5:30</span>. Nothing else is accepted.
                </p>
                <div className="flex md:hidden items-center gap-1.5 pb-3">
                  <span className="text-xs text-muted-foreground mr-1">Active rep:</span>
                  {REPS.map((rep) => (
                    <button
                      key={rep}
                      type="button"
                      onClick={() => setActiveRep(rep - 1)}
                      className={`h-7 w-7 rounded-full text-xs font-medium border transition-colors ${
                        rep - 1 === activeRep
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border'
                      }`}
                    >
                      {rep}
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Athlete</TableHead>
                        <TableHead className="text-center whitespace-nowrap">Target</TableHead>
                        {REPS.map((rep) => (
                          <TableHead
                            key={rep}
                            className={`text-center ${rep - 1 === activeRep ? '' : 'hidden md:table-cell'}`}
                          >
                            Rep {rep}
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
                          registerRef={registerRef}
                          onComplete={handleComplete}
                          onClear={handleClear}
                          onNavigate={handleNavigate}
                          removing={removeEntry.isPending}
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
      </div>
    </div>
  );
};

export default IntervalSessionManagePage;
