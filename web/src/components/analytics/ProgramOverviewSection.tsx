import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ProgramAnalyticsData } from '@/hooks/useProgramAnalytics';
import { formatPace } from '@/lib/formatUtils';

// What the band/position charts below don't answer on their own: is the
// program growing, are they coming back, is it getting faster, is the pack
// tightening, does it land near the front of a field, and does it keep the
// athletes it recruits. Each card is one clear number over time, not a
// config panel — same "coffee in November" spirit as the charts below.
//
// Everything except field standing is computed live from race results
// (backend/lib/programSeasons.js). It used to come from TeamSeasonMetrics,
// which only exists for seasons somebody remembered to run "Recalculate
// Metrics" on — so a program could race for four years and open this
// screen to an empty chart. A screen about a program's history can't
// depend on a manual step nobody was told to take.

interface ProgramOverviewSectionProps {
  data: ProgramAnalyticsData;
}

const GENDER_COLORS = { men: '#3b82f6', women: '#ec4899' };

const WINDOW_LABELS: Record<number, string> = {
  1: '1 yr later',
  2: '2 yrs later',
  3: '3 yrs later',
  4: '4 yrs later',
};

export function ProgramOverviewSection({ data }: ProgramOverviewSectionProps) {
  const { seasons, attrition } = data;

  const participantsData = seasons.map((s) => ({
    season: s.season,
    men: s.participants.men,
    women: s.participants.women,
    total: s.participants.total,
  }));

  // raceMiles, not milesLogged. The old number came from TeamSeasonMetrics
  // and was null until someone ran "Recalculate Metrics", so a program
  // could race for four years and see an empty chart. This one is computed
  // from the results themselves.
  const milesData = seasons.map((s) => ({
    season: s.season,
    miles: s.raceMiles,
    perAthlete: s.milesPerAthlete,
    meets: s.meets,
  }));

  // Churn: who came back, who is new. The first season on file has no
  // previous season to compare against and reports null rather than a
  // fabricated 0%.
  const churnData = seasons
    .filter((s) => s.churn?.returning != null)
    .map((s) => ({
      season: s.season,
      returning: s.churn.returning,
      newcomers: s.churn.newcomers,
      returnRate: s.churn.returnRate,
      previousSize: s.churn.previousSize,
    }));

  const paceData = seasons.map((s) => ({
    season: s.season,
    men: s.medianPace?.men?.paceSecPerMile ?? null,
    women: s.medianPace?.women?.paceSecPerMile ?? null,
    menN: s.medianPace?.men?.athleteCount ?? 0,
    womenN: s.medianPace?.women?.athleteCount ?? 0,
  }));
  const hasAnyPace = paceData.some((d) => d.men != null || d.women != null);

  const packData = seasons.map((s) => ({
    season: s.season,
    men: s.packSpread?.men?.spreadSec ?? null,
    women: s.packSpread?.women?.spreadSec ?? null,
  }));
  const hasAnyPack = packData.some((d) => d.men != null || d.women != null);

  const topFieldData = seasons.map((s) => ({
    season: s.season,
    men: s.topField.men,
    women: s.topField.women,
  }));
  const hasAnyTopField = topFieldData.some((d) => d.men != null || d.women != null);

  const attritionData = attrition.windows.map((w) => ({
    window: WINDOW_LABELS[w] ?? `${w} yr${w === 1 ? '' : 's'} later`,
    retention: attrition.retention[String(w)] ?? null,
    n: attrition.cohortSizes[String(w)] ?? 0,
  }));
  const hasAnyAttrition = attritionData.some((d) => d.retention != null);

  const hasAnyBenchmark = seasons.some(
    (s) =>
      s.benchmarks.men.league != null ||
      s.benchmarks.men.state != null ||
      s.benchmarks.men.national != null ||
      s.benchmarks.women.league != null ||
      s.benchmarks.women.state != null ||
      s.benchmarks.women.national != null
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Participants</CardTitle>
            <CardDescription>Roster size by gender, per season.</CardDescription>
          </CardHeader>
          <CardContent>
            {participantsData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No seasons loaded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={participantsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="season" />
                  <YAxis allowDecimals={false} />
                  <Tooltip labelFormatter={(l) => `Season: ${l}`} />
                  <Legend />
                  <Bar dataKey="men" name="Boys" fill={GENDER_COLORS.men} />
                  <Bar dataKey="women" name="Girls" fill={GENDER_COLORS.women} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Race Miles</CardTitle>
            <CardDescription>
              Miles raced per season, and per athlete — a longer schedule logs more miles without anyone running
              further, so both are here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {milesData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No seasons loaded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={milesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="season" />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(l) => `Season: ${l}`}
                    formatter={(value: number | string, name: string, entry: { payload?: { perAthlete?: number | null; meets?: number } }) =>
                      name === 'Miles'
                        ? [
                            `${Number(value).toFixed(0)} mi across ${entry?.payload?.meets ?? 0} meets · ${
                              entry?.payload?.perAthlete ?? '—'
                            } mi per athlete`,
                            'Raced',
                          ]
                        : [String(value), name]
                    }
                  />
                  <Bar dataKey="miles" name="Miles" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Returning &amp; New</CardTitle>
            <CardDescription>
              How many of last season's athletes came back, and how many were new. Graduating seniors count in the
              leaving half — this is churn, not attrition.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {churnData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Needs two consecutive seasons on file — the first season has nothing to have returned from.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={churnData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="season" />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(l) => `Season: ${l}`}
                    formatter={(value: number | string, name: string, entry: { payload?: { returnRate?: number | null; previousSize?: number | null } }) =>
                      name === 'Returning'
                        ? [`${value} of ${entry?.payload?.previousSize ?? '?'} (${entry?.payload?.returnRate ?? '?'}%)`, name]
                        : [String(value), name]
                    }
                  />
                  <Legend />
                  <Bar dataKey="returning" name="Returning" stackId="roster" fill="#8b5cf6" />
                  <Bar dataKey="newcomers" name="New" stackId="roster" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Program Pace</CardTitle>
            <CardDescription>
              Median season-best pace, by gender. Median so one transfer doesn't move it, season bests so a longer
              schedule doesn't either. Courses differ year to year — read small changes as noise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasAnyPace ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Needs at least three athletes with a finished race in a season.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={paceData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="season" />
                  {/* Faster is lower, so the axis is reversed: up means quicker,
                      which is the direction a coach reads as better. */}
                  <YAxis reversed tickFormatter={(v) => formatPace(Number(v))} domain={['dataMin - 15', 'dataMax + 15']} />
                  <Tooltip
                    labelFormatter={(l) => `Season: ${l}`}
                    formatter={(value: number | string, name: string, entry: { payload?: Record<string, number> }) => {
                      if (value == null) return ['not enough athletes', name];
                      const n = entry?.payload?.[name === 'Boys' ? 'menN' : 'womenN'];
                      return [`${formatPace(Number(value))} (n=${n ?? '?'})`, name];
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="men" name="Boys" stroke={GENDER_COLORS.men} strokeWidth={2} connectNulls={false} />
                  <Line type="monotone" dataKey="women" name="Girls" stroke={GENDER_COLORS.women} strokeWidth={2} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pack Spread</CardTitle>
            <CardDescription>
              1st to 5th finisher in the team's tightest race of each season. Lower is a closer pack — the thing that
              wins meets when nobody has a front-runner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasAnyPack ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Needs a race where five athletes of the same gender finished.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={packData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="season" />
                  <YAxis reversed tickFormatter={(v) => `${Math.round(Number(v))}s`} />
                  <Tooltip
                    labelFormatter={(l) => `Season: ${l}`}
                    formatter={(value: number | string, name: string) =>
                      value == null ? ['no race with five finishers', name] : [`${Math.round(Number(value))}s`, name]
                    }
                  />
                  <Legend />
                  <Line type="monotone" dataKey="men" name="Boys" stroke={GENDER_COLORS.men} strokeWidth={2} connectNulls={false} />
                  <Line type="monotone" dataKey="women" name="Girls" stroke={GENDER_COLORS.women} strokeWidth={2} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 20% of Field</CardTitle>
            <CardDescription>% of races where a team runner finished in the top 20% of the full field.</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasAnyTopField ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No field-results data uploaded yet for any season — see Field Results to add it.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={topFieldData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="season" />
                  <YAxis unit="%" domain={[0, 100]} />
                  <Tooltip labelFormatter={(l) => `Season: ${l}`} formatter={(v: number | string) => (v == null ? ['no data', ''] : [`${v}%`, ''])} />
                  <Legend />
                  <Line type="monotone" dataKey="men" name="Boys" stroke={GENDER_COLORS.men} strokeWidth={2} connectNulls={false} />
                  <Line type="monotone" dataKey="women" name="Girls" stroke={GENDER_COLORS.women} strokeWidth={2} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attrition</CardTitle>
            <CardDescription>
              % of athletes still on the team N years after they first joined. Graduating seniors don't count against
              this.
              {(attrition.leftCensored ?? 0) > 0 && attrition.earliestSeason != null && (
                <>
                  {' '}
                  {attrition.leftCensored} of these athletes first appear in {attrition.earliestSeason}, the earliest
                  season loaded — if they were already running before that, this reads low.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasAnyAttrition ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Not enough seasons loaded yet to observe any retention window.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={attritionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="window" />
                  <YAxis unit="%" domain={[0, 100]} />
                  <Tooltip
                    formatter={(value: number | string, _name: string, entry: { payload?: { n?: number } }) =>
                      value == null ? ['not enough seasons yet', ''] : [`${value}% (n=${entry?.payload?.n ?? '?'})`, 'Retained']
                    }
                  />
                  <Bar dataKey="retention" name="Retained" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {!hasAnyBenchmark && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No league/state/national benchmark data</AlertTitle>
          <AlertDescription>
            There's no external reference data configured for this team yet, so the numbers above are shown on their own rather than
            against a league, state, or national average. This will fill in automatically once a benchmark data source is available.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
