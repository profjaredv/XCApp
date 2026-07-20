import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatTime, formatPace, formatDateShort } from '@/lib/formatUtils';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, BarChart, Bar } from 'recharts';
import CareerProgressChart from '@/components/analytics/CareerProgressChart';
import type { Athlete } from '@/types/analytics';
import type { PerformanceStats } from '@/types/performance';

interface AthleteRace {
  name: string;
  date: string;
  distanceMi: number;
  time: number;
}

interface AthleteProfileProps {
  athlete: Athlete & {
    bestTimeDate?: string;
    raceCount?: number;
    firstRaceTime?: number;
    currentGrade?: number;
    gender?: 'M' | 'F';
    name?: string;
    lastRaceTime?: number;
  };
  athleteRaces: AthleteRace[];
  seasonSpark: Array<{
    idx: number;
    date: string;
    pace: number;
    meetName?: string;
    [key: string]: string | number | undefined;
  }>;
  allTimeAvgPace: number;
  best5kTime: number;
  best5kMeet: string;
  best5kYear: number | null;
  seasonBest5kTime: number;
  seasonBest5kMeet: string;
  athleteStats?: PerformanceStats;
  athleteAllSeasons?: {
    data?: {
      seasons?: Array<{
        season: number;
        grade: number;
        metrics: {
          races?: Array<{
            id: string;
            meetId?: string;
            meetName?: string;
            name?: string;
            date: string;
            distance: number;
            time: number;
            pace?: number;
            place?: number;
            totalRunners?: number;
            isPr?: boolean;
            isSeasonBest?: boolean;
            [key: string]: string | number | boolean | undefined;
          }>;
          [key: string]: unknown;
        };
        [key: string]: any;
      }>;
      [key: string]: any;
    };
    [key: string]: any;
  };
  derivedAvgPaceSec: number;
  selectedSeason: number;
}

const AthleteProfile: React.FC<AthleteProfileProps> = ({
  athlete,
  athleteRaces,
  seasonSpark,
  allTimeAvgPace,
  best5kTime,
  best5kMeet,
  best5kYear,
  seasonBest5kTime,
  seasonBest5kMeet,
  athleteStats,
  athleteAllSeasons,
  derivedAvgPaceSec,
  selectedSeason
}) => {
  // Calculate current season races
  const currentSeasonRaces = athleteRaces.filter(race => {
    const raceYear = race.date ? new Date(race.date).getFullYear() : selectedSeason;
    return raceYear === selectedSeason;
  });
  
  // Calculate current season pace
  const currentSeasonTotals = currentSeasonRaces.reduce((acc, r) => {
    if (r.distanceMi > 0 && r.time > 0) {
      acc.time += r.time;
      acc.miles += r.distanceMi;
    }
    return acc;
  }, { time: 0, miles: 0 });
  
  const currentSeasonPace = currentSeasonTotals.miles > 0 
    ? Math.round(currentSeasonTotals.time / currentSeasonTotals.miles) 
    : 0;
  
  // Prefer calculated current season pace, then backend avg pace, then legacy field
  const avgPaceSec = currentSeasonPace > 0
    ? currentSeasonPace
    : (athleteStats?.avgMilePace?.overall && athleteStats?.avgMilePace?.overall > 0
      ? athleteStats.avgMilePace.overall
      : (derivedAvgPaceSec || athlete.avgPace || 0));
  
  const totalRacesAth = currentSeasonRaces.length || (athleteStats?.totalRaces ?? 0);

  return (
    <div className="w-full">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="races">Race History</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Best 5k (all time)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{best5kMeet || '—'}</p>
                <p className="text-2xl font-bold">
                  {formatTime(best5kTime)}
                  {best5kYear && <span className="text-sm text-muted-foreground ml-2">{best5kYear}</span>}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Best 5k (this season)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{seasonBest5kMeet || '—'}</p>
                <p className="text-2xl font-bold">
                  {seasonBest5kTime > 0 ? formatTime(seasonBest5kTime) : '—'}
                </p>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg. Mile Pace (all time)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatPace(allTimeAvgPace)}</p>
                <p className="text-sm text-muted-foreground">
                  {athleteAllSeasons?.data?.seasons 
                    ? `${athleteAllSeasons.data.seasons.reduce((total, season) => total + (season.races?.length || 0), 0)} races across ${athleteAllSeasons.data.seasons.length} ${athleteAllSeasons.data.seasons.length === 1 ? 'season' : 'seasons'}`
                    : `${athleteRaces.length || 0} races`}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg. Mile Pace (this season)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatPace(avgPaceSec)}</p>
                <p className="text-sm text-muted-foreground">{totalRacesAth} races</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Season Progress</CardTitle>
              <CardDescription>Current season performance</CardDescription>
            </CardHeader>
            <CardContent>
              {seasonSpark.length >= 3 ? (
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={seasonSpark} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <YAxis hide domain={['dataMin', 'dataMax']} />
                      <XAxis hide dataKey="idx" />
                      <Tooltip 
                        formatter={(v: number) => formatPace(v)} 
                        labelFormatter={(l, payload) => {
                          if (payload && payload[0]) {
                            const data = payload[0].payload;
                            return `${data.meetName || 'Race'} \n${data.date || ''}`;
                          }
                          return `Race ${l}`;
                        }}
                      />
                      <Line type="monotone" dataKey="pace" stroke="#2563eb" strokeWidth={2} dot={true} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-24 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Race more to unlock</p>
                  <p className="text-xs text-muted-foreground">Need {3 - seasonSpark.length} more race{seasonSpark.length === 2 ? '' : 's'}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Career Progress</CardTitle>
              <CardDescription>
                {athleteAllSeasons?.data?.seasons && athleteAllSeasons.data.seasons.length > 1 
                  ? `Performance across ${athleteAllSeasons.data.seasons.length} seasons (${athleteAllSeasons.data.seasons.map(s => s.season).join(', ')})` 
                  : 'All-time performance across seasons'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-32">
                {athleteAllSeasons?.data?.seasons && athleteAllSeasons.data.seasons.length > 0 ? (
                  <CareerProgressChart 
                    athlete={{
                      ...athlete,
                      races: athleteAllSeasons.data.seasons.flatMap(season => 
                        (season.races || []).map(race => ({
                          ...race,
                          grade: season.grade,
                          pace: race.pace || (race.time && race.distance ? race.time / (race.distance / 1609.34) : 0)
                        }))
                      )
                    }} 
                    height={130} 
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">Career data not available yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="races" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Race History</CardTitle>
              <CardDescription>All races for {athlete.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {athleteRaces.map((race, index) => {
                  const pace = race.distanceMi > 0 ? Math.round(race.time / race.distanceMi) : 0;
                  return (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium">{race.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDateShort(race.date)} • {race.distanceMi.toFixed(2)} mi
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatTime(race.time)}</p>
                        <p className="text-sm text-muted-foreground">{formatPace(pace)} /mi</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Performance Trends</CardTitle>
              <CardDescription>Avg pace per race (lower is faster)</CardDescription>
            </CardHeader>
            <CardContent>
              {seasonSpark.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={seasonSpark} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" interval={0} angle={-30} textAnchor="end" height={50} />
                      <YAxis tickFormatter={(v: number) => formatPace(v)} width={60} />
                      <Tooltip formatter={(v: number) => formatPace(v)} labelFormatter={(l) => l} />
                      <Legend />
                      <Line type="monotone" dataKey="pace" name="Pace" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted-foreground">No season data available.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pace Distribution</CardTitle>
              <CardDescription>Distribution of race paces this season</CardDescription>
            </CardHeader>
            <CardContent>
              {seasonSpark.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={seasonSpark} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="idx" tickFormatter={(i) => `#${i}`} />
                      <YAxis tickFormatter={(v: number) => formatPace(v)} width={60} />
                      <Tooltip formatter={(v: number) => formatPace(v)} labelFormatter={(l) => `Race ${l}`} />
                      <Bar dataKey="pace" name="Pace" fill="#94a3b8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted-foreground">No pace data available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AthleteProfile;
