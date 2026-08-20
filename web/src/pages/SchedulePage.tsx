import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Download, Loader2, Plus, Upload } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import {
  usePracticePlanRange,
  useSavePracticePlan,
  useSetPublished,
  useDuplicateDay,
  useDuplicateWeek,
  useExportPracticePlans,
  useImportPracticePlans,
} from '@/hooks/usePracticePlans';
import { usePracticeLocations, useCreatePracticeLocation } from '@/hooks/usePracticeLocations';
import { useWorkoutTemplates } from '@/hooks/useWorkoutTemplates';
import { useIntervalSessions } from '@/hooks/useIntervalSessions';
import { useMeets } from '@/hooks/useMeetOps';
import type { PracticePlan } from '@/api/practicePlanService';
import type { MeetSummary } from '@/api/meetOpsService';
import { formatDateShort } from '@/lib/formatUtils';
import { toCsv } from '@/lib/csvParse';

// Schedule rework: Practice Plans and Meets merged into one calendar, with
// month/week/agenda views (all sharing the same DayCell rendering, agenda
// just lists its own rows) — a coach opened two separate, mostly-empty
// pages before this and had to hold the actual paper calendar to know what
// day was what. Clicking a day opens the simplified plan editor (Location,
// Announcements, Pre Run/Run/Post Run, plus an attached workout template or
// interval sheet); clicking a meet navigates to that meet's detail page.

const NONE = '__none__';
const NEW_LOCATION = '__new__';
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type ViewMode = 'month' | 'week' | 'agenda';
const AGENDA_WINDOW_DAYS = 30;

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay());
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function isSameDay(a: Date, b: Date): boolean {
  return toISODate(a) === toISODate(b);
}
function formatDayHeading(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function downloadCsv(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const SchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { data: context } = useTeamContext();
  const { data: seasons = [] } = useAvailableSeasons(context?.team?.id);

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [viewWeekStart, setViewWeekStart] = useState(() => startOfWeek(new Date()));
  const [agendaStart, setAgendaStart] = useState(() => new Date());
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const activeYear = selectedYear ?? context?.activeSeason ?? seasons[0]?.year ?? null;
  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;

  const gridDays = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const gridStart = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewMonth]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(viewWeekStart, i)), [viewWeekStart]);

  const agendaDays = useMemo(
    () => Array.from({ length: AGENDA_WINDOW_DAYS }, (_, i) => addDays(agendaStart, i)),
    [agendaStart]
  );

  const rangeStart = viewMode === 'month' ? gridDays[0] : viewMode === 'week' ? weekDays[0] : agendaDays[0];
  const rangeEnd =
    viewMode === 'month' ? gridDays[41] : viewMode === 'week' ? weekDays[6] : agendaDays[AGENDA_WINDOW_DAYS - 1];

  const { data: plans = [] } = usePracticePlanRange(seasonId, toISODate(rangeStart), toISODate(rangeEnd));
  const { data: meets = [] } = useMeets(seasonId);

  const planByDate = useMemo(() => new Map(plans.map((p) => [p.date.slice(0, 10), p])), [plans]);
  const meetsByDate = useMemo(() => {
    const map = new Map<string, typeof meets>();
    for (const m of meets) {
      const key = m.date.slice(0, 10);
      const existing = map.get(key);
      if (existing) existing.push(m);
      else map.set(key, [m]);
    }
    return map;
  }, [meets]);

  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const today = new Date();

  const handleModeChange = (mode: ViewMode) => {
    if (mode === 'week') setViewWeekStart(startOfWeek(viewMonth));
    if (mode === 'agenda') setAgendaStart(viewMonth);
    setViewMode(mode);
  };

  const exportPlans = useExportPracticePlans();
  const handleExport = async () => {
    try {
      const { headers, rows } = await exportPlans.mutateAsync({
        seasonId: seasonId as string,
        from: toISODate(rangeStart),
        to: toISODate(rangeEnd),
      });
      if (rows.length === 0) {
        toast('No practices to export in this range.');
        return;
      }
      downloadCsv(`practices-${toISODate(rangeStart)}-to-${toISODate(rangeEnd)}.csv`, toCsv(headers, rows));
    } catch {
      toast.error('Could not export practices.');
    }
  };

  if (!activeYear || !seasonId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">No season set up yet — set one up from the Groups screen first.</p>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-sm text-muted-foreground">Practices and meets for the season.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(activeYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.year} value={String(s.year)}>
                  {s.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport} disabled={exportPlans.isPending}>
            {exportPlans.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
          {(['month', 'week', 'agenda'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleModeChange(mode)}
              className={`px-3 py-1 text-sm rounded capitalize transition-colors ${
                viewMode === mode ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (viewMode === 'month') setViewMonth((m) => addMonths(m, -1));
              else if (viewMode === 'week') setViewWeekStart((w) => addDays(w, -7));
              else setAgendaStart((a) => addDays(a, -AGENDA_WINDOW_DAYS));
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold whitespace-nowrap">
            {viewMode === 'month' && viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            {viewMode === 'week' &&
              `${weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
            {viewMode === 'agenda' &&
              `${agendaDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${agendaDays[AGENDA_WINDOW_DAYS - 1].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (viewMode === 'month') setViewMonth((m) => addMonths(m, 1));
              else if (viewMode === 'week') setViewWeekStart((w) => addDays(w, 7));
              else setAgendaStart((a) => addDays(a, AGENDA_WINDOW_DAYS));
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {viewMode === 'month' && (
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="bg-muted text-xs font-medium text-muted-foreground text-center py-1.5">
              {d}
            </div>
          ))}
          {gridDays.map((day) => (
            <DayCell
              key={toISODate(day)}
              day={day}
              faded={day.getMonth() !== viewMonth.getMonth()}
              isToday={isSameDay(day, today)}
              plan={planByDate.get(toISODate(day)) ?? null}
              dayMeets={meetsByDate.get(toISODate(day)) ?? []}
              onSelectDay={() => setEditorDate(toISODate(day))}
              onSelectMeet={(id) => navigate(teamPath(`/meet/${id}`))}
            />
          ))}
        </div>
      )}

      {viewMode === 'week' && (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border min-w-[720px]">
            {weekDays.map((day) => (
              <div key={toISODate(day)} className="bg-muted text-xs font-medium text-muted-foreground text-center py-1.5">
                {day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
              </div>
            ))}
            {weekDays.map((day) => (
              <DayCell
                key={toISODate(day)}
                day={day}
                faded={false}
                isToday={isSameDay(day, today)}
                plan={planByDate.get(toISODate(day)) ?? null}
                dayMeets={meetsByDate.get(toISODate(day)) ?? []}
                onSelectDay={() => setEditorDate(toISODate(day))}
                onSelectMeet={(id) => navigate(teamPath(`/meet/${id}`))}
                roomy
              />
            ))}
          </div>
        </div>
      )}

      {viewMode === 'agenda' && (
        <div className="space-y-2">
          {(() => {
            const activeDays = agendaDays.filter(
              (day) => planByDate.get(toISODate(day)) || (meetsByDate.get(toISODate(day)) ?? []).length > 0
            );
            if (activeDays.length === 0) {
              return <p className="text-sm text-muted-foreground py-6">Nothing scheduled in this window.</p>;
            }
            return activeDays.map((day) => {
              const iso = toISODate(day);
              const plan = planByDate.get(iso) ?? null;
              const dayMeets = meetsByDate.get(iso) ?? [];
              return (
                <div key={iso} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setEditorDate(iso)}
                      className={`text-sm font-medium hover:underline text-left ${isSameDay(day, today) ? 'text-primary' : ''}`}
                    >
                      {formatDayHeading(day)}
                    </button>
                  </div>
                  {plan && (
                    <button type="button" onClick={() => setEditorDate(iso)} className="block w-full text-left space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        {plan.locationName && <span className="font-medium">{plan.locationName}</span>}
                        {plan.startTime && <span className="text-muted-foreground">{plan.startTime}</span>}
                        <span
                          className={`text-[11px] rounded px-1.5 py-0.5 ${
                            plan.published ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {plan.published ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      {(plan.run || plan.workoutTemplate?.name || plan.intervalSession?.title) && (
                        <p className="text-sm text-muted-foreground">
                          {[plan.run, plan.workoutTemplate?.name, plan.intervalSession?.title].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </button>
                  )}
                  {dayMeets.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => navigate(teamPath(`/meet/${m.id}`))}
                      className="block w-full text-left text-sm rounded px-2 py-1 bg-secondary text-secondary-foreground hover:underline"
                    >
                      {m.name}
                      {m.location ? ` · ${m.location}` : ''}
                    </button>
                  ))}
                </div>
              );
            });
          })()}
        </div>
      )}

      {editorDate && (
        <DayEditorDialog
          date={editorDate}
          seasonId={seasonId}
          plan={planByDate.get(editorDate) ?? null}
          onClose={() => setEditorDate(null)}
        />
      )}

      <ImportPracticesDialog open={importOpen} onClose={() => setImportOpen(false)} seasonId={seasonId} />
    </div>
  );
};

const DayCell: React.FC<{
  day: Date;
  faded: boolean;
  isToday: boolean;
  plan: PracticePlan | null;
  dayMeets: MeetSummary[];
  onSelectDay: () => void;
  onSelectMeet: (meetId: string) => void;
  roomy?: boolean;
}> = ({ day, faded, isToday, plan, dayMeets, onSelectDay, onSelectMeet, roomy }) => {
  const planLabel = plan ? plan.locationName ?? plan.run ?? plan.workoutTemplate?.name ?? plan.intervalSession?.title : null;

  return (
    <button
      type="button"
      onClick={onSelectDay}
      className={`bg-background p-1.5 text-left flex flex-col gap-1 hover:bg-accent/50 transition-colors ${
        roomy ? 'min-h-[180px]' : 'min-h-[84px]'
      } ${faded ? 'opacity-40' : ''}`}
    >
      <span
        className={`text-xs w-5 h-5 inline-flex items-center justify-center ${
          isToday ? 'rounded-full bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'
        }`}
      >
        {day.getDate()}
      </span>
      {planLabel && (
        <span
          className={`text-[11px] rounded px-1 py-0.5 truncate ${
            plan?.published ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {planLabel}
        </span>
      )}
      {roomy && plan?.run && plan.run !== planLabel && (
        <span className="text-[11px] text-muted-foreground truncate">{plan.run}</span>
      )}
      {dayMeets.map((m) => (
        <span
          key={m.id}
          role="link"
          onClick={(e) => {
            e.stopPropagation();
            onSelectMeet(m.id);
          }}
          className="text-[11px] rounded px-1 py-0.5 truncate bg-secondary text-secondary-foreground hover:underline"
        >
          {m.name}
        </span>
      ))}
    </button>
  );
};

// Practices-only bulk import (routes/practicePlans.js's POST /import) —
// meets keep using the separate Athletic.net/scraped-race importers on the
// Meets page. A coach can either upload a .csv file or paste CSV text
// straight in; both land in the same csvText state.
const ImportPracticesDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  seasonId: string;
}> = ({ open, onClose, seasonId }) => {
  const importPlans = useImportPracticePlans(seasonId);
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<{ imported: number; skipped: number; warnings: Array<{ row: number; message: string }> } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    onClose();
    setCsvText('');
    setResult(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvText(await readFileAsText(file));
    setResult(null);
  };

  const handleImport = async () => {
    if (!csvText.trim()) return;
    try {
      const res = await importPlans.mutateAsync(csvText);
      setResult(res);
      toast.success(res.msg);
    } catch {
      toast.error('Could not import that CSV.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import practices</DialogTitle>
          <DialogDescription>
            Columns: Date (YYYY-MM-DD, required), Location, Start Time, Announcements, Pre Run, Run, Post Run, Workout
            Template, Interval Sheet, Published (TRUE/FALSE). A row overwrites that day's existing plan; new locations
            are created automatically, but Workout Template/Interval Sheet names must already exist.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="text-sm" />
          <Textarea
            rows={8}
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setResult(null);
            }}
            placeholder="Or paste CSV text here…"
            className="font-mono text-xs"
          />
          {result && (
            <div className="text-sm space-y-1">
              <p>
                {result.imported} imported, {result.skipped} skipped.
              </p>
              {result.warnings.length > 0 && (
                <ul className="text-xs text-amber-700 list-disc pl-4 max-h-32 overflow-y-auto">
                  {result.warnings.map((w, i) => (
                    <li key={i}>
                      Row {w.row}: {w.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button onClick={handleImport} disabled={!csvText.trim() || importPlans.isPending}>
            {importPlans.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DayEditorDialog: React.FC<{
  date: string;
  seasonId: string;
  plan: PracticePlan | null;
  onClose: () => void;
}> = ({ date, seasonId, plan, onClose }) => {
  const { data: locations = [] } = usePracticeLocations();
  const { data: templates = [] } = useWorkoutTemplates();
  const { data: sessions = [] } = useIntervalSessions(seasonId);
  const activeSessions = sessions.filter((s) => !s.archived);

  const savePlan = useSavePracticePlan(seasonId);
  const setPublished = useSetPublished(seasonId);
  const duplicateDay = useDuplicateDay(seasonId);
  const duplicateWeek = useDuplicateWeek(seasonId);
  const createLocation = useCreatePracticeLocation();

  const [locationId, setLocationId] = useState(plan?.locationId ?? NONE);
  const [newLocationName, setNewLocationName] = useState('');
  const [startTime, setStartTime] = useState(plan?.startTime ?? '');
  const [announcements, setAnnouncements] = useState(plan?.announcements ?? '');
  const [preRun, setPreRun] = useState(plan?.preRun ?? '');
  const [run, setRun] = useState(plan?.run ?? '');
  const [postRun, setPostRun] = useState(plan?.postRun ?? '');
  const [workoutTemplateId, setWorkoutTemplateId] = useState(plan?.workoutTemplateId ?? NONE);
  const [intervalSessionId, setIntervalSessionId] = useState(plan?.intervalSessionId ?? NONE);

  const handleSave = async () => {
    try {
      let finalLocationId = locationId;
      if (locationId === NEW_LOCATION) {
        if (!newLocationName.trim()) {
          toast.error('Enter a name for the new location.');
          return;
        }
        const created = await createLocation.mutateAsync(newLocationName.trim());
        finalLocationId = created.id;
      }
      await savePlan.mutateAsync({
        seasonId,
        date,
        locationId: finalLocationId === NONE ? null : finalLocationId,
        startTime: startTime || null,
        announcements: announcements || null,
        preRun: preRun || null,
        run: run || null,
        postRun: postRun || null,
        workoutTemplateId: workoutTemplateId === NONE ? null : workoutTemplateId,
        intervalSessionId: intervalSessionId === NONE ? null : intervalSessionId,
      });
      toast.success('Plan saved.');
      onClose();
    } catch {
      toast.error('Could not save that plan.');
    }
  };

  const handlePublishToggle = async () => {
    if (!plan) return;
    try {
      await setPublished.mutateAsync({ planId: plan.id, published: !plan.published });
      toast.success(plan.published ? 'Unpublished.' : 'Published — athletes can see this now.');
    } catch {
      toast.error('Could not update publish state.');
    }
  };

  const handleDuplicateTomorrow = async () => {
    if (!plan) return;
    const tomorrow = toISODate(addDays(new Date(`${date}T00:00:00`), 1));
    try {
      await duplicateDay.mutateAsync({ planId: plan.id, toDate: tomorrow, toSeasonId: seasonId });
      toast.success('Duplicated to tomorrow.');
    } catch {
      toast.error('Could not duplicate that day.');
    }
  };

  const handleDuplicateWeek = async () => {
    const weekStart = toISODate(addDays(new Date(`${date}T00:00:00`), -new Date(`${date}T00:00:00`).getDay()));
    const nextWeekStart = toISODate(addDays(new Date(`${weekStart}T00:00:00`), 7));
    try {
      const result = await duplicateWeek.mutateAsync({ seasonId, fromWeekStart: weekStart, toWeekStart: nextWeekStart });
      toast.success(`Duplicated ${result.count} day${result.count === 1 ? '' : 's'} to next week.`);
    } catch {
      toast.error('Could not duplicate that week.');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{formatDateShort(new Date(`${date}T00:00:00`))}</DialogTitle>
          <DialogDescription>
            {plan?.published ? 'Published — athletes can see this.' : 'Draft — athletes cannot see this until published.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No location set</SelectItem>
                {locations.filter((l) => !l.archived).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_LOCATION}>
                  <span className="flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add new location
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {locationId === NEW_LOCATION && (
              <Input
                className="mt-2"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="e.g. Carey Lakes"
              />
            )}
          </div>

          <div>
            <Label>Start time</Label>
            <Input className="mt-1" value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="2:40 PM" />
          </div>

          <div>
            <Label>Announcements</Label>
            <Textarea className="mt-1" rows={2} value={announcements} onChange={(e) => setAnnouncements(e.target.value)} />
          </div>

          <div>
            <Label>Pre Run</Label>
            <Input className="mt-1" value={preRun} onChange={(e) => setPreRun(e.target.value)} />
          </div>
          <div>
            <Label>Run</Label>
            <Input className="mt-1" value={run} onChange={(e) => setRun(e.target.value)} placeholder="Tempo, Long Run, Dis/Steady…" />
          </div>
          <div>
            <Label>Post Run</Label>
            <Input className="mt-1" value={postRun} onChange={(e) => setPostRun(e.target.value)} />
          </div>

          <div>
            <Label>Workout template</Label>
            <Select value={workoutTemplateId} onValueChange={setWorkoutTemplateId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Interval sheet</Label>
            <Select value={intervalSessionId} onValueChange={setIntervalSessionId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {activeSessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} {s.groupName ? `(${s.groupName})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Create or duplicate one for a specific group from Interval Sessions first, then attach it here.
            </p>
          </div>

          {plan && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button size="sm" variant="outline" onClick={handlePublishToggle} disabled={setPublished.isPending}>
                {plan.published ? 'Unpublish' : 'Publish'}
              </Button>
              <Button size="sm" variant="outline" onClick={handleDuplicateTomorrow} disabled={duplicateDay.isPending}>
                Duplicate to tomorrow
              </Button>
              <Button size="sm" variant="outline" onClick={handleDuplicateWeek} disabled={duplicateWeek.isPending}>
                Duplicate week to next week
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={savePlan.isPending || createLocation.isPending}>
            {(savePlan.isPending || createLocation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SchedulePage;
