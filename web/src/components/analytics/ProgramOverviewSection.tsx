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

// The four things the Program tab's band/position charts don't answer on
// their own (user request): is the program growing, is it burning miles,
// is it landing near the front of the field, and is it keeping the
// athletes it recruits. Each card here is one clear number-over-time, not
// a config panel — same "coffee in November" spirit as the charts below.

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

  const milesData = seasons.map((s) => ({
    season: s.season,
    miles: s.milesLogged,
    calculated: s.metricsCalculated,
  }));
  const uncalculatedSeasons = seasons.filter((s) => !s.metricsCalculated).map((s) => s.season);

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
            <CardTitle>Miles Logged</CardTitle>
            <CardDescription>Total race miles the team has run, per season.</CardDescription>
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
                    formatter={(value: number | string) => [value == null ? 'not calculated yet' : `${Number(value).toFixed(0)} mi`, 'Miles']}
                  />
                  <Bar dataKey="miles" name="Miles" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            )}
            {uncalculatedSeasons.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {uncalculatedSeasons.join(', ')} {uncalculatedSeasons.length === 1 ? 'has' : 'have'} no calculated metrics yet — run
                "Recalculate Metrics" for {uncalculatedSeasons.length === 1 ? 'that season' : 'those seasons'} to fill this in.
              </p>
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
            <CardDescription>% of athletes still on the team N years after they first joined. Graduating seniors don't count against this.</CardDescription>
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
