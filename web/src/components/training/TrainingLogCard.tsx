import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Activity, FileUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { trainingLogService, type TrainingLogType } from '@/api/trainingLogService';
import { formatTime, parseTimeToSeconds, formatDateShort, todayIso as todayIsoLocal } from '@/lib/formatUtils';
import { ImportWorkoutsDialog } from './ImportWorkoutsDialog';

// An athlete's own training log — log a run, import from a watch, share or
// delete past entries. Moved here verbatim from MyProgressPage so the next
// shell's Train page (docs/leadpack-new-ui-trial.md §4.2) shows the same
// log rather than a second one.

const LOG_TYPES: { value: TrainingLogType; label: string }[] = [
  { value: 'easy', label: 'Easy run' },
  { value: 'long', label: 'Long run' },
  { value: 'tempo', label: 'Tempo / threshold' },
  { value: 'interval', label: 'Intervals' },
  { value: 'race', label: 'Race / time trial' },
  { value: 'other', label: 'Other' },
];

export const TrainingLogCard: React.FC = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const linkedAthlete = currentUser?.linkedAthlete;

  const { data: logs = [] } = useQuery({
    queryKey: ['myTrainingLogs'],
    queryFn: () => trainingLogService.getMyLogs(30),
    enabled: !!linkedAthlete,
  });

  const [logDate, setLogDate] = useState(todayIsoLocal);
  const [importOpen, setImportOpen] = useState(false);
  const [logType, setLogType] = useState<TrainingLogType>('easy');
  const [logDistance, setLogDistance] = useState('');
  const [logDuration, setLogDuration] = useState('');
  const [logNotes, setLogNotes] = useState('');
  // Private by default — matches the backend's default and the card's own
  // "yours alone" copy below. An athlete has to actively check one of
  // these to let anyone else see a run.
  const [logShareCoach, setLogShareCoach] = useState(false);
  const [logShareTeam, setLogShareTeam] = useState(false);

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
        sharedWithCoach: logShareCoach,
        sharedWithTeam: logShareTeam,
      });
    },
    onSuccess: () => {
      toast.success('Run logged');
      setLogDistance('');
      setLogDuration('');
      setLogNotes('');
      setLogShareCoach(false);
      setLogShareTeam(false);
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

  const updateLogSharing = useMutation({
    mutationFn: ({ logId, sharedWithCoach, sharedWithTeam }: { logId: string; sharedWithCoach: boolean; sharedWithTeam: boolean }) =>
      trainingLogService.updateSharing(logId, sharedWithCoach, sharedWithTeam),
    onSuccess: invalidateLogs,
    onError: () => toast.error('Could not update sharing'),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5" />
                Log a run
              </CardTitle>
              <CardDescription>
                Training runs are private by default — check a box below to share one with your coach, your team, or both.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <FileUp className="mr-2 h-4 w-4" />
              Import from watch
            </Button>
          </div>
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="log-share-coach" checked={logShareCoach} onCheckedChange={(v) => setLogShareCoach(v === true)} />
              <Label htmlFor="log-share-coach" className="text-sm font-normal">Share with coach</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="log-share-team" checked={logShareTeam} onCheckedChange={(v) => setLogShareTeam(v === true)} />
              <Label htmlFor="log-share-team" className="text-sm font-normal">Share with team</Label>
            </div>
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
                    <div className="flex items-center gap-3 mt-1">
                      <button
                        type="button"
                        className={`text-xs ${log.sharedWithCoach ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() =>
                          updateLogSharing.mutate({ logId: log.id, sharedWithCoach: !log.sharedWithCoach, sharedWithTeam: log.sharedWithTeam })
                        }
                        disabled={updateLogSharing.isPending}
                      >
                        {log.sharedWithCoach ? '✓ Shared with coach' : 'Share with coach'}
                      </button>
                      <button
                        type="button"
                        className={`text-xs ${log.sharedWithTeam ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() =>
                          updateLogSharing.mutate({ logId: log.id, sharedWithCoach: log.sharedWithCoach, sharedWithTeam: !log.sharedWithTeam })
                        }
                        disabled={updateLogSharing.isPending}
                      >
                        {log.sharedWithTeam ? '✓ Shared with team' : 'Share with team'}
                      </button>
                    </div>
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
      <ImportWorkoutsDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
};
