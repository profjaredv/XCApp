import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Loader2, AlertTriangle, Printer, Trash2 } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import {
  useMeets,
  useMeet,
  useCreateMeet,
  useEntries,
  useSaveEntries,
  useMeetPlan,
  useSaveMeetPlan,
  usePrintableRoster,
} from '@/hooks/useMeetOps';
import { ENTRY_STATUSES, formatTimeSec, type EntryStatus, type MeetEntryRow, type MeetPlan } from '@/api/meetOpsService';
import { useReflectionsForRace } from '@/hooks/useRaceReflections';

// T4 coach screens (Team Management handoff): meet CRUD, per-race entry
// management (same bulk-save shape as T2's group assignment), meet-day
// logistics, and a printable roster. Mounted at /t/:athleticTeamId/meets,
// distinct from the analytics "Meets" tab (which lists individual Race
// rows under the legacy name — see routes/meetOps.js's own comment for
// why these are two different things sharing an unfortunate word).

const STATUS_LABEL: Record<EntryStatus, string> = {
  NOT_ENTERED: 'Not entered',
  ENTERED: 'Entered',
  ALTERNATE: 'Alternate',
  SCRATCHED: 'Scratched',
  INJURED: 'Injured',
  ACADEMIC: 'Academic',
  EXCUSED: 'Excused',
};

const MeetOpsPage: React.FC = () => {
  const { data: context } = useTeamContext();
  const { data: seasons = [] } = useAvailableSeasons(context?.team?.id);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const activeYear = selectedYear ?? context?.activeSeason ?? seasons[0]?.year ?? null;
  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;

  const { data: meets = [], isLoading: meetsLoading } = useMeets(seasonId);
  const [selectedMeetId, setSelectedMeetId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedMeetId && meets.length > 0) setSelectedMeetId(meets[0].id);
  }, [meets, selectedMeetId]);

  const { data: meet } = useMeet(selectedMeetId);
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  useEffect(() => {
    if (meet && meet.races.length > 0 && !meet.races.some((r) => r.id === selectedRaceId)) {
      setSelectedRaceId(meet.races[0].id);
    }
    if (meet && meet.races.length === 0) setSelectedRaceId(null);
  }, [meet, selectedRaceId]);

  const createMeet = useCreateMeet(seasonId);
  const [newMeetOpen, setNewMeetOpen] = useState(false);
  const [newMeetName, setNewMeetName] = useState('');
  const [newMeetDate, setNewMeetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newMeetLocation, setNewMeetLocation] = useState('');

  const handleCreateMeet = async () => {
    if (!newMeetName.trim() || !newMeetDate) return;
    try {
      const created = await createMeet.mutateAsync({ name: newMeetName.trim(), date: newMeetDate, location: newMeetLocation.trim() || undefined });
      toast.success('Meet created.');
      setSelectedMeetId(created.id);
      setNewMeetOpen(false);
      setNewMeetName('');
      setNewMeetLocation('');
    } catch {
      toast.error('Could not create that meet.');
    }
  };

  if (!activeYear || !seasonId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Meets</h1>
        <p className="text-muted-foreground">No season set up yet — set one up from the Groups screen first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold">Meets</h1>
        <div className="flex items-center gap-2">
          <Select value={String(activeYear)} onValueChange={(v) => { setSelectedYear(Number(v)); setSelectedMeetId(null); }}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.year} value={String(s.year)}>{s.year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setNewMeetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Meet
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card className="h-fit">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Meets this season</CardTitle>
          </CardHeader>
          <CardContent className="py-2 space-y-1">
            {meetsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!meetsLoading && meets.length === 0 && <p className="text-sm text-muted-foreground">No meets yet.</p>}
            {meets.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMeetId(m.id)}
                className={`w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 ${selectedMeetId === m.id ? 'bg-primary/10 text-primary font-medium' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{m.name}</span>
                  {m.planPublished && <Badge variant="secondary" className="text-[10px]">Published</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{m.date.slice(0, 10)}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        {!meet ? (
          <div className="text-muted-foreground p-6">Select a meet to manage entries and logistics.</div>
        ) : (
          <MeetDetail
            meet={meet}
            selectedRaceId={selectedRaceId}
            setSelectedRaceId={setSelectedRaceId}
            seasonId={seasonId}
          />
        )}
      </div>

      <Dialog open={newMeetOpen} onOpenChange={setNewMeetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New meet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input className="mt-1" value={newMeetName} onChange={(e) => setNewMeetName(e.target.value)} placeholder="Sunfair Invite" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" className="mt-1" value={newMeetDate} onChange={(e) => setNewMeetDate(e.target.value)} />
            </div>
            <div>
              <Label>Location</Label>
              <Input className="mt-1" value={newMeetLocation} onChange={(e) => setNewMeetLocation(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewMeetOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateMeet} disabled={!newMeetName.trim() || !newMeetDate || createMeet.isPending}>
              {createMeet.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MeetDetail: React.FC<{
  meet: NonNullable<ReturnType<typeof useMeet>['data']>;
  selectedRaceId: string | null;
  setSelectedRaceId: (id: string) => void;
  seasonId: string | null;
}> = ({ meet, selectedRaceId, setSelectedRaceId, seasonId }) => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{meet.name}</h2>
        <p className="text-sm text-muted-foreground">
          {meet.date.slice(0, 10)}
          {meet.location ? ` · ${meet.location}` : ''}
        </p>
      </div>

      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="logistics">Logistics</TabsTrigger>
          <TabsTrigger value="roster">Printable roster</TabsTrigger>
          <TabsTrigger value="reflections">Reflections</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="space-y-4 pt-2">
          {meet.races.length === 0 ? (
            <p className="text-sm text-muted-foreground">This meet has no races linked yet.</p>
          ) : (
            <>
              <Select value={selectedRaceId ?? undefined} onValueChange={setSelectedRaceId}>
                <SelectTrigger className="w-[280px]"><SelectValue placeholder="Choose a race…" /></SelectTrigger>
                <SelectContent>
                  {meet.races.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRaceId && <EntryTable raceId={selectedRaceId} />}
            </>
          )}
        </TabsContent>

        <TabsContent value="logistics" className="pt-2">
          <MeetPlanForm meetId={meet.id} plan={meet.plan} seasonId={seasonId} />
        </TabsContent>

        <TabsContent value="roster" className="pt-2">
          <PrintableRosterView meetId={meet.id} />
        </TabsContent>

        <TabsContent value="reflections" className="space-y-4 pt-2">
          {meet.races.length === 0 ? (
            <p className="text-sm text-muted-foreground">This meet has no races linked yet.</p>
          ) : (
            <>
              <Select value={selectedRaceId ?? undefined} onValueChange={setSelectedRaceId}>
                <SelectTrigger className="w-[280px]"><SelectValue placeholder="Choose a race…" /></SelectTrigger>
                <SelectContent>
                  {meet.races.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRaceId && <ReflectionsView raceId={selectedRaceId} />}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const EntryTable: React.FC<{ raceId: string }> = ({ raceId }) => {
  const { data, isLoading } = useEntries(raceId);
  const saveEntries = useSaveEntries(raceId);
  const [rows, setRows] = useState<MeetEntryRow[]>([]);

  useEffect(() => {
    if (data) setRows(data.entries);
  }, [data]);

  const updateRow = (athleteId: string, patch: Partial<MeetEntryRow>) => {
    setRows((prev) => prev.map((r) => (r.athleteId === athleteId ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    try {
      const result = await saveEntries.mutateAsync(
        rows.map((r) => ({ athleteId: r.athleteId, status: r.status, seedTimeSec: r.seedTimeSec, bibNumber: r.bibNumber, notes: r.notes }))
      );
      toast.success(result.msg);
      if (result.entryCapWarning) {
        toast.warning(`${result.enteredCount} athletes entered — most meets cap varsity at 7.`);
      }
    } catch {
      toast.error('Could not save entries.');
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading roster…</p>;

  return (
    <div className="space-y-3">
      {data?.entryCapWarning && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{data.enteredCount} athletes are entered — most meets cap varsity at 7.</AlertDescription>
        </Alert>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Season best</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Seed time</TableHead>
              <TableHead>Bib</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.athleteId}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.grade ?? '—'}</TableCell>
                <TableCell>{formatTimeSec(r.seasonBestSec)}</TableCell>
                <TableCell>
                  <Select value={r.status} onValueChange={(v) => updateRow(r.athleteId, { status: v as EntryStatus })}>
                    <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ENTRY_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    className="h-8 w-20"
                    value={r.seedTimeSec ?? ''}
                    onChange={(e) => updateRow(r.athleteId, { seedTimeSec: e.target.value ? Number(e.target.value) : null })}
                  />
                </TableCell>
                <TableCell>
                  <Input className="h-8 w-16" value={r.bibNumber ?? ''} onChange={(e) => updateRow(r.athleteId, { bibNumber: e.target.value })} />
                </TableCell>
                <TableCell>
                  <Input className="h-8 w-32" value={r.notes ?? ''} onChange={(e) => updateRow(r.athleteId, { notes: e.target.value })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button onClick={handleSave} disabled={saveEntries.isPending}>
        {saveEntries.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Save entries
      </Button>
    </div>
  );
};

const MeetPlanForm: React.FC<{ meetId: string; plan: MeetPlan | null; seasonId: string | null }> = ({ meetId, plan, seasonId }) => {
  const { data: freshPlan } = useMeetPlan(meetId);
  const savePlan = useSaveMeetPlan(meetId, seasonId);
  const source = freshPlan ?? plan;

  const [departureTime, setDepartureTime] = useState(source?.departureTime ?? '');
  const [returnTime, setReturnTime] = useState(source?.returnTime ?? '');
  const [departureLoc, setDepartureLoc] = useState(source?.departureLoc ?? '');
  const [transportNotes, setTransportNotes] = useState(source?.transportNotes ?? '');
  const [uniformNotes, setUniformNotes] = useState(source?.uniformNotes ?? '');
  const [bringList, setBringList] = useState(source?.bringList ?? '');
  const [itinerary, setItinerary] = useState<Array<{ time: string; label: string }>>(source?.itinerary ?? []);
  const [published, setPublished] = useState(source?.published ?? false);

  useEffect(() => {
    if (freshPlan) {
      setDepartureTime(freshPlan.departureTime ?? '');
      setReturnTime(freshPlan.returnTime ?? '');
      setDepartureLoc(freshPlan.departureLoc ?? '');
      setTransportNotes(freshPlan.transportNotes ?? '');
      setUniformNotes(freshPlan.uniformNotes ?? '');
      setBringList(freshPlan.bringList ?? '');
      setItinerary(freshPlan.itinerary ?? []);
      setPublished(freshPlan.published ?? false);
    }
  }, [freshPlan]);

  const handleSave = async (publish: boolean) => {
    try {
      await savePlan.mutateAsync({
        departureTime: departureTime || null,
        returnTime: returnTime || null,
        departureLoc: departureLoc || null,
        transportNotes: transportNotes || null,
        uniformNotes: uniformNotes || null,
        bringList: bringList || null,
        itinerary: itinerary.filter((i) => i.time || i.label),
        published: publish,
      });
      setPublished(publish);
      toast.success(publish ? 'Logistics published.' : 'Saved as draft.');
    } catch {
      toast.error('Could not save logistics.');
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Badge variant={published ? 'default' : 'secondary'}>{published ? 'Published' : 'Draft'}</Badge>
        <p className="text-xs text-muted-foreground">Athletes only see this once it's published.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Departure time</Label>
          <Input type="datetime-local" className="mt-1" value={departureTime ?? ''} onChange={(e) => setDepartureTime(e.target.value)} />
        </div>
        <div>
          <Label>Return time</Label>
          <Input type="datetime-local" className="mt-1" value={returnTime ?? ''} onChange={(e) => setReturnTime(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Departure location</Label>
        <Input className="mt-1" value={departureLoc ?? ''} onChange={(e) => setDepartureLoc(e.target.value)} placeholder="Front of the gym" />
      </div>
      <div>
        <Label>Transport notes</Label>
        <Textarea className="mt-1" rows={2} value={transportNotes ?? ''} onChange={(e) => setTransportNotes(e.target.value)} />
      </div>
      <div>
        <Label>Uniform</Label>
        <Textarea className="mt-1" rows={2} value={uniformNotes ?? ''} onChange={(e) => setUniformNotes(e.target.value)} />
      </div>
      <div>
        <Label>What to bring</Label>
        <Textarea className="mt-1" rows={2} value={bringList ?? ''} onChange={(e) => setBringList(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Itinerary</Label>
        {itinerary.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              className="w-28"
              placeholder="3:45 PM"
              value={item.time}
              onChange={(e) => setItinerary((prev) => prev.map((it, idx) => (idx === i ? { ...it, time: e.target.value } : it)))}
            />
            <Input
              placeholder="Girls Varsity starts"
              value={item.label}
              onChange={(e) => setItinerary((prev) => prev.map((it, idx) => (idx === i ? { ...it, label: e.target.value } : it)))}
            />
            <Button variant="ghost" size="icon" onClick={() => setItinerary((prev) => prev.filter((_, idx) => idx !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setItinerary((prev) => [...prev, { time: '', label: '' }])}>
          <Plus className="h-3 w-3 mr-1" />
          Add itinerary row
        </Button>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => handleSave(false)} disabled={savePlan.isPending}>
          {savePlan.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save as draft
        </Button>
        <Button onClick={() => handleSave(true)} disabled={savePlan.isPending}>
          {savePlan.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Publish
        </Button>
      </div>
    </div>
  );
};

const PrintableRosterView: React.FC<{ meetId: string }> = ({ meetId }) => {
  const { data, isLoading } = usePrintableRoster(meetId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4 mr-2" />
        Print
      </Button>
      {data.races.map((race) => (
        <div key={race.id}>
          <h3 className="font-semibold mb-1">{race.name}</h3>
          {race.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entered/alternate athletes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bib</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Seed time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Splits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {race.entries.map((e) => (
                  <TableRow key={e.athleteId}>
                    <TableCell>{e.bibNumber ?? '—'}</TableCell>
                    <TableCell>{e.name}</TableCell>
                    <TableCell>{e.grade ?? '—'}</TableCell>
                    <TableCell>{formatTimeSec(e.seedTimeSec)}</TableCell>
                    <TableCell>{STATUS_LABEL[e.status]}</TableCell>
                    <TableCell className="w-24 border-l"></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ))}
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
          <CardHeader className="py-3">
            <CardTitle className="text-sm">{r.athleteName}</CardTitle>
          </CardHeader>
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

export default MeetOpsPage;
