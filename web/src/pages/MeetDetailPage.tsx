import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Split, Plus, Trash2, ClipboardList, Timer as TimerIcon } from 'lucide-react';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useMeet, useUpdateMeet, useCreateRace, useDeleteRace, useRaceResults, useSubmitRaceResults } from '@/hooks/useMeetOps';
import { useReflectionsForRace } from '@/hooks/useRaceReflections';
import { formatTimeSec, type MeetDetail, type ResultStatus, type RaceResultEntry } from '@/api/meetOpsService';
import { rosterService } from '@/api/rosterService';
import { formatTime, parseTimeToSeconds } from '@/lib/formatUtils';

const DISTANCE_PRESETS: Array<{ label: string; meters: number }> = [
  { label: '1 Mile', meters: 1609 },
  { label: '2K', meters: 2000 },
  { label: '3200m (2 Mile)', meters: 3200 },
  { label: '5K', meters: 5000 },
];

const STATUS_OPTIONS: ResultStatus[] = ['FINISHED', 'DNF', 'DNS', 'DQ'];

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

  const deleteRace = useDeleteRace();

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [isHome, setIsHome] = useState('unspecified');
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  const [addRaceOpen, setAddRaceOpen] = useState(false);
  const [enterResultsOpen, setEnterResultsOpen] = useState(false);

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

  const selectedRace = meet.races.find((r) => r.id === selectedRaceId) ?? null;

  const handleDeleteRace = async () => {
    if (!selectedRaceId) return;
    if (!window.confirm('Delete this race and all its results? This cannot be undone.')) return;
    try {
      await deleteRace.mutateAsync(selectedRaceId);
      toast.success('Race deleted.');
      setSelectedRaceId(null);
    } catch {
      toast.error('Could not delete that race.');
    }
  };

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
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>Race plans</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setAddRaceOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Race
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {meet.races.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This meet has no races linked yet — scraped results link automatically, or add one by hand (e.g. a time trial).
              Once it has results it's treated exactly like any other race.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Select value={selectedRaceId ?? undefined} onValueChange={setSelectedRaceId}>
                    <SelectTrigger className="w-[280px]"><SelectValue placeholder="Choose a race…" /></SelectTrigger>
                    <SelectContent>
                      {meet.races.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}{r.isManual ? ' (Manual)' : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedRace?.isManual && (
                    <Button variant="ghost" size="icon" onClick={handleDeleteRace} disabled={deleteRace.isPending} title="Delete this race">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedRaceId && (
                    <Button variant="outline" onClick={() => navigate(teamPath(`/race/${selectedRaceId}/timer`))}>
                      <TimerIcon className="h-4 w-4 mr-2" />
                      Live Timer
                    </Button>
                  )}
                  {selectedRaceId && (
                    <Button variant="outline" onClick={() => setEnterResultsOpen(true)}>
                      <ClipboardList className="h-4 w-4 mr-2" />
                      Enter Results
                    </Button>
                  )}
                  {selectedRaceId && (
                    <Button variant="outline" onClick={() => navigate(teamPath(`/race/${selectedRaceId}/splits`))}>
                      <Split className="h-4 w-4 mr-2" />
                      Enter splits
                    </Button>
                  )}
                </div>
              </div>
              {selectedRaceId && <ReflectionsView raceId={selectedRaceId} />}
            </>
          )}
        </CardContent>
      </Card>

      <AddRaceDialog meet={meet} open={addRaceOpen} onOpenChange={setAddRaceOpen} />
      {selectedRaceId && (
        <EnterRaceResultsDialog
          raceId={selectedRaceId}
          raceName={selectedRace?.name ?? ''}
          seasonYear={meet.seasonYear}
          open={enterResultsOpen}
          onOpenChange={setEnterResultsOpen}
        />
      )}
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

// A race that never touched the Athletic.net scraper — an in-house time
// trial, most often. Distance is required (no silent default): pace-based
// analysis elsewhere silently drops a race with no distance rather than
// showing a wrong number, so better to ask up front than have this race
// mysteriously not count toward anything later.
const AddRaceDialog: React.FC<{ meet: MeetDetail; open: boolean; onOpenChange: (open: boolean) => void }> = ({ meet, open, onOpenChange }) => {
  const createRace = useCreateRace(meet.id);
  const [name, setName] = useState('Time Trial');
  const [date, setDate] = useState('');
  const [presetLabel, setPresetLabel] = useState(DISTANCE_PRESETS[2].label);
  const [customMeters, setCustomMeters] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('Time Trial');
    setDate(meet.date.slice(0, 10));
    setPresetLabel(DISTANCE_PRESETS[2].label);
    setCustomMeters('');
  }, [open, meet.date]);

  const preset = DISTANCE_PRESETS.find((p) => p.label === presetLabel);
  const distanceMeters = presetLabel === 'Custom' ? parseFloat(customMeters) : preset?.meters;
  const canSave = Boolean(name.trim() && date && Number.isFinite(distanceMeters) && (distanceMeters ?? 0) > 0);

  const handleCreate = async () => {
    if (!canSave || distanceMeters == null) return;
    try {
      await createRace.mutateAsync({
        name: name.trim(),
        date,
        distanceMeters,
        distance: presetLabel === 'Custom' ? undefined : presetLabel,
      });
      toast.success('Race added.');
      onOpenChange(false);
    } catch {
      toast.error('Could not add that race.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a race</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            For a race run outside Athletic.net — an in-house time trial, for example. Once it has results it's treated exactly
            like any other race: pace trends, PRs, band analytics, and AI insights all pick it up automatically.
          </p>
          <div>
            <Label>Race name</Label>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Distance</Label>
            <Select value={presetLabel} onValueChange={setPresetLabel}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DISTANCE_PRESETS.map((p) => (
                  <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>
                ))}
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {presetLabel === 'Custom' && (
              <Input
                type="number"
                min="1"
                className="mt-2"
                placeholder="Distance in meters"
                value={customMeters}
                onChange={(e) => setCustomMeters(e.target.value)}
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!canSave || createRace.isPending}>
            {createRace.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Race
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface ResultDraft {
  time: string;
  status: ResultStatus;
}

// The actual finish-time entry a manual race needs — distinct from
// "Enter splits" above, which only records intermediate mile markers for
// a Result that already exists. Pre-fills from whatever's already saved
// (works for correcting a scraped race's result too, not just manual
// ones); clearing a touched time field with no status override clears any
// existing result for that athlete, so un-filling a row removes it rather
// than saving a zero.
//
// Only the athlete/field combinations a coach actually edits in THIS
// dialog session are sent on save — not every roster row rebuilt from
// this dialog's own load-time snapshot. Two coaches with this dialog open
// on the same race at once, each entering different athletes (or even
// different fields for the same athlete), must not have one's save wipe
// the other's already-saved result back to blank just because it wasn't
// in whichever coach's snapshot loaded first — see backend POST
// /races/:raceId/results, which only writes keys actually present in
// each entry.
const EnterRaceResultsDialog: React.FC<{
  raceId: string;
  raceName: string;
  seasonYear: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ raceId, raceName, seasonYear, open, onOpenChange }) => {
  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ['roster', seasonYear],
    queryFn: () => rosterService.getRoster(seasonYear ?? undefined),
    enabled: open && seasonYear != null,
  });
  const { data: raceResults, isLoading: resultsLoading } = useRaceResults(open ? raceId : null);
  const submitResults = useSubmitRaceResults(raceId);

  const [draft, setDraft] = useState<Record<string, ResultDraft>>({});
  // Which (athleteId, field) pairs this dialog session has actually
  // edited — the only things handleSave includes in its payload.
  const [touched, setTouched] = useState<Record<string, { time?: boolean; status?: boolean }>>({});

  useEffect(() => {
    if (!open || !raceResults) return;
    const initial: Record<string, ResultDraft> = {};
    for (const r of raceResults.results) {
      initial[r.athleteId] = { time: r.time != null ? formatTime(r.time) : '', status: r.status };
    }
    setDraft(initial);
    setTouched({});
  }, [open, raceResults]);

  const setEntry = (athleteId: string, patch: Partial<ResultDraft>) => {
    setDraft((prev) => ({
      ...prev,
      [athleteId]: { time: prev[athleteId]?.time ?? '', status: prev[athleteId]?.status ?? 'FINISHED', ...patch },
    }));
    setTouched((prev) => ({
      ...prev,
      [athleteId]: { ...prev[athleteId], ...('time' in patch ? { time: true } : {}), ...('status' in patch ? { status: true } : {}) },
    }));
  };

  const handleSave = async () => {
    const entries: RaceResultEntry[] = roster
      .filter((a) => touched[a.id]?.time || touched[a.id]?.status)
      .map((a) => {
        const d = draft[a.id];
        const entry: RaceResultEntry = { athleteId: a.id };
        if (touched[a.id]?.time) {
          const timeStr = d?.time?.trim();
          const parsed = timeStr ? parseTimeToSeconds(timeStr) : NaN;
          entry.time = timeStr && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        }
        if (touched[a.id]?.status) {
          entry.status = d?.status ?? 'FINISHED';
        }
        return entry;
      });
    if (entries.length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      const result = await submitResults.mutateAsync(entries);
      toast.success(`Saved ${result.saved} result${result.saved === 1 ? '' : 's'}${result.cleared ? `, cleared ${result.cleared}` : ''}.`);
      onOpenChange(false);
    } catch {
      toast.error('Could not save results.');
    }
  };

  const loading = rosterLoading || resultsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enter results — {raceName}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading roster…</p>
        ) : roster.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No roster found for this season.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {roster.map((a) => {
              const d = draft[a.id] ?? { time: '', status: 'FINISHED' as ResultStatus };
              return (
                <div key={a.id} className="flex items-center gap-2 py-1 border-b last:border-0">
                  <span className="flex-1 text-sm truncate">{a.preferredName || a.name}</span>
                  <Input
                    className="w-24 font-mono"
                    placeholder="mm:ss"
                    value={d.time}
                    onChange={(e) => setEntry(a.id, { time: e.target.value })}
                  />
                  <Select value={d.status} onValueChange={(v) => setEntry(a.id, { status: v as ResultStatus })}>
                    <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || roster.length === 0 || submitResults.isPending}>
            {submitResults.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Results
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MeetDetailPage;
