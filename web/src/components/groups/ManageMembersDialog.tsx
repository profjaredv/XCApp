import React, { useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAddMember, useGroupMembers, useRemoveMember } from '@/hooks/useGroups';
import type { Group } from '@/api/groupService';
import { AthletePicker } from './AthletePicker';

// A group's member management: add from the roster, move to another
// group, remove. Moved here verbatim from GroupsPage so the next shell's
// group page (docs/leadpack-new-ui-trial.md §4.3, Members tab) opens the
// same dialog rather than a second implementation.

export interface AthleteRow {
  id: string;
  name: string;
  gender: string | null;
  grade: number | null;
  bestTime: number | null;
  // Distance-normalized, so it's comparable across a roster where some
  // athletes have only run miles and others only 5Ks — which raw
  // bestTime is not (see groupService.seasonBestTime's own note).
  avgPaceSecPerMile: number | null;
}

const MOVE_PLACEHOLDER = '__move__';

export const ManageMembersDialog: React.FC<{
  group: Group | null;
  seasonId: string | null;
  onClose: () => void;
  roster: AthleteRow[];
  /** Every group this season — the "move to" list is this minus the group being viewed and any archived ones. */
  allGroups: Group[];
}> = ({ group, seasonId, onClose, roster, allGroups }) => {
  const { data: members = [], isLoading: membersLoading } = useGroupMembers(group?.id ?? null);
  const addMember = useAddMember(seasonId);
  const removeMember = useRemoveMember(seasonId);
  const [movingAthleteId, setMovingAthleteId] = useState<string | null>(null);

  if (!group) return null;

  const memberIds = new Set(members.map((m) => m.athleteId));
  const available = roster.filter((a) => !memberIds.has(a.id));
  const moveTargets = allGroups.filter((g) => g.id !== group.id && !g.archived);

  const handleAdd = async (athleteId: string) => {
    try {
      await addMember.mutateAsync({ groupId: group.id, athleteId });
      toast.success('Athlete added.');
    } catch {
      toast.error('Could not add athlete.');
    }
  };

  const handleRemove = async (athleteId: string) => {
    try {
      await removeMember.mutateAsync({ groupId: group.id, athleteId });
      toast.success('Athlete removed.');
    } catch {
      toast.error('Could not remove athlete.');
    }
  };

  // Moving is remove-then-add (there's no single "move" endpoint here —
  // unlike the TRAINING board's bulk-assign, which can swap a TRAINING
  // membership atomically because it's exclusive-per-athlete-per-type,
  // this dialog's move targets can span any group type). Both requests are
  // still sequenced from one click here instead of the coach having to
  // open a second group's dialog and re-find the athlete.
  const handleMove = async (athleteId: string, targetGroupId: string) => {
    setMovingAthleteId(athleteId);
    try {
      await removeMember.mutateAsync({ groupId: group.id, athleteId });
      await addMember.mutateAsync({ groupId: targetGroupId, athleteId });
      const target = moveTargets.find((g) => g.id === targetGroupId);
      toast.success(target ? `Moved to ${target.name}.` : 'Moved.');
    } catch {
      toast.error('Could not move athlete — they may have been removed from this group but not added to the new one. Please check both groups.');
    } finally {
      setMovingAthleteId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Members — {group.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* The member list scrolls inside the dialog rather than growing it:
              a 15-athlete group used to make the whole dialog taller than the
              phone screen, and a centered dialog that overflows has no
              reachable top or bottom. Keeping the list bounded also keeps the
              "add an athlete" row and Done button on screen where a coach can
              actually reach them. */}
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          {membersLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            members.map((m) => (
              <div key={m.membershipId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>{m.name}</span>
                <div className="flex items-center gap-1">
                  {moveTargets.length > 0 && (
                    <Select
                      value={MOVE_PLACEHOLDER}
                      onValueChange={(targetGroupId) => handleMove(m.athleteId, targetGroupId)}
                      disabled={movingAthleteId === m.athleteId}
                    >
                      <SelectTrigger className="h-7 w-[140px] text-xs">
                        <SelectValue placeholder="Move to…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={MOVE_PLACEHOLDER} disabled>Move to…</SelectItem>
                        {moveTargets.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemove(m.athleteId)} disabled={removeMember.isPending}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
          </div>
          {/* Was a plain Select listing the whole roster, so adding one
              person to a group meant scrolling ninety names. Picking is
              also now the click itself — the old two-step (choose, then
              press Add) served no purpose once the list is searchable. */}
          <div className="pt-2">
            <p className="mb-2 text-sm font-medium">Add an athlete</p>
            <AthletePicker
              athletes={available}
              onPick={handleAdd}
              disabled={addMember.isPending}
              emptyLabel="Everyone on the roster is already in this group."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
