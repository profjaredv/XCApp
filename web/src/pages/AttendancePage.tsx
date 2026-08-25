import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, ChevronLeft, ChevronRight, Settings2, Printer, Download } from 'lucide-react';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { useAttendanceWeek, useUpdateAttendanceRecord } from '@/hooks/useAttendance';
import type { AttendanceStatus } from '@/api/attendanceService';
import { AttendanceStatusCell } from '@/components/attendance/StatusCell';
import { lastNameOf, mondayOf } from '@/lib/formatUtils';
import { gradeLabel, gradeLabelShort } from '@/lib/seasonUtils';
import { toCsv } from '@/lib/csvParse';

// The primary attendance surface: a Monday-Friday grid, one row per
// athlete, one column per weekday — the paper clipboard's actual layout,
// not a per-day form. Grade tabs let several coaches split the same week
// up and each work their own grade without stepping on each other; every
// cell writes to its own day's AttendanceRecord via the existing
// single-record PATCH, so there's nothing here that can clobber another
// coach's concurrent edit on a different athlete or a different day.
// Per-day specifics (location, time, notes, adding a walk-on, printing or
// exporting a single day) still live on AttendanceSessionPage, reachable
// via the small settings icon under each day's header.

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

function dayHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
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
  const visibleRows = tab === ALL_TAB ? rows : rows.filter((r) => String(r.grade) === tab);

  const statusFor = (athleteId: string, dayIndex: number): AttendanceStatus | null =>
    days[dayIndex]?.records.find((r) => r.athleteId === athleteId)?.status ?? null;

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

  const topBar = (
    <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-2 sm:gap-4 border-b border-border bg-background px-3 sm:px-6 py-3">
      <h1 className="text-lg font-semibold">Attendance</h1>
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <Button variant="outline" size="sm" onClick={handleExport} disabled={days.length === 0} title="Export week CSV">
          <Download className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint} disabled={days.length === 0} title="Print">
          <Printer className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Print</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={handleClose} title="Close">
          <X className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Close</span>
        </Button>
      </div>
    </div>
  );

  if (!activeYear || !seasonId) {
    return (
      <div className="min-h-screen bg-background">
        {topBar}
        <div className="p-6 space-y-6">
          <p className="text-muted-foreground">No season set up yet — set one up from the Groups screen first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {topBar}
      <div className="print:hidden p-3 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDays(w, -7))} title="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(mondayOf(new Date().toISOString().slice(0, 10)))}>
              {dayHeader(weekStart)} – {dayHeader(addDays(weekStart, 4))}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDays(w, 7))} title="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
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

        {grades.length > 1 && (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value={ALL_TAB}>All</TabsTrigger>
              {grades.map((g) => (
                <TabsTrigger key={g ?? 'unknown'} value={String(g)}>
                  {gradeLabel(g)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {isLoading ? (
          <div className="text-muted-foreground">Loading week…</div>
        ) : visibleRows.length === 0 ? (
          <p className="text-muted-foreground">No athletes on the roster yet.</p>
        ) : (
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-2 font-medium sticky left-0 bg-muted/50">Athlete</th>
                  {days.map((day) => (
                    <th key={day.date} className="p-2 font-medium text-center min-w-[72px]">
                      <div>{dayHeader(day.date)}</div>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center mt-1"
                        title="Day details (location, time, notes, add athlete, print/export this day)"
                        onClick={() => navigate(teamPath(`/attendance/${day.sessionId}?week=${weekStart}`))}
                      >
                        <Settings2 className="h-3 w-3" />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.athleteId} className="border-t border-border">
                    <td className="p-2 sticky left-0 bg-background">
                      <span className="font-medium">{row.name}</span>{' '}
                      <span className="text-xs text-muted-foreground">{gradeLabelShort(row.grade)}</span>
                    </td>
                    {days.map((day, i) => {
                      const status = statusFor(row.athleteId, i);
                      return (
                        <td key={day.date} className="p-2 text-center">
                          {status ? (
                            <AttendanceStatusCell
                              status={status}
                              onChange={(next) =>
                                updateRecord.mutate({ sessionId: day.sessionId, athleteId: row.athleteId, input: { status: next } })
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Print view: same weekly grid, plain table, no interactive controls. */}
      <div className="hidden print:block p-4">
        <h1 className="text-lg font-semibold">
          Attendance — {dayHeader(weekStart)} to {dayHeader(addDays(weekStart, 4))}
        </h1>
        <table className="w-full text-xs border-collapse mt-3">
          <thead>
            <tr>
              <th className="text-left p-1 border border-border">Grade</th>
              <th className="text-left p-1 border border-border">Athlete</th>
              {days.map((day) => (
                <th key={day.date} className="text-center p-1 border border-border">
                  {dayHeader(day.date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.athleteId}>
                <td className="p-1 border border-border whitespace-nowrap">{gradeLabelShort(row.grade)}</td>
                <td className="p-1 border border-border whitespace-nowrap">{row.name}</td>
                {days.map((day, i) => {
                  const status = statusFor(row.athleteId, i);
                  const mark = status === 'PRESENT' ? '✓' : status === 'EXCUSED' ? 'E' : status === 'LATE' ? 'L' : '';
                  return (
                    <td key={day.date} className="h-8 w-8 p-1 border border-border text-center font-mono">
                      {mark}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AttendancePage;
