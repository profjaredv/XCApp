import React, { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { toast } from 'sonner';
import { Plus, Copy, Save, Loader2, Pencil, Trash2, UserCog, X } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { seasonService } from '@/api/seasonService';
import {
  useGroups,
  useMyGroups,
  useAllGroupMembers,
  useGroupMembers,
  useRosterWithRaces,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useBulkAssignGroups,
  useCopyGroupsFromSeason,
  useStaff,
  useAssignLeader,
  useRemoveLeader,
  useAddMember,
  useRemoveMember,
} from '@/hooks/useGroups';
import { seasonBestTime, formatTime, type Group, type GroupType } from '@/api/groupService';
import { useQueryClient } from '@tanstack/react-query';

// Bulk assignment screen (T2, Team Management handoff): "Assigning 130
// athletes one modal at a time is how a feature dies." The doc describes
// drag-and-drop; this ships multi-select + assign as the functional core
// first — genuinely faster than dragging for a real bulk move — with
// drag-and-drop left as a stretch goal on top rather than a blocker.
//
// Post-launch feedback added edit/delete/leader-management UI, a real
// "unassign" (previously a no-op — see handleSave), and a members view for
// CAPTAIN/CUSTOM groups, which the TRAINING-only bulk columns below don't
// cover (a captain group can run concurrently with a training group, so it
// isn't "one of the columns an athlete lives in exclusively").

const UNASSIGNED = '__unassigned__';
const MIXED_GENDER = '__mixed__';

interface AthleteRow {
  id: string;
  name: string;
  gender: string | null;
  grade: number | null;
  bestTime: number | null;
}

// Same 'coach' convention Layout.tsx's sidebar gating already uses. An
// athlete (or captain with no coach role) gets a read-only "what group am
// I in, who else is in it" view instead of the full management screen —
// GET /groups/me is already scoped server-side to just their own group(s),
// so this isn't the only thing standing between them and the rest of the
// team's group structure, but the management UI (create/edit/delete/bulk
// assign, the synthetic "Unassigned" column) simply isn't relevant to them.
const GroupsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const isCoach = currentUser?.role === 'coach';
  return isCoach ? <CoachGroupsView /> : <AthleteGroupsView />;
};

const GROUP_TYPE_LABEL: Record<GroupType, string> = {
  TRAINING: 'Training group',
  CAPTAIN: 'Captain group',
  CUSTOM: 'Group',
};

const AthleteGroupsView: React.FC = () => {
  const { data: groups, isLoading } = useMyGroups();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your groups…</p>;
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Groups</h1>
        <p className="text-muted-foreground">
          You're not currently assigned to a group. Check with your coach if you think that's wrong.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Groups</h1>
      {groups.map((group) => (
        <Card key={group.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {group.name}
              <Badge variant="outline">{GROUP_TYPE_LABEL[group.type]}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
            </p>
            <div className="space-y-1">
              {group.members.map((member) => (
                <div key={member.athleteId} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <span>{member.name}</span>
                  <span className="text-muted-foreground">{member.grade ? `Grade ${member.grade}` : ''}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const CoachGroupsView: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: context } = useTeamContext();
  const { data: seasons = [] } = useAvailableSeasons(context?.team?.id);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const activeYear = selectedYear ?? context?.activeSeason ?? seasons[0]?.year ?? null;
  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;

  const previousSeason = seasons.find((s) => s.year === (activeYear ?? 0) - 1) ?? null;

  const { data: groups = [], isLoading: groupsLoading } = useGroups(seasonId);
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const { data: membersByGroup = {}, isLoading: membersLoading } = useAllGroupMembers(seasonId, groupIds);
  const { data: roster = [], isLoading: rosterLoading } = useRosterWithRaces(activeYear ?? undefined);

  const createGroup = useCreateGroup(seasonId);
  const updateGroup = useUpdateGroup(seasonId);
  const deleteGroup = useDeleteGroup(seasonId);
  const bulkAssign = useBulkAssignGroups(seasonId);
  const removeMember = useRemoveMember(seasonId);
  const copyFromSeason = useCopyGroupsFromSeason(seasonId);

  const [selectedAthletes, setSelectedAthletes] = useState<Set<string>>(new Set());
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({}); // athleteId -> groupId | UNASSIGNED
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<GroupType>('TRAINING');
  const [newGroupGender, setNewGroupGender] = useState<'M' | 'F' | typeof MIXED_GENDER>('M');
  const [creatingForSeason, setCreatingForSeason] = useState(false);

  const [editTarget, setEditTarget] = useState<Group | null>(null);
  const [editName, setEditName] = useState('');
  const [leadersTarget, setLeadersTarget] = useState<Group | null>(null);
  const [membersTarget, setMembersTarget] = useState<Group | null>(null);

  // Current group id for each athlete, before any local pending edits.
  const currentGroupByAthlete = useMemo(() => {
    const map = new Map<string, string>();
    for (const [groupId, members] of Object.entries(membersByGroup)) {
      for (const m of members) map.set(m.athleteId, groupId);
    }
    return map;
  }, [membersByGroup]);

  const athletes: AthleteRow[] = useMemo(
    () =>
      roster.map((a) => ({
        id: a.id,
        name: a.name,
        gender: a.gender,
        grade: a.grade,
        bestTime: seasonBestTime(a),
      })),
    [roster]
  );

  const displayedGroupFor = (athleteId: string) => pendingChanges[athleteId] ?? currentGroupByAthlete.get(athleteId) ?? UNASSIGNED;

  const trainingGroups = groups.filter((g) => g.type === 'TRAINING' && !g.archived);
  const otherGroups = groups.filter((g) => g.type !== 'TRAINING' && !g.archived);
  const changeCount = Object.keys(pendingChanges).length;

  const handleInitializeSeason = async () => {
    if (!activeYear) return;
    setCreatingForSeason(true);
    try {
      await seasonService.createSeason({ year: activeYear, sport: 'XC' });
      await queryClient.invalidateQueries({ queryKey: ['availableSeasons'] });
      toast.success(`Set up ${activeYear} season — you can add groups now.`);
    } catch (err) {
      toast.error('Failed to set up this season.');
      console.error(err);
    } finally {
      setCreatingForSeason(false);
    }
  };

  const handleAssignSelectedTo = (groupId: string) => {
    setPendingChanges((prev) => {
      const next = { ...prev };
      for (const athleteId of selectedAthletes) next[athleteId] = groupId;
      return next;
    });
    setSelectedAthletes(new Set());
  };

  const handleSave = async () => {
    const assignments: Array<{ athleteId: string; groupId: string }> = [];
    // Previously, setting an athlete to "Unassigned" and saving did nothing
    // server-side — the change was silently dropped before the request went
    // out, so their old group membership never actually closed. Fixed: an
    // explicit removal (DELETE .../members/:athleteId, no replacement
    // group) for anyone who currently has a group and was moved to
    // Unassigned.
    const removals: Array<{ groupId: string; athleteId: string }> = [];

    for (const [athleteId, groupId] of Object.entries(pendingChanges)) {
      if (groupId === UNASSIGNED) {
        const currentGroupId = currentGroupByAthlete.get(athleteId);
        if (currentGroupId) removals.push({ groupId: currentGroupId, athleteId });
      } else {
        assignments.push({ athleteId, groupId });
      }
    }

    if (assignments.length === 0 && removals.length === 0) {
      setPendingChanges({});
      return;
    }

    try {
      const results = await Promise.allSettled([
        ...(assignments.length > 0 ? [bulkAssign.mutateAsync(assignments)] : []),
        ...removals.map((r) => removeMember.mutateAsync(r)),
      ]);
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        toast.error(`${failed} change(s) failed to save — please review and retry.`);
      } else {
        toast.success(`Saved ${assignments.length + removals.length} change(s).`);
      }
      setPendingChanges({});
    } catch (err) {
      toast.error('Failed to save group assignments.');
      console.error(err);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createGroup.mutateAsync({
        name: newGroupName.trim(),
        type: newGroupType,
        gender: newGroupGender === MIXED_GENDER ? null : newGroupGender,
        sortOrder: newGroupType === 'TRAINING' ? trainingGroups.filter((g) => g.gender === newGroupGender).length : otherGroups.length,
      });
      setNewGroupName('');
      setNewGroupType('TRAINING');
      setNewGroupOpen(false);
      toast.success('Group created.');
    } catch (err) {
      toast.error('Failed to create group.');
      console.error(err);
    }
  };

  const handleCopyFromPreviousSeason = async () => {
    if (!previousSeason?.id || !seasonId) return;
    try {
      const result = await copyFromSeason.mutateAsync({ fromSeasonId: previousSeason.id, toSeasonId: seasonId });
      toast.success((result as { msg?: string }).msg || 'Copied groups from last season.');
    } catch (err) {
      toast.error('Failed to copy groups from last season.');
      console.error(err);
    }
  };

  const openEdit = (group: Group) => {
    setEditTarget(group);
    setEditName(group.name);
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !editName.trim()) return;
    try {
      await updateGroup.mutateAsync({ groupId: editTarget.id, name: editName.trim() });
      toast.success('Group updated.');
      setEditTarget(null);
    } catch (err) {
      toast.error('Failed to update group.');
      console.error(err);
    }
  };

  const handleArchiveToggle = async (group: Group) => {
    try {
      await updateGroup.mutateAsync({ groupId: group.id, archived: !group.archived });
      toast.success(group.archived ? 'Group restored.' : 'Group archived.');
    } catch (err) {
      toast.error('Failed to update group.');
      console.error(err);
    }
  };

  const handleDeleteGroup = async (group: Group) => {
    if (!window.confirm(`Delete "${group.name}"? This can't be undone.`)) return;
    try {
      await deleteGroup.mutateAsync(group.id);
      toast.success('Group deleted.');
    } catch (err) {
      toast.error('Failed to delete group — it may still have athletes in it.');
      console.error(err);
    }
  };

  if (!activeYear) {
    return <div className="p-6 text-muted-foreground">Loading seasons…</div>;
  }

  if (!seasonId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Groups</h1>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-muted-foreground">
              {activeYear} doesn't have a season set up yet, so there's nowhere to save groups. Set it up first.
            </p>
            <Button onClick={handleInitializeSeason} disabled={creatingForSeason}>
              {creatingForSeason && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Set up {activeYear} season
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const loading = groupsLoading || membersLoading || rosterLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold">Groups</h1>
        <div className="flex items-center gap-2">
          <Select value={String(activeYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.year} value={String(s.year)}>{s.year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {trainingGroups.length === 0 && previousSeason?.id && (
            <Button variant="outline" onClick={handleCopyFromPreviousSeason} disabled={copyFromSeason.isPending}>
              <Copy className="h-4 w-4 mr-2" />
              Copy from {previousSeason.year}
            </Button>
          )}
          <Button variant="outline" onClick={() => setNewGroupOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Group
          </Button>
          <Button onClick={handleSave} disabled={changeCount === 0 || bulkAssign.isPending || removeMember.isPending}>
            {(bulkAssign.isPending || removeMember.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" />
            Save{changeCount > 0 ? ` (${changeCount})` : ''}
          </Button>
        </div>
      </div>

      {selectedAthletes.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium">{selectedAthletes.size} selected</span>
          <Select onValueChange={handleAssignSelectedTo}>
            <SelectTrigger className="w-[220px] h-8"><SelectValue placeholder="Assign to group…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {trainingGroups.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSelectedAthletes(new Set())}>Clear</Button>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground">Loading roster…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(['M', 'F'] as const).map((gender) => (
            <GenderColumn
              key={gender}
              gender={gender}
              athletes={athletes.filter((a) => a.gender === gender)}
              groups={trainingGroups.filter((g) => g.gender === gender || !g.gender)}
              archivedGroups={groups.filter((g) => g.type === 'TRAINING' && g.archived && (g.gender === gender || !g.gender))}
              displayedGroupFor={displayedGroupFor}
              selectedAthletes={selectedAthletes}
              setSelectedAthletes={setSelectedAthletes}
              onEdit={openEdit}
              onArchive={handleArchiveToggle}
              onDelete={handleDeleteGroup}
              onManageLeaders={setLeadersTarget}
            />
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Captain &amp; Custom Groups</h2>
        </div>
        {otherGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet — use "New Group" above and pick Captain or Custom as the type.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {otherGroups.map((g) => (
              <Card key={g.id}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {g.name}
                      <Badge variant="outline" className="text-[10px]">{g.type === 'CAPTAIN' ? 'Captain' : 'Custom'}</Badge>
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLeadersTarget(g)}>
                        <UserCog className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteGroup(g)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {g.activeMemberCount} member{g.activeMemberCount === 1 ? '' : 's'}
                    {g.leaders.length > 0 ? ` · led by ${g.leaders.map((l) => l.name || l.email).join(', ')}` : ''}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setMembersTarget(g)}>
                    Manage members
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
            <DialogDescription>Training groups reset every season and are gender-split. Captain and Custom groups can run alongside a training group.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Boys Blue" className="mt-1" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newGroupType} onValueChange={(v) => setNewGroupType(v as GroupType)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRAINING">Training</SelectItem>
                  <SelectItem value="CAPTAIN">Captain</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={newGroupGender} onValueChange={(v) => setNewGroupGender(v as 'M' | 'F' | typeof MIXED_GENDER)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Boys</SelectItem>
                  <SelectItem value="F">Girls</SelectItem>
                  <SelectItem value={MIXED_GENDER}>Mixed / not split</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewGroupOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim() || createGroup.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit group</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Name</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={!editName.trim() || updateGroup.isPending}>
              {updateGroup.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageLeadersDialog group={leadersTarget} seasonId={seasonId} onClose={() => setLeadersTarget(null)} />
      <ManageMembersDialog group={membersTarget} seasonId={seasonId} onClose={() => setMembersTarget(null)} roster={athletes} />
    </div>
  );
};

const GENDER_LABEL: Record<'M' | 'F', string> = { M: 'Boys', F: 'Girls' };

const GenderColumn: React.FC<{
  gender: 'M' | 'F';
  athletes: AthleteRow[];
  groups: Group[];
  archivedGroups: Group[];
  displayedGroupFor: (athleteId: string) => string;
  selectedAthletes: Set<string>;
  setSelectedAthletes: React.Dispatch<React.SetStateAction<Set<string>>>;
  onEdit: (group: Group) => void;
  onArchive: (group: Group) => void;
  onDelete: (group: Group) => void;
  onManageLeaders: (group: Group) => void;
}> = ({ gender, athletes, groups, archivedGroups, displayedGroupFor, selectedAthletes, setSelectedAthletes, onEdit, onArchive, onDelete, onManageLeaders }) => {
  const toggle = (athleteId: string) => {
    setSelectedAthletes((prev) => {
      const next = new Set(prev);
      if (next.has(athleteId)) next.delete(athleteId);
      else next.add(athleteId);
      return next;
    });
  };

  const columns = [
    { id: UNASSIGNED, name: 'Unassigned', group: null as Group | null },
    ...[...groups].sort((a, b) => a.sortOrder - b.sortOrder).map((g) => ({ id: g.id, name: g.name, group: g })),
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{GENDER_LABEL[gender]}</h2>
      {columns.map((col) => {
        const members = athletes.filter((a) => displayedGroupFor(a.id) === col.id);
        return (
          <Card key={col.id}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{col.name}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary">{members.length}</Badge>
                  {col.group && (
                    <>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onManageLeaders(col.group!)} title="Manage leaders">
                        <UserCog className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(col.group!)} title="Edit">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(col.group!)} title="Delete">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </CardTitle>
              {col.group?.leaders && col.group.leaders.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Led by {col.group.leaders.map((l) => l.name || l.email).join(', ')}
                </p>
              )}
            </CardHeader>
            <CardContent className="py-2 space-y-1">
              {members.length === 0 && <p className="text-xs text-muted-foreground py-2">No athletes</p>}
              {members.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer text-sm"
                >
                  <Checkbox checked={selectedAthletes.has(a.id)} onCheckedChange={() => toggle(a.id)} />
                  <span className="flex-1">{a.name}</span>
                  {a.grade && <span className="text-xs text-muted-foreground">{a.grade}</span>}
                  <span className="text-xs text-muted-foreground w-12 text-right">{formatTime(a.bestTime)}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        );
      })}
      {archivedGroups.length > 0 && (
        <div className="pt-1">
          <p className="text-xs font-medium text-muted-foreground mb-1">Archived</p>
          {archivedGroups.map((g) => (
            <div key={g.id} className="flex items-center justify-between text-xs text-muted-foreground px-1 py-1">
              <span>{g.name}</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onArchive(g)}>Restore</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ManageLeadersDialog: React.FC<{ group: Group | null; seasonId: string | null; onClose: () => void }> = ({ group, seasonId, onClose }) => {
  const { data: staff = [], isLoading: staffLoading } = useStaff();
  const assignLeader = useAssignLeader(seasonId);
  const removeLeader = useRemoveLeader(seasonId);
  const [selectedUserId, setSelectedUserId] = useState('');

  if (!group) return null;

  const leaderIds = new Set(group.leaders.map((l) => l.userId));
  const available = staff.filter((s) => !leaderIds.has(s.userId));

  const handleAdd = async () => {
    if (!selectedUserId) return;
    try {
      await assignLeader.mutateAsync({ groupId: group.id, userId: selectedUserId, primary: group.leaders.length === 0 });
      toast.success('Leader assigned.');
      setSelectedUserId('');
    } catch {
      toast.error('Could not assign leader.');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeLeader.mutateAsync({ groupId: group.id, userId });
      toast.success('Leader removed.');
    } catch {
      toast.error('Could not remove leader.');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leaders — {group.name}</DialogTitle>
          <DialogDescription>Coaches assigned here can edit this group and move athletes into it (volunteer coaches only for groups they lead).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {group.leaders.length === 0 && <p className="text-sm text-muted-foreground">No leaders assigned yet.</p>}
          {group.leaders.map((l) => (
            <div key={l.userId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span>
                {l.name || l.email}
                {l.primary && <Badge variant="secondary" className="ml-2 text-[10px]">Primary</Badge>}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemove(l.userId)} disabled={removeLeader.isPending}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder={staffLoading ? 'Loading staff…' : 'Add a coach…'} /></SelectTrigger>
              <SelectContent>
                {available.map((s) => (
                  <SelectItem key={s.userId} value={s.userId}>{s.name || s.email} ({s.role.replace('_', ' ').toLowerCase()})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={!selectedUserId || assignLeader.isPending}>
              {assignLeader.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ManageMembersDialog: React.FC<{ group: Group | null; seasonId: string | null; onClose: () => void; roster: AthleteRow[] }> = ({
  group,
  seasonId,
  onClose,
  roster,
}) => {
  const { data: members = [], isLoading: membersLoading } = useGroupMembers(group?.id ?? null);
  const addMember = useAddMember(seasonId);
  const removeMember = useRemoveMember(seasonId);
  const [selectedAthleteId, setSelectedAthleteId] = useState('');

  if (!group) return null;

  const memberIds = new Set(members.map((m) => m.athleteId));
  const available = roster.filter((a) => !memberIds.has(a.id));

  const handleAdd = async () => {
    if (!selectedAthleteId) return;
    try {
      await addMember.mutateAsync({ groupId: group.id, athleteId: selectedAthleteId });
      toast.success('Athlete added.');
      setSelectedAthleteId('');
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Members — {group.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {membersLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            members.map((m) => (
              <div key={m.membershipId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>{m.name}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemove(m.athleteId)} disabled={removeMember.isPending}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
          <div className="flex items-center gap-2 pt-2">
            <Select value={selectedAthleteId} onValueChange={setSelectedAthleteId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Add an athlete…" /></SelectTrigger>
              <SelectContent>
                {available.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={!selectedAthleteId || addMember.isPending}>
              {addMember.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GroupsPage;
