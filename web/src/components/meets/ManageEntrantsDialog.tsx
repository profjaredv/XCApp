import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { AthletePicker } from '@/components/groups/AthletePicker';
import { useRaceEntrants, useAddEntrant, useRemoveEntrant } from '@/hooks/useMeetOps';
import { rosterService } from '@/api/rosterService';

// "Add entrants to a manual race" — who's declared to run it, before the
// fact. The point isn't meet-day logistics (that whole workflow — bibs,
// seed times, alternates — was deliberately removed, see backend/routes/
// meetOps.js's header comment); it's giving the Live Timer a bounded,
// named list to tap into instead of the entire team roster. See
// RaceLiveTimerPage.tsx, which reads this same list.
const VARSITY_ENTRY_CAP = 7;

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

  const enteredIds = useMemo(() => new Set(entrants.map((e) => e.athleteId)), [entrants]);
  const available = useMemo(
    () =>
      roster
        .filter((a) => !enteredIds.has(a.id))
        .map((a) => ({ id: a.id, name: a.preferredName || a.name, grade: a.grade })),
    [roster, enteredIds]
  );

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

  const loading = rosterLoading || entrantsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entrants — {raceName}</DialogTitle>
          <DialogDescription>
            Who's running this race. The Live Timer taps names from this list, not the whole roster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="max-h-[40vh] space-y-2 overflow-y-auto">
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
          <div className="pt-1">
            <p className="mb-2 text-sm font-medium">Add an athlete</p>
            <AthletePicker
              athletes={available}
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
