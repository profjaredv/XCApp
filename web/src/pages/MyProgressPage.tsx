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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTabsList } from '@/components/ui/responsive-tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Activity, Bus, CalendarDays, Lock, MessageCircleHeart, Trash2, Trophy, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { athleteService } from '@/api/athleteService';
import { trainingLogService, type TrainingLogType } from '@/api/trainingLogService';
import { TrainingPacesCard } from '@/components/TrainingPacesCard';
import { formatTime, parseTimeToSeconds, formatDateShort } from '@/lib/formatUtils';
import { useMyPracticePlan } from '@/hooks/usePracticePlans';
import { useMyMeetCard } from '@/hooks/useMeetOps';
import { useMyReflection, useSavePreRace, useSavePostRace, useSetSharing } from '@/hooks/useRaceReflections';

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

  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: todaysPlan } = useMyPracticePlan(todayIso, !!linkedAthlete);
  const { data: meetCard } = useMyMeetCard(!!linkedAthlete);


  const [reflectionRaceId, setReflectionRaceId] = useState<string | null>(null);
  const reflectionRace = recentRaces.find((r) => r.raceId === reflectionRaceId);

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
            <CalendarDays className="h-5 w-5" />
            Today's practice
          </CardTitle>
          <CardDescription>Only what your group's on tap for — the coach hasn't published anything more than this.</CardDescription>
        </CardHeader>
        <CardContent>
          {!todaysPlan?.plan ? (
            <p className="text-sm text-muted-foreground">Nothing published for today yet.</p>
          ) : (
            <div className="space-y-3">
              {(todaysPlan.plan.title || todaysPlan.plan.startTime || todaysPlan.plan.location) && (
                <div>
                  {todaysPlan.plan.title && <p className="font-medium">{todaysPlan.plan.title}</p>}
                  {(todaysPlan.plan.startTime || todaysPlan.plan.location) && (
                    <p className="text-sm text-muted-foreground">
                      {[todaysPlan.plan.startTime, todaysPlan.plan.location].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              )}
              {todaysPlan.plan.teamNotes && <p className="text-sm">{todaysPlan.plan.teamNotes}</p>}
              {todaysPlan.plan.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workout details posted for your group yet.</p>
              ) : (
                <div className="space-y-2">
                  {todaysPlan.plan.assignments.map((a, i) => (
                    <div key={i} className="rounded-lg border p-3 text-sm">
                      <p className="font-medium">
                        {a.focus || (a.strength ? 'Strength' : 'Workout')}
                      </p>
                      <p className="text-muted-foreground">
                        {a.durationMinutes ? `${a.durationMinutes} min` : ''}
                        {a.durationMinutes && a.distanceMi ? ' · ' : ''}
                        {a.distanceMi ? `${a.distanceMi} mi` : ''}
                        {a.strength ? ' · Strength' : ''}
                      </p>
                      {a.details && <p className="text-muted-foreground mt-1">{a.details}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {meetCard?.meet && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bus className="h-5 w-5" />
              Next meet: {meetCard.meet.name}
            </CardTitle>
            <CardDescription>
              {formatDateShort(meetCard.meet.date)}
              {meetCard.meet.location ? ` · ${meetCard.meet.location}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">
              {meetCard.entry?.status === 'ENTERED'
                ? `You're entered${meetCard.race ? ` in ${meetCard.race.name}` : ''}.`
                : meetCard.entry?.status === 'ALTERNATE'
                ? "You're an alternate for this meet."
                : "You're not entered in this meet."}
            </p>
            {!meetCard.plan ? (
              <p className="text-sm text-muted-foreground">Logistics haven't been posted yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                {meetCard.plan.departureTime && (
                  <div>
                    <p className="text-muted-foreground">Bus departs</p>
                    <p className="font-medium">{new Date(meetCard.plan.departureTime).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                )}
                {meetCard.plan.returnTime && (
                  <div>
                    <p className="text-muted-foreground">Return</p>
                    <p className="font-medium">{new Date(meetCard.plan.returnTime).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                )}
                {meetCard.plan.departureLoc && (
                  <div>
                    <p className="text-muted-foreground">Departs from</p>
                    <p className="font-medium">{meetCard.plan.departureLoc}</p>
                  </div>
                )}
                {meetCard.plan.uniformNotes && (
                  <div>
                    <p className="text-muted-foreground">Uniform</p>
                    <p className="font-medium">{meetCard.plan.uniformNotes}</p>
                  </div>
                )}
                {meetCard.plan.bringList && (
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground">Bring</p>
                    <p className="font-medium">{meetCard.plan.bringList}</p>
                  </div>
                )}
                {meetCard.plan.itinerary && meetCard.plan.itinerary.length > 0 && (
                  <div className="sm:col-span-2 space-y-1">
                    <p className="text-muted-foreground">Itinerary</p>
                    {meetCard.plan.itinerary.map((item, i) => (
                      <p key={i}>
                        <span className="font-medium">{item.time}</span> — {item.label}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <TrainingPacesCard recentRaces={recentRaces} />

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageCircleHeart className="h-5 w-5" />
            Race goals & reflections
          </CardTitle>
          <CardDescription>
            Write goals before you race, lock them in, and reflect afterward. You choose whether your coach can read it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentRaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No races yet.</p>
          ) : (
            <div className="divide-y">
              {recentRaces.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setReflectionRaceId(r.raceId)}
                  className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-slate-50 rounded-md px-2 -mx-2"
                >
                  <div>
                    <p className="text-sm font-medium">{r.raceName}</p>
                    <p className="text-xs text-muted-foreground">{formatDateShort(r.date)}</p>
                  </div>
                  <span className="text-xs text-primary">Goals & reflection →</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reflectionRaceId} onOpenChange={(open) => !open && setReflectionRaceId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{reflectionRace?.raceName ?? 'Race'}</DialogTitle>
            <DialogDescription>{reflectionRace ? formatDateShort(reflectionRace.date) : ''}</DialogDescription>
          </DialogHeader>
          {reflectionRaceId && <RaceReflectionDialogBody raceId={reflectionRaceId} />}
        </DialogContent>
      </Dialog>

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

const RaceReflectionDialogBody: React.FC<{ raceId: string }> = ({ raceId }) => {
  const { data, isLoading } = useMyReflection(raceId);
  const savePreRace = useSavePreRace(raceId);
  const savePostRace = useSavePostRace(raceId);
  const setSharing = useSetSharing(raceId);

  const [processGoal, setProcessGoal] = useState('');
  const [outcomeGoal, setOutcomeGoal] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [keyFocus, setKeyFocus] = useState('');

  const [feelingRating, setFeelingRating] = useState('');
  const [effortRating, setEffortRating] = useState('');
  const [whatWorked, setWhatWorked] = useState('');
  const [whatDidnt, setWhatDidnt] = useState('');
  const [postNotes, setPostNotes] = useState('');
  const [reflectionTab, setReflectionTab] = useState('pre');

  useEffect(() => {
    if (data?.reflection) {
      const r = data.reflection;
      setProcessGoal(r.processGoal ?? '');
      setOutcomeGoal(r.outcomeGoal ?? '');
      setTargetTime(r.targetTimeSec ? formatTime(r.targetTimeSec) : '');
      setKeyFocus(r.keyFocus ?? '');
      setFeelingRating(r.feelingRating != null ? String(r.feelingRating) : '');
      setEffortRating(r.effortRating != null ? String(r.effortRating) : '');
      setWhatWorked(r.whatWorked ?? '');
      setWhatDidnt(r.whatDidnt ?? '');
      setPostNotes(r.postNotes ?? '');
    }
  }, [data]);

  const handleSavePreRace = async () => {
    const targetTimeSec = targetTime.trim() ? parseTimeToSeconds(targetTime) : undefined;
    if (targetTime.trim() && (targetTimeSec === undefined || Number.isNaN(targetTimeSec))) {
      toast.error('Target time must look like MM:SS');
      return;
    }
    try {
      await savePreRace.mutateAsync({
        processGoal: processGoal.trim() || undefined,
        outcomeGoal: outcomeGoal.trim() || undefined,
        targetTimeSec,
        keyFocus: keyFocus.trim() || undefined,
      });
      toast.success('Goals saved.');
    } catch (err) {
      const message =
        (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ?? 'Could not save goals.';
      toast.error(message);
    }
  };

  const handleSavePostRace = async () => {
    try {
      await savePostRace.mutateAsync({
        feelingRating: feelingRating ? Number(feelingRating) : undefined,
        effortRating: effortRating ? Number(effortRating) : undefined,
        whatWorked: whatWorked.trim() || undefined,
        whatDidnt: whatDidnt.trim() || undefined,
        postNotes: postNotes.trim() || undefined,
      });
      toast.success('Reflection saved.');
    } catch {
      toast.error('Could not save reflection.');
    }
  };

  const handleToggleSharing = async (shared: boolean) => {
    try {
      await setSharing.mutateAsync(shared);
    } catch {
      toast.error('Could not update sharing.');
    }
  };

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={data.reflection.sharedWithCoach} onCheckedChange={(v) => handleToggleSharing(Boolean(v))} />
        {data.reflection.sharedWithCoach ? 'Your coach can read this' : 'Only you can read this'}
      </label>

      <Tabs value={reflectionTab} onValueChange={setReflectionTab}>
        <ResponsiveTabsList value={reflectionTab} onValueChange={setReflectionTab}>
          <TabsTrigger value="pre">Pre-race goals</TabsTrigger>
          <TabsTrigger value="post">Post-race reflection</TabsTrigger>
        </ResponsiveTabsList>

        <TabsContent value="pre" className="space-y-3 pt-2">
          {data.locked && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>Goals are locked — this race has already started.</AlertDescription>
            </Alert>
          )}
          <div>
            <Label>Process goal</Label>
            <Input
              className="mt-1"
              disabled={data.locked}
              value={processGoal}
              onChange={(e) => setProcessGoal(e.target.value)}
              placeholder="Stay relaxed through mile 1"
            />
          </div>
          <div>
            <Label>Outcome goal</Label>
            <Input
              className="mt-1"
              disabled={data.locked}
              value={outcomeGoal}
              onChange={(e) => setOutcomeGoal(e.target.value)}
              placeholder="Top 20, sub 18:00"
            />
          </div>
          <div>
            <Label>Target time (MM:SS)</Label>
            <Input className="mt-1" disabled={data.locked} value={targetTime} onChange={(e) => setTargetTime(e.target.value)} placeholder="18:00" />
          </div>
          <div>
            <Label>Key focus</Label>
            <Input className="mt-1" disabled={data.locked} value={keyFocus} onChange={(e) => setKeyFocus(e.target.value)} />
          </div>
          {!data.locked && (
            <Button onClick={handleSavePreRace} disabled={savePreRace.isPending}>
              {savePreRace.isPending ? 'Saving…' : 'Save goals'}
            </Button>
          )}
        </TabsContent>

        <TabsContent value="post" className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Feeling (1-10)</Label>
              <Input type="number" min="1" max="10" className="mt-1" value={feelingRating} onChange={(e) => setFeelingRating(e.target.value)} />
            </div>
            <div>
              <Label>Effort (1-10)</Label>
              <Input type="number" min="1" max="10" className="mt-1" value={effortRating} onChange={(e) => setEffortRating(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>What worked</Label>
            <Textarea className="mt-1" rows={2} value={whatWorked} onChange={(e) => setWhatWorked(e.target.value)} />
          </div>
          <div>
            <Label>What didn't</Label>
            <Textarea className="mt-1" rows={2} value={whatDidnt} onChange={(e) => setWhatDidnt(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea className="mt-1" rows={2} value={postNotes} onChange={(e) => setPostNotes(e.target.value)} />
          </div>
          <Button onClick={handleSavePostRace} disabled={savePostRace.isPending}>
            {savePostRace.isPending ? 'Saving…' : 'Save reflection'}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MyProgressPage;
