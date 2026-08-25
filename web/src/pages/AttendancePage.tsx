import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, ChevronLeft, ChevronRight, Settings2, Printer, Download } from 'lucide-react';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useAttendanceWeek, useUpdateAttendanceRecord } from '@/hooks/useAttendance';
import type { AttendanceStatus } from '@/api/attendanceService';
import { AttendanceStatusCell, AttendanceStatusPicker } from '@/components/attendance/StatusCell';
import { ATTENDANCE_STATUS_MARK } from '@/lib/attendanceStatus';
import { FieldHeader } from '@/components/field/FieldHeader';
import { SegmentedPills } from '@/components/field/SegmentedPills';
import { lastNameOf, mondayOf } from '@/lib/formatUtils';
import { gradeLabel, gradeLabelShort } from '@/lib/seasonUtils';
import { toCsv } from '@/lib/csvParse';

// The primary attendance surface: a Monday-Friday grid, one row per
// athlete, one column per weekday — the paper clipboard's actual layout.
// Grade tabs let several coaches split the same week up and each work
// their own grade without stepping on each other; every cell writes to its
// own day's AttendanceRecord via the existing single-record PATCH, so
// there's nothing here that can clobber another coach's concurrent edit on
// a different athlete or a different day.
//
// Two layouts of the same data, chosen by CSS breakpoint (same approach as
// ResponsiveTabsList — no JS media query, so there's no flash of the wrong
// one): from `md` up, the real week grid. Below it, ONE DAY AT A TIME —
// five weekday columns plus a name column can't be squeezed into 375px
// without either 8px text or sideways scrolling, and a coach marking
// attendance on a phone is looking at exactly one day anyway. The day
// pills carry a per-day "how many marked" badge so the week's progress is
// still visible at a glance, which is the only thing the grid gave you
// that a single day doesn't.
//
// Per-day specifics (location, time, notes, adding a walk-on, printing or
// exporting a single day) still live on AttendanceSessionPage, reached via
// the settings icon on each day.

const ALL_TAB = 'all';

function downloadCsv(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayName(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

function dayNumber(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
}

function dayHeader(dateStr: string): string {
  return `${dayName(dateStr)} ${dayNumber(dateStr)}`;
}

const AttendancePage: React.FC = () => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const { seasons, activeYear, setSelectedYear } = useSeasonSelection();
  const selectedSeason = seasons.find((s) => s.year === activeYear) ?? null;
  const seasonId = selectedSeason?.id ?? null;

  const [searchParams, setSearchParams] = useSearchParams();
  const weekParam = searchParams.get('week');
  const [weekStart, setWeekStartState] = useState(() =>
    weekParam ? mondayOf(weekParam) : mondayOf(new Date().toISOString().slice(0, 10))
  );
  // Keeps the URL in sync so the settings icon (which links to a day's
  // detail page) can carry `?week=` back, and a refresh/bookmark reopens
  // the same week instead of always snapping to the current one.
  const setWeekStart = (next: string | ((w: string) => string)) => {
    setWeekStartState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      setSearchParams({ week: value }, { replace: true });
      return value;
    });
  };
  const [tab, setTab] = useState<string>(ALL_TAB);
  // Mobile only — which weekday the one-day list is showing. Defaults to
  // today when the visible week contains it (the overwhelmingly common
  // case: a coach opening this at practice), else Monday.
  const [activeDay, setActiveDay] = useState(() => {
    const todayIdx = Math.round(
      (Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z') -
        Date.parse(mondayOf(new Date().toISOString().slice(0, 10)) + 'T00:00:00Z')) /
        86400000
    );
    return todayIdx >= 0 && todayIdx <= 4 ? todayIdx : 0;
  });

  const { data: week, isLoading } = useAttendanceWeek(seasonId, weekStart);
  const updateRecord = useUpdateAttendanceRecord(seasonId);

  const days = useMemo(() => week?.days ?? [], [week]);

  // Union of every athlete appearing on any day this week — covers a
  // walk-on added to just one day's session, not only the roster snapshot
  // seeded on day one.
  const rows = useMemo(() => {
    const byId = new Map<string, { athleteId: string; name: string; grade: number | null }>();
    for (const day of days) {
      for (const r of day.records) {
        if (!byId.has(r.athleteId)) byId.set(r.athleteId, { athleteId: r.athleteId, name: r.name, grade: r.grade });
      }
    }
    return [...byId.values()].sort((a, b) => (b.grade ?? -1) - (a.grade ?? -1) || lastNameOf(a.name).localeCompare(lastNameOf(b.name)));
  }, [days]);

  const grades = useMemo(() => [...new Set(rows.map((r) => r.grade))].sort((a, b) => (b ?? -1) - (a ?? -1)), [rows]);
  const visibleRows = useMemo(
    () => (tab === ALL_TAB ? rows : rows.filter((r) => String(r.grade) === tab)),
    [rows, tab]
  );

  const statusFor = (athleteId: string, dayIndex: number): AttendanceStatus | null =>
    days[dayIndex]?.records.find((r) => r.athleteId === athleteId)?.status ?? null;

  // How many of the currently-visible athletes have been given any status
  // other than blank, per day — the "have I finished Tuesday yet" signal
  // that the one-day mobile view would otherwise lose.
  const markedCountFor = (dayIndex: number) =>
    visibleRows.reduce((n, row) => (statusFor(row.athleteId, dayIndex) ?? 'ABSENT') !== 'ABSENT' ? n + 1 : n, 0);

  const setStatus = (dayIndex: number, athleteId: string, status: AttendanceStatus) => {
    const day = days[dayIndex];
    if (!day) return;
    updateRecord.mutate({ sessionId: day.sessionId, athleteId, input: { status } });
  };

  const handleClose = () => navigate(teamPath('/schedule'));
  const handlePrint = () => window.print();

  const handleExport = () => {
    if (days.length === 0) return;
    const headers = ['Date', 'Athlete', 'Grade', 'Status'];
    const rowsOut = days.flatMap((day) =>
      visibleRows.map((row) => ({
        Date: day.date,
        Athlete: row.name,
        Grade: gradeLabel(row.grade),
        Status: day.records.find((r) => r.athleteId === row.athleteId)?.status ?? 'ABSENT',
      }))
    );
    downloadCsv(`attendance-week-${weekStart}.csv`, toCsv(headers, rowsOut));
  };

  const weekLabel = `${dayHeader(weekStart)} – ${dayHeader(addDays(weekStart, 4))}`;

  const header = (
    <FieldHeader
      title="Attendance"
      subtitle={weekLabel}
      actions={[
        { icon: Download, label: 'Export', onClick: handleExport, disabled: days.length === 0 },
        { icon: Printer, label: 'Print', onClick: handlePrint, disabled: days.length === 0 },
        { icon: X, label: 'Close', onClick: handleClose, variant: 'ghost' },
      ]}
    >
      {/* Week navigation lives in the header rather than the body so it
          stays reachable while a long roster is scrolled — the same reason
          the timer keeps its controls pinned. */}
      <div className="flex items-center gap-2 px-3 pb-2 sm:px-6">
        <Button
          variant="outline"
          size="sm"
          className="h-11 w-11 p-0 sm:h-8 sm:w-8"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-11 flex-1 sm:h-8 sm:flex-none"
          onClick={() => setWeekStart(mondayOf(new Date().toISOString().slice(0, 10)))}
        >
          This week
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-11 w-11 p-0 sm:h-8 sm:w-8"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Select value={String(activeYear ?? '')} onValueChange={(v) => setSelectedYear(Number(v))}>
          <SelectTrigger className="h-11 w-[92px] sm:h-8">
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
    </FieldHeader>
  );

  if (!activeYear || !seasonId) {
    return (
      <div className="min-h-screen bg-background">
        {header}
        <div className="p-4 text-muted-foreground">No season set up yet — set one up from the Groups screen first.</div>
      </div>
    );
  }

  const gradeSegments = [
    { value: ALL_TAB, label: 'All', badge: rows.length },
    ...grades.map((g) => ({
      value: String(g),
      label: gradeLabelShort(g) || 'Other',
      badge: rows.filter((r) => r.grade === g).length,
    })),
  ];

  const daySegments = days.map((day, i) => ({
    value: String(i),
    label: dayName(day.date),
    sublabel: dayNumber(day.date),
    badge: markedCountFor(i),
  }));

  const currentDay = days[activeDay];

  return (
    <div className="min-h-screen bg-background">
      {header}

      <div className="print:hidden space-y-3 p-3 sm:p-4">
        {grades.length > 1 && (
          <SegmentedPills equal segments={gradeSegments} value={tab} onChange={setTab} caption="Grade" />
        )}

        {isLoading ? (
          <div className="text-muted-foreground">Loading week…</div>
        ) : visibleRows.length === 0 ? (
          <p className="text-muted-foreground">No athletes on the roster yet.</p>
        ) : (
          <>
            {/* ---------- Mobile: one day at a time ---------- */}
            <div className="space-y-3 md:hidden">
              <SegmentedPills
                equal
                segments={daySegments}
                value={String(activeDay)}
                onChange={(v) => setActiveDay(Number(v))}
              />

              {currentDay && (
                <>
                  <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{dayHeader(currentDay.date)}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold tabular-nums text-foreground">{markedCountFor(activeDay)}</span>
                        {' of '}
                        <span className="tabular-nums">{visibleRows.length}</span> marked
                        {currentDay.location ? ` · ${currentDay.location.name}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 w-11 shrink-0 p-0"
                      aria-label="Day details"
                      title="Location, time, notes, add an athlete"
                      onClick={() => navigate(teamPath(`/attendance/${currentDay.sessionId}?week=${weekStart}`))}
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="rounded-lg border">
                    {visibleRows.map((row) => {
                      const status = statusFor(row.athleteId, activeDay);
                      return (
                        <div
                          key={row.athleteId}
                          className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-medium leading-tight">{row.name}</p>
                            {tab === ALL_TAB && (
                              <p className="text-xs text-muted-foreground">{gradeLabel(row.grade)}</p>
                            )}
                          </div>
                          {status ? (
                            <AttendanceStatusPicker
                              status={status}
                              onChange={(next) => setStatus(activeDay, row.athleteId, next)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">Not on this day</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* ---------- Desktop: the full week grid ---------- */}
            <div className="hidden overflow-x-auto rounded-lg border md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="sticky left-0 bg-muted/50 p-2 text-left font-medium">Athlete</th>
                    {days.map((day, i) => (
                      <th key={day.date} className="min-w-[76px] p-2 text-center font-medium">
                        <div className="leading-tight">{dayName(day.date)}</div>
                        <div className="text-xs font-normal tabular-nums text-muted-foreground">{dayNumber(day.date)}</div>
                        <div className="mt-0.5 flex items-center justify-center gap-1">
                          <span className="text-[10px] font-normal tabular-nums text-muted-foreground">
                            {markedCountFor(i)}/{visibleRows.length}
                          </span>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            title="Day details (location, time, notes, add athlete)"
                            aria-label={`Details for ${dayHeader(day.date)}`}
                            onClick={() => navigate(teamPath(`/attendance/${day.sessionId}?week=${weekStart}`))}
                          >
                            <Settings2 className="h-3 w-3" />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.athleteId} className="border-t hover:bg-muted/30">
                      <td className="sticky left-0 bg-background p-2">
                        <span className="font-medium">{row.name}</span>{' '}
                        <span className="text-xs text-muted-foreground">{gradeLabelShort(row.grade)}</span>
                      </td>
                      {days.map((day, i) => {
                        const status = statusFor(row.athleteId, i);
                        return (
                          <td key={day.date} className="p-1 text-center">
                            {status ? (
                              <AttendanceStatusCell
                                status={status}
                                onChange={(next) => setStatus(i, row.athleteId, next)}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Print view: same weekly grid, plain table, no interactive controls. */}
      <div className="hidden p-4 print:block">
        <h1 className="text-lg font-semibold">Attendance — {weekLabel}</h1>
        <table className="mt-3 w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-border p-1 text-left">Grade</th>
              <th className="border border-border p-1 text-left">Athlete</th>
              {days.map((day) => (
                <th key={day.date} className="border border-border p-1 text-center">
                  {dayHeader(day.date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.athleteId}>
                <td className="whitespace-nowrap border border-border p-1">{gradeLabelShort(row.grade)}</td>
                <td className="whitespace-nowrap border border-border p-1">{row.name}</td>
                {days.map((day, i) => (
                  <td key={day.date} className="h-8 w-8 border border-border p-1 text-center font-mono">
                    {ATTENDANCE_STATUS_MARK[statusFor(row.athleteId, i) ?? 'ABSENT']}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AttendancePage;
