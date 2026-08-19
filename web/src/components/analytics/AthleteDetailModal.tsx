import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTabsList } from '@/components/ui/responsive-tabs';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import AthleteProgressChart from './AthleteProgressChart';
import { AthleteHighlightCard } from './AthleteHighlightCard';
import { formatTime, formatPace } from '@/lib/formatUtils';
import { gradeLabel } from '@/lib/seasonUtils';
import { enrichRacesWithPRs, getPRBadgeStyle } from '@/utils/prTracking';
import type { Athlete, Race } from '@/types/analytics';

interface RaceData {
  name: string;
  date: string;
  distanceMi: number;
  time: number;
  season?: number;
  isPR?: boolean;
  isSeasonPR?: boolean;
  division?: string | null;
  place?: number | null;
  fieldSize?: number | null;
  overallPlace?: number | null;
  overallFieldSize?: number | null;
  teamPlace?: number | null;
}

interface CareerSummary {
  totalRaces: number;
  totalMiles: number;
  avgPace: number;
  best5kTime: number;
}

interface SeasonBreakdown {
  season: number;
  totalRaces: number;
  totalMiles: number;
  avgPace: number;
  best5kTime: number;
}



interface AthleteDetailModalProps {
  selectedAthlete: Athlete | null;
  enhancedSelectedAthlete: (Athlete & { bestTimeDate?: string; raceCount?: number; firstRaceTime?: number; lastRaceTime?: number; races: Race[] }) | null;
  careerSummary: CareerSummary;
  seasonBreakdown: SeasonBreakdown[];
  allSeasonsRaces: RaceData[];
  onClose: () => void;
}

export const AthleteDetailModal = ({
  selectedAthlete,
  enhancedSelectedAthlete,
  careerSummary,
  seasonBreakdown,
  allSeasonsRaces,
  onClose
}: AthleteDetailModalProps) => {
  // Sorting state for races table
  const [sortField, setSortField] = useState<'meet' | 'season' | 'distance' | 'time' | 'pace'>('season');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [detailTab, setDetailTab] = useState('summary');

  // Deduplicate races by creating a unique key (before early return)
  const uniqueRaces = useMemo(() => {
    if (!allSeasonsRaces || allSeasonsRaces.length === 0) {
      return new Map();
    }
    return allSeasonsRaces.reduce((acc, race) => {
      const key = `${race.name}-${race.date}-${race.distanceMi}-${race.time}`;
      if (!acc.has(key)) {
        acc.set(key, race);
      }
      return acc;
    }, new Map());
  }, [allSeasonsRaces]);

  // Enrich races with PR information
  const racesWithPRs = useMemo(() => {
    const races = Array.from(uniqueRaces.values());
    // Convert to format expected by PR tracking
    const racesForPRTracking = races.map((r, idx) => ({
      time: r.time,
      distanceMeters: Math.round(r.distanceMi * 1609.34), // Convert miles to meters
      date: r.date,
      meetName: r.name,
      season: r.season,
      _id: `${r.name}-${r.date}-${idx}`
    }));
    
    const enriched = enrichRacesWithPRs(racesForPRTracking);
    
    // Map back to original race format with PR info
    return races.map((r, idx) => ({
      ...r,
      isPR: enriched[idx].isPR,
      isSeasonPR: enriched[idx].isSeasonPR
    }));
  }, [uniqueRaces]);

  // Sort races based on current sort field and direction (before early return)
  const sortedRaces = useMemo(() => {
    return racesWithPRs.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;
      
      switch (sortField) {
        case 'meet':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'season':
          aValue = a.season || 0;
          bValue = b.season || 0;
          break;
        case 'distance':
          aValue = a.distanceMi;
          bValue = b.distanceMi;
          break;
        case 'time':
          aValue = a.time;
          bValue = b.time;
          break;
        case 'pace':
          aValue = a.time / a.distanceMi;
          bValue = b.time / b.distanceMi;
          break;
        default:
          aValue = a.season || 0;
          bValue = b.season || 0;
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      } else {
        return sortDirection === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number);
      }
    });
  }, [racesWithPRs, sortField, sortDirection]);

  // Chart data for "Race Performance Over Time" — always chronological
  // regardless of how the table below is currently sorted (sortedRaces'
  // order follows sortField/sortDirection, which the chart must not
  // inherit). Plots pace (time per mile), not raw time: races here span
  // wildly different distances (a 1-mile time trial vs. a 5K), and raw
  // finish time makes those look like huge fitness swings when they're
  // really just distance differences. A synthetic null-pace point is
  // inserted at every season boundary so the line breaks there instead of
  // drawing a single continuous slope straight through the off-season,
  // where no races actually happened.
  const paceChartData = useMemo(() => {
    const points = sortedRaces
      .filter((race) => race.distanceMi > 0)
      .map((race) => ({
        date: new Date(race.date).getTime(),
        season: race.season || 2022,
        pace: race.time / race.distanceMi,
      }))
      .sort((a, b) => a.date - b.date);

    // Least-squares fit over the real races only (never the synthetic
    // season-break points below) — a straight trend line across the whole
    // span, distinct from the pace line itself, which still breaks at
    // season boundaries. Needs at least 2 races with distinct dates or the
    // slope is undefined; in that case no trend is drawn.
    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.date, 0);
    const sumY = points.reduce((s, p) => s + p.pace, 0);
    const sumXY = points.reduce((s, p) => s + p.date * p.pace, 0);
    const sumXX = points.reduce((s, p) => s + p.date * p.date, 0);
    const denominator = n * sumXX - sumX * sumX;
    const trendFn: ((date: number) => number) | null =
      n >= 2 && denominator !== 0
        ? (() => {
            const slope = (n * sumXY - sumX * sumY) / denominator;
            const intercept = (sumY - slope * sumX) / n;
            return (date: number) => slope * date + intercept;
          })()
        : null;

    const withTrend = points.map((p) => ({ ...p, trend: trendFn?.(p.date) }));

    const withBreaks: typeof withTrend = [];
    withTrend.forEach((point, i) => {
      withBreaks.push(point);
      const next = withTrend[i + 1];
      if (next && next.season !== point.season) {
        const breakDate = (point.date + next.date) / 2;
        withBreaks.push({
          date: breakDate,
          season: point.season,
          pace: null as unknown as number,
          trend: trendFn?.(breakDate),
        });
      }
    });
    return withBreaks;
  }, [sortedRaces]);

  if (!selectedAthlete || !enhancedSelectedAthlete) return null;

  // Transform data for AthleteProgressChart. Team/gender comparison lines
  // (team5K/boys5K/girls5K/etc.) used to come from GET /api/multi-season/
  // trends, which silently dropped every state/championship race and took
  // an unweighted mean — that endpoint and its frontend hook are gone (Part
  // B, XCApp Pre-Season Fixes doc). Left null here: the athlete's own
  // progress line still renders, just without a team/gender comparison —
  // see /band-trends for the real, per-band replacement view.
  const athleteProgressData = (seasonBreakdown || []).map(season => ({
    season: season.season,
    athlete5K: season.best5kTime || null,
    athletePace: season.avgPace || null,
    team5K: null,
    teamPace: null,
    boys5K: null,
    boysPace: null,
    girls5K: null,
    girlsPace: null
  }));

  // Add PR and SB data to career summary
  const enhancedCareerSummary = {
    ...(careerSummary || {}),
    prBest5K: enhancedSelectedAthlete?.prBest5K || enhancedSelectedAthlete?.bestTime || 0,
    sbBest5K: enhancedSelectedAthlete?.bestTime || 0
  };


  // Handle sort column click
  const handleSort = (field: 'meet' | 'season' | 'distance' | 'time' | 'pace') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose}>
      <div className="bg-background h-full w-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-8 max-w-7xl mx-auto">
          <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">{enhancedSelectedAthlete.name}</h2>
            <p className="text-muted-foreground">{gradeLabel(enhancedSelectedAthlete.currentGrade)} &bull; {enhancedSelectedAthlete.gender === 'M' ? 'Boys' : enhancedSelectedAthlete.gender === 'F' ? 'Girls' : enhancedSelectedAthlete.gender || 'Unknown'}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="mt-6">
          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <div className="mb-4">
              <ResponsiveTabsList value={detailTab} onValueChange={setDetailTab} className="md:w-full">
                <TabsTrigger value="summary" className="whitespace-nowrap">Career Summary</TabsTrigger>
                <TabsTrigger value="seasons" className="whitespace-nowrap">Season Breakdown</TabsTrigger>
                <TabsTrigger value="races" className="whitespace-nowrap">All Races</TabsTrigger>
                <TabsTrigger value="highlights" className="whitespace-nowrap">Highlights</TabsTrigger>
              </ResponsiveTabsList>
            </div>
            <TabsContent value="summary">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 text-center">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground uppercase">Races</p>
                  <p className="text-2xl font-bold">{enhancedCareerSummary.totalRaces || 0}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground uppercase">Total Miles</p>
                  <p className="text-2xl font-bold">{enhancedCareerSummary.totalMiles || 0}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground uppercase">Avg Pace</p>
                  <p className="text-2xl font-bold">{enhancedCareerSummary.avgPace ? formatPace(enhancedCareerSummary.avgPace) : 'N/A'}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground uppercase">PR 5K</p>
                  <p className="text-2xl font-bold">{enhancedCareerSummary.prBest5K ? formatTime(enhancedCareerSummary.prBest5K) : 'N/A'}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground uppercase">SB 5K</p>
                  <p className="text-2xl font-bold">{enhancedCareerSummary.sbBest5K ? formatTime(enhancedCareerSummary.sbBest5K) : 'N/A'}</p>
                </div>
              </div>
              <AthleteProgressChart
                athleteName={enhancedSelectedAthlete.name}
                athleteGender={enhancedSelectedAthlete.gender as 'M' | 'F'}
                data={athleteProgressData}
              />
            </TabsContent>
            <TabsContent value="seasons">
              <div className="space-y-6">
                {/* Season Overview Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Season Performance Overview</CardTitle>
                    <p className="text-sm text-muted-foreground">Best 5K times by season</p>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={seasonBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="season" />
                        <YAxis 
                          tickFormatter={(value) => formatTime(value)}
                          domain={['dataMin - 30', 'dataMax + 30']}
                        />
                        <Tooltip 
                          formatter={(value: number) => [formatTime(value), 'Best 5K']}
                          labelFormatter={(label) => `${label} Season`}
                        />
                        <Bar dataKey="best5kTime" fill="#2563eb" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Individual Season Details */}
                {seasonBreakdown.map(s => (
                  <Card key={s.season}>
                    <CardHeader><CardTitle>{s.season} Season</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground uppercase">Races</p>
                          <p className="text-xl font-bold">{s.totalRaces}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground uppercase">Miles</p>
                          <p className="text-xl font-bold">{s.totalMiles.toFixed(1)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground uppercase">Avg Pace</p>
                          <p className="text-xl font-bold">{formatPace(s.avgPace)}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground uppercase">SB 5K</p>
                          <p className="text-xl font-bold">{formatTime(s.best5kTime)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="races">
              <div className="space-y-6">
                {/* Race Progress Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Race Performance Over Time</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Performance progression across seasons ({sortedRaces.length} races)
                    </p>
                  </CardHeader>
                  <CardContent>
                    {sortedRaces.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={paceChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(timestamp) => {
                              const date = new Date(timestamp);
                              return `${date.getMonth() + 1}/${date.getDate()}`;
                            }}
                          />
                          <YAxis
                            tickFormatter={(value) => formatPace(value)}
                            domain={['dataMin - 15', 'dataMax + 15']}
                          />
                          <Tooltip
                            formatter={(value: number | null, name: string) =>
                              value == null ? ['—', name] : [formatPace(value), name]
                            }
                            labelFormatter={(timestamp) => {
                              const date = new Date(timestamp);
                              return `${date.toLocaleDateString()} - ${sortedRaces.find(r => new Date(r.date).getTime() === timestamp)?.name || 'Race'}`;
                            }}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="pace"
                            stroke="#2563eb"
                            strokeWidth={2}
                            name="Pace (min/mi)"
                            connectNulls={false}
                            dot={{ r: 4 }}
                          />
                          <Line
                            type="linear"
                            dataKey="trend"
                            stroke="#f97316"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            name="Trend"
                            connectNulls
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-64 text-muted-foreground">
                        No race data available
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Race Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>All Races</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[400px] overflow-auto">
                      <table className="w-full text-sm min-w-[500px]">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">
                              <button 
                                className="flex items-center gap-1 hover:text-blue-600"
                                onClick={() => handleSort('meet')}
                              >
                                Meet
                                {sortField === 'meet' && (
                                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                )}
                              </button>
                            </th>
                            <th className="text-right p-2">
                              <button 
                                className="flex items-center gap-1 hover:text-blue-600 ml-auto"
                                onClick={() => handleSort('season')}
                              >
                                Season
                                {sortField === 'season' && (
                                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                )}
                              </button>
                            </th>
                            <th className="text-right p-2">
                              <button 
                                className="flex items-center gap-1 hover:text-blue-600 ml-auto"
                                onClick={() => handleSort('distance')}
                              >
                                Distance
                                {sortField === 'distance' && (
                                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                )}
                              </button>
                            </th>
                            <th className="text-right p-2">
                              <button 
                                className="flex items-center gap-1 hover:text-blue-600 ml-auto"
                                onClick={() => handleSort('time')}
                              >
                                Time
                                {sortField === 'time' && (
                                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                )}
                              </button>
                            </th>
                            <th className="text-right p-2">
                              <button 
                                className="flex items-center gap-1 hover:text-blue-600 ml-auto"
                                onClick={() => handleSort('pace')}
                              >
                                Pace
                                {sortField === 'pace' && (
                                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                )}
                              </button>
                            </th>
                            <th className="text-right p-2">Team Place</th>
                            <th className="text-right p-2">Place</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedRaces.map((race, idx) => {
                            const prBadge = getPRBadgeStyle(race.isPR || false, race.isSeasonPR || false);
                            return (
                              <tr key={idx} className={`border-b ${prBadge.className}`}>
                                <td className="p-2">
                                  {race.name}
                                  {race.division && <span className="block text-xs text-muted-foreground">{race.division}</span>}
                                  {race.isPR && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 font-bold">PR</span>}
                                  {race.isSeasonPR && !race.isPR && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 font-semibold">SB</span>}
                                </td>
                                <td className="text-right p-2">{race.season}</td>
                                <td className="text-right p-2">{race.distanceMi.toFixed(2)} mi</td>
                                <td className={`text-right p-2 ${race.isPR ? 'font-bold' : ''}`}>{formatTime(race.time)}</td>
                                <td className="text-right p-2">{formatPace(race.time / race.distanceMi)}</td>
                                <td className="text-right p-2 whitespace-nowrap">
                                  {race.teamPlace != null ? `#${race.teamPlace}` : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="text-right p-2 whitespace-nowrap">
                                  {race.place != null ? (
                                    <>
                                      #{race.place}{race.fieldSize ? ` of ${race.fieldSize}` : ''}
                                      {race.overallPlace != null && (
                                        <span className="block text-xs text-muted-foreground">
                                          Overall #{race.overallPlace}{race.overallFieldSize ? ` of ${race.overallFieldSize}` : ''}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="highlights">
              <div className="space-y-8">
                <p className="text-muted-foreground text-center mb-6">
                  Create shareable highlight cards for social media showcasing this athlete's achievements
                </p>
                
                {/* Season Highlights */}
                {seasonBreakdown && seasonBreakdown.length > 0 && (() => {
                  // Get the most recent season (highest season number)
                  const currentSeasonData = seasonBreakdown.reduce((latest, season) => 
                    season.season > latest.season ? season : latest
                  , seasonBreakdown[0]);
                  
                  // Get races for current season to build progression data
                  const currentSeasonRaces = allSeasonsRaces
                    .filter(r => r.season === currentSeasonData.season && r.distanceMi >= 3.0)
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  
                  const progressionData = currentSeasonRaces.map(r => r.time);
                  const firstRaceTime = progressionData[0];
                  const fastestRaceTime = Math.min(...progressionData);
                  const timeDropped = firstRaceTime && fastestRaceTime ? firstRaceTime - fastestRaceTime : 0;

                  // Get best races by distance category. Labels come from
                  // rounding to a nearby common XC/track distance — a fixed
                  // 4-bucket enum used to merge every race >=3.0mi (5K, 6K,
                  // 8K...) into one "5K" bucket, so an 8K time could wrongly
                  // "win" a 5K's spot, and the old order array below had no
                  // way to sort 4K/6K/8K correctly. Sorting by the actual
                  // distanceMi of the winning race (not a label lookup) is
                  // what makes any distance order correctly.
                  const getDistanceCategory = (miles: number) => {
                    if (miles >= 4.5) return '8K';
                    if (miles >= 3.5) return '6K';
                    if (miles >= 2.75) return '5K';
                    if (miles >= 2.25) return '4K';
                    if (miles >= 1.75) return '2 Mile';
                    if (miles >= 1.25) return '1.5 Mile';
                    return '1 Mile';
                  };

                  const racesByDistance = allSeasonsRaces
                    .filter(r => r.season === currentSeasonData.season)
                    .reduce((acc, race) => {
                      const category = getDistanceCategory(race.distanceMi);
                      if (!acc[category] || race.time < acc[category].time) {
                        acc[category] = { distance: category, time: race.time, raceName: race.name, distanceMi: race.distanceMi };
                      }
                      return acc;
                    }, {} as Record<string, { distance: string; time: number; raceName: string; distanceMi: number }>);

                  const bestRacesByDistance = Object.values(racesByDistance)
                    .sort((a, b) => a.distanceMi - b.distanceMi);

                  // "Season Best 5K" and its race-name caption have to come
                  // from the SAME bucketed lookup used just above — pulling
                  // the headline number from currentSeasonData.best5kTime (a
                  // separately cached metric) while the caption came from an
                  // unbucketed Math.min() over every race >=3.0mi let the two
                  // drift out of sync (a stale cached time next to a race
                  // name that actually ran a different time), and could even
                  // let an 8K "win" a headline explicitly labeled 5K.
                  const best5kEntry = racesByDistance['5K'];
                  const bestRaceName = best5kEntry?.raceName || '';

                  // The actual 1-mile PR — a real 1-mile race result, not
                  // (as this used to compute) the best per-mile PACE across
                  // 5K-and-longer races, which produced a number nowhere
                  // close to any mile this athlete has actually run.
                  const bestMileEntry = racesByDistance['1 Mile'];

                  return (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Current Season Highlights ({currentSeasonData.season})</h3>
                      <AthleteHighlightCard
                        athleteName={enhancedSelectedAthlete.name}
                        grade={enhancedSelectedAthlete.currentGrade}
                        gender={enhancedSelectedAthlete.gender as 'M' | 'F'}
                        season={currentSeasonData.season}
                        mode="season"
                        stats={{
                          totalRaces: currentSeasonData.totalRaces,
                          totalMiles: currentSeasonData.totalMiles,
                          prTime: best5kEntry?.time ?? currentSeasonData.best5kTime ?? enhancedSelectedAthlete.bestTime,
                          sbTime: currentSeasonData.best5kTime,
                          avgPace: currentSeasonData.avgPace,
                          milePR: bestMileEntry?.time,
                          improvement: enhancedSelectedAthlete.improvementPercent,
                          timeDropped: timeDropped > 0 ? timeDropped : undefined,
                          firstRaceTime,
                          fastestRaceTime,
                          bestRaceName,
                          bestRacesByDistance: bestRacesByDistance.length > 0 ? bestRacesByDistance : undefined,
                          progressionData: progressionData.length > 1 ? progressionData : undefined
                        }}
                        teamName={enhancedSelectedAthlete.teamName || 'Team'}
                      />
                    </div>
                  );
                })()}

                {/* Career Highlights */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Career Highlights</h3>
                  {(() => {
                    // Get all 5K races across all seasons for career progression
                    const all5KRaces = allSeasonsRaces
                      .filter(r => r.distanceMi >= 3.0)
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    
                    const careerProgressionData = all5KRaces.map(r => r.time);
                    const firstCareerRaceTime = careerProgressionData[0];
                    const fastestCareerRaceTime = Math.min(...careerProgressionData);
                    const careerTimeDropped = firstCareerRaceTime && fastestCareerRaceTime
                      ? firstCareerRaceTime - fastestCareerRaceTime
                      : 0;

                    // Get best races by distance category for career — see
                    // the season-scoped version above for why this sorts by
                    // distanceMi rather than a fixed label order array.
                    const getDistanceCategory = (miles: number) => {
                      if (miles >= 4.5) return '8K';
                      if (miles >= 3.5) return '6K';
                      if (miles >= 2.75) return '5K';
                      if (miles >= 2.25) return '4K';
                      if (miles >= 1.75) return '2 Mile';
                      if (miles >= 1.25) return '1.5 Mile';
                      return '1 Mile';
                    };

                    const careerRacesByDistance = allSeasonsRaces
                      .reduce((acc, race) => {
                        const category = getDistanceCategory(race.distanceMi);
                        if (!acc[category] || race.time < acc[category].time) {
                          acc[category] = { distance: category, time: race.time, raceName: race.name, distanceMi: race.distanceMi };
                        }
                        return acc;
                      }, {} as Record<string, { distance: string; time: number; raceName: string; distanceMi: number }>);

                    const careerBestRacesByDistance = Object.values(careerRacesByDistance)
                      .sort((a, b) => a.distanceMi - b.distanceMi);

                    // Same fix as the season card above: the headline
                    // number and its race-name caption both come from the
                    // same bucketed "5K" lookup now, instead of pairing a
                    // separately cached prBest5K with a race name derived
                    // from an unbucketed min() that could point at an 8K.
                    const best5kCareerEntry = careerRacesByDistance['5K'];
                    const bestCareerRaceName = best5kCareerEntry?.raceName || '';

                    // A real career 1-mile PR, not the best per-mile pace
                    // across 5K-and-longer races (which is what this used
                    // to compute — see the season card's comment above).
                    const bestCareerMileEntry = careerRacesByDistance['1 Mile'];

                    return (
                      <AthleteHighlightCard
                        athleteName={enhancedSelectedAthlete.name}
                        grade={enhancedSelectedAthlete.currentGrade}
                        gender={enhancedSelectedAthlete.gender as 'M' | 'F'}
                        season={new Date().getFullYear()}
                        mode="career"
                        stats={{
                          totalRaces: enhancedCareerSummary.totalRaces || 0,
                          totalMiles: enhancedCareerSummary.totalMiles || 0,
                          prTime: best5kCareerEntry?.time ?? enhancedCareerSummary.prBest5K ?? enhancedSelectedAthlete.bestTime,
                          avgPace: enhancedCareerSummary.avgPace || enhancedSelectedAthlete.avgPace,
                          milePR: bestCareerMileEntry?.time,
                          bestPace: enhancedSelectedAthlete.avgPace,
                          timeDropped: careerTimeDropped > 0 ? careerTimeDropped : undefined,
                          firstRaceTime: firstCareerRaceTime,
                          fastestRaceTime: fastestCareerRaceTime,
                          bestRaceName: bestCareerRaceName,
                          bestRacesByDistance: careerBestRacesByDistance.length > 0 ? careerBestRacesByDistance : undefined,
                          progressionData: careerProgressionData.length > 1 ? careerProgressionData : undefined
                        }}
                        teamName={enhancedSelectedAthlete.teamName || 'Team'}
                      />
                    );
                  })()}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
        </div>
      </div>
    </div>
  );
};
