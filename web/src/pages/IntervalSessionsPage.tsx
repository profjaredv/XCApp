import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Archive, Loader2, X, Check, ClipboardList, Copy } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { useGroups, useGroupMembers } from '@/hooks/useGroups';
import {
  useIntervalSessions,
  useCreateIntervalSession,
  useDeleteIntervalSession,
  useSetIntervalSessionArchived,
  useDuplicateIntervalSession,
} from '@/hooks/useIntervalSessions';
import type { IntervalSession, IntervalZone } from '@/api/intervalSessionService';
import { formatDateShort } from '@/lib/formatUtils';

// Coach-adoption pass item 6: replaces the printed sheet a coach fills in
// by hand at the track. This page is the session LIST only — three states
// per session: create (the dialog below), manage entries (its own
// full-screen route, interval-sessions/:sessionId, so filling one session
// in on a phone isn't competing with every other session on the same
// screen), and archive (soft-hide once a session is done, same pattern as
// Group.archived — never deleted, just out of the way).

const ZONE_LABEL: Record<IntervalZone, string> = {
  threshold: 'Threshold',
  interval: 'Interval',
  repetition: 'Repetition',
};

const AD_HOC = '__ad_hoc__';

interface NewSessionForm {
  groupId: string; // AD_HOC or a group id
  date: string;
  title: string;
  repDistanceM: string;
  zone: IntervalZone;
}

const EMPTY_NEW_SESSION: NewSessionForm = {
  groupId: AD_HOC,
  date: new Date().toISOString().slice(0, 10),
  title: '',
  repDistanceM: '800',
  zone: 'interval',
};

const SessionSummaryCard: React.FC<{
  session: IntervalSession;
  onManage: () => void;
  onDuplicate: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  archiving: boolean;
  deleting: boolean;
}> = ({ session, onManage, onDuplicate, onArchiveToggle, onDelete, archiving, deleting }) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-2 py-4">
      <div>
        <CardTitle className="text-base">{session.title}</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDateShort(session.date)} · {session.groupName ?? 'Ad hoc'} · {session.repDistanceM}m ·{' '}
          {ZONE_LABEL[session.zone]} pace · {session.entries.length} athlete{session.entries.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={onDuplicate} title="Duplicate for another group">
          <Copy className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onArchiveToggle} disabled={archiving} title="Archive">
          <Archive className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} disabled={deleting} title="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      <Button onClick={onManage} size="sm">
        <ClipboardList className="h-4 w-4 mr-2" />
        Manage entries
      </Button>
    </CardContent>
  </Card>
);

const IntervalSessionsPage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { data: context } = useTeamContext();
  const { data: seasons = [] } = useAvailableSeasons(context?.team?.id);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const activeYear = selectedYear ?? context?.activeSeason ?? seasons[0]?.year ?? null;
  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;

  const { data: groups = [] } = useGroups(seasonId);
  const trainingGroups = groups.filter((g) => g.type === 'TRAINING' && !g.archived);
  const { data: sessions = [], isLoading } = useIntervalSessions(seasonId);

  const activeSessions = sessions.filter((s) => !s.archived);
  const archivedSessions = sessions.filter((s) => s.archived);

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [form, setForm] = useState<NewSessionForm>(EMPTY_NEW_SESSION);
  const { data: groupMembers = [] } = useGroupMembers(form.groupId !== AD_HOC ? form.groupId : null);

  const [duplicateSource, setDuplicateSource] = useState<IntervalSession | null>(null);
  const [duplicateGroupId, setDuplicateGroupId] = useState(AD_HOC);
  const [duplicateDate, setDuplicateDate] = useState(new Date().toISOString().slice(0, 10));

  const createSession = useCreateIntervalSession(seasonId);
  const deleteSession = useDeleteIntervalSession(seasonId);
  const setArchived = useSetIntervalSessionArchived(seasonId);
  const duplicateSession = useDuplicateIntervalSession(seasonId);

  // Opened full screen from Schedule's "Interval Sessions" header button,
  // or from the day editor's Interval Sheet select via a new tab (see
  // router/index.tsx — this route is deliberately outside <Layout>, no
  // sidebar/header).
  const handleClose = () => navigate(teamPath('/schedule'));
  const handleSave = () => {
    toast.success('All changes saved.');
  };

  const topBar = (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background px-6 py-3">
      <h1 className="text-lg font-semibold">Interval Sessions</h1>
      <div className="flex items-center gap-2">
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

  const handleCreate = async () => {
    if (!seasonId || !form.title.trim() || !form.repDistanceM) return;
    try {
      const created = await createSession.mutateAsync({
        seasonId,
        groupId: form.groupId === AD_HOC ? null : form.groupId,
        date: form.date,
        title: form.title.trim(),
        repDistanceM: Number(form.repDistanceM),
        zone: form.zone,
        athleteIds: form.groupId !== AD_HOC ? groupMembers.map((m) => m.athleteId) : [],
      });
      toast.success('Session created.');
      setNewDialogOpen(false);
      setForm(EMPTY_NEW_SESSION);
      navigate(teamPath(`/interval-sessions/${created.id}`));
    } catch {
      toast.error('Could not create that session.');
    }
  };

  const handleArchiveToggle = async (session: IntervalSession) => {
    try {
      await setArchived.mutateAsync({ id: session.id, archived: !session.archived });
      toast.success(session.archived ? 'Session restored.' : 'Session archived.');
    } catch {
      toast.error('Could not update that session.');
    }
  };

  const handleDelete = async (session: IntervalSession) => {
    try {
      await deleteSession.mutateAsync(session.id);
      toast.success('Session deleted.');
    } catch {
      toast.error('Could not delete that session.');
    }
  };

  const openDuplicate = (session: IntervalSession) => {
    setDuplicateSource(session);
    setDuplicateGroupId(session.groupId ?? AD_HOC);
    setDuplicateDate(session.date.slice(0, 10));
  };

  const handleDuplicate = async () => {
    if (!duplicateSource) return;
    try {
      const created = await duplicateSession.mutateAsync({
        id: duplicateSource.id,
        groupId: duplicateGroupId === AD_HOC ? null : duplicateGroupId,
        date: duplicateDate,
      });
      toast.success('Session duplicated.');
      setDuplicateSource(null);
      navigate(teamPath(`/interval-sessions/${created.id}`));
    } catch {
      toast.error('Could not duplicate that session.');
    }
  };

  if (!activeYear || !seasonId) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-6 space-y-6">
          <p className="text-muted-foreground">No season set up yet — set one up from the Groups screen first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {topBar}
      <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Capture reps on a grid instead of paper — saved times log straight to each athlete's training log.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(activeYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.year} value={String(s.year)}>
                  {s.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setNewDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New session
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <p className="text-muted-foreground">No interval sessions yet this season.</p>
      ) : (
        <>
          {activeSessions.length === 0 ? (
            <p className="text-muted-foreground">No active sessions — everything's archived below.</p>
          ) : (
            <div className="space-y-4">
              {activeSessions.map((session) => (
                <SessionSummaryCard
                  key={session.id}
                  session={session}
                  onManage={() => navigate(teamPath(`/interval-sessions/${session.id}`))}
                  onDuplicate={() => openDuplicate(session)}
                  onArchiveToggle={() => handleArchiveToggle(session)}
                  onDelete={() => handleDelete(session)}
                  archiving={setArchived.isPending}
                  deleting={deleteSession.isPending}
                />
              ))}
            </div>
          )}

          {archivedSessions.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Archived</p>
              <div className="space-y-1">
                {archivedSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground truncate">
                      {session.title} — {formatDateShort(session.date)}
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs flex-shrink-0" onClick={() => handleArchiveToggle(session)}>
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Dialog
        open={newDialogOpen}
        onOpenChange={(open) => {
          setNewDialogOpen(open);
          if (!open) setForm(EMPTY_NEW_SESSION);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New interval session</DialogTitle>
            <DialogDescription>Picking a group seeds the grid with its current roster — add anyone else after.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                className="mt-1"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="5 x 800m Tempo"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input type="date" className="mt-1" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <Label>Group</Label>
                <Select value={form.groupId} onValueChange={(v) => setForm({ ...form, groupId: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AD_HOC}>Ad hoc (add athletes manually)</SelectItem>
                    {trainingGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Rep distance (m)</Label>
                <Input
                  type="number"
                  min="1"
                  className="mt-1"
                  value={form.repDistanceM}
                  onChange={(e) => setForm({ ...form, repDistanceM: e.target.value })}
                />
              </div>
              <div>
                <Label>Suggested-pace zone</Label>
                <Select value={form.zone} onValueChange={(v) => setForm({ ...form, zone: v as IntervalZone })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ZONE_LABEL) as IntervalZone[]).map((z) => (
                      <SelectItem key={z} value={z}>
                        {ZONE_LABEL[z]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!form.title.trim() || createSession.isPending}>
              {createSession.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!duplicateSource} onOpenChange={(open) => !open && setDuplicateSource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate "{duplicateSource?.title}"</DialogTitle>
            <DialogDescription>
              Creates a new, independent session with the same title, rep distance, and zone — pick who's running it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Date</Label>
              <Input type="date" className="mt-1" value={duplicateDate} onChange={(e) => setDuplicateDate(e.target.value)} />
            </div>
            <div>
              <Label>Group</Label>
              <Select value={duplicateGroupId} onValueChange={setDuplicateGroupId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AD_HOC}>Ad hoc (add athletes manually)</SelectItem>
                  {trainingGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateSource(null)}>
              Cancel
            </Button>
            <Button onClick={handleDuplicate} disabled={duplicateSession.isPending}>
              {duplicateSession.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default IntervalSessionsPage;
