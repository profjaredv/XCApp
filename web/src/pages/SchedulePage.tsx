import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import {
  usePracticePlanRange,
  useSavePracticePlan,
  useSetPublished,
  useDuplicateDay,
  useDuplicateWeek,
} from '@/hooks/usePracticePlans';
import { usePracticeLocations, useCreatePracticeLocation } from '@/hooks/usePracticeLocations';
import { useWorkoutTemplates } from '@/hooks/useWorkoutTemplates';
import { useIntervalSessions } from '@/hooks/useIntervalSessions';
import { useMeets } from '@/hooks/useMeetOps';
import type { PracticePlan } from '@/api/practicePlanService';
import { formatDateShort } from '@/lib/formatUtils';

// Schedule rework: Practice Plans and Meets merged into one month calendar
// — a coach opened two separate, mostly-empty pages before this and had to
// hold the actual paper calendar to know what day was what. Clicking a day
// opens the simplified plan editor (Location, Announcements, Pre Run/Run/
// Post Run, plus an attached workout template or interval sheet); clicking
// a meet navigates into the existing Meets page for that specific meet.

const NONE = '__none__';
const NEW_LOCATION = '__new__';
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
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

const SchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { data: context } = useTeamContext();
  const { data: seasons = [] } = useAvailableSeasons(context?.team?.id);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const activeYear = selectedYear ?? context?.activeSeason ?? seasons[0]?.year ?? null;
  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;

  const gridDays = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const gridStart = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [viewMonth]);

  const { data: plans = [] } = usePracticePlanRange(seasonId, toISODate(gridDays[0]), toISODate(gridDays[41]));
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
  const today = new Date();

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
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={() => setViewMonth((m) => addMonths(m, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <Button variant="outline" size="icon" onClick={() => setViewMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="bg-muted text-xs font-medium text-muted-foreground text-center py-1.5">
            {d}
          </div>
        ))}
        {gridDays.map((day) => {
          const iso = toISODate(day);
          const inMonth = day.getMonth() === viewMonth.getMonth();
          const plan = planByDate.get(iso);
          const dayMeets = meetsByDate.get(iso) ?? [];
          const planLabel = plan
            ? plan.locationName ?? plan.run ?? plan.workoutTemplate?.name ?? plan.intervalSession?.title
            : null;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => setEditorDate(iso)}
              className={`min-h-[84px] bg-background p-1.5 text-left flex flex-col gap-1 hover:bg-accent/50 transition-colors ${
                inMonth ? '' : 'opacity-40'
              }`}
            >
              <span
                className={`text-xs w-5 h-5 inline-flex items-center justify-center ${
                  isSameDay(day, today) ? 'rounded-full bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground'
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
              {dayMeets.map((m) => (
                <span
                  key={m.id}
                  role="link"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(teamPath(`/meet/${m.id}`));
                  }}
                  className="text-[11px] rounded px-1 py-0.5 truncate bg-secondary text-secondary-foreground hover:underline"
                >
                  {m.name}
                </span>
              ))}
            </button>
          );
        })}
      </div>

      {editorDate && (
        <DayEditorDialog
          date={editorDate}
          seasonId={seasonId}
          plan={planByDate.get(editorDate) ?? null}
          onClose={() => setEditorDate(null)}
        />
      )}
    </div>
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
