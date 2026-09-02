import React, { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { Plus, Copy, Save, Loader2, Pencil, Trash2, UserCog, X, ChevronDown, ChevronRight, EyeOff, Eye, Dumbbell, Search, CalendarCheck } from 'lucide-react';
import { AthletePicker } from '@/components/groups/AthletePicker';
import { DynamicGroups } from '@/components/groups/DynamicGroups';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { useExpandedSections } from '@/hooks/useExpandedSections';
import { matchesQuery } from '@/lib/athleteSearch';
import { useSeasonSelection } from '@/contexts/SeasonContext';
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
  useSeasonCaptains,
  useAssignLeader,
  useRemoveLeader,
  useAddMember,
  useRemoveMember,
  useXTrainingRoster,
  useSendToXTraining,
} from '@/hooks/useGroups';
import { seasonBestTime, formatTime, type Group, type GroupType } from '@/api/groupService';
import { gradeLabel } from '@/lib/seasonUtils';
import { formatDateShort } from '@/lib/formatUtils';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTeamPath } from '@/hooks/useTeamRoute';

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
// A held value for the assign trigger so it always reads "Assign to
// group…" rather than sticking on whatever was picked last — this control
// performs an action, it does not represent a state.
const ASSIGN_PLACEHOLDER = '__assign__';
const MIXED_GENDER = '__mixed__';
const NO_CAPTAIN = '__none__';

const captainAutoName = (name: string) => `${name}'s Group`;

interface AthleteRow {
  id: string;
  name: string;
  gender: string | null;
  grade: number | null;
  bestTime: number | null;
}

const displayName = (a: { name: string; preferredName?: string | null }) => a.preferredName || a.name;

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
  X_TRAINING: 'Cross Training',
};

const AthleteGroupsView: React.FC = () => {
  const { data: groups, isLoading } = useMyGroups();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your groups…</p>;
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl md:text-4xl font-bold">Groups</h1>
        <p className="text-muted-foreground">
          You're not currently assigned to a group. Check with your coach if you think that's wrong.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl md:text-4xl font-bold">Groups</h1>
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
                  <span className="text-muted-foreground">{member.grade ? gradeLabel(member.grade) : ''}</span>
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
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { currentUser } = useAuth();
  const { seasons, activeYear } = useSeasonSelection();
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
  const addMember = useAddMember(seasonId);
  const removeMember = useRemoveMember(seasonId);
  const copyFromSeason = useCopyGroupsFromSeason(seasonId);
  const { data: captains = [] } = useSeasonCaptains(seasonId);
  const { data: xTrainingRoster } = useXTrainingRoster(seasonId);

  // Which sections are open, remembered per device. The board and the
  // groups a coach leads start open — they are why this screen exists —
  // and everything below them starts shut, which is most of a phone screen
  // saved before the coach has scrolled to what they came for.
  const { isOpen, toggle } = useExpandedSections('xc_groups_open_sections', ['board', 'my-groups']);

  const [selectedAthletes, setSelectedAthletes] = useState<Set<string>>(new Set());
  const [athleteQuery, setAthleteQuery] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({}); // athleteId -> groupId | UNASSIGNED
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<GroupType>('TRAINING');
  const [newGroupGender, setNewGroupGender] = useState<'M' | 'F' | typeof MIXED_GENDER>('M');
  const [selectedCaptainId, setSelectedCaptainId] = useState(NO_CAPTAIN);
  const [creatingForSeason, setCreatingForSeason] = useState(false);
  const [xTrainingRosterOpen, setXTrainingRosterOpen] = useState(false);
  const [xTrainingSendTarget, setXTrainingSendTarget] = useState<AthleteRow | null>(null);

  // Captains who don't already lead a CAPTAIN-type group this season — the
  // whole point of this picker is to skip retyping a name AND skip a
  // separate "Manage members" trip, so a captain who already has a group
  // doesn't need to appear again here.
  const availableCaptains = useMemo(() => captains.filter((c) => !c.existingGroup), [captains]);

  const handleCaptainSelect = (captainId: string) => {
    const previous = captains.find((c) => c.athleteId === selectedCaptainId);
    setSelectedCaptainId(captainId);
    if (captainId === NO_CAPTAIN) return;
    const captain = captains.find((c) => c.athleteId === captainId);
    if (!captain) return;
    // Only overwrite the name field if it's still blank or still matches
    // the previously auto-filled name — a coach who already typed/edited
    // their own name keeps it even after browsing the captain dropdown.
    setNewGroupName((prev) => (prev.trim() === '' || (previous && prev === captainAutoName(previous.name)) ? captainAutoName(captain.name) : prev));
  };

  const [editTarget, setEditTarget] = useState<Group | null>(null);
  const [editName, setEditName] = useState('');
  const [leadersTarget, setLeadersTarget] = useState<Group | null>(null);
  const [membersTarget, setMembersTarget] = useState<Group | null>(null);

  // Current TRAINING group id for each athlete, before any local pending
  // edits — scoped to TRAINING only. The board below (and pendingChanges/
  // bulk-assign) only ever deals in TRAINING groups; an athlete can also
  // independently belong to a CAPTAIN group and a CUSTOM group at the same
  // time (see lib/groups.js's moveAthleteToGroup — "active" is scoped per
  // GroupType). Without this filter, membersByGroup's non-TRAINING entries
  // would win the last-write race in this map (object key order is
  // unspecified) and an athlete added to e.g. a Custom "Cross Training"
  // group could silently vanish from every TRAINING board column, since
  // their tracked groupId would then match no TRAINING column and not
  // UNASSIGNED either.
  const trainingGroupIds = useMemo(
    () => new Set(groups.filter((g) => g.type === 'TRAINING').map((g) => g.id)),
    [groups]
  );
  const currentGroupByAthlete = useMemo(() => {
    const map = new Map<string, string>();
    for (const [groupId, members] of Object.entries(membersByGroup)) {
      if (!trainingGroupIds.has(groupId)) continue;
      for (const m of members) map.set(m.athleteId, groupId);
    }
    return map;
  }, [membersByGroup, trainingGroupIds]);

  const athletes: AthleteRow[] = useMemo(
    () =>
      roster.map((a) => ({
        id: a.id,
        name: displayName(a),
        gender: a.gender,
        grade: a.grade,
        bestTime: seasonBestTime(a),
      })),
    [roster]
  );

  // Filtered once here rather than inside each column, so both genders
  // and every group narrow together and the empty state below can tell the
  // difference between "no match anywhere" and "no match in this column".
  const visibleAthletes = useMemo(
    () => athletes.filter((a) => matchesQuery(a.name, athleteQuery)),
    [athletes, athleteQuery]
  );

  const displayedGroupFor = (athleteId: string) => pendingChanges[athleteId] ?? currentGroupByAthlete.get(athleteId) ?? UNASSIGNED;

  const trainingGroups = groups.filter((g) => g.type === 'TRAINING' && !g.archived);
  // X_TRAINING gets its own dedicated "Cross Training today" box above
  // (auto-provisioned, bounded memberships, date-aware "active today"
  // logic) rather than the generic Captain/Custom "Manage members" card,
  // which reads current members via a plain endDate: null list — that
  // would miss anyone whose stint hasn't expired yet but is bounded.
  const otherGroups = groups.filter((g) => g.type !== 'TRAINING' && g.type !== 'X_TRAINING' && !g.archived);
  const changeCount = Object.keys(pendingChanges).length;

  // "My Groups" — whatever this coach is personally assigned to lead, any
  // type, shown first thing on the page. A head coach who isn't personally
  // a leader of anything just doesn't get this section (no manufactured
  // empty state) and sees the page exactly as before.
  const myLedGroups = useMemo(
    () => groups.filter((g) => !g.archived && g.leaders.some((l) => l.userId === currentUser?.uid)),
    [groups, currentUser?.uid]
  );

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

  // Training assignment is exclusive: an athlete is in exactly one training
  // group, so it goes through pendingChanges and the board re-renders as a
  // preview the coach saves or discards.
  const handleAssignSelectedTo = (groupId: string) => {
    setPendingChanges((prev) => {
      const next = { ...prev };
      for (const athleteId of selectedAthletes) next[athleteId] = groupId;
      return next;
    });
    setSelectedAthletes(new Set());
  };

  // Captain and custom membership is ADDITIVE — "Captain and Custom groups
  // can run alongside a training group", per the New Group dialog's own
  // description. So these cannot go through pendingChanges: that map is
  // one-group-per-athlete and drives the training board, so routing a
  // captain group through it would replace the athlete's training group
  // and then make them vanish from the board entirely, since a captain
  // group has no column.
  //
  // Writing immediately rather than staging is deliberate for the same
  // reason: there is no board column to preview the change in, so a
  // pending state would be invisible until Save and look like nothing
  // happened.
  const handleAddSelectedToGroup = async (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    const ids = [...selectedAthletes];
    setSelectedAthletes(new Set());
    const results = await Promise.allSettled(
      ids.map((athleteId) => addMember.mutateAsync({ groupId, athleteId }))
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      toast.error(`${failed} of ${ids.length} could not be added to ${group?.name ?? 'that group'}.`);
    } else {
      toast.success(`Added ${ids.length} to ${group?.name ?? 'the group'}.`);
    }
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
      const group = await createGroup.mutateAsync({
        name: newGroupName.trim(),
        type: newGroupType,
        gender: newGroupGender === MIXED_GENDER ? null : newGroupGender,
        sortOrder: newGroupType === 'TRAINING' ? trainingGroups.filter((g) => g.gender === newGroupGender).length : otherGroups.length,
      });
      // Picking a captain above isn't just a naming shortcut — it also
      // saves the separate "Manage members" trip a coach used to need to
      // actually put that captain in their own group.
      if (newGroupType === 'CAPTAIN' && selectedCaptainId !== NO_CAPTAIN) {
        await addMember.mutateAsync({ groupId: group.id, athleteId: selectedCaptainId });
      }
      setNewGroupName('');
      setNewGroupType('TRAINING');
      setSelectedCaptainId(NO_CAPTAIN);
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
        <h1 className="text-3xl md:text-4xl font-bold">Groups</h1>
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
        <h1 className="text-3xl md:text-4xl font-bold">Groups</h1>
        <div className="flex items-center gap-2">
          {trainingGroups.length === 0 && previousSeason?.id && (
            <Button variant="outline" onClick={handleCopyFromPreviousSeason} disabled={copyFromSeason.isPending}>
              <Copy className="h-4 w-4 mr-2" />
              Copy from {previousSeason.year}
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowUnassigned((v) => !v)}>
            {showUnassigned ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {showUnassigned ? 'Hide' : 'Show'} Unassigned
          </Button>
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

      {/* Lists the data draws, above the groups a coach builds by hand:
          fastest, biggest gains, who is next up for the scoring seven.
          Nothing here is a membership — see components/groups/DynamicGroups.tsx. */}
      <DynamicGroups season={activeYear ?? null} />

      {myLedGroups.length > 0 && (
        <CollapsibleSection
          id="my-groups"
          title="My Groups"
          count={myLedGroups.length}
          open={isOpen('my-groups')}
          onToggle={() => toggle('my-groups')}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {myLedGroups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                onOpen={() => setMembersTarget(g)}
                onEdit={() => openEdit(g)}
                onManageLeaders={() => setLeadersTarget(g)}
                onDelete={() => handleDeleteGroup(g)}
                onOpenDay={() => navigate(teamPath(`/group/${g.id}`))}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      <button
        type="button"
        onClick={() => setXTrainingRosterOpen(true)}
        className="w-full flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        <span className="flex items-center gap-2 font-medium text-sm">
          <Dumbbell className="h-4 w-4 text-muted-foreground" />
          Cross Training today
        </span>
        <Badge variant={xTrainingRoster && xTrainingRoster.members.length > 0 ? 'default' : 'secondary'}>
          {xTrainingRoster?.members.length ?? 0}
        </Badge>
      </button>

      {selectedAthletes.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-background border border-border rounded-lg px-4 py-2.5 shadow-md">
          <span className="text-sm font-medium">{selectedAthletes.size} selected</span>
          {/* Captain and custom groups were missing here entirely — the
              list only ever mapped trainingGroups, so the only way to put
              someone in a captain group was to open that group's own
              dialog and re-find them. Labelled sections because the two
              halves do different things: the top moves an athlete between
              training groups, the bottom adds them to a group they hold
              alongside it. */}
          <Select
            value={ASSIGN_PLACEHOLDER}
            onValueChange={(value) => {
              if (value === ASSIGN_PLACEHOLDER) return;
              if (value === UNASSIGNED || trainingGroups.some((g) => g.id === value)) {
                handleAssignSelectedTo(value);
              } else {
                void handleAddSelectedToGroup(value);
              }
            }}
          >
            <SelectTrigger className="w-[240px] h-8"><SelectValue placeholder="Assign to group…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ASSIGN_PLACEHOLDER} disabled>Assign to group…</SelectItem>
              <SelectGroup>
                <SelectLabel>Move to training group</SelectLabel>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {trainingGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectGroup>
              {otherGroups.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Also add to</SelectLabel>
                  {otherGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {g.type === 'CAPTAIN' ? 'captain' : 'custom'}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSelectedAthletes(new Set())}>Clear</Button>
        </div>
      )}

      {/* Assigning athletes above only stages the change locally — this bar
          is the one thing guaranteed to still be on screen (fixed, not
          sticky-in-flow) no matter how far the coach has scrolled down the
          board, so "I assigned them but it didn't save" can't happen from
          losing track of the Save button up in the page header. */}
      {changeCount > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-background border border-border rounded-lg px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium">
            {changeCount} unsaved change{changeCount === 1 ? '' : 's'}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPendingChanges({})} disabled={bulkAssign.isPending || removeMember.isPending}>
            Discard
          </Button>
          <Button size="sm" onClick={handleSave} disabled={bulkAssign.isPending || removeMember.isPending}>
            {(bulkAssign.isPending || removeMember.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      )}

      <CollapsibleSection
        id="board"
        title="Training groups"
        count={trainingGroups.length}
        open={isOpen('board')}
        onToggle={() => toggle('board')}
      >
        <div className="space-y-4">
        {/* Find an athlete without knowing which group they are in — on a
            ninety-name board split across two columns and several groups,
            scanning for one runner was the slowest thing on this page.
            Filters rather than jumps: seeing WHICH group the match sits in
            is usually the actual question. */}
        {!loading && athletes.length > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={athleteQuery}
              onChange={(e) => setAthleteQuery(e.target.value)}
              placeholder="Find an athlete…"
              className="pl-9"
            />
            {athleteQuery.trim() && (
              <button
                type="button"
                onClick={() => setAthleteQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {!loading && athleteQuery.trim() && visibleAthletes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No athlete matching “{athleteQuery.trim()}” on this season's roster.
          </p>
        )}

        {loading ? (
          <div className="text-muted-foreground">Loading roster…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(['M', 'F'] as const).map((gender) => (
              <GenderColumn
                key={gender}
                gender={gender}
                athletes={visibleAthletes.filter((a) => a.gender === gender)}
                groups={trainingGroups.filter((g) => g.gender === gender || !g.gender)}
                archivedGroups={groups.filter((g) => g.type === 'TRAINING' && g.archived && (g.gender === gender || !g.gender))}
                displayedGroupFor={displayedGroupFor}
                selectedAthletes={selectedAthletes}
                setSelectedAthletes={setSelectedAthletes}
                showUnassigned={showUnassigned}
                onSendToXTraining={setXTrainingSendTarget}
                onEdit={openEdit}
                onArchive={handleArchiveToggle}
                onDelete={handleDeleteGroup}
                onManageLeaders={setLeadersTarget}
                onOpenDay={(group) => navigate(teamPath(`/group/${group.id}`))}
              />
            ))}
          </div>
        )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="captain-custom"
        title="Captain & Custom Groups"
        count={otherGroups.length}
        open={isOpen('captain-custom')}
        onToggle={() => toggle('captain-custom')}
      >
        {otherGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet — use "New Group" above and pick Captain or Custom as the type.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {otherGroups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                onOpen={() => setMembersTarget(g)}
                onEdit={() => openEdit(g)}
                onManageLeaders={() => setLeadersTarget(g)}
                onDelete={() => handleDeleteGroup(g)}
                onOpenDay={() => navigate(teamPath(`/group/${g.id}`))}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

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
            {newGroupType === 'CAPTAIN' && (
              <div>
                <Label>Captain</Label>
                <Select value={selectedCaptainId} onValueChange={handleCaptainSelect}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={availableCaptains.length === 0 ? 'No captains without a group' : 'Pick a captain…'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CAPTAIN}>None — I'll name this myself</SelectItem>
                    {availableCaptains.map((c) => (
                      <SelectItem key={c.athleteId} value={c.athleteId}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Fills in the name below and adds them as a member — no retyping. Captains already leading a group
                  aren't listed again.
                </p>
              </div>
            )}
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
            <Button onClick={handleCreateGroup} disabled={!newGroupName.trim() || createGroup.isPending || addMember.isPending}>Create</Button>
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
      <ManageMembersDialog
        group={membersTarget}
        seasonId={seasonId}
        onClose={() => setMembersTarget(null)}
        roster={athletes}
        allGroups={groups}
      />
      <XTrainingSendDialog
        athlete={xTrainingSendTarget}
        seasonId={seasonId}
        onClose={() => setXTrainingSendTarget(null)}
      />
      <XTrainingRosterDialog
        open={xTrainingRosterOpen}
        onClose={() => setXTrainingRosterOpen(false)}
        seasonId={seasonId}
      />
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
  showUnassigned: boolean;
  onSendToXTraining: (athlete: AthleteRow) => void;
  onEdit: (group: Group) => void;
  onArchive: (group: Group) => void;
  onDelete: (group: Group) => void;
  onManageLeaders: (group: Group) => void;
  onOpenDay: (group: Group) => void;
}> = ({ gender, athletes, groups, archivedGroups, displayedGroupFor, selectedAthletes, setSelectedAthletes, showUnassigned, onSendToXTraining, onEdit, onArchive, onDelete, onManageLeaders, onOpenDay }) => {
  const toggle = (athleteId: string) => {
    setSelectedAthletes((prev) => {
      const next = new Set(prev);
      if (next.has(athleteId)) next.delete(athleteId);
      else next.add(athleteId);
      return next;
    });
  };

  // Per-card collapse — a coach with a big roster wants to fold away a
  // group they aren't actively working with, without losing the member
  // count. Collapsed by column id, not persisted — a fresh page load
  // always starts everything expanded.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const columns = [
    ...(showUnassigned ? [{ id: UNASSIGNED, name: 'Unassigned', group: null as Group | null }] : []),
    ...[...groups].sort((a, b) => a.sortOrder - b.sortOrder).map((g) => ({ id: g.id, name: g.name, group: g })),
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{GENDER_LABEL[gender]}</h2>
      {columns.map((col) => {
        const members = athletes.filter((a) => displayedGroupFor(a.id) === col.id);
        const isCollapsed = collapsedIds.has(col.id);
        return (
          <Card key={col.id}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(col.id)}
                  className="flex items-center gap-1.5 hover:text-foreground/80"
                >
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span>{col.name}</span>
                </button>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary">{members.length}</Badge>
                  {col.group && (
                    <>
                      {/* The day view, from the board a coach is already
                          looking at — who is here, last times, today's
                          sheet. */}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpenDay(col.group!)} title="Today">
                        <CalendarCheck className="h-3 w-3" />
                      </Button>
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
              {!isCollapsed && col.group?.leaders && col.group.leaders.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Led by {col.group.leaders.map((l) => l.name || l.email).join(', ')}
                </p>
              )}
            </CardHeader>
            {!isCollapsed && (
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      title="Send to Cross Training"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSendToXTraining(a);
                      }}
                    >
                      <Dumbbell className="h-3.5 w-3.5" />
                    </Button>
                  </label>
                ))}
              </CardContent>
            )}
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

// Shared by "My Groups" and "Captain & Custom Groups" — clicking anywhere
// on the card opens the roster (ManageMembersDialog, via onOpen), which is
// also where add/move/remove live; the icon buttons are separate smaller
// actions (rename, leaders, delete) that stop the click from bubbling up
// to onOpen. The TRAINING board's own cards (GenderColumn, above) already
// have their own click-to-expand-inline behavior and don't use this.
const GroupCard: React.FC<{
  group: Group;
  onOpen: () => void;
  onEdit: () => void;
  onManageLeaders: () => void;
  onDelete: () => void;
  onOpenDay: () => void;
}> = ({ group, onOpen, onEdit, onManageLeaders, onDelete, onOpenDay }) => {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer hover:bg-accent/40 transition-colors"
    >
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            {group.name}
            <Badge variant="outline" className="text-[10px]">{GROUP_TYPE_LABEL[group.type]}</Badge>
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={stop(onManageLeaders)} title="Manage leaders">
              <UserCog className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={stop(onEdit)} title="Rename">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={stop(onDelete)} title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2 py-2">
        <p className="text-xs text-muted-foreground">
          {group.activeMemberCount} member{group.activeMemberCount === 1 ? '' : 's'}
          {group.leaders.length > 0 ? ` · led by ${group.leaders.map((l) => l.name || l.email).join(', ')}` : ''}
        </p>
        {/* The card opens the roster; this opens the group's afternoon —
            who is here, what they last ran, today's interval sheet. */}
        <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={stop(onOpenDay)}>
          <CalendarCheck className="mr-1 h-3.5 w-3.5" />
          Today
        </Button>
      </CardContent>
    </Card>
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
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
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
          </div>
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

const MOVE_PLACEHOLDER = '__move__';

const ManageMembersDialog: React.FC<{
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

const X_TRAINING_DAY_OPTIONS = [
  { value: '1', label: 'Today only' },
  { value: '2', label: 'Next 2 days' },
  { value: '3', label: 'Next 3 days' },
  { value: '5', label: 'Next 5 days' },
  { value: '7', label: 'Next 7 days (1 week)' },
  { value: '14', label: 'Next 14 days (2 weeks)' },
];

// The "click XTraining" flow: the coach leading this athlete's training
// group sends them to cross-training, today or for the next N days, with
// a reason — a bounded GroupMembership that expires on its own (see
// backend POST /groups/x-training). Authorization is enforced server-side
// against the athlete's current training group, not checked here — a
// volunteer coach who isn't its leader just gets a 403 toast back.
const XTrainingSendDialog: React.FC<{
  athlete: AthleteRow | null;
  seasonId: string | null;
  onClose: () => void;
}> = ({ athlete, seasonId, onClose }) => {
  const [days, setDays] = useState('1');
  const [reason, setReason] = useState('');
  const sendToXTraining = useSendToXTraining(seasonId);

  if (!athlete) return null;

  const handleClose = () => {
    onClose();
    setDays('1');
    setReason('');
  };

  const handleSend = async () => {
    if (!reason.trim()) return;
    try {
      await sendToXTraining.mutateAsync({ athleteId: athlete.id, days: Number(days), reason: reason.trim() });
      toast.success(`${athlete.name} sent to Cross Training.`);
      handleClose();
    } catch (err) {
      const message = (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ?? 'Could not send to Cross Training.';
      toast.error(message);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send {athlete.name} to Cross Training</DialogTitle>
          <DialogDescription>
            Their training group membership is untouched — this runs alongside it and reverts on its own when the
            window above ends.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Duration</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {X_TRAINING_DAY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. shin splints, coach's call to cross-train ahead of Saturday's meet"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={!reason.trim() || sendToXTraining.isPending}>
            {sendToXTraining.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// The "official box": any coach can open this to see who's supposed to be
// in cross-training today and why, regardless of who sent them there or
// who's covering it. Members are already scoped to "active today" by the
// backend (GET /groups/x-training/:seasonId uses getActiveMembersOf, not
// a plain endDate: null list), so nothing here needs its own date math.
const XTrainingRosterDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  seasonId: string | null;
}> = ({ open, onClose, seasonId }) => {
  const { data, isLoading } = useXTrainingRoster(seasonId);
  const removeMember = useRemoveMember(seasonId);

  const handleReturn = async (athleteId: string, name: string) => {
    if (!data?.group) return;
    try {
      await removeMember.mutateAsync({ groupId: data.group.id, athleteId });
      toast.success(`${name} returned to training.`);
    } catch {
      toast.error('Could not return that athlete to training.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4" />
            Cross Training today
          </DialogTitle>
          <DialogDescription>Who's cross-training right now, why, and when they're expected back.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !data || data.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody is in cross-training right now.</p>
          ) : (
            data.members.map((m) => (
              <div key={m.athleteId} className="rounded-md border px-3 py-2 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{m.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleReturn(m.athleteId, m.name)}
                    disabled={removeMember.isPending}
                  >
                    Return to training
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {m.trainingGroup ? `Normally in ${m.trainingGroup.name}` : 'No current training group on record'}
                  {' · back '}
                  {formatDateShort(m.until)}
                </p>
                {m.reason && <p className="text-xs text-muted-foreground italic">"{m.reason}"</p>}
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GroupsPage;
