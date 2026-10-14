import React, { useEffect, useMemo, useState } from 'react';
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Split, Plus, Trash2, ClipboardList, Download, Upload, Timer as TimerIcon, Users } from 'lucide-react';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useMeet, useUpdateMeet, useDeleteMeet, useCreateRace, useDeleteRace, useSetPostseasonLevel, useMeetEntrants } from '@/hooks/useMeetOps';
import { ImportResultsDialog } from '@/components/meets/ImportResultsDialog';
import { EnterRaceResultsDialog } from '@/components/meets/EnterRaceResultsDialog';
import { RaceDistanceDialog } from '@/components/meets/RaceDistanceDialog';
import { DISTANCE_PRESETS } from '@/lib/distancePresets';
import { ManageEntrantsDialog } from '@/components/meets/ManageEntrantsDialog';
import { MissingEntrantsCard } from '@/components/meets/MissingEntrantsCard';
import { MeetPredictionsCard } from '@/components/predictions/MeetPredictionsCard';
import { useReflectionsForRace } from '@/hooks/useRaceReflections';
import { useFeatureEnabled } from '@/hooks/useTeamFeatures';
import { meetOpsService, formatTimeSec, type MeetDetail, type PostseasonLevel } from '@/api/meetOpsService';
import { toCsv, downloadCsv } from '@/lib/csvParse';
import { getApiErrorMessage } from '@/lib/apiError';



// Meet detail, simplified per the Schedule rework: name/date/location/
// home-or-away (all editable) and, per race, an "Enter splits" link-out
// plus athletes' shared race plans (RaceReflection — pre-race goals and
// post-race reflection). Entries, meet-day logistics, and the printable
// roster all moved out — see routes/meetOps.js's header comment.
// The postseason ladder. Names vary by state — Ohio runs
// District/Regional/State, Texas runs District/Region/State, California
// runs League/Section/State — so these are rungs, not any one state's
// vocabulary.
const REGULAR_SEASON = '__regular__';
const POSTSEASON_LEVELS: PostseasonLevel[] = ['LEAGUE', 'DISTRICT', 'REGIONAL', 'STATE', 'NATIONAL'];
const POSTSEASON_LABELS: Record<PostseasonLevel, string> = {
  LEAGUE: 'League / conference',
  DISTRICT: 'District / sectional',
  REGIONAL: 'Regional',
  STATE: 'State',
  NATIONAL: 'National',
};

// `detailsOnly` is the next shell's meet page (docs/leadpack-new-ui-
// trial.md §4.6), which shows this from its overflow: just the meet's own
// details card, plus Add race and Export — races, entrants and
// predictions live on its own tabs. Off — classic — the page is unchanged.
const MeetDetailPage: React.FC<{ detailsOnly?: boolean }> = ({ detailsOnly = false }) => {
  const { meetId } = useParams<{ meetId: string }>();
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { data: meet, isLoading } = useMeet(meetId ?? null);
  const updateMeet = useUpdateMeet(meetId ?? null);
  const setPostseason = useSetPostseasonLevel(meetId ?? null);
  // Same query MissingEntrantsCard reads below — react-query dedupes by
  // key, so this doesn't cost a second request. Just the counts, for the
  // race picker label ("Varsity Boys (12)") — a coach picking a race off
  // this dropdown shouldn't have to open it to find out how big the field is.
  const { data: meetEntrants } = useMeetEntrants(meetId ?? null);
  const entrantCountByRace = useMemo(
    () => new Map((meetEntrants?.races ?? []).map((r) => [r.id, r.entrants.length])),
    [meetEntrants]
  );

  const deleteRace = useDeleteRace();
  const deleteMeet = useDeleteMeet();

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [isHome, setIsHome] = useState('unspecified');
  const [distance, setDistance] = useState('');
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  const [addRaceOpen, setAddRaceOpen] = useState(false);
  const [enterResultsOpen, setEnterResultsOpen] = useState(false);
  const [importResultsOpen, setImportResultsOpen] = useState(false);
  const [entrantsOpen, setEntrantsOpen] = useState(false);
  // Correcting a published distance — see useUpdateRaceDistance.
  const [distanceRace, setDistanceRace] = useState<{ id: string; name: string; distanceMeters: number | null } | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  useEffect(() => {
    if (!meet) return;
    setName(meet.name);
    setDate(meet.date.slice(0, 10));
    setLocation(meet.location ?? '');
    setIsHome(meet.isHome == null ? 'unspecified' : meet.isHome ? 'home' : 'away');
    setDistance(meet.distance ?? '');
  }, [meet]);

  const handleSave = async () => {
    if (!name.trim() || !date) return;
    try {
      await updateMeet.mutateAsync({
        name: name.trim(),
        date,
        location: location.trim(),
        isHome: isHome === 'unspecified' ? null : isHome === 'home',
        distance: distance.trim(),
      });
      toast.success('Meet updated.');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not save changes.'));
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
    isHome !== (meet.isHome == null ? 'unspecified' : meet.isHome ? 'home' : 'away') ||
    distance.trim() !== (meet.distance ?? '');

  const selectedRace = meet.races.find((r) => r.id === selectedRaceId) ?? null;

  // Deleting a meet does NOT delete its racing. The races keep every
  // result, split, entrant and reflection — they just stop being grouped
  // under this meet (backend clears Race.meetId). Only the meet row and
  // its day-of plan go. The confirmation says so in those words, with the
  // race count, because "delete" on a screen full of results reads as
  // something far worse than what this does.
  const handleDeleteMeet = async () => {
    const raceCount = meet.races.length;
    const consequence =
      raceCount === 0
        ? 'It has no races linked, so nothing else is affected.'
        : `Its ${raceCount} race${raceCount === 1 ? '' : 's'} and every result, split and entrant stay — they just stop being grouped under this meet. The meet's day-of plan is deleted.`;
    if (!window.confirm(`Delete "${meet.name}"?\n\n${consequence}\n\nThis cannot be undone.`)) return;
    try {
      await deleteMeet.mutateAsync(meet.id);
      toast.success('Meet deleted.');
      navigate(teamPath('/meets'));
    } catch {
      toast.error('Could not delete that meet.');
    }
  };

  const handleDeleteRace = async (raceId: string) => {
    if (!window.confirm('Delete this race and all its results? This cannot be undone.')) return;
    try {
      await deleteRace.mutateAsync(raceId);
      toast.success('Race deleted.');
      if (selectedRaceId === raceId) setSelectedRaceId(null);
    } catch {
      toast.error('Could not delete that race.');
    }
  };

  // Every race's results at once, combined into one CSV — "I ran 4 races'
  // timer sheets, now I need to export all of it." Fetched on click, not
  // kept as a standing query: this is a one-off action a coach reaches
  // for once per meet, not something the page needs to keep in sync with.
  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const { results } = await meetOpsService.getMeetResults(meet.id);
      const csv = toCsv(
        ['Race', 'Name', 'Grade', 'Gender', 'Time', 'Status'],
        results.map((r) => ({
          Race: r.raceName,
          Name: r.name,
          Grade: r.grade != null ? String(r.grade) : '',
          Gender: r.gender ?? '',
          Time: r.time != null ? formatTimeSec(r.time) : '',
          Status: r.status,
        }))
      );
      const safeName = meet.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'meet';
      downloadCsv(`${safeName}-results.csv`, csv);
    } catch {
      toast.error('Could not export results.');
    } finally {
      setExportingCsv(false);
    }
  };

  const renderDetailsCard = () => (
    <>
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
            <div className="sm:col-span-2">
              <Label>Distance</Label>
              {/* Known ahead of the race itself existing — this team's
                  races only materialize once results are scraped, after
                  the meet. Confirming it here lets race predictions use
                  the real distance instead of guessing from an athlete's
                  own history; see routes/meetOps.js's PUT /:meetId. */}
              <div className="mt-1 flex flex-wrap gap-2">
                {DISTANCE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant={distance === preset.label ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDistance(preset.label)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <Input
                className="mt-2"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                placeholder="Optional — e.g. 5K, 2 Miles"
              />
              {meet.races.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Used to predict times until a real race exists for this meet — races only link once results
                  are scraped.
                </p>
              )}
            </div>
            <div>
              <Label>Post season</Label>
              {/* Nothing infers this. lib/postseason.js reads the meet's
                  name and suggests, and a coach confirms — "Penn State
                  Invitational" contains the word state and is not a state
                  meet, and a wrong mark writes a program's postseason
                  history without anyone noticing. */}
              <Select
                value={meet.postseasonLevel ?? REGULAR_SEASON}
                onValueChange={(value) =>
                  setPostseason.mutate(value === REGULAR_SEASON ? null : (value as PostseasonLevel), {
                    onSuccess: (result) =>
                      toast.success(
                        result.level
                          ? `Marked ${result.raceCount} race${result.raceCount === 1 ? '' : 's'} as ${POSTSEASON_LABELS[result.level]}.`
                          : 'Marked as regular season.'
                      ),
                    onError: () => toast.error('Could not save that.'),
                  })
                }
                disabled={setPostseason.isPending || meet.races.length === 0}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={REGULAR_SEASON}>Regular season</SelectItem>
                  {POSTSEASON_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>{POSTSEASON_LABELS[level]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {meet.races.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Add a race first — the level is stored on the races.</p>
              ) : meet.postseasonMixed ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  This meet's races are marked differently from each other. Choosing a level sets all of them.
                </p>
              ) : !meet.postseasonLevel && meet.suggestedPostseasonLevel ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Looks like {POSTSEASON_LABELS[meet.suggestedPostseasonLevel].toLowerCase()} from the name — set it if
                  that's right.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Counts toward how far the program got each year, on the Program screen.
                </p>
              )}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" onClick={handleDeleteMeet} disabled={deleteMeet.isPending}>
              {deleteMeet.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2 text-destructive" />
              )}
              Delete meet
            </Button>
            <Button onClick={handleSave} disabled={!dirty || !name.trim() || !date || updateMeet.isPending}>
              {updateMeet.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
          {meet.races.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Deleting the meet keeps its {meet.races.length} race{meet.races.length === 1 ? '' : 's'} and all their
              results — they just stop being grouped under it.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );

  if (detailsOnly) {
    return (
      <div className="space-y-4">
        {renderDetailsCard()}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAddRaceOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add race
          </Button>
          {meet.races.length > 0 && (
            <Button variant="outline" onClick={handleExportCsv} disabled={exportingCsv}>
              {exportingCsv ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Export results CSV
            </Button>
          )}
        </div>
        <AddRaceDialog meet={meet} open={addRaceOpen} onOpenChange={setAddRaceOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" className="-ml-2" onClick={() => navigate(teamPath('/meets'))}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Meets
      </Button>

      {renderDetailsCard()}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>Race plans</CardTitle>
            <div className="flex items-center gap-2">
              {meet.races.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={exportingCsv}>
                  {exportingCsv ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  Export CSV
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setAddRaceOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Race
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {meet.races.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This meet has no races linked yet — scraped results link automatically, or add one by hand (e.g. a time trial).
              Once it has results it's treated exactly like any other race.
            </p>
          ) : (
            // A dropdown hid every race but one — a coach with several
            // races at a meet (varsity/JV x boys/girls, easily) wants to
            // see the whole list and reach any of them without a menu in
            // the way. Each race is its own self-contained block instead:
            // its name, its own action buttons, its own reflections.
            <div className="space-y-4">
              {meet.races.map((r) => {
                const count = entrantCountByRace.get(r.id);
                return (
                  <div key={r.id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{r.name}</span>
                        {/* The distance was invisible here, which is how a
                            wrong one survives: every pace in the app is
                            time / distance, but nothing on screen said
                            what distance was being divided by. */}
                        <button
                          type="button"
                          className="shrink-0 rounded border border-dashed px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Correct this race's distance"
                          onClick={() => setDistanceRace({ id: r.id, name: r.name, distanceMeters: r.distanceMeters ?? null })}
                        >
                          {r.distanceMeters ? `${Math.round(r.distanceMeters)}m` : 'set distance'}
                        </button>
                        {count != null && <span className="shrink-0 text-xs text-muted-foreground">{count} entered</span>}
                        {r.isManual && <span className="shrink-0 text-xs text-muted-foreground">Manual</span>}
                      </div>
                      {r.isManual && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleDeleteRace(r.id)}
                          disabled={deleteRace.isPending}
                          title="Delete this race"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedRaceId(r.id);
                          setEntrantsOpen(true);
                        }}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Entrants
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(teamPath(`/race/${r.id}/timer`))}>
                        <TimerIcon className="h-4 w-4 mr-2" />
                        Live Timer
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedRaceId(r.id);
                          setImportResultsOpen(true);
                        }}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Import Results
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedRaceId(r.id);
                          setEnterResultsOpen(true);
                        }}
                      >
                        <ClipboardList className="h-4 w-4 mr-2" />
                        Enter Results
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(teamPath(`/race/${r.id}/splits`))}>
                        <Split className="h-4 w-4 mr-2" />
                        Enter splits
                      </Button>
                    </div>
                    <ReflectionsView raceId={r.id} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <MissingEntrantsCard meetId={meet.id} seasonYear={meet.seasonYear} />

      <MeetPredictionsCard meetId={meet.id} />

      <AddRaceDialog meet={meet} open={addRaceOpen} onOpenChange={setAddRaceOpen} />

      <RaceDistanceDialog race={distanceRace} onClose={() => setDistanceRace(null)} />

      {selectedRaceId && (
        <ManageEntrantsDialog
          raceId={selectedRaceId}
          raceName={selectedRace?.name ?? ''}
          seasonYear={meet.seasonYear}
          raceDistanceMeters={selectedRace?.distanceMeters ?? null}
          open={entrantsOpen}
          onOpenChange={setEntrantsOpen}
        />
      )}
      {selectedRaceId && (
        <EnterRaceResultsDialog
          raceId={selectedRaceId}
          raceName={selectedRace?.name ?? ''}
          seasonYear={meet.seasonYear}
          open={enterResultsOpen}
          onOpenChange={setEnterResultsOpen}
        />
      )}
      {selectedRaceId && (
        <ImportResultsDialog
          raceId={selectedRaceId}
          raceName={selectedRace?.name ?? ''}
          seasonYear={meet.seasonYear}
          open={importResultsOpen}
          onOpenChange={setImportResultsOpen}
        />
      )}
    </div>
  );
};

const ReflectionsView: React.FC<{ raceId: string }> = ({ raceId }) => {
  // A team can opt out of athlete-written reflections entirely (Settings →
  // Features); the API refuses this call then, so don't make it.
  const enabled = useFeatureEnabled('reflections');
  const { data, isLoading } = useReflectionsForRace(raceId, { enabled });
  if (!enabled) return null;
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

export default MeetDetailPage;
