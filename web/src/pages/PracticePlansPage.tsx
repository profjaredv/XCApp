import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2, Loader2, BookmarkPlus } from 'lucide-react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { useGroups } from '@/hooks/useGroups';
import {
  useWeekPlans,
  useSaveDayShell,
  useSetPublished,
  useAddAssignment,
  useUpdateAssignment,
  useDeleteAssignment,
  useDuplicateDay,
  useDuplicateWeek,
} from '@/hooks/usePracticePlans';
import { useWorkoutTemplates, useSaveAssignmentAsTemplate } from '@/hooks/useWorkoutTemplates';
import type { PracticePlan, PracticePlanAssignment, AssignmentInput } from '@/api/practicePlanService';

// T3 coach composer (Team Management handoff): week-at-a-glance, one card
// per day. A day's assignment rows are grouped by which group they target
// ("Whole Team" for groupId: null) — a volunteer coach never sees a card
// section for a group they don't lead, because GET /practice-plans already
// filters that server-side (see routes/practicePlans.js), so the composer
// doesn't need its own copy of that filtering logic to get the visible
// result right. The "add to group" picker below still lists every group
// (this screen doesn't know a signed-in user's exact TeamRole, only the
// team-agnostic 'coach' hint — see middleware/auth.js); a volunteer coach
// picking a group they don't lead gets a clear 403 toast from the real,
// server-side gate rather than a silently-filtered dropdown.

const TEAM_WIDE = '__team_wide__';

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift Sunday back to the previous Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

const WEEKDAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface AssignmentFormState {
  groupId: string; // TEAM_WIDE or a group id
  volumeTier: string;
  focus: string;
  durationMinutes: string;
  distanceMi: string;
  strength: boolean;
  details: string;
}

const EMPTY_ASSIGNMENT_FORM: AssignmentFormState = {
  groupId: TEAM_WIDE,
  volumeTier: '',
  focus: '',
  durationMinutes: '',
  distanceMi: '',
  strength: false,
  details: '',
};

function assignmentFormToInput(form: AssignmentFormState): AssignmentInput {
  return {
    groupId: form.groupId === TEAM_WIDE ? null : form.groupId,
    volumeTier: form.volumeTier.trim() || null,
    focus: form.focus.trim() || null,
    durationMinutes: form.durationMinutes.trim() ? Number(form.durationMinutes) : null,
    distanceMi: form.distanceMi.trim() ? Number(form.distanceMi) : null,
    strength: form.strength,
    details: form.details.trim() || null,
  };
}

const PracticePlansPage: React.FC = () => {
  const { data: context } = useTeamContext();
  const { data: seasons = [] } = useAvailableSeasons(context?.team?.id);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const activeYear = selectedYear ?? context?.activeSeason ?? seasons[0]?.year ?? null;
  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const from = toISODate(weekStart);
  const to = toISODate(weekDays[6]);

  const { data: groups = [] } = useGroups(seasonId);
  const trainingGroups = groups.filter((g) => g.type === 'TRAINING' && !g.archived);
  const { data: plans = [], isLoading } = useWeekPlans(seasonId, from, to);
  const { data: templates = [] } = useWorkoutTemplates();

  const saveDayShell = useSaveDayShell(seasonId);
  const setPublished = useSetPublished(seasonId);
  const addAssignment = useAddAssignment(seasonId);
  const updateAssignment = useUpdateAssignment(seasonId);
  const deleteAssignment = useDeleteAssignment(seasonId);
  const duplicateDay = useDuplicateDay(seasonId);
  const duplicateWeek = useDuplicateWeek(seasonId);
  const saveAsTemplate = useSaveAssignmentAsTemplate();

  const planByDate = useMemo(() => {
    const map = new Map<string, PracticePlan>();
    for (const plan of plans) map.set(toISODate(new Date(plan.date)), plan);
    return map;
  }, [plans]);

  // Assignment dialog state — shared for both "add" and "edit".
  const [assignmentDialog, setAssignmentDialog] = useState<{
    date: string;
    planId: string | null;
    editingId: string | null;
    form: AssignmentFormState;
  } | null>(null);

  const [dayDetailsDialog, setDayDetailsDialog] = useState<{ date: string; plan: PracticePlan | null } | null>(null);
  const [duplicateDayDialog, setDuplicateDayDialog] = useState<{ planId: string; toDate: string } | null>(null);
  const [duplicateWeekOpen, setDuplicateWeekOpen] = useState(false);
  const [duplicateWeekTarget, setDuplicateWeekTarget] = useState(() => toISODate(addDays(weekStart, 7)));
  const [saveTemplateFor, setSaveTemplateFor] = useState<PracticePlanAssignment | null>(null);
  const [templateName, setTemplateName] = useState('');

  const openAddAssignment = (date: string, plan: PracticePlan | null) => {
    setAssignmentDialog({ date, planId: plan?.id ?? null, editingId: null, form: { ...EMPTY_ASSIGNMENT_FORM } });
  };

  const openEditAssignment = (date: string, plan: PracticePlan, a: PracticePlanAssignment) => {
    setAssignmentDialog({
      date,
      planId: plan.id,
      editingId: a.id,
      form: {
        groupId: a.groupId ?? TEAM_WIDE,
        volumeTier: a.volumeTier ?? '',
        focus: a.focus ?? '',
        durationMinutes: a.durationMinutes != null ? String(a.durationMinutes) : '',
        distanceMi: a.distanceMi != null ? String(a.distanceMi) : '',
        strength: a.strength,
        details: a.details ?? '',
      },
    });
  };

  const applyTemplate = (templateId: string) => {
    const t = templates.find((tt) => tt.id === templateId);
    if (!t || !assignmentDialog) return;
    setAssignmentDialog({
      ...assignmentDialog,
      form: {
        ...assignmentDialog.form,
        volumeTier: t.volumeTier ?? '',
        focus: t.focus ?? '',
        durationMinutes: t.durationMinutes != null ? String(t.durationMinutes) : '',
        distanceMi: t.distanceMi != null ? String(t.distanceMi) : '',
        strength: t.strength,
        details: t.details ?? '',
      },
    });
  };

  const handleSaveAssignment = async () => {
    if (!assignmentDialog || !seasonId) return;
    try {
      let planId = assignmentDialog.planId;
      if (!planId) {
        const created = await saveDayShell.mutateAsync({ seasonId, date: assignmentDialog.date });
        planId = created.id;
      }
      const input = assignmentFormToInput(assignmentDialog.form);
      if (assignmentDialog.editingId) {
        await updateAssignment.mutateAsync({ assignmentId: assignmentDialog.editingId, input });
      } else {
        await addAssignment.mutateAsync({ planId, input });
      }
      toast.success('Saved.');
      setAssignmentDialog(null);
    } catch (err) {
      const message =
        (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ?? 'Could not save that row.';
      toast.error(message);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      await deleteAssignment.mutateAsync(assignmentId);
      toast.success('Removed.');
    } catch {
      toast.error('Could not remove that row.');
    }
  };

  const handleTogglePublish = async (plan: PracticePlan) => {
    try {
      await setPublished.mutateAsync({ planId: plan.id, published: !plan.published });
    } catch {
      toast.error('Could not update publish state.');
    }
  };

  const handleSaveDayDetails = async (date: string, fields: { title: string; location: string; startTime: string; teamNotes: string }) => {
    if (!seasonId) return;
    try {
      await saveDayShell.mutateAsync({
        seasonId,
        date,
        title: fields.title,
        location: fields.location,
        startTime: fields.startTime,
        teamNotes: fields.teamNotes,
      });
      toast.success('Day details saved.');
      setDayDetailsDialog(null);
    } catch {
      toast.error('Could not save day details.');
    }
  };

  const handleDuplicateDay = async () => {
    if (!duplicateDayDialog) return;
    try {
      await duplicateDay.mutateAsync({ planId: duplicateDayDialog.planId, toDate: duplicateDayDialog.toDate });
      toast.success('Day duplicated (unpublished).');
      setDuplicateDayDialog(null);
    } catch {
      toast.error('Could not duplicate that day.');
    }
  };

  const handleDuplicateWeek = async () => {
    if (!seasonId) return;
    try {
      const result = await duplicateWeek.mutateAsync({
        seasonId,
        fromWeekStart: from,
        toWeekStart: duplicateWeekTarget,
      });
      toast.success(result.msg || 'Week duplicated.');
      setDuplicateWeekOpen(false);
    } catch {
      toast.error('Could not duplicate that week.');
    }
  };

  const handleSaveTemplate = async () => {
    if (!saveTemplateFor || !templateName.trim()) return;
    try {
      await saveAsTemplate.mutateAsync({ assignmentId: saveTemplateFor.id, name: templateName.trim() });
      toast.success('Saved as template.');
      setSaveTemplateFor(null);
      setTemplateName('');
    } catch (err) {
      const message =
        (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ?? 'Could not save that template.';
      toast.error(message);
    }
  };

  if (!activeYear || !seasonId) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Practice Plans</h1>
        <p className="text-muted-foreground">No season set up yet — set one up from the Groups screen first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold">Practice Plans</h1>
        <div className="flex items-center gap-2">
          <Select value={String(activeYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.year} value={String(s.year)}>{s.year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium whitespace-nowrap">
            {from} – {to}
          </span>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setDuplicateWeekTarget(toISODate(addDays(weekStart, 7)));
              setDuplicateWeekOpen(true);
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Duplicate week
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading week…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {weekDays.map((date, i) => {
            const iso = toISODate(date);
            const plan = planByDate.get(iso) ?? null;
            const grouped = new Map<string, { groupName: string; rows: PracticePlanAssignment[] }>();
            for (const a of plan?.assignments ?? []) {
              const key = a.groupId ?? TEAM_WIDE;
              if (!grouped.has(key)) grouped.set(key, { groupName: a.groupName, rows: [] });
              grouped.get(key)!.rows.push(a);
            }

            return (
              <Card key={iso}>
                <CardHeader className="py-3 space-y-1">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>
                      {WEEKDAY_LABEL[i]} <span className="text-muted-foreground font-normal">{iso.slice(5)}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      {plan && (
                        <Badge variant={plan.published ? 'default' : 'secondary'}>
                          {plan.published ? 'Published' : 'Draft'}
                        </Badge>
                      )}
                    </div>
                  </CardTitle>
                  {plan?.title && <p className="text-xs font-medium">{plan.title}</p>}
                  {(plan?.location || plan?.startTime) && (
                    <p className="text-xs text-muted-foreground">
                      {[plan?.startTime, plan?.location].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="py-2 space-y-3">
                  {[...grouped.entries()].map(([key, { groupName, rows }]) => (
                    <div key={key} className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">{groupName}</p>
                      {rows
                        .slice()
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((a) => (
                          <div key={a.id} className="rounded-md border p-2 text-xs space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium">
                                  {a.focus || (a.strength ? 'Strength' : 'Workout')}
                                  {a.volumeTier ? ` · ${a.volumeTier}` : ''}
                                </p>
                                <p className="text-muted-foreground">
                                  {a.durationMinutes ? `${a.durationMinutes} min` : ''}
                                  {a.durationMinutes && a.distanceMi ? ' · ' : ''}
                                  {a.distanceMi ? `${a.distanceMi} mi` : ''}
                                  {a.strength ? ' · Strength' : ''}
                                </p>
                                {a.details && <p className="text-muted-foreground">{a.details}</p>}
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditAssignment(iso, plan as PracticePlan, a)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSaveTemplateFor(a)}>
                                  <BookmarkPlus className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteAssignment(a.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                  {grouped.size === 0 && <p className="text-xs text-muted-foreground py-1">Nothing planned yet.</p>}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => openAddAssignment(iso, plan)}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDayDetailsDialog({
                          date: iso,
                          plan,
                        })
                      }
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Details
                    </Button>
                    {plan && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => handleTogglePublish(plan)}>
                          {plan.published ? 'Unpublish' : 'Publish'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDuplicateDayDialog({ planId: plan.id, toDate: toISODate(addDays(date, 7)) })}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Duplicate
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/edit assignment */}
      <Dialog open={!!assignmentDialog} onOpenChange={(open) => !open && setAssignmentDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{assignmentDialog?.editingId ? 'Edit workout' : 'Add workout'}</DialogTitle>
            <DialogDescription>{assignmentDialog?.date}</DialogDescription>
          </DialogHeader>
          {assignmentDialog && (
            <div className="space-y-4">
              <div>
                <Label>Group</Label>
                <Select
                  value={assignmentDialog.form.groupId}
                  onValueChange={(v) => setAssignmentDialog({ ...assignmentDialog, form: { ...assignmentDialog.form, groupId: v } })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TEAM_WIDE}>Whole Team</SelectItem>
                    {trainingGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {templates.length > 0 && (
                <div>
                  <Label>Start from a template (optional)</Label>
                  <Select onValueChange={applyTemplate}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a template…" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Focus</Label>
                  <Input
                    className="mt-1"
                    value={assignmentDialog.form.focus}
                    onChange={(e) => setAssignmentDialog({ ...assignmentDialog, form: { ...assignmentDialog.form, focus: e.target.value } })}
                    placeholder="Easy, Tempo, Intervals…"
                  />
                </div>
                <div>
                  <Label>Volume tier</Label>
                  <Input
                    className="mt-1"
                    value={assignmentDialog.form.volumeTier}
                    onChange={(e) => setAssignmentDialog({ ...assignmentDialog, form: { ...assignmentDialog.form, volumeTier: e.target.value } })}
                    placeholder="Low / Med / High"
                  />
                </div>
                <div>
                  <Label>Duration (min)</Label>
                  <Input
                    type="number"
                    min="0"
                    className="mt-1"
                    value={assignmentDialog.form.durationMinutes}
                    onChange={(e) => setAssignmentDialog({ ...assignmentDialog, form: { ...assignmentDialog.form, durationMinutes: e.target.value } })}
                  />
                </div>
                <div>
                  <Label>Distance (mi)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    className="mt-1"
                    value={assignmentDialog.form.distanceMi}
                    onChange={(e) => setAssignmentDialog({ ...assignmentDialog, form: { ...assignmentDialog.form, distanceMi: e.target.value } })}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={assignmentDialog.form.strength}
                  onCheckedChange={(v) => setAssignmentDialog({ ...assignmentDialog, form: { ...assignmentDialog.form, strength: Boolean(v) } })}
                />
                Includes strength work
              </label>
              <div>
                <Label>Details</Label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={assignmentDialog.form.details}
                  onChange={(e) => setAssignmentDialog({ ...assignmentDialog, form: { ...assignmentDialog.form, details: e.target.value } })}
                  placeholder="e.g. 6x800m @ 5k pace, 2min recovery"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignmentDialog(null)}>Cancel</Button>
            <Button onClick={handleSaveAssignment} disabled={addAssignment.isPending || updateAssignment.isPending || saveDayShell.isPending}>
              {(addAssignment.isPending || updateAssignment.isPending || saveDayShell.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day details */}
      <Dialog open={!!dayDetailsDialog} onOpenChange={(open) => !open && setDayDetailsDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Day details</DialogTitle>
            <DialogDescription>{dayDetailsDialog?.date}</DialogDescription>
          </DialogHeader>
          {dayDetailsDialog && (
            <DayDetailsForm
              plan={dayDetailsDialog.plan}
              onSave={(fields) => handleSaveDayDetails(dayDetailsDialog.date, fields)}
              saving={saveDayShell.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate day */}
      <Dialog open={!!duplicateDayDialog} onOpenChange={(open) => !open && setDuplicateDayDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate day</DialogTitle>
            <DialogDescription>Lands as an unpublished draft on the target date.</DialogDescription>
          </DialogHeader>
          {duplicateDayDialog && (
            <div>
              <Label>To date</Label>
              <Input
                type="date"
                className="mt-1"
                value={duplicateDayDialog.toDate}
                onChange={(e) => setDuplicateDayDialog({ ...duplicateDayDialog, toDate: e.target.value })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDayDialog(null)}>Cancel</Button>
            <Button onClick={handleDuplicateDay} disabled={duplicateDay.isPending}>
              {duplicateDay.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate week */}
      <Dialog open={duplicateWeekOpen} onOpenChange={setDuplicateWeekOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate this week</DialogTitle>
            <DialogDescription>Only days with a plan are copied; new days land unpublished.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Target week starting</Label>
            <Input type="date" className="mt-1" value={duplicateWeekTarget} onChange={(e) => setDuplicateWeekTarget(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateWeekOpen(false)}>Cancel</Button>
            <Button onClick={handleDuplicateWeek} disabled={duplicateWeek.isPending}>
              {duplicateWeek.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Duplicate week
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as template */}
      <Dialog open={!!saveTemplateFor} onOpenChange={(open) => !open && setSaveTemplateFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>Copies this workout's fields — edits to the template won't change past plans.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Template name</Label>
            <Input className="mt-1" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Tempo Tuesday" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateFor(null)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={!templateName.trim() || saveAsTemplate.isPending}>
              {saveAsTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const DayDetailsForm: React.FC<{
  plan: PracticePlan | null;
  onSave: (fields: { title: string; location: string; startTime: string; teamNotes: string }) => void;
  saving: boolean;
}> = ({ plan, onSave, saving }) => {
  const [title, setTitle] = useState(plan?.title ?? '');
  const [location, setLocation] = useState(plan?.location ?? '');
  const [startTime, setStartTime] = useState(plan?.startTime ?? '');
  const [teamNotes, setTeamNotes] = useState(plan?.teamNotes ?? '');

  return (
    <div className="space-y-4">
      <div>
        <Label>Title</Label>
        <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Track Workout" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Start time</Label>
          <Input className="mt-1" value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="3:15 PM" />
        </div>
        <div>
          <Label>Location</Label>
          <Input className="mt-1" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Track" />
        </div>
      </div>
      <div>
        <Label>Notes (whole team)</Label>
        <Textarea className="mt-1" rows={3} value={teamNotes} onChange={(e) => setTeamNotes(e.target.value)} />
      </div>
      <DialogFooter>
        <Button onClick={() => onSave({ title, location, startTime, teamNotes })} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </div>
  );
};

export default PracticePlansPage;
