import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import {
  useProposeImport,
  useConfirmImport,
  useProposeCalendarImport,
  useConfirmCalendarImport,
  useDeleteRace,
} from '@/hooks/useMeetOps';
import { type ProposedMeet, type ProposedCalendarMeet } from '@/api/meetOpsService';

// The two flows that create Meet rows — from this season's scraped races,
// and from the team's Athletic.net calendar. Moved here verbatim from
// MeetsPage so the next shell's Meets list (docs/leadpack-new-ui-trial.md
// §4.6) imports meets the same way.

interface ImportRow extends ProposedMeet {
  included: boolean;
  editedName: string;
}

// Meets don't exist for a season until something groups its scraped races
// (or the calendar import below) into one — this proposes groupings from
// races already scraped this season that aren't linked to a Meet yet, a
// coach reviews/edits names, then confirms.
export const ImportMeetsDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  seasonId: string | null;
  onImported: (firstMeetId?: string) => void;
}> = ({ open, onClose, seasonId, onImported }) => {
  const proposeImport = useProposeImport(seasonId);
  const confirmImport = useConfirmImport(seasonId);
  const deleteRace = useDeleteRace();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [proposed, setProposed] = useState(false);
  // Which row a delete is in flight for — e.g. leftover heats from a meet
  // deleted without deleting its races first (DELETE /meet-ops/:meetId
  // unlinks races rather than deleting them). This is the same "races
  // this season aren't linked to a Meet" list Import reads from; deleting
  // straight from here means a coach doesn't have to import junk into a
  // throwaway meet just to reach a delete button.
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open && !proposed) {
      proposeImport.mutate(undefined, {
        onSuccess: (data) => {
          setRows(data.map((m) => ({ ...m, included: true, editedName: m.proposedName })));
          setProposed(true);
        },
        onError: () => toast.error('Could not load races for this season.'),
      });
    }
    if (!open) {
      setProposed(false);
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleImport = async () => {
    const selected = rows.filter((r) => r.included && r.editedName.trim());
    if (selected.length === 0) return;
    try {
      const result = await confirmImport.mutateAsync(
        selected.map((r) => ({ name: r.editedName.trim(), date: r.date, location: r.location, raceIds: r.raceIds }))
      );
      toast.success(result.msg);
      onImported(result.meets[0]?.id);
      onClose();
    } catch {
      toast.error('Could not import meets.');
    }
  };

  // Deletes every race in one proposed group. Only a manually-entered
  // race actually goes (DELETE /meet-ops/races/:raceId — same rule as the
  // meet detail page's own Trash2 button); a scraped one is silently left
  // in place rather than destroyed, since its results exist nowhere else.
  // Re-proposes afterward instead of guessing the new state locally: a
  // full delete removes the row, a partial one shrinks it to just the
  // scraped race(s) left behind.
  const handleDeleteRow = async (row: ImportRow, index: number) => {
    const count = row.raceIds.length;
    const confirmed = window.confirm(
      `Delete ${count} race${count === 1 ? '' : 's'} from "${row.proposedName}"?\n\n` +
        `Any results recorded on a manually-entered race go with it. A scraped race isn't removed this way — ` +
        `re-import it into a meet if you want to keep it.\n\nThis cannot be undone.`
    );
    if (!confirmed) {
      return;
    }
    setDeletingIndex(index);
    let deleted = 0;
    for (const raceId of row.raceIds) {
      try {
        await deleteRace.mutateAsync(raceId);
        deleted += 1;
      } catch {
        // Not a manual race — left in place, see the confirmation copy above.
      }
    }
    const skipped = count - deleted;
    setDeletingIndex(null);
    if (deleted === 0) {
      toast.error("Couldn't delete — none of these are manually-entered races.");
      return;
    }
    toast.success(
      skipped === 0
        ? `Deleted ${deleted} race${deleted === 1 ? '' : 's'}.`
        : `Deleted ${deleted} race${deleted === 1 ? '' : 's'}. ${skipped} left in place — not manually entered.`
    );
    proposeImport.mutate(undefined, {
      onSuccess: (data) => setRows(data.map((m) => ({ ...m, included: true, editedName: m.proposedName }))),
    });
  };

  const selectedCount = rows.filter((r) => r.included).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import meets from this season's races</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Races on the same day are grouped into one proposed meet (boys/girls, varsity/JV races at the same event share a day).
          Nothing is created until you confirm. Just want a leftover group gone — say, heats from a meet you deleted by
          mistake — instead of imported? Use the trash icon on that row.
        </p>
        {proposeImport.isPending ? (
          <p className="text-sm text-muted-foreground py-4">Loading races…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No unlinked races found for this season — either everything's already grouped into a meet, or nothing's been scraped yet.
          </p>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {rows.map((row, i) => (
              <div key={i} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={row.included}
                  onCheckedChange={(v) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, included: Boolean(v) } : r)))}
                  className="mt-2"
                  disabled={deletingIndex === i}
                />
                <div className="flex-1 space-y-1">
                  <Input
                    className="h-8"
                    value={row.editedName}
                    onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, editedName: e.target.value } : r)))}
                    disabled={deletingIndex === i}
                  />
                  <p className="text-xs text-muted-foreground">
                    {row.date.slice(0, 10)}
                    {row.location ? ` · ${row.location}` : ''} · {row.raceCount} race{row.raceCount === 1 ? '' : 's'}: {row.raceNames.join(', ')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => handleDeleteRow(row, i)}
                  disabled={deletingIndex !== null}
                  title="Delete these races instead of importing them"
                >
                  {deletingIndex === i ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleImport} disabled={selectedCount === 0 || confirmImport.isPending}>
            {confirmImport.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import {selectedCount > 0 ? `${selectedCount} meet${selectedCount === 1 ? '' : 's'}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface CalendarImportRow extends ProposedCalendarMeet {
  included: boolean;
  editedName: string;
}

// Sourced from the team's own Athletic.net calendar feed rather than
// scraped races — the only way to pull in a season's schedule before any
// results exist (preseason), and the way to pick up midseason schedule
// changes (a rescheduled or added meet) without waiting for results to be
// scraped first. Keyed on Athletic.net's own meet ID (lib/icalMeets.js),
// so re-running this — even after the "Import from races" flow already
// created some of these meets from scraped results — never creates a
// second Meet row for the same real-world meet; it just refreshes it and
// links any newly-scraped, still-unlinked races.
export const ImportCalendarDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  seasonId: string | null;
  onImported: (firstMeetId?: string) => void;
}> = ({ open, onClose, seasonId, onImported }) => {
  const proposeImport = useProposeCalendarImport(seasonId);
  const confirmImport = useConfirmCalendarImport(seasonId);
  const [rows, setRows] = useState<CalendarImportRow[]>([]);
  const [proposed, setProposed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (open && !proposed) {
      setLoadError(null);
      proposeImport.mutate(undefined, {
        onSuccess: (data) => {
          setRows(data.map((m) => ({ ...m, included: true, editedName: m.name })));
          setProposed(true);
        },
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ??
            "Could not load this team's Athletic.net schedule.";
          setLoadError(message);
        },
      });
    }
    if (!open) {
      setProposed(false);
      setRows([]);
      setLoadError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleImport = async () => {
    const selected = rows.filter((r) => r.included && r.editedName.trim());
    if (selected.length === 0) return;
    try {
      const result = await confirmImport.mutateAsync(
        selected.map((r) => ({ athleticMeetId: r.athleticMeetId, name: r.editedName.trim(), date: r.date, location: r.location }))
      );
      toast.success(result.msg);
      onImported(result.meets[0]?.id);
      onClose();
    } catch {
      toast.error('Could not import meets.');
    }
  };

  const selectedCount = rows.filter((r) => r.included).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import meets from Athletic.net</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pulls this season's schedule straight from your team's Athletic.net calendar — works before results exist, and safe to
          re-run for midseason changes. Nothing is created until you confirm.
        </p>
        {proposeImport.isPending ? (
          <p className="text-sm text-muted-foreground py-4">Loading schedule…</p>
        ) : loadError ? (
          <p className="text-sm text-destructive py-4">{loadError}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No meets found on this team's Athletic.net schedule for this season.</p>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {rows.map((row, i) => (
              <div key={row.athleticMeetId} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={row.included}
                  onCheckedChange={(v) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, included: Boolean(v) } : r)))}
                  className="mt-2"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8"
                      value={row.editedName}
                      onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, editedName: e.target.value } : r)))}
                    />
                    {row.alreadyImported && <Badge variant="secondary" className="text-[10px] shrink-0">Already on schedule</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.date.slice(0, 10)}
                    {row.location ? ` · ${row.location}` : ''}
                    {row.unlinkedRaceCount > 0
                      ? ` · ${row.unlinkedRaceCount} scraped result${row.unlinkedRaceCount === 1 ? '' : 's'} will be linked`
                      : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleImport} disabled={selectedCount === 0 || confirmImport.isPending}>
            {confirmImport.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import {selectedCount > 0 ? `${selectedCount} meet${selectedCount === 1 ? '' : 's'}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
