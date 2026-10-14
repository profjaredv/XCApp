import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTabsList } from '@/components/ui/responsive-tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatTime, parseTimeToSeconds } from '@/lib/formatUtils';
import { useMyReflection, useSavePreRace, useSavePostRace, useSetSharing } from '@/hooks/useRaceReflections';

// An athlete's own pre-race goals and post-race reflection for one race.
// Moved here verbatim from MyProgressPage so the next shell's Today and My
// Season open the same form (docs/leadpack-new-ui-trial.md §4.1, §4.7);
// `initialTab` is additive and defaults to what My Progress always showed.
export const RaceReflectionDialogBody: React.FC<{ raceId: string; initialTab?: 'pre' | 'post' }> = ({
  raceId,
  initialTab = 'pre',
}) => {
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
  const [reflectionTab, setReflectionTab] = useState<string>(initialTab);

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
