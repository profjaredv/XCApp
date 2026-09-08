import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Search, X } from 'lucide-react';
import { AthletePicker } from '@/components/groups/AthletePicker';
import { useRaceEntrants, useAddEntrant, useRemoveEntrant } from '@/hooks/useMeetOps';
import { rosterService } from '@/api/rosterService';
import { matchesQuery } from '@/lib/athleteSearch';

// "Add entrants to a manual race" — who's declared to run it, before the
// fact. The point isn't meet-day logistics (that whole workflow — bibs,
// seed times, alternates — was deliberately removed, see backend/routes/
// meetOps.js's header comment); it's giving the Live Timer a bounded,
// named list to tap into instead of the entire team roster. See
// RaceLiveTimerPage.tsx, which reads this same list.
const VARSITY_ENTRY_CAP = 7;
type GenderFilter = 'ALL' | 'M' | 'F';

export const ManageEntrantsDialog: React.FC<{
  raceId: string;
  raceName: string;
  seasonYear: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ raceId, raceName, seasonYear, open, onOpenChange }) => {
  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ['roster', seasonYear],
    queryFn: () => rosterService.getRoster(seasonYear ?? undefined),
    enabled: open && seasonYear != null,
  });
  const { data: entrants = [], isLoading: entrantsLoading } = useRaceEntrants(open ? raceId : null);
  const addEntrant = useAddEntrant(raceId);
  const removeEntrant = useRemoveEntrant(raceId);

  const [bulkQuery, setBulkQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);

  const enteredIds = useMemo(() => new Set(entrants.map((e) => e.athleteId)), [entrants]);
  const available = useMemo(() => roster.filter((a) => !enteredIds.has(a.id)), [roster, enteredIds]);
  const availableForPicker = useMemo(
    () => available.map((a) => ({ id: a.id, name: a.preferredName || a.name, grade: a.grade })),
    [available]
  );

  // The checkbox grid's own filtered view — separate from availableForPicker
  // above (the single-add AthletePicker keeps its own search box).
  const filteredForBulk = useMemo(
    () =>
      available.filter(
        (a) =>
          matchesQuery(a.preferredName || a.name, bulkQuery) &&
          (genderFilter === 'ALL' || a.gender === genderFilter)
      ),
    [available, bulkQuery, genderFilter]
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
              entrants.map((entrant) => (
                <div key={entrant.athleteId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <span>{entrant.name}</span>
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
              ))
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
            <div className="flex items-center gap-2 text-xs">
              <button type="button" className="text-primary underline" onClick={selectAllFiltered} disabled={filteredForBulk.length === 0}>
                Select all{bulkQuery.trim() || genderFilter !== 'ALL' ? ' shown' : ''} ({filteredForBulk.length})
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
                      <span className="min-w-0 flex-1 truncate">{a.preferredName || a.name}</span>
                      {a.grade != null && <span className="shrink-0 text-xs text-muted-foreground">Gr {a.grade}</span>}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManageEntrantsDialog;
