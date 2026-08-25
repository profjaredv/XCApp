import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Check, X, Loader2, UserPlus, Trash2, Printer, Download, Plus } from 'lucide-react';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { useRosterWithRaces } from '@/hooks/useGroups';
import { usePracticeLocations, useCreatePracticeLocation } from '@/hooks/usePracticeLocations';
import {
  useAttendanceSession,
  useUpdateAttendanceSession,
  useUpdateAttendanceRecord,
  useAddAttendanceRecord,
  useRemoveAttendanceRecord,
} from '@/hooks/useAttendance';
import type { AttendanceRecord, AttendanceStatus } from '@/api/attendanceService';
import { formatDateShort, lastNameOf, mondayOf } from '@/lib/formatUtils';
import { gradeLabel, gradeLabelShort } from '@/lib/seasonUtils';
import { toCsv } from '@/lib/csvParse';
import { AttendanceStatusCell } from '@/components/attendance/StatusCell';
import { ATTENDANCE_STATUS_LABEL } from '@/lib/attendanceStatus';

// The take-attendance state of one session — its own full-screen route
// (not a card on the list page), same reasoning as Interval Sessions'
// manage page: marking a roster on a phone at practice shouldn't compete
// with every other session for screen space. Reached from the weekly grid
// (AttendancePage) via a day's settings icon, for the things a dense
// week-wide grid has no room for: location/time, notes, adding a walk-on,
// and a single day's print/export.

const NONE = '__none__';
const NEW_LOCATION = '__new__';

const STATUS_ORDER: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'EXCUSED', 'LATE'];
const STATUS_LABEL = ATTENDANCE_STATUS_LABEL;

function downloadCsv(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const AthleteRow: React.FC<{
  record: AttendanceRecord;
  onSetStatus: (status: AttendanceStatus) => void;
  onSaveNotes: (notes: string) => void;
  onRemove: () => void;
  removing: boolean;
}> = ({ record, onSetStatus, onSaveNotes, onRemove, removing }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-2 border-b border-border last:border-b-0">
    <div className="sm:w-40 min-w-0">
      <p className="text-sm font-medium truncate">{record.name}</p>
    </div>
    <AttendanceStatusCell status={record.status} onChange={onSetStatus} />
    <Input
      key={record.id}
      defaultValue={record.notes ?? ''}
      onBlur={(e) => {
        const value = e.target.value.trim();
        if (value !== (record.notes ?? '')) onSaveNotes(value);
      }}
      placeholder="Notes…"
      className="h-8 text-sm flex-1"
    />
    <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={onRemove} disabled={removing} title="Remove">
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>
);

const AttendanceSessionPage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const weekParam = searchParams.get('week');
  const { data: context } = useTeamContext();
  const { data: seasons = [] } = useAvailableSeasons(context?.team?.id);

  const { data: session, isLoading } = useAttendanceSession(sessionId ?? null);
  const seasonId = session?.seasonId ?? null;
  const seasonYear = seasons.find((s) => s.id === seasonId)?.year;
  const { data: roster = [] } = useRosterWithRaces(seasonYear);
  const { data: locations = [] } = usePracticeLocations();

  const updateSession = useUpdateAttendanceSession(seasonId);
  const updateRecord = useUpdateAttendanceRecord(seasonId);
  const addRecord = useAddAttendanceRecord(seasonId);
  const removeRecord = useRemoveAttendanceRecord(seasonId);
  const createLocation = useCreatePracticeLocation();

  const [addAthleteId, setAddAthleteId] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [addingLocation, setAddingLocation] = useState(false);

  // Grouped by grade (Senior first, matching the physical sheet's
  // convention — same descending sort RosterPage's byGrade uses), then
  // alphabetical by last name within each grade group.
  const byGrade = useMemo(() => {
    const records = session?.records ?? [];
    const groups = new Map<number | null, AttendanceRecord[]>();
    for (const record of records) {
      const key = record.grade ?? null;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(record);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => lastNameOf(a.name).localeCompare(lastNameOf(b.name)) || a.name.localeCompare(b.name));
    }
    return [...groups.entries()].sort((a, b) => (b[0] ?? -1) - (a[0] ?? -1));
  }, [session?.records]);

  const enteredIds = useMemo(() => new Set((session?.records ?? []).map((r) => r.athleteId)), [session?.records]);
  const available = roster
    .filter((a) => !enteredIds.has(a.id))
    .sort((a, b) => lastNameOf(a.preferredName || a.name).localeCompare(lastNameOf(b.preferredName || b.name)));

  const handleClose = () => {
    const week = weekParam ?? (session ? mondayOf(session.date.slice(0, 10)) : null);
    navigate(teamPath(week ? `/attendance?week=${week}` : '/attendance'));
  };
  const handleSave = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    toast.success('All changes saved.');
  };
  const handlePrint = () => window.print();

  const handleDateChange = (value: string) => {
    if (!session || value === session.date.slice(0, 10)) return;
    updateSession.mutate({ id: session.id, input: { date: value } });
  };
  const handleTimeChange = (value: string) => {
    if (!session) return;
    updateSession.mutate({ id: session.id, input: { time: value || null } });
  };
  const handleLocationChange = async (value: string) => {
    if (!session) return;
    if (value === NEW_LOCATION) {
      setAddingLocation(true);
      return;
    }
    updateSession.mutate({ id: session.id, input: { locationId: value === NONE ? null : value } });
  };
  const handleConfirmNewLocation = async () => {
    if (!session || !newLocationName.trim()) return;
    try {
      const created = await createLocation.mutateAsync(newLocationName.trim());
      updateSession.mutate({ id: session.id, input: { locationId: created.id } });
      setAddingLocation(false);
      setNewLocationName('');
    } catch {
      toast.error('Could not create that location.');
    }
  };

  const handleAdd = async () => {
    if (!addAthleteId || !session) return;
    try {
      await addRecord.mutateAsync({ sessionId: session.id, athleteId: addAthleteId });
      setAddAthleteId('');
    } catch {
      toast.error('Could not add that athlete.');
    }
  };

  const handleExport = () => {
    if (!session) return;
    const headers = ['Date', 'Time', 'Location', 'Grade', 'Athlete', 'Status', 'Notes'];
    const rows = (session.records ?? [])
      .slice()
      .sort((a, b) => (b.grade ?? -1) - (a.grade ?? -1) || lastNameOf(a.name).localeCompare(lastNameOf(b.name)))
      .map((r) => ({
        Date: session.date.slice(0, 10),
        Time: session.time ?? '',
        Location: session.location?.name ?? '',
        Grade: gradeLabel(r.grade),
        Athlete: r.name,
        Status: STATUS_LABEL[r.status],
        Notes: r.notes ?? '',
      }));
    downloadCsv(`attendance-${session.date.slice(0, 10)}.csv`, toCsv(headers, rows));
  };

  const topBar = (
    <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-2 sm:gap-4 border-b border-border bg-background px-3 sm:px-6 py-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold truncate">Attendance{session ? ` — ${formatDateShort(session.date)}` : ''}</h1>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!session} title="Export CSV">
          <Download className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint} disabled={!session} title="Print">
          <Printer className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Print</span>
        </Button>
        <Button variant="outline" size="sm" onClick={handleSave} title="Save">
          <Check className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Save</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleClose} title="Close">
          <X className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Close</span>
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-6 text-muted-foreground">Loading session…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-6 text-muted-foreground">Session not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {topBar}
      <div className="print:hidden p-3 md:p-6 space-y-4">
        <Card>
          <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Date</Label>
              <Input type="date" className="mt-1" defaultValue={session.date.slice(0, 10)} onBlur={(e) => handleDateChange(e.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" className="mt-1" defaultValue={session.time ?? ''} onBlur={(e) => handleTimeChange(e.target.value)} />
            </div>
            <div>
              <Label>Location</Label>
              <Select value={session.location?.id ?? NONE} onValueChange={handleLocationChange}>
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
              {addingLocation && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="e.g. Rustic Woods Park"
                  />
                  <Button size="sm" onClick={handleConfirmNewLocation} disabled={!newLocationName.trim() || createLocation.isPending}>
                    {createLocation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                    Add
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {session.records.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No athletes yet — add one below.</p>
            ) : (
              byGrade.map(([grade, records]) => (
                <div key={grade ?? 'unknown'} className="mb-4 last:mb-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    {gradeLabel(grade)} <span className="normal-case">({records.length})</span>
                  </p>
                  {records.map((record) => (
                    <AthleteRow
                      key={record.id}
                      record={record}
                      onSetStatus={(status) => updateRecord.mutate({ sessionId: session.id, athleteId: record.athleteId, input: { status } })}
                      onSaveNotes={(notes) =>
                        updateRecord.mutate({ sessionId: session.id, athleteId: record.athleteId, input: { notes: notes || null } })
                      }
                      onRemove={() => removeRecord.mutate({ sessionId: session.id, athleteId: record.athleteId })}
                      removing={removeRecord.isPending}
                    />
                  ))}
                </div>
              ))
            )}
            <div className="flex items-center gap-2 pt-3">
              <Select value={addAthleteId} onValueChange={setAddAthleteId}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Add an athlete not in this session…" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.preferredName || a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={handleAdd} disabled={!addAthleteId || addRecord.isPending}>
                {addRecord.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1" />}
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Print view: a blank-or-filled paper backup, same idea as the
          Interval Sessions print sheet — a coach can carry this and mark
          it by hand, or file it as a clean record of what's already saved. */}
      <div className="hidden print:block p-4">
        <h1 className="text-lg font-semibold">Attendance — {formatDateShort(session.date)}</h1>
        <p className="text-sm text-muted-foreground mb-3">
          {session.time ? `${session.time} · ` : ''}
          {session.location?.name ?? 'No location set'}
        </p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left p-1 border border-border">Grade</th>
              <th className="text-left p-1 border border-border">Athlete</th>
              <th className="text-center p-1 border border-border">P</th>
              <th className="text-center p-1 border border-border">A</th>
              <th className="text-center p-1 border border-border">E</th>
              <th className="text-center p-1 border border-border">L</th>
              <th className="text-left p-1 border border-border">Notes</th>
            </tr>
          </thead>
          <tbody>
            {byGrade.flatMap(([grade, records]) =>
              records.map((record) => (
                <tr key={record.id}>
                  <td className="p-1 border border-border whitespace-nowrap">{gradeLabelShort(grade)}</td>
                  <td className="p-1 border border-border whitespace-nowrap">{record.name}</td>
                  {STATUS_ORDER.map((status) => (
                    <td key={status} className="h-8 w-8 p-1 border border-border text-center font-mono">
                      {record.status === status ? '✓' : ''}
                    </td>
                  ))}
                  <td className="p-1 border border-border">{record.notes ?? ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AttendanceSessionPage;
