import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Trash2, UserPlus, Archive, Loader2, X, Check, Printer } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { useRosterWithRaces } from '@/hooks/useGroups';
import { useAthleteRecentRace, type AthleteRecentRace } from '@/hooks/useAthleteRecentRace';
import {
  useIntervalSession,
  useAddIntervalEntry,
  useUpdateIntervalEntry,
  useRemoveIntervalEntry,
  useSetIntervalSessionArchived,
} from '@/hooks/useIntervalSessions';
import { bestPaceSecPerMile, formatTime } from '@/api/groupService';
import type { IntervalSessionEntry, RepUpdateInput } from '@/api/intervalSessionService';
import { usePaceZones } from '@/hooks/usePaceZones';
import { findZoneByKey, zoneDisplayName } from '@/lib/paceZoneLookup';
import { resolvePaceZone, type PaceZoneDefinition, type Explanation } from '@/lib/paceZones';
import { formatRepTargetRange, explainRepTarget } from '@/lib/paceFormat';
import { NerdBox, NerdNote } from '@/components/NerdBox';
import { formatDateShort, compactName } from '@/lib/formatUtils';
import { SplitCell, type CellNavigate } from '@/components/splits/SplitCell';
import { FieldHeader, type FieldAction } from '@/components/field/FieldHeader';
import { SegmentedPills } from '@/components/field/SegmentedPills';

// The "manage entries" state of an interval session — its own full-screen
// route (not one card among many on the list page), so filling this in on
// a phone at the track isn't competing with every other session for
// screen space. Suggested per-rep splits reuse the same VDOT engine as
// TrainingPacesCard, computed here from each athlete's own most recent race.

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

// The suggested per-rep target, from the session's pace zone and this
// athlete's own most recent race.
//
// Season-agnostic on purpose — see useAthleteRecentRace's comment. A
// preseason interval session (the exact time a coach is most likely
// setting one up) has zero results in the *current* season, so this needs
// whichever race actually happened most recently, any season.
//
// A zone is a RANGE, so this returns one too. Returns null when there is
// no race to work from, or when the session's zone has since been deleted
// from the team's settings — in both cases there is genuinely nothing to
// suggest, and a number would be a guess.
function suggestedRepTarget(
  recentRace: AthleteRecentRace | null | undefined,
  zone: PaceZoneDefinition | null,
  repDistanceM: number
): { fastSec: number; slowSec: number; explain: Explanation } | null {
  if (!recentRace || !zone) return null;
  const paces = resolvePaceZone(zone, { distanceMiles: recentRace.distance, timeSeconds: recentRace.time });
  if (!paces) return null;
  return explainRepTarget(paces, repDistanceM);
}


const EntryRow: React.FC<{
  entry: IntervalSessionEntry;
  target: { fastSec: number; slowSec: number; explain: Explanation } | null;
  activeRep: number;
  registerRef: (key: string, el: HTMLInputElement | null) => void;
  onComplete: (key: string, elapsedSec: number) => void;
  onClear: (key: string) => void;
  onNavigate: (key: string, direction: CellNavigate) => void;
  onRemove: () => void;
  removing: boolean;
}> = ({ entry, target, activeRep, registerRef, onComplete, onClear, onNavigate, onRemove, removing }) => {
  const repValue = (rep: number): number | null => entry[repField(rep)];

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{compactName(entry.athleteName)}</TableCell>
      <TableCell className="text-center text-sm md:text-xs text-muted-foreground whitespace-nowrap font-mono">
        {target ? formatRepTargetRange(target.fastSec, target.slowSec) : '—'}
        {/* One compact line per athlete rather than the full panel: this
            grid gets used on a phone at the track, and a six-step box per
            row would bury the thing a coach is actually here to do. The
            full derivation for the session sits above the table. */}
        {target && (
          <NerdNote>{target.explain.steps[target.explain.steps.length - 1].substituted}</NerdNote>
        )}
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
            className="text-base md:text-sm h-11 md:h-9"
          />
        </TableCell>
      ))}
      <TableCell className="p-1">
        <Button variant="ghost" size="icon" className="h-11 w-11 md:h-7 md:w-7" onClick={onRemove} disabled={removing} aria-label="Remove athlete">
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
  const available = roster
    .filter((a) => !enteredIds.has(a.id))
    .sort((a, b) => (a.preferredName || a.name).localeCompare(b.preferredName || b.name));

  const entryAthleteIds = useMemo(() => (session?.entries ?? []).map((e) => e.athleteId), [session?.entries]);
  const { data: recentRaceByAthlete } = useAthleteRecentRace(entryAthleteIds);
  const { data: teamZones = [] } = usePaceZones();
  // Resolved live, so renaming or retuning a zone in Settings updates the
  // targets on an in-progress session. Null once a zone has been deleted —
  // the session still renders (its stored label carries the name), it just
  // stops suggesting paces it can no longer derive.
  const sessionZone = session ? findZoneByKey(session.zone, teamZones) : null;

  // The first athlete on the sheet with a race behind them, used as the
  // worked example for the nerd-mode panel above the table. Deliberately a
  // real athlete rather than a made-up 18:00 runner: a coach checking the
  // arithmetic can cross-check it against a name they know.
  const workedExample = useMemo(() => {
    for (const entry of session?.entries ?? []) {
      const target = suggestedRepTarget(
        recentRaceByAthlete?.get(entry.athleteId),
        sessionZone,
        session?.repDistanceM ?? 0
      );
      if (target) return { name: entry.athleteName, target };
    }
    return null;
  }, [session?.entries, session?.repDistanceM, recentRaceByAthlete, sessionZone]);

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

  // A paper backup, same idea as Splits' Print button: coaches want
  // something at the track that still works when a phone dies or there's
  // no signal. Printed before any reps are in, the sheet is just blank
  // ruled boxes to fill in by hand and enter here later; printed after,
  // it doubles as a clean record of what's already saved.
  const handlePrint = () => window.print();

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

  // Icon-only below sm (FieldHeader's job now): on a narrow phone, "Archive ·
  // Print · Save · Close" as full-text buttons left almost no room for the
  // title — it was truncating to "5x…" / "Aug 1…".
  const topBar = (
    <FieldHeader
      title={session?.title ?? 'Interval Session'}
      subtitle={
        session
          ? `${formatDateShort(session.date)} · ${session.groupName ?? 'Ad hoc'} · ${session.repDistanceM}m · ${zoneDisplayName(session.zone, teamZones, session.zoneLabel)} pace`
          : undefined
      }
      actions={[
        ...(session
          ? [
              {
                icon: Archive,
                label: session.archived ? 'Restore' : 'Archive',
                onClick: handleArchiveToggle,
                busy: setArchived.isPending,
              } as FieldAction,
            ]
          : []),
        { icon: Printer, label: 'Print', onClick: handlePrint, disabled: !session || session.entries.length === 0 },
        { icon: Check, label: 'Save', onClick: handleSave },
        { icon: X, label: 'Close', onClick: handleClose, variant: 'ghost' },
      ]}
    />
  );

  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-4 text-muted-foreground">Loading session…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-4 text-muted-foreground">Session not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {topBar}
      <div className="print:hidden p-3 sm:p-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            {session.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No athletes yet — add one below.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground pb-2">
                  Type 3 or 4 digits for minutes:seconds — e.g. <span className="font-mono">530</span> becomes{' '}
                  <span className="font-mono">5:30</span>. Nothing else is accepted.
                </p>
                {/* Where the whole Target column comes from, worked all the
                    way through once for a real athlete on this sheet. The
                    per-row notes then only have to show the last step. */}
                {workedExample && (
                  <div className="pb-3">
                    <NerdBox
                      explain={{
                        ...workedExample.target.explain,
                        title: `${workedExample.target.explain.title} — worked through for ${workedExample.name}`,
                      }}
                    />
                  </div>
                )}
                <SegmentedPills
                  className="pb-3 md:hidden"
                  caption="Rep"
                  segments={REPS.map((rep) => ({ value: String(rep - 1), label: String(rep) }))}
                  value={String(activeRep)}
                  onChange={(v) => setActiveRep(Number(v))}
                />
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
                          target={suggestedRepTarget(recentRaceByAthlete?.get(entry.athleteId), sessionZone, session.repDistanceM)}
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
                <SelectTrigger className="h-11 flex-1 sm:h-9 sm:max-w-[280px]">
                  <SelectValue placeholder="Add an athlete not in this group…" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.preferredName || a.name}
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

      {/* Print view: a paper backup sheet, not a screenshot of the input
          grid — plain ruled boxes a coach can fill in by hand with a
          stopwatch, whether printed blank before the session or with
          whatever's already been typed in showing (both are real uses:
          "carry this in case the tablet dies" and "here's today's sheet
          for the file"). Same table shape and athlete order as the
          digital grid so the two never disagree. */}
      <div className="hidden print:block p-4">
        <h1 className="text-lg font-semibold">{session.title}</h1>
        <p className="text-sm text-muted-foreground mb-3">
          {formatDateShort(session.date)} · {session.groupName ?? 'Ad hoc'} · {session.repDistanceM}m ·{' '}
          {zoneDisplayName(session.zone, teamZones, session.zoneLabel)} pace
        </p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left p-1 border border-border">Athlete</th>
              <th className="text-center p-1 border border-border">Target</th>
              {REPS.map((rep) => (
                <th key={rep} className="text-center p-1 border border-border">
                  Rep {rep}
                </th>
              ))}
              <th className="text-left p-1 border border-border">Notes</th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry) => {
              const target = suggestedRepTarget(recentRaceByAthlete?.get(entry.athleteId), sessionZone, session.repDistanceM);
              return (
                <tr key={entry.id}>
                  <td className="p-1 border border-border whitespace-nowrap">{entry.athleteName}</td>
                  <td className="text-center p-1 border border-border font-mono">{target ? formatRepTargetRange(target.fastSec, target.slowSec) : ''}</td>
                  {REPS.map((rep) => {
                    const value = entry[repField(rep)];
                    return (
                      <td key={rep} className="h-8 p-1 border border-border font-mono text-center">
                        {value != null ? formatTime(value) : ''}
                      </td>
                    );
                  })}
                  <td className="border border-border" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default IntervalSessionManagePage;
