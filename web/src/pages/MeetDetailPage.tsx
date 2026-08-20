import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Split } from 'lucide-react';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useMeet, useUpdateMeet } from '@/hooks/useMeetOps';
import { useReflectionsForRace } from '@/hooks/useRaceReflections';
import { formatTimeSec } from '@/api/meetOpsService';

// Meet detail, simplified per the Schedule rework: name/date/location/
// home-or-away (all editable) and, per race, an "Enter splits" link-out
// plus athletes' shared race plans (RaceReflection — pre-race goals and
// post-race reflection). Entries, meet-day logistics, and the printable
// roster all moved out — see routes/meetOps.js's header comment.
const MeetDetailPage: React.FC = () => {
  const { meetId } = useParams<{ meetId: string }>();
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { data: meet, isLoading } = useMeet(meetId ?? null);
  const updateMeet = useUpdateMeet(meetId ?? null);

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [isHome, setIsHome] = useState('unspecified');
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!meet) return;
    setName(meet.name);
    setDate(meet.date.slice(0, 10));
    setLocation(meet.location ?? '');
    setIsHome(meet.isHome == null ? 'unspecified' : meet.isHome ? 'home' : 'away');
    if (meet.races.length > 0 && !meet.races.some((r) => r.id === selectedRaceId)) {
      setSelectedRaceId(meet.races[0].id);
    }
    if (meet.races.length === 0) setSelectedRaceId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meet]);

  const handleSave = async () => {
    if (!name.trim() || !date) return;
    try {
      await updateMeet.mutateAsync({
        name: name.trim(),
        date,
        location: location.trim(),
        isHome: isHome === 'unspecified' ? null : isHome === 'home',
      });
      toast.success('Meet updated.');
    } catch {
      toast.error('Could not save changes.');
    }
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  if (!meet) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Meet not found.</p>
        <Button variant="outline" onClick={() => navigate(teamPath('/meets'))}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Meets
        </Button>
      </div>
    );
  }

  const dirty = name.trim() !== meet.name || date !== meet.date.slice(0, 10) || location.trim() !== (meet.location ?? '') ||
    isHome !== (meet.isHome == null ? 'unspecified' : meet.isHome ? 'home' : 'away');

  return (
    <div className="space-y-6">
      <Button variant="ghost" className="-ml-2" onClick={() => navigate(teamPath('/meets'))}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Meets
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Meet details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Location</Label>
              <Input className="mt-1" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label>Home or away</Label>
              <Select value={isHome} onValueChange={setIsHome}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unspecified">Not set</SelectItem>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="away">Away</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!dirty || !name.trim() || !date || updateMeet.isPending}>
              {updateMeet.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Race plans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {meet.races.length === 0 ? (
            <p className="text-sm text-muted-foreground">This meet has no races linked yet.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <Select value={selectedRaceId ?? undefined} onValueChange={setSelectedRaceId}>
                  <SelectTrigger className="w-[280px]"><SelectValue placeholder="Choose a race…" /></SelectTrigger>
                  <SelectContent>
                    {meet.races.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedRaceId && (
                  <Button variant="outline" onClick={() => navigate(teamPath(`/race/${selectedRaceId}/splits`))}>
                    <Split className="h-4 w-4 mr-2" />
                    Enter splits
                  </Button>
                )}
              </div>
              {selectedRaceId && <ReflectionsView raceId={selectedRaceId} />}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const ReflectionsView: React.FC<{ raceId: string }> = ({ raceId }) => {
  const { data, isLoading } = useReflectionsForRace(raceId);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">No shared reflections for this race yet.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Only reflections athletes chose to share appear here — a volunteer coach only sees their own groups' athletes.
      </p>
      {data.map((r) => (
        <Card key={r.athleteId}>
          <CardHeader className="py-3"><CardTitle className="text-sm">{r.athleteName}</CardTitle></CardHeader>
          <CardContent className="py-2 space-y-2 text-sm">
            {(r.processGoal || r.outcomeGoal || r.keyFocus) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Pre-race goals</p>
                {r.outcomeGoal && <p>Outcome: {r.outcomeGoal}</p>}
                {r.processGoal && <p>Process: {r.processGoal}</p>}
                {r.keyFocus && <p>Focus: {r.keyFocus}</p>}
                {r.targetTimeSec != null && <p>Target: {formatTimeSec(r.targetTimeSec)}</p>}
              </div>
            )}
            {(r.feelingRating != null || r.effortRating != null || r.whatWorked || r.whatDidnt || r.postNotes) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Post-race reflection</p>
                {(r.feelingRating != null || r.effortRating != null) && (
                  <p>
                    {r.feelingRating != null ? `Feeling: ${r.feelingRating}/10` : ''}
                    {r.feelingRating != null && r.effortRating != null ? ' · ' : ''}
                    {r.effortRating != null ? `Effort: ${r.effortRating}/10` : ''}
                  </p>
                )}
                {r.whatWorked && <p>What worked: {r.whatWorked}</p>}
                {r.whatDidnt && <p>What didn't: {r.whatDidnt}</p>}
                {r.postNotes && <p>Notes: {r.postNotes}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default MeetDetailPage;
