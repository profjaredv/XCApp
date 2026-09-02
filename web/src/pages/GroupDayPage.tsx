import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Timer, Users } from 'lucide-react';
import { useGroupDay } from '@/hooks/useGroups';
import { useCreateAttendanceSession, useUpdateAttendanceRecord } from '@/hooks/useAttendance';
import { useCreateIntervalSession } from '@/hooks/useIntervalSessions';
import { usePaceZones } from '@/hooks/usePaceZones';
import { selectableZones, findZoneByKey } from '@/lib/paceZoneLookup';
import type { IntervalZoneKey } from '@/api/intervalSessionService';
import { AttendanceStatusPicker } from '@/components/attendance/StatusCell';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { formatTime, formatPace, formatDateShort, todayIso } from '@/lib/formatUtils';
import { gradeLabelShort } from '@/lib/seasonUtils';
import type { AttendanceStatus } from '@/api/attendanceService';
import type { GroupDayMember } from '@/api/groupService';

// A group, on a given afternoon.
//
// Everything else about groups is configuration — who is in which squad,
// who leads it. This is the screen a coach actually holds standing on a
// field: who turned up, what each of them last ran, and one button to
// build today's interval sheet from the ones who are here.
//
// Attendance here is the SAME session the week grid uses, filtered to this
// group. A team takes attendance once a day (AttendanceSession is unique
// per team+season+date); scoping it per group would let two groups
// practising at the same time record contradictory answers about the same
// athlete. So marking someone present here marks them present, full stop.

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function readableDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

const MemberRow: React.FC<{
  member: GroupDayMember;
  attendanceReady: boolean;
  onStatus: (status: AttendanceStatus) => void;
  saving: boolean;
  athleteHref: string;
}> = ({ member, attendanceReady, onStatus, saving, athleteHref }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <Link to={athleteHref} className="truncate font-medium hover:underline">
          {member.name}
        </Link>
        {member.grade != null && (
          <Badge variant="outline" className="font-normal">
            {gradeLabelShort(member.grade)}
          </Badge>
        )}
      </div>
      {/* What they last ran, which is the number a coach wants in their
          head before deciding what this athlete does today. */}
      {member.lastRace ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {formatTime(member.lastRace.timeSec)}
          {member.lastRace.paceSecPerMile ? ` · ${formatPace(member.lastRace.paceSecPerMile)}` : ''}
          {' · '}
          {member.lastRace.name} · {formatDateShort(member.lastRace.date)}
        </p>
      ) : (
        <p className="mt-0.5 text-xs text-muted-foreground italic">No race yet</p>
      )}
    </div>
    {attendanceReady && (
      <AttendanceStatusPicker
        status={(member.status ?? 'ABSENT') as AttendanceStatus}
        onChange={onStatus}
        disabled={saving}
      />
    )}
  </div>
);

const GroupDayPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIso);

  const { data: day, isLoading } = useGroupDay(groupId ?? null, date);
  const seasonId = day?.group.seasonId ?? null;

  const createSession = useCreateAttendanceSession(seasonId);
  const updateRecord = useUpdateAttendanceRecord(seasonId);
  const createInterval = useCreateIntervalSession(seasonId);
  const { data: teamZones = [] } = usePaceZones();
  const zoneOptions = selectableZones(teamZones);

  const [intervalOpen, setIntervalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [repDistanceM, setRepDistanceM] = useState('800');
  const [zone, setZone] = useState<IntervalZoneKey>('mcm-vo2');
  const [savingAthleteId, setSavingAthleteId] = useState<string | null>(null);

  const here = useMemo(
    () => (day?.members ?? []).filter((m) => m.status === 'PRESENT' || m.status === 'LATE'),
    [day?.members]
  );

  const refreshDay = () => queryClient.invalidateQueries({ queryKey: ['groupDay', groupId] });

  const handleStartAttendance = async () => {
    if (!seasonId) return;
    try {
      await createSession.mutateAsync({ seasonId, date });
      refreshDay();
    } catch {
      toast.error('Could not start attendance for that day.');
    }
  };

  const handleStatus = async (athleteId: string, status: AttendanceStatus) => {
    if (!day?.session) return;
    setSavingAthleteId(athleteId);
    try {
      await updateRecord.mutateAsync({ sessionId: day.session.id, athleteId, input: { status } });
      refreshDay();
    } catch {
      toast.error('Could not save that.');
    } finally {
      setSavingAthleteId(null);
    }
  };

  const handleCreateInterval = async () => {
    if (!seasonId || !groupId || !title.trim()) return;
    try {
      const selectedZone = findZoneByKey(zone, teamZones);
      // Entries for whoever is actually here. The backend keeps the group
      // on the session either way, so it is still that group's sheet —
      // just without six blank rows for the athletes who are home sick.
      const created = await createInterval.mutateAsync({
        seasonId,
        groupId,
        date,
        title: title.trim(),
        repDistanceM: Number(repDistanceM),
        zone,
        zoneLabel: selectedZone?.name ?? null,
        athleteIds: here.length > 0 ? here.map((m) => m.athleteId) : undefined,
      });
      setIntervalOpen(false);
      setTitle('');
      navigate(teamPath(`/interval-sessions/${created.id}`));
    } catch {
      toast.error('Could not create that session.');
    }
  };

  if (isLoading) {
    return (
      <div className="container space-y-4 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!day) {
    return (
      <div className="container py-8">
        <Card className="mx-auto max-w-xl">
          <CardHeader className="text-center">
            <CardTitle>Group not found</CardTitle>
            <CardDescription>It may have been deleted, or belong to another team.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const attendanceReady = day.attendanceEnabled && !!day.session;
  const leaderNames = day.group.leaders.map((l) => l.name || l.email).join(', ');

  return (
    <div className="container space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-3 mb-1" onClick={() => navigate(teamPath('/groups'))}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            All groups
          </Button>
          <h1 className="text-3xl font-bold md:text-4xl">{day.group.name}</h1>
          <p className="text-muted-foreground">
            {day.members.length} athlete{day.members.length === 1 ? '' : 's'}
            {leaderNames ? ` · led by ${leaderNames}` : ''}
          </p>
        </div>

        {/* Yesterday is one tap away: a coach who forgot to mark the board
            on Tuesday is the reason this isn't pinned to today. */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[168px] text-center">
            <p className="text-sm font-medium">{readableDate(date)}</p>
            {date !== todayIso() && (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setDate(todayIso())}>
                Back to today
              </button>
            )}
          </div>
          <Button variant="outline" size="icon" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setIntervalOpen(true)} disabled={day.members.length === 0}>
          <Timer className="mr-2 h-4 w-4" />
          Interval session
        </Button>
        {day.attendanceEnabled && !day.session && (
          <Button variant="outline" onClick={handleStartAttendance} disabled={createSession.isPending}>
            {createSession.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ClipboardCheck className="mr-2 h-4 w-4" />
            )}
            Take attendance
          </Button>
        )}
        {day.attendanceEnabled && day.session && (
          <Button variant="outline" onClick={() => navigate(teamPath(`/attendance/${day.session!.id}`))}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Whole team
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate(teamPath('/groups'))}>
          <Users className="mr-2 h-4 w-4" />
          Manage members
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {attendanceReady ? `${here.length} here` : 'Today'}
            {attendanceReady && day.counts.unmarked > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {day.counts.unmarked} not marked
              </span>
            )}
          </CardTitle>
          <CardDescription>
            {!day.attendanceEnabled
              ? 'Attendance is turned off for this team — this is the roster and what each athlete last ran.'
              : day.session
                ? `${day.counts.EXCUSED} excused · ${day.counts.ABSENT} absent. This is the same attendance the week grid shows.`
                : 'Nobody has taken attendance for this day yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {day.members.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No athletes in this group yet — add them from the Groups screen.
            </p>
          ) : (
            <div className="divide-y border-t">
              {day.members.map((member) => (
                <MemberRow
                  key={member.athleteId}
                  member={member}
                  attendanceReady={attendanceReady}
                  saving={savingAthleteId === member.athleteId}
                  onStatus={(status) => handleStatus(member.athleteId, status)}
                  athleteHref={teamPath(`/team/athlete/${member.athleteId}`)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {day.intervalSessions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recent interval sessions</CardTitle>
            <CardDescription>This group's sheets, newest first.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y border-t">
              {day.intervalSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => navigate(teamPath(`/interval-sessions/${session.id}`))}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{session.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateShort(session.date)} · {session.repDistanceM}m · {session.entryCount} athlete
                      {session.entryCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={intervalOpen} onOpenChange={setIntervalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Interval session for {day.group.name}</DialogTitle>
            <DialogDescription>
              {here.length > 0
                ? `Starts with the ${here.length} athlete${here.length === 1 ? '' : 's'} marked here today.`
                : `Starts with all ${day.members.length} athletes in the group — nobody is marked present yet.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="interval-title">Title</Label>
              <Input
                id="interval-title"
                className="mt-1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="5 x 800m"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="interval-distance">Rep distance (m)</Label>
                <Input
                  id="interval-distance"
                  className="mt-1"
                  inputMode="numeric"
                  value={repDistanceM}
                  onChange={(e) => setRepDistanceM(e.target.value)}
                />
              </div>
              <div>
                <Label>Pace zone</Label>
                <Select value={zone} onValueChange={(v) => setZone(v as IntervalZoneKey)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {zoneOptions.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.definition.abbreviation} · {option.definition.name}
                        {option.group === 'team' ? '' : ' (standard)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIntervalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateInterval}
              disabled={!title.trim() || !repDistanceM || createInterval.isPending}
            >
              {createInterval.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GroupDayPage;
