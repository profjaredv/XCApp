import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2, X, Check, ClipboardCheck, Trash2, Clock, MapPin } from 'lucide-react';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { usePracticeLocations, useCreatePracticeLocation } from '@/hooks/usePracticeLocations';
import { useAttendanceSessions, useCreateAttendanceSession, useDeleteAttendanceSession } from '@/hooks/useAttendance';
import type { AttendanceSession } from '@/api/attendanceService';
import { formatDateShort } from '@/lib/formatUtils';

// Digitized version of the physical attendance clipboard: a list of
// sessions (date/time/location) here, then one full-screen take-attendance
// page per session (AttendanceSessionPage) — same list/detail split as
// Interval Sessions, for the same reason (marking a roster on a phone
// shouldn't compete with every other session on the same screen).

const NONE = '__none__';
const NEW_LOCATION = '__new__';

const STATUS_LABEL: Record<string, string> = { PRESENT: 'Present', ABSENT: 'Absent', EXCUSED: 'Excused', LATE: 'Late' };

const SessionSummaryCard: React.FC<{
  session: AttendanceSession;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}> = ({ session, onOpen, onDelete, deleting }) => {
  const countsSummary = (['PRESENT', 'ABSENT', 'EXCUSED', 'LATE'] as const)
    .filter((k) => session.counts[k] > 0)
    .map((k) => `${session.counts[k]} ${STATUS_LABEL[k]}`)
    .join(' · ');

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 py-4">
        <div>
          <CardTitle className="text-base">{formatDateShort(session.date)}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {session.time && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {session.time}
              </span>
            )}
            {session.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {session.location.name}
              </span>
            )}
            <span>
              {session.recordCount} athlete{session.recordCount === 1 ? '' : 's'}
              {countsSummary ? ` · ${countsSummary}` : ''}
            </span>
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete} disabled={deleting} title="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <Button onClick={onOpen} size="sm">
          <ClipboardCheck className="h-4 w-4 mr-2" />
          Take attendance
        </Button>
      </CardContent>
    </Card>
  );
};

const AttendancePage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { seasons, activeYear, setSelectedYear } = useSeasonSelection();
  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;

  const { data: locations = [] } = usePracticeLocations();
  const { data: sessions = [], isLoading } = useAttendanceSessions(seasonId);

  const createSession = useCreateAttendanceSession(seasonId);
  const deleteSession = useDeleteAttendanceSession(seasonId);
  const createLocation = useCreatePracticeLocation();

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');
  const [locationId, setLocationId] = useState(NONE);
  const [newLocationName, setNewLocationName] = useState('');

  const resetForm = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setTime('');
    setLocationId(NONE);
    setNewLocationName('');
  };

  // Opened full screen from Schedule's "Attendance" header button, same
  // standalone-no-Layout pattern as interval-sessions.
  const handleClose = () => navigate(teamPath('/schedule'));
  const handleSave = () => {
    toast.success('All changes saved.');
  };

  const topBar = (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background px-6 py-3">
      <h1 className="text-lg font-semibold">Attendance</h1>
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
    if (!seasonId || !date) return;
    try {
      let finalLocationId: string | null = locationId === NONE ? null : locationId;
      if (locationId === NEW_LOCATION) {
        if (!newLocationName.trim()) {
          toast.error('Enter a name for the new location.');
          return;
        }
        const created = await createLocation.mutateAsync(newLocationName.trim());
        finalLocationId = created.id;
      }

      const created = await createSession.mutateAsync({
        seasonId,
        date,
        time: time || null,
        locationId: finalLocationId,
      });
      toast.success('Attendance session created.');
      setNewDialogOpen(false);
      resetForm();
      navigate(teamPath(`/attendance/${created.id}`));
    } catch {
      toast.error('Could not create that session.');
    }
  };

  const handleDelete = async (session: AttendanceSession) => {
    try {
      await deleteSession.mutateAsync(session.id);
      toast.success('Session deleted.');
    } catch {
      toast.error('Could not delete that session.');
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
          <p className="text-sm text-muted-foreground">
            The same roster your team already marks on a clipboard — sorted by grade, then last name.
          </p>
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
          <p className="text-muted-foreground">No attendance taken yet this season.</p>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <SessionSummaryCard
                key={session.id}
                session={session}
                onOpen={() => navigate(teamPath(`/attendance/${session.id}`))}
                onDelete={() => handleDelete(session)}
                deleting={deleteSession.isPending}
              />
            ))}
          </div>
        )}

        <Dialog
          open={newDialogOpen}
          onOpenChange={(open) => {
            setNewDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New attendance session</DialogTitle>
              <DialogDescription>Seeds one row per athlete currently on the active roster, marked Present.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <Label>Time</Label>
                  <Input type="time" className="mt-1" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No location set</SelectItem>
                    {locations.filter((l) => !l.archived).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_LOCATION}>
                      <span className="flex items-center gap-1">
                        <Plus className="h-3.5 w-3.5" /> Add new location
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {locationId === NEW_LOCATION && (
                  <Input
                    className="mt-2"
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="e.g. Rustic Woods Park"
                  />
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!date || createSession.isPending || createLocation.isPending}>
                {(createSession.isPending || createLocation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AttendancePage;
