import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { toast } from 'sonner';
import { Plus, Loader2, CalendarDays, Download } from 'lucide-react';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateShort } from '@/lib/formatUtils';
import {
  useMeets,
  useCreateMeet,
  useProposeImport,
  useConfirmImport,
  useProposeCalendarImport,
  useConfirmCalendarImport,
} from '@/hooks/useMeetOps';
import { entryStatusLabel, type ProposedMeet, type ProposedCalendarMeet } from '@/api/meetOpsService';

// Meets, simplified per the Schedule rework: this list is now just
// name/date/location/home-or-away plus the two import flows that create
// Meet rows. Entries, meet-day logistics, and the printable roster all
// moved out — results sync (routes/meets.js) supplies what's needed once a
// race is scraped, and coaches no longer hand-manage entries here. Race
// plans (RaceReflection) live on the meet detail page a click opens
// (MeetDetailPage.tsx).

const MeetsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { seasons, activeYear } = useSeasonSelection();
  const navigate = useNavigate();
  const teamPath = useTeamPath();

  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;

  const { data: meets = [], isLoading: meetsLoading } = useMeets(seasonId);

  const createMeet = useCreateMeet(seasonId);
  const [newMeetOpen, setNewMeetOpen] = useState(false);
  const [newMeetName, setNewMeetName] = useState('');
  const [newMeetDate, setNewMeetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newMeetLocation, setNewMeetLocation] = useState('');
  const [newMeetIsHome, setNewMeetIsHome] = useState<string>('unspecified');

  const [importOpen, setImportOpen] = useState(false);
  const [calendarImportOpen, setCalendarImportOpen] = useState(false);

  const handleCreateMeet = async () => {
    if (!newMeetName.trim() || !newMeetDate) return;
    try {
      const created = await createMeet.mutateAsync({
        name: newMeetName.trim(),
        date: newMeetDate,
        location: newMeetLocation.trim() || undefined,
        isHome: newMeetIsHome === 'unspecified' ? null : newMeetIsHome === 'home',
      });
      toast.success('Meet created.');
      setNewMeetOpen(false);
      setNewMeetName('');
      setNewMeetLocation('');
      setNewMeetIsHome('unspecified');
      navigate(teamPath(`/meet/${created.id}`));
    } catch {
      toast.error('Could not create that meet.');
    }
  };

  // B4 (LeadPack Master Build Handoff): athletes get "Meets, read-only" —
  // GET /api/meet-ops returns myEntryStatus per race for a caller with a
  // linkedAthlete, so this reuses the exact same list query the coach view
  // below uses; it just renders it differently. Volunteer coaches get the
  // full coach view, same as head/paid coaches — this branch is
  // athlete-only. Placed after every hook above so hook call order never
  // depends on role.
  const teamRole = currentUser?.teamRole;
  const isCoachViewer = teamRole === 'HEAD_COACH' || teamRole === 'COACH' || teamRole === 'VOLUNTEER_COACH';
  if (!isCoachViewer) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Meets</h1>
        {meetsLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : meets.length === 0 ? (
          <p className="text-muted-foreground">No meets scheduled yet.</p>
        ) : (
          <div className="space-y-3">
            {meets.map((m) => (
              <Card key={m.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{m.name}</span>
                    <span className="text-sm font-normal text-muted-foreground">{formatDateShort(m.date)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    {m.location && <p className="text-sm text-muted-foreground">{m.location}</p>}
                    {m.isHome != null && (
                      <Badge variant="outline" className="font-normal">{m.isHome ? 'Home' : 'Away'}</Badge>
                    )}
                  </div>
                  {m.races.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-sm">
                      <span>{r.name}</span>
                      <span className="text-muted-foreground">{entryStatusLabel(r.myEntryStatus)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

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
          <Button variant="outline" onClick={() => setCalendarImportOpen(true)}>
            <CalendarDays className="h-4 w-4 mr-2" />
            Import from Athletic.net
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            Import from races
          </Button>
          <Button variant="outline" onClick={() => setNewMeetOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Meet
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Meets this season</CardTitle>
        </CardHeader>
        <CardContent className="py-2 space-y-1">
          {meetsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!meetsLoading && meets.length === 0 && <p className="text-sm text-muted-foreground">No meets yet.</p>}
          {meets.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(teamPath(`/meet/${m.id}`))}
              className="w-full text-left rounded-md px-2 py-2 text-sm hover:bg-slate-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{m.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {m.isHome != null && (
                    <Badge variant="outline" className="text-[10px] font-normal">{m.isHome ? 'Home' : 'Away'}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{m.date.slice(0, 10)}</span>
                </div>
              </div>
              {m.location && <div className="text-xs text-muted-foreground">{m.location}</div>}
            </button>
          ))}
        </CardContent>
      </Card>

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
            <div>
              <Label>Home or away</Label>
              <Select value={newMeetIsHome} onValueChange={setNewMeetIsHome}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unspecified">Not set</SelectItem>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="away">Away</SelectItem>
                </SelectContent>
              </Select>
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

      <ImportMeetsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        seasonId={seasonId}
        onImported={(firstMeetId) => {
          if (firstMeetId) navigate(teamPath(`/meet/${firstMeetId}`));
        }}
      />

      <ImportCalendarDialog
        open={calendarImportOpen}
        onClose={() => setCalendarImportOpen(false)}
        seasonId={seasonId}
        onImported={(firstMeetId) => {
          if (firstMeetId) navigate(teamPath(`/meet/${firstMeetId}`));
        }}
      />
    </div>
  );
};

interface ImportRow extends ProposedMeet {
  included: boolean;
  editedName: string;
}

// Meets don't exist for a season until something groups its scraped races
// (or the calendar import below) into one — this proposes groupings from
// races already scraped this season that aren't linked to a Meet yet, a
// coach reviews/edits names, then confirms.
const ImportMeetsDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  seasonId: string | null;
  onImported: (firstMeetId?: string) => void;
}> = ({ open, onClose, seasonId, onImported }) => {
  const proposeImport = useProposeImport(seasonId);
  const confirmImport = useConfirmImport(seasonId);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [proposed, setProposed] = useState(false);

  useEffect(() => {
    if (open && !proposed) {
      proposeImport.mutate(undefined, {
        onSuccess: (data) => {
          setRows(data.map((m) => ({ ...m, included: true, editedName: m.proposedName })));
          setProposed(true);
        },
        onError: () => toast.error('Could not load races for this season.'),
      });
    }
    if (!open) {
      setProposed(false);
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleImport = async () => {
    const selected = rows.filter((r) => r.included && r.editedName.trim());
    if (selected.length === 0) return;
    try {
      const result = await confirmImport.mutateAsync(
        selected.map((r) => ({ name: r.editedName.trim(), date: r.date, location: r.location, raceIds: r.raceIds }))
      );
      toast.success(result.msg);
      onImported(result.meets[0]?.id);
      onClose();
    } catch {
      toast.error('Could not import meets.');
    }
  };

  const selectedCount = rows.filter((r) => r.included).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import meets from this season's races</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Races on the same day are grouped into one proposed meet (boys/girls, varsity/JV races at the same event share a day).
          Nothing is created until you confirm.
        </p>
        {proposeImport.isPending ? (
          <p className="text-sm text-muted-foreground py-4">Loading races…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No unlinked races found for this season — either everything's already grouped into a meet, or nothing's been scraped yet.
          </p>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {rows.map((row, i) => (
              <div key={i} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={row.included}
                  onCheckedChange={(v) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, included: Boolean(v) } : r)))}
                  className="mt-2"
                />
                <div className="flex-1 space-y-1">
                  <Input
                    className="h-8"
                    value={row.editedName}
                    onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, editedName: e.target.value } : r)))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {row.date.slice(0, 10)}
                    {row.location ? ` · ${row.location}` : ''} · {row.raceCount} race{row.raceCount === 1 ? '' : 's'}: {row.raceNames.join(', ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleImport} disabled={selectedCount === 0 || confirmImport.isPending}>
            {confirmImport.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import {selectedCount > 0 ? `${selectedCount} meet${selectedCount === 1 ? '' : 's'}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface CalendarImportRow extends ProposedCalendarMeet {
  included: boolean;
  editedName: string;
}

// Sourced from the team's own Athletic.net calendar feed rather than
// scraped races — the only way to pull in a season's schedule before any
// results exist (preseason), and the way to pick up midseason schedule
// changes (a rescheduled or added meet) without waiting for results to be
// scraped first. Keyed on Athletic.net's own meet ID (lib/icalMeets.js),
// so re-running this — even after the "Import from races" flow already
// created some of these meets from scraped results — never creates a
// second Meet row for the same real-world meet; it just refreshes it and
// links any newly-scraped, still-unlinked races.
const ImportCalendarDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  seasonId: string | null;
  onImported: (firstMeetId?: string) => void;
}> = ({ open, onClose, seasonId, onImported }) => {
  const proposeImport = useProposeCalendarImport(seasonId);
  const confirmImport = useConfirmCalendarImport(seasonId);
  const [rows, setRows] = useState<CalendarImportRow[]>([]);
  const [proposed, setProposed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (open && !proposed) {
      setLoadError(null);
      proposeImport.mutate(undefined, {
        onSuccess: (data) => {
          setRows(data.map((m) => ({ ...m, included: true, editedName: m.name })));
          setProposed(true);
        },
        onError: (err: unknown) => {
          const message =
            (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ??
            "Could not load this team's Athletic.net schedule.";
          setLoadError(message);
        },
      });
    }
    if (!open) {
      setProposed(false);
      setRows([]);
      setLoadError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleImport = async () => {
    const selected = rows.filter((r) => r.included && r.editedName.trim());
    if (selected.length === 0) return;
    try {
      const result = await confirmImport.mutateAsync(
        selected.map((r) => ({ athleticMeetId: r.athleticMeetId, name: r.editedName.trim(), date: r.date, location: r.location }))
      );
      toast.success(result.msg);
      onImported(result.meets[0]?.id);
      onClose();
    } catch {
      toast.error('Could not import meets.');
    }
  };

  const selectedCount = rows.filter((r) => r.included).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import meets from Athletic.net</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pulls this season's schedule straight from your team's Athletic.net calendar — works before results exist, and safe to
          re-run for midseason changes. Nothing is created until you confirm.
        </p>
        {proposeImport.isPending ? (
          <p className="text-sm text-muted-foreground py-4">Loading schedule…</p>
        ) : loadError ? (
          <p className="text-sm text-destructive py-4">{loadError}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No meets found on this team's Athletic.net schedule for this season.</p>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {rows.map((row, i) => (
              <div key={row.athleticMeetId} className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={row.included}
                  onCheckedChange={(v) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, included: Boolean(v) } : r)))}
                  className="mt-2"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8"
                      value={row.editedName}
                      onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, editedName: e.target.value } : r)))}
                    />
                    {row.alreadyImported && <Badge variant="secondary" className="text-[10px] shrink-0">Already on schedule</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.date.slice(0, 10)}
                    {row.location ? ` · ${row.location}` : ''}
                    {row.unlinkedRaceCount > 0
                      ? ` · ${row.unlinkedRaceCount} scraped result${row.unlinkedRaceCount === 1 ? '' : 's'} will be linked`
                      : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleImport} disabled={selectedCount === 0 || confirmImport.isPending}>
            {confirmImport.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import {selectedCount > 0 ? `${selectedCount} meet${selectedCount === 1 ? '' : 's'}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MeetsPage;
