import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Activity, Gauge, Trash2, Trophy, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { athleteService } from '@/api/athleteService';
import { trainingLogService, type TrainingLogType } from '@/api/trainingLogService';
import { trainingPacesFromRace } from '@/lib/vdotPaces';
import { formatTime, formatPace, parseTimeToSeconds } from '@/lib/formatters';
import { formatDateShort } from '@/lib/formatUtils';

const LOG_TYPES: { value: TrainingLogType; label: string }[] = [
  { value: 'easy', label: 'Easy run' },
  { value: 'long', label: 'Long run' },
  { value: 'tempo', label: 'Tempo / threshold' },
  { value: 'interval', label: 'Intervals' },
  { value: 'race', label: 'Race / time trial' },
  { value: 'other', label: 'Other' },
];

// Athletes usually don't know what pace an "easy day" or a "tempo run"
// should actually be — this screen answers that from their own results,
// lets them log runs the coach never sees a form for, and links out to the
// same team/meet views a coach has for whenever they want the bigger picture.
const MyProgressPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const queryClient = useQueryClient();
  const linkedAthlete = currentUser?.linkedAthlete;

  const { data: recentRaces = [] } = useQuery({
    queryKey: ['myRecentRaces', linkedAthlete?.id],
    queryFn: () => athleteService.getRecentRaces(linkedAthlete!.id, 10),
    enabled: !!linkedAthlete,
  });

  const [selectedRaceId, setSelectedRaceId] = useState<string>('');
  useEffect(() => {
    if (recentRaces.length > 0 && !recentRaces.some((r) => r.id === selectedRaceId)) {
      setSelectedRaceId(recentRaces[0].id);
    }
  }, [recentRaces, selectedRaceId]);
  const activeRace = recentRaces.find((r) => r.id === selectedRaceId);
  const paceResult = activeRace ? trainingPacesFromRace(activeRace.distance, activeRace.time) : null;

  const { data: logs = [] } = useQuery({
    queryKey: ['myTrainingLogs'],
    queryFn: () => trainingLogService.getMyLogs(30),
    enabled: !!linkedAthlete,
  });

  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logType, setLogType] = useState<TrainingLogType>('easy');
  const [logDistance, setLogDistance] = useState('');
  const [logDuration, setLogDuration] = useState('');
  const [logNotes, setLogNotes] = useState('');

  const invalidateLogs = () => queryClient.invalidateQueries({ queryKey: ['myTrainingLogs'] });

  const logRun = useMutation({
    mutationFn: () => {
      const durationSec = logDuration ? Math.round(parseTimeToSeconds(logDuration)) : undefined;
      if (logDuration && (durationSec === undefined || Number.isNaN(durationSec))) {
        throw new Error('Duration must look like MM:SS or H:MM:SS');
      }
      return trainingLogService.logRun({
        date: logDate,
        type: logType,
        distanceMi: logDistance ? parseFloat(logDistance) : undefined,
        durationSec,
        notes: logNotes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Run logged');
      setLogDistance('');
      setLogDuration('');
      setLogNotes('');
      invalidateLogs();
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ??
        (err instanceof Error ? err.message : 'Could not log run');
      toast.error(message);
    },
  });

  const deleteLog = useMutation({
    mutationFn: (logId: string) => trainingLogService.deleteLog(logId),
    onSuccess: invalidateLogs,
    onError: () => toast.error('Could not delete that entry'),
  });

  if (!linkedAthlete) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your profile isn't linked yet</CardTitle>
          <CardDescription>
            Your account isn't connected to a roster entry, so there's no personal data to show
            here yet. Ask your coach for an invite, or join with your team's code and claim your
            profile from the roster.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate('/join-team')}>Join a team</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Progress</h1>
        <p className="text-muted-foreground">
          {linkedAthlete.name}
          {linkedAthlete.graduationYear ? ` • Class of ${linkedAthlete.graduationYear}` : ''}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gauge className="h-5 w-5" />
            Recommended training paces
          </CardTitle>
          <CardDescription>
            Based on a recent race — an estimate, not a guarantee. Adjust for how you feel and
            weather/terrain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recentRaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No race results yet — training paces will appear here once you've raced.
            </p>
          ) : (
            <>
              <div className="max-w-sm space-y-2">
                <Label>Based on</Label>
                <Select value={selectedRaceId} onValueChange={setSelectedRaceId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {recentRaces.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.raceName} — {formatTime(r.time)} ({formatDateShort(r.date)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {paceResult ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {paceResult.paces.map((zone) => (
                    <div key={zone.key} className="rounded-lg border p-3">
                      <p className="font-medium">{zone.label}</p>
                      <p className="text-xl font-bold text-primary">{formatPace(zone.paceSecPerMile)}</p>
                      <p className="text-xs text-muted-foreground">{zone.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Couldn't estimate paces from that result.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5" />
            Log a run
          </CardTitle>
          <CardDescription>
            Training runs are yours alone — they never show up in team results or meet history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="log-date">Date</Label>
              <Input id="log-date" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={logType} onValueChange={(v) => setLogType(v as TrainingLogType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOG_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="log-distance">Distance (mi)</Label>
              <Input
                id="log-distance"
                type="number"
                min="0"
                step="0.1"
                value={logDistance}
                onChange={(e) => setLogDistance(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="log-duration">Duration (MM:SS)</Label>
              <Input
                id="log-duration"
                value={logDuration}
                onChange={(e) => setLogDuration(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="log-notes">Notes</Label>
            <Textarea
              id="log-notes"
              value={logNotes}
              onChange={(e) => setLogNotes(e.target.value)}
              placeholder="How did it feel?"
              rows={2}
            />
          </div>
          <Button onClick={() => logRun.mutate()} disabled={logRun.isPending}>
            {logRun.isPending ? 'Saving…' : 'Log run'}
          </Button>

          {logs.length > 0 && (
            <div className="divide-y pt-2">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {formatDateShort(log.date)} •{' '}
                      {LOG_TYPES.find((t) => t.value === log.type)?.label ?? log.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.distanceMi ? `${log.distanceMi} mi` : ''}
                      {log.distanceMi && log.durationSec ? ' • ' : ''}
                      {log.durationSec ? formatTime(log.durationSec) : ''}
                      {log.notes ? ` • ${log.notes}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteLog.mutate(log.id)}
                    disabled={deleteLog.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => navigate(teamPath(`/team/athlete/${linkedAthlete.id}`))}>
          <Trophy className="mr-2 h-4 w-4" />
          My full race history
        </Button>
        <Button variant="outline" onClick={() => navigate(teamPath('/analytics'))}>
          <Users className="mr-2 h-4 w-4" />
          Team & meet results
        </Button>
      </div>
    </div>
  );
};

export default MyProgressPage;
