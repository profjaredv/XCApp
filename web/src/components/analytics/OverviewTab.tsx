import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatPace, formatDateShort, formatTime } from '@/lib/formatUtils';
import type { MostImprovedAthlete } from '@/types/analytics';
import type { TeamSeasonSeriesPoint } from '@/types/performance';

interface OverviewTabProps {
  displayedStats: {
    totalMeets: number;
    totalRaces: number;
    totalAthletes: number;
    totalMilesRun: number;
    avgAthletesPerRace: number;
    avgMilePace: number;
    totalPRs?: number;
    top10Finishes?: number;
  };
  mostImproved: MostImprovedAthlete[];
  seasonSeriesData?: {
    series: TeamSeasonSeriesPoint[];
  };
}

const tooltipFormatter = (value: number) => formatPace(value || 0);

export const OverviewTab = ({
  displayedStats,
  mostImproved,
  seasonSeriesData,
}: OverviewTabProps) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Team Season Stats</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div><p className="text-sm text-muted-foreground">Meets</p><p className="text-2xl font-bold">{displayedStats.totalMeets || 0}</p></div>
            <div><p className="text-sm text-muted-foreground">Total Races</p><p className="text-2xl font-bold">{displayedStats.totalRaces || 0}</p></div>
            <div><p className="text-sm text-muted-foreground">Total Athletes</p><p className="text-2xl font-bold">{displayedStats.totalAthletes || 0}</p></div>
            <div><p className="text-sm text-muted-foreground">Avg Athletes/Race</p><p className="text-2xl font-bold">{displayedStats.avgAthletesPerRace || 0}</p></div>
            <div><p className="text-sm text-muted-foreground">Total Miles Run</p><p className="text-2xl font-bold">{displayedStats.totalMilesRun?.toFixed(1) || '0.0'}</p></div>
            <div><p className="text-sm text-muted-foreground">Avg Mile Pace</p><p className="text-2xl font-bold">{formatPace(displayedStats.avgMilePace)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top Improving Athletes</CardTitle>
            <p className="text-sm text-muted-foreground">Based on pace improvement from first to most recent race</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {mostImproved.slice(0, 5).map((athlete: MostImprovedAthlete) => (
                <li key={athlete.id} className="flex justify-between items-center">
                  <span className="font-medium">{athlete.name}</span>
                  <div className="flex items-center gap-2">
                    {athlete.firstRaceTime && athlete.lastRaceTime && (
                      <span className="text-xs text-muted-foreground">
                        {formatTime(athlete.firstRaceTime)} → {formatTime(athlete.lastRaceTime)}
                      </span>
                    )}
                    <span className="text-green-600 font-semibold min-w-[3.5rem] text-right">
                      {typeof athlete.improvementPercent === 'number' ? `+${athlete.improvementPercent.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Season Pace Trend</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={seasonSeriesData?.series?.map((pt: TeamSeasonSeriesPoint) => ({
              name: pt.meetName || 'Unknown Meet',
              date: formatDateShort(pt.meetDate),
              overall: pt.overall?.avgMilePace?.overall || 0,
              boys: pt.byGender?.M?.avgMilePace?.overall || 0,
              girls: pt.byGender?.F?.avgMilePace?.overall || 0,
            })) || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={tooltipFormatter} domain={['dataMin - 15', 'dataMax + 15']} />
              <Tooltip formatter={tooltipFormatter} />
              <Legend />
              <Line type="monotone" dataKey="overall" stroke="#8884d8" strokeWidth={3} name="Overall Avg Pace" />
              <Line type="monotone" dataKey="boys" stroke="#82ca9d" strokeWidth={3} name="Boys Avg Pace" />
              <Line type="monotone" dataKey="girls" stroke="#ffc658" strokeWidth={3} name="Girls Avg Pace" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};
