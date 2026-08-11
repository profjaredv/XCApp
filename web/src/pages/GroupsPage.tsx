import React, { useMemo, useState } from 'react';
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
import { Plus, Copy, Save, Loader2 } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { seasonService } from '@/api/seasonService';
import {
  useGroups,
  useAllGroupMembers,
  useRosterWithRaces,
  useCreateGroup,
  useBulkAssignGroups,
  useCopyGroupsFromSeason,
} from '@/hooks/useGroups';
import { seasonBestTime, formatTime, type Group, type GroupType } from '@/api/groupService';
import { useQueryClient } from '@tanstack/react-query';

// Bulk assignment screen (T2, Team Management handoff): "Assigning 130
// athletes one modal at a time is how a feature dies." The doc describes
// drag-and-drop; this ships multi-select + assign as the functional core
// first — genuinely faster than dragging for a real bulk move — with
// drag-and-drop left as a stretch goal on top rather than a blocker.

const UNASSIGNED = '__unassigned__';

interface AthleteRow {
  id: string;
  name: string;
  gender: string | null;
  grade: number | null;
  bestTime: number | null;
}

const GroupsPage: React.FC = () => {
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
  const bulkAssign = useBulkAssignGroups(seasonId);
  const copyFromSeason = useCopyGroupsFromSeason(seasonId);

  const [selectedAthletes, setSelectedAthletes] = useState<Set<string>>(new Set());
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({}); // athleteId -> groupId | UNASSIGNED
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupGender, setNewGroupGender] = useState<'M' | 'F'>('M');
  const [creatingForSeason, setCreatingForSeason] = useState(false);

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
    const assignments = Object.entries(pendingChanges)
      .filter(([, groupId]) => groupId !== UNASSIGNED)
      .map(([athleteId, groupId]) => ({ athleteId, groupId }));
    if (assignments.length === 0) {
      setPendingChanges({});
      return;
    }
    try {
      const result = await bulkAssign.mutateAsync(assignments);
      toast.success(result.msg || `Assigned ${assignments.length} athletes.`);
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
        type: 'TRAINING' as GroupType,
        gender: newGroupGender,
        sortOrder: trainingGroups.filter((g) => g.gender === newGroupGender).length,
      });
      setNewGroupName('');
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
          <Button onClick={handleSave} disabled={changeCount === 0 || bulkAssign.isPending}>
            {bulkAssign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
              displayedGroupFor={displayedGroupFor}
              selectedAthletes={selectedAthletes}
              setSelectedAthletes={setSelectedAthletes}
            />
          ))}
        </div>
      )}

      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New training group</DialogTitle>
            <DialogDescription>Groups reset every season and are gender-split.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Boys Blue" className="mt-1" />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={newGroupGender} onValueChange={(v) => setNewGroupGender(v as 'M' | 'F')}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Boys</SelectItem>
                  <SelectItem value="F">Girls</SelectItem>
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
    </div>
  );
};

const GENDER_LABEL: Record<'M' | 'F', string> = { M: 'Boys', F: 'Girls' };

const GenderColumn: React.FC<{
  gender: 'M' | 'F';
  athletes: AthleteRow[];
  groups: Group[];
  displayedGroupFor: (athleteId: string) => string;
  selectedAthletes: Set<string>;
  setSelectedAthletes: React.Dispatch<React.SetStateAction<Set<string>>>;
}> = ({ gender, athletes, groups, displayedGroupFor, selectedAthletes, setSelectedAthletes }) => {
  const toggle = (athleteId: string) => {
    setSelectedAthletes((prev) => {
      const next = new Set(prev);
      if (next.has(athleteId)) next.delete(athleteId);
      else next.add(athleteId);
      return next;
    });
  };

  const columns = [
    { id: UNASSIGNED, name: 'Unassigned' },
    ...[...groups].sort((a, b) => a.sortOrder - b.sortOrder),
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
                <Badge variant="secondary">{members.length}</Badge>
              </CardTitle>
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
    </div>
  );
};

export default GroupsPage;
