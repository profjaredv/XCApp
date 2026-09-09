import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Download, Loader2, Search, X } from 'lucide-react';
import { AthletePicker } from '@/components/groups/AthletePicker';
import { useRaceEntrants, useAddEntrant, useRemoveEntrant } from '@/hooks/useMeetOps';
import { useRosterWithRaces } from '@/hooks/useGroups';
import { bestPaceSecPerMile, entrantPaceStat, formatTime } from '@/api/groupService';
import { matchesQuery } from '@/lib/athleteSearch';
import { parseTimeToSeconds } from '@/lib/formatUtils';
import { toCsv, downloadCsv } from '@/lib/csvParse';

// "Add entrants to a manual race" — who's declared to run it, before the
// fact. The point isn't meet-day logistics (that whole workflow — bibs,
// seed times, alternates — was deliberately removed, see backend/routes/
// meetOps.js's header comment); it's giving the Live Timer a bounded,
// named list to tap into instead of the entire team roster. See
// RaceLiveTimerPage.tsx, which reads this same list.
const VARSITY_ENTRY_CAP = 7;
type GenderFilter = 'ALL' | 'M' | 'F';
type PaceDirection = 'faster' | 'slower';

export const ManageEntrantsDialog: React.FC<{
  raceId: string;
  raceName: string;
  seasonYear: number | null;
  /** Matches each entrant's mile PR or average 5K pace to what this race
   * actually is — see entrantPaceStat in groupService.ts. Null shows no
   * stat rather than guessing. */
  raceDistanceMeters: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ raceId, raceName, seasonYear, raceDistanceMeters, open, onOpenChange }) => {
  const { data: roster = [], isLoading: rosterLoading } = useRosterWithRaces(seasonYear ?? undefined);
  const { data: entrants = [], isLoading: entrantsLoading } = useRaceEntrants(open ? raceId : null);
  const addEntrant = useAddEntrant(raceId);
  const removeEntrant = useRemoveEntrant(raceId);

  const [bulkQuery, setBulkQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('ALL');
  const [paceInput, setPaceInput] = useState('');
  const [paceDirection, setPaceDirection] = useState<PaceDirection>('faster');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);

  const rosterById = useMemo(() => new Map(roster.map((a) => [a.id, a])), [roster]);

  const enteredIds = useMemo(() => new Set(entrants.map((e) => e.athleteId)), [entrants]);
  const available = useMemo(
    () => roster.filter((a) => !enteredIds.has(a.id)).map((a) => ({ ...a, pace: bestPaceSecPerMile(a) })),
    [roster, enteredIds]
  );
  const availableForPicker = useMemo(
    () => available.map((a) => ({ id: a.id, name: a.preferredName || a.name, grade: a.grade })),
    [available]
  );

  // "6:15" -> 375, blank/unparseable -> null (no pace filter applied).
  const paceThresholdSec = useMemo(() => {
    const parsed = parseTimeToSeconds(paceInput);
    return Number.isFinite(parsed) ? parsed : null;
  }, [paceInput]);

  // The checkbox grid's own filtered view — separate from availableForPicker
  // above (the single-add AthletePicker keeps its own search box). These
  // internal groups are organized by pace, so this is the filter a coach
  // actually reaches for — "boys faster than 6:15" — not just a name
  // search. An athlete with no time on record NEVER gets filtered out by
  // pace (there's nothing to compare, not a reason to hide them) — the
  // grid below marks them "no time on record" instead, so a coach still
  // sees and can add someone who just hasn't raced yet.
  const filteredForBulk = useMemo(
    () =>
      available.filter((a) => {
        if (!matchesQuery(a.preferredName || a.name, bulkQuery)) return false;
        if (genderFilter !== 'ALL' && a.gender !== genderFilter) return false;
        if (paceThresholdSec != null && a.pace != null) {
          return paceDirection === 'faster' ? a.pace < paceThresholdSec : a.pace > paceThresholdSec;
        }
        return true;
      }),
    [available, bulkQuery, genderFilter, paceThresholdSec, paceDirection]
  );

  const toggleSelected = (athleteId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(athleteId)) next.delete(athleteId);
      else next.add(athleteId);
      return next;
    });
  };

  const selectAllFiltered = () => setSelected((prev) => new Set([...prev, ...filteredForBulk.map((a) => a.id)]));
  const clearSelected = () => setSelected(new Set());

  const handleAdd = async (athleteId: string) => {
    try {
      await addEntrant.mutateAsync(athleteId);
    } catch {
      toast.error('Could not add that athlete.');
    }
  };

  const handleRemove = async (athleteId: string) => {
    try {
      await removeEntrant.mutateAsync(athleteId);
    } catch {
      toast.error('Could not remove that athlete.');
    }
  };

  // Populating a heat of sixty one tap at a time doesn't scale — check a
  // batch of boxes and add them all in one shot. Individual POSTs run in
  // parallel (no bulk endpoint) rather than a new all-or-nothing batch
  // route, same pattern GroupsPage's multi-select assign uses: one bad id
  // shouldn't sink everyone else's add.
  const handleBulkAdd = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkAdding(true);
    try {
      const results = await Promise.allSettled(ids.map((athleteId) => addEntrant.mutateAsync(athleteId)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        toast.error(`${failed} of ${ids.length} could not be added.`);
      } else {
        toast.success(`Added ${ids.length}.`);
      }
      clearSelected();
    } finally {
      setBulkAdding(false);
    }
  };

  const loading = rosterLoading || entrantsLoading;

  // A blank sheet to fill in by hand — at the meet with no signal, or just
  // faster to jot times on paper and type them in later than tap through
  // the app between races. Grade comes from the roster (RaceEntrant
  // itself doesn't carry it); Time/Status are left blank on purpose.
  const handleExportCsv = () => {
    const csv = toCsv(
      ['Name', 'Grade', 'Gender', 'Time', 'Status'],
      entrants.map((e) => ({
        Name: e.name,
        Grade: rosterById.get(e.athleteId)?.grade != null ? String(rosterById.get(e.athleteId)!.grade) : '',
        Gender: e.gender ?? '',
        Time: '',
        Status: '',
      }))
    );
    const safeName = raceName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'race';
    downloadCsv(`${safeName}-entrants.csv`, csv);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Entrants — {raceName}</DialogTitle>
          <DialogDescription>
            Who's running this race. The Live Timer taps names from this list, not the whole roster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="max-h-[30vh] space-y-2 overflow-y-auto">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : entrants.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody entered yet — add from the roster below.</p>
            ) : (
              entrants.map((entrant) => {
                const athlete = rosterById.get(entrant.athleteId);
                const stat = athlete ? entrantPaceStat(athlete, raceDistanceMeters) : null;
                return (
                <div key={entrant.athleteId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{entrant.name}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {stat ? `${stat.label} ${formatTime(stat.seconds)}` : 'no time on record'}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleRemove(entrant.athleteId)}
                    disabled={removeEntrant.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                );
              })
            )}
          </div>
          {/* A nudge, not a block — JV/lower-level races routinely run
              bigger fields than varsity's usual seven. */}
          {entrants.length > VARSITY_ENTRY_CAP && (
            <p className="text-xs text-muted-foreground">
              {entrants.length} entered — more than a typical varsity field. Fine for JV or a full-field time trial.
            </p>
          )}

          {/* The bulk path — populating a whole heat at once. Checkboxes,
              not one-at-a-time clicks, because that's what's slow with 60
              on a roster. */}
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Add from roster</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={bulkQuery}
                  onChange={(e) => setBulkQuery(e.target.value)}
                  placeholder="Filter by name…"
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-1">
                {(['ALL', 'F', 'M'] as GenderFilter[]).map((g) => (
                  <Button
                    key={g}
                    type="button"
                    size="sm"
                    variant={genderFilter === g ? 'secondary' : 'outline'}
                    onClick={() => setGenderFilter(g)}
                  >
                    {g === 'ALL' ? 'All' : g === 'F' ? 'Girls' : 'Boys'}
                  </Button>
                ))}
              </div>
            </div>
            {/* These internal groups are organized by pace — "boys faster
                than 6:15" is the filter a coach actually reaches for.
                Someone with no time on record is never hidden by this
                (nothing to compare), just labelled below instead. */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                {(['faster', 'slower'] as PaceDirection[]).map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={paceDirection === d ? 'secondary' : 'outline'}
                    onClick={() => setPaceDirection(d)}
                  >
                    {d === 'faster' ? 'Faster than' : 'Slower than'}
                  </Button>
                ))}
              </div>
              <Input
                value={paceInput}
                onChange={(e) => setPaceInput(e.target.value)}
                placeholder="6:15"
                className="w-24 font-mono"
              />
              <span className="text-xs text-muted-foreground">per mile</span>
              {paceInput.trim() && paceThresholdSec == null && (
                <span className="text-xs text-destructive">Use mm:ss, e.g. 6:15</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button type="button" className="text-primary underline" onClick={selectAllFiltered} disabled={filteredForBulk.length === 0}>
                Select all{bulkQuery.trim() || genderFilter !== 'ALL' || paceThresholdSec != null ? ' shown' : ''} ({filteredForBulk.length})
              </button>
              {selected.size > 0 && (
                <button type="button" className="text-muted-foreground underline" onClick={clearSelected}>
                  Clear selection
                </button>
              )}
            </div>
            <div className="max-h-[30vh] overflow-y-auto rounded-md border p-2">
              {filteredForBulk.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted-foreground">
                  {available.length === 0 ? 'Everyone on the roster is already entered.' : 'No one matches that filter.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3">
                  {filteredForBulk.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelected(a.id)} />
                      {/* min-w guarantees the name stays visible even when
                          the row is tight — previously both trailing spans
                          were pinned shrink-0, so the (longer) "no time on
                          record" fallback could claim the whole row on a
                          2-3 column layout and squeeze this to zero width. */}
                      <span className="min-w-[3.5rem] flex-1 truncate">{a.preferredName || a.name}</span>
                      {a.grade != null && <span className="shrink-0 text-xs text-muted-foreground">Gr {a.grade}</span>}
                      {/* Never excluded by the pace filter above, so this is
                          the only place a coach learns why — no time to
                          compare, not "doesn't qualify." Capped and
                          truncatable (not shrink-0) so a long fallback
                          can't be the thing that starves the name above. */}
                      <span className="max-w-[6rem] shrink truncate font-mono text-xs text-muted-foreground">
                        {a.pace != null ? formatTime(a.pace) : 'no time yet'}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <Button size="sm" onClick={handleBulkAdd} disabled={selected.size === 0 || bulkAdding}>
              {bulkAdding && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Add {selected.size > 0 ? selected.size : ''} selected
            </Button>
          </div>

          {/* The one-at-a-time path — for a straggler after the heat's
              already set up, where typing a name is faster than scrolling
              the grid above for a single checkbox. */}
          <div className="border-t pt-3">
            <p className="mb-2 text-sm font-medium">Add one more</p>
            <AthletePicker
              athletes={availableForPicker}
              onPick={handleAdd}
              disabled={addEntrant.isPending || loading}
              emptyLabel="Everyone on the roster is already entered."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleExportCsv} disabled={entrants.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManageEntrantsDialog;
