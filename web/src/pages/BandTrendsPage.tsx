import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { LabelProps } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { formatPace, formatTime } from '@/lib/formatUtils';
import { useBandAnalytics, useBandAnalyticsCourses } from '@/hooks/useBandAnalytics';
import type { BandStats } from '@/hooks/useBandAnalytics';
import { useQueryParam } from '@/hooks/useQueryState';
import { useProgramAnalytics } from '@/hooks/useProgramAnalytics';
import { ProgramOverviewSection } from '@/components/analytics/ProgramOverviewSection';

// Band Analytics (XCApp Pre-Season Fixes + Phase 3 doc, Part B). "One
// screen a coach looks at in November with a cup of coffee, not a
// dashboard they configure" — so this page is deliberately just: gender
// (required, no "all" — bands are always computed within one gender),
// mode, an optional course filter, one band-trend chart, and one position-
// curve chart underneath. Every average on this page is rendered with its
// n directly next to it (doc requirement) — as a point label on the chart
// and again in the tooltip, never bare.

const BAND_COLORS: Record<'top' | 'middle' | 'bottom', string> = {
  top: '#22c55e',
  middle: '#3b82f6',
  bottom: '#f97316',
};

const BAND_LABELS: Record<'top' | 'middle' | 'bottom', string> = {
  top: 'Top',
  middle: 'Middle',
  bottom: 'Bottom',
};

const POSITION_COLORS: Record<number, string> = {
  1: '#0ea5e9',
  3: '#8b5cf6',
  5: '#ec4899',
  7: '#f59e0b',
  10: '#64748b',
};

function bandRangeLabel(band: BandStats | null): string {
  if (!band) return '';
  return `ranks ${band.range[0]}–${band.range[1]}`;
}

const BandTrendsPage = () => {
  const [genderParam, setGenderParam] = useQueryParam('gender');
  const [modeParam, setModeParam] = useQueryParam('mode');
  const [courseIdParam, setCourseIdParam] = useQueryParam('courseId');

  // Gender is required and has no "all" option — a band is always computed
  // within one gender (ranking boys against girls makes no sense here).
  // Default to boys rather than leaving the chart empty on first load.
  const gender: 'M' | 'F' = genderParam === 'F' ? 'F' : 'M';
  const mode: 'meet' | 'season' = modeParam === 'season' ? 'season' : 'meet';
  const courseId = courseIdParam || undefined;

  const { data: courses = [] } = useBandAnalyticsCourses();
  const { data, isLoading, error } = useBandAnalytics({ gender, mode, courseId });
  const { data: programData, isLoading: isLoadingProgram } = useProgramAnalytics();

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.seasons.map((s) => ({
      season: s.season,
      topPace: s.bands?.top && !s.bands.top.insufficientDepth ? s.bands.top.meanPaceSecPerMile ?? null : null,
      topN: s.bands?.top?.athleteCount,
      topInsufficient: s.bands?.top?.insufficientDepth ?? true,
      middlePace: s.bands?.middle && !s.bands.middle.insufficientDepth ? s.bands.middle.meanPaceSecPerMile ?? null : null,
      middleN: s.bands?.middle?.athleteCount,
      middleInsufficient: s.bands?.middle == null || s.bands.middle.insufficientDepth,
      bottomPace: s.bands?.bottom && !s.bands.bottom.insufficientDepth ? s.bands.bottom.meanPaceSecPerMile ?? null : null,
      bottomN: s.bands?.bottom?.athleteCount,
      bottomInsufficient: s.bands?.bottom?.insufficientDepth ?? true,
      seasonInsufficient: s.insufficientDepth,
      bands: s.bands,
    }));
  }, [data]);

  const positionCurveData = useMemo(() => {
    if (!data) return [];
    return data.seasons.map((s) => {
      const row: Record<string, number | null> = { season: s.season };
      for (const p of s.positionCurve) {
        row[`p${p.position}`] = p.avgTimeSec;
        row[`p${p.position}n`] = p.raceCount;
      }
      return row;
    });
  }, [data]);

  interface TooltipEntry {
    payload?: Record<string, number | undefined>;
  }

  const renderNLabel = (key: 'topN' | 'middleN' | 'bottomN') => (props: LabelProps) => {
    const x = typeof props.x === 'number' ? props.x : undefined;
    const y = typeof props.y === 'number' ? props.y : undefined;
    const index = typeof props.index === 'number' ? props.index : undefined;
    if (x == null || y == null || index == null) return null;
    const n = chartData[index]?.[key];
    if (n == null) return null;
    return (
      <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fill="#64748b">
        n={n}
      </text>
    );
  };

  const bandTooltipFormatter = (value: number | string, name: string, entry: TooltipEntry) => {
    if (value == null) return ['insufficient depth', name];
    const band = name.toLowerCase() as 'top' | 'middle' | 'bottom';
    const nKey = `${band}N`;
    const n = entry?.payload?.[nKey];
    return [`${formatPace(Number(value))} (n=${n ?? '?'})`, name];
  };

  const positionTooltipFormatter = (value: number | string, name: string, entry: TooltipEntry) => {
    if (value == null) return ['no data', name];
    const nKey = `${name}n`;
    const n = entry?.payload?.[nKey];
    return [`${formatTime(Number(value))} (${n ?? 0} races)`, `Position ${name.replace('p', '')}`];
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Program</h1>
        <CardDescription>
          The story behind the numbers: participation, mileage, field standing, and retention, across every season loaded.
        </CardDescription>
      </div>

      {isLoadingProgram && <p className="text-sm text-muted-foreground">Loading program overview...</p>}
      {programData && <ProgramOverviewSection data={programData} />}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div>
          <h2 className="text-lg font-semibold">Performance Bands</h2>
          <CardDescription>
            Top, middle, and bottom performance bands within gender, tracked across seasons.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={gender} onValueChange={(v) => setGenderParam(v)}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="M">Boys</SelectItem>
              <SelectItem value="F">Girls</SelectItem>
            </SelectContent>
          </Select>
          <Select value={mode} onValueChange={(v) => setModeParam(v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="meet">Meet-based</SelectItem>
              <SelectItem value="season">Season-based</SelectItem>
            </SelectContent>
          </Select>
          <Select value={courseId ?? 'all'} onValueChange={(v) => setCourseIdParam(v === 'all' ? undefined : v)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Courses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {data && !data.normalizationAvailable && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Field normalization not available yet</AlertTitle>
          <AlertDescription>
            Pace per mile is shown below. Field-relative ratios will appear automatically once the meet scraper has
            collected enough full-field results for this team's races.
          </AlertDescription>
        </Alert>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading band analytics...</p>}
      {error && <p className="text-sm text-destructive">Failed to load band analytics: {error.message}</p>}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Band Pace Trends</CardTitle>
              <CardDescription>
                Average pace per mile, by band, per season
                {data.courseName ? ` at ${data.courseName}` : ''}. Each point is labeled with the number of athletes
                (n) behind that average.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No race data for this selection yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="season" />
                    <YAxis tickFormatter={(v) => formatPace(v)} domain={['dataMin - 15', 'dataMax + 15']} />
                    <Tooltip formatter={bandTooltipFormatter} labelFormatter={(l) => `Season: ${l}`} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="topPace"
                      name="Top"
                      stroke={BAND_COLORS.top}
                      strokeWidth={3}
                      connectNulls={false}
                      label={renderNLabel('topN')}
                    />
                    <Line
                      type="monotone"
                      dataKey="middlePace"
                      name="Middle"
                      stroke={BAND_COLORS.middle}
                      strokeWidth={3}
                      connectNulls={false}
                      label={renderNLabel('middleN')}
                    />
                    <Line
                      type="monotone"
                      dataKey="bottomPace"
                      name="Bottom"
                      stroke={BAND_COLORS.bottom}
                      strokeWidth={3}
                      connectNulls={false}
                      label={renderNLabel('bottomN')}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {chartData.map((row) => (
                  <div key={row.season}>
                    <span className="font-medium text-foreground">{row.season}:</span>{' '}
                    {row.seasonInsufficient ? (
                      <span>fewer than {5} athletes with data — not enough depth to band.</span>
                    ) : (
                      (['top', 'middle', 'bottom'] as const).map((band) => {
                        const b = row.bands?.[band];
                        if (!b) return null;
                        return (
                          <span key={band} className="mr-3">
                            {BAND_LABELS[band]} ({bandRangeLabel(b)}, n={b.athleteCount}
                            {b.raceCount ? `, ${b.raceCount} races` : ''}):{' '}
                            {b.insufficientDepth ? 'insufficient depth' : formatPace(b.meanPaceSecPerMile!)}
                          </span>
                        );
                      })
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Position Curve</CardTitle>
              <CardDescription>
                The team's 1st / 3rd / 5th / 7th / 10th finisher time, averaged across each season's races
                {data.courseName ? ` at ${data.courseName}` : ''}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {positionCurveData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No race data for this selection yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={positionCurveData} margin={{ top: 5, right: 30, left: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="season" />
                    <YAxis tickFormatter={(v) => formatTime(v)} domain={['dataMin - 30', 'dataMax + 30']} />
                    <Tooltip formatter={positionTooltipFormatter} labelFormatter={(l) => `Season: ${l}`} />
                    <Legend />
                    {[1, 3, 5, 7, 10].map((position) => (
                      <Line
                        key={position}
                        type="monotone"
                        dataKey={`p${position}`}
                        name={`p${position}`}
                        stroke={POSITION_COLORS[position]}
                        strokeWidth={2}
                        connectNulls={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default BandTrendsPage;
