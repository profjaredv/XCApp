import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import AthleteProgressChart from './AthleteProgressChart';
import { AthleteHighlightCard } from './AthleteHighlightCard';
import { formatTime, formatPace } from '@/lib/formatUtils';
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
  multiSeasonTrendsData?: {
    trends: Array<{
      season: number;
      avg5K?: { boys?: number; girls?: number; team?: number };
      avgPace?: { boys?: number; girls?: number; team?: number };
    }>;
  };
  isLoadingMultiSeasonTrends: boolean;
  onClose: () => void;
}

export const AthleteDetailModal = ({ 
  selectedAthlete,
  enhancedSelectedAthlete,
  careerSummary,
  seasonBreakdown,
  allSeasonsRaces,
  multiSeasonTrendsData,
  isLoadingMultiSeasonTrends,
  onClose 
}: AthleteDetailModalProps) => {
  // Sorting state for races table
  const [sortField, setSortField] = useState<'meet' | 'season' | 'distance' | 'time' | 'pace'>('season');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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

  if (!selectedAthlete || !enhancedSelectedAthlete) return null;

  // Get team and gender averages from multiSeasonTrendsData
  const getTeamGenderAverages = (season: number) => {
    if (!multiSeasonTrendsData?.trends) return { 
      team5K: null, teamPace: null, 
      boys5K: null, boysPace: null,
      girls5K: null, girlsPace: null
    };
    
    const seasonData = multiSeasonTrendsData.trends.find(t => t.season === season);
    if (!seasonData) return { 
      team5K: null, teamPace: null, 
      boys5K: null, boysPace: null,
      girls5K: null, girlsPace: null
    };
    
    return {
      team5K: seasonData.avg5K?.team || null,
      teamPace: seasonData.avgPace?.team || null,
      boys5K: seasonData.avg5K?.boys || null,
      boysPace: seasonData.avgPace?.boys || null,
      girls5K: seasonData.avg5K?.girls || null,
      girlsPace: seasonData.avgPace?.girls || null
    };
  };

  // Transform data for AthleteProgressChart
  const athleteProgressData = (seasonBreakdown || []).map(season => {
    const averages = getTeamGenderAverages(season.season);
    return {
      season: season.season,
      athlete5K: season.best5kTime || null,
      athletePace: season.avgPace || null,
      team5K: averages.team5K,
      teamPace: averages.teamPace,
      boys5K: averages.boys5K,
      boysPace: averages.boysPace,
      girls5K: averages.girls5K,
      girlsPace: averages.girlsPace
    };
  });

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
            <p className="text-muted-foreground">Grade {enhancedSelectedAthlete.currentGrade} &bull; {enhancedSelectedAthlete.gender === 'M' ? 'Boys' : enhancedSelectedAthlete.gender === 'F' ? 'Girls' : enhancedSelectedAthlete.gender || 'Unknown'}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="mt-6">
          <Tabs defaultValue="summary">
            {/* Scrollable tabs on mobile */}
            <div className="overflow-x-auto mb-4 -mx-4 px-4 md:mx-0 md:px-0">
              <TabsList className="inline-flex w-auto min-w-full md:w-full">
                <TabsTrigger value="summary" className="whitespace-nowrap">Career Summary</TabsTrigger>
                <TabsTrigger value="seasons" className="whitespace-nowrap">Season Breakdown</TabsTrigger>
                <TabsTrigger value="races" className="whitespace-nowrap">All Races</TabsTrigger>
                <TabsTrigger value="highlights" className="whitespace-nowrap">Highlights</TabsTrigger>
              </TabsList>
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
                isLoading={isLoadingMultiSeasonTrends}
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
                        <LineChart data={sortedRaces.map((race, index) => ({
                          date: new Date(race.date).getTime(), // Use actual date timestamp
                          season: race.season || 2022,
                          time: race.time,
                          pace: race.time / race.distanceMi,
                          meetName: race.name,
                          raceIndex: index
                        })).sort((a, b) => a.date - b.date)}> {/* Sort by date */}
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
                            tickFormatter={(value) => formatTime(value)}
                            domain={['dataMin - 30', 'dataMax + 30']}
                          />
                          <Tooltip 
                            formatter={(value: number, name: string) => [
                              name === 'time' ? formatTime(value) : formatPace(value),
                              name === 'time' ? 'Time' : 'Pace'
                            ]}
                            labelFormatter={(timestamp) => {
                              const date = new Date(timestamp);
                              return `${date.toLocaleDateString()} - ${sortedRaces.find(r => new Date(r.date).getTime() === timestamp)?.name || 'Race'}`;
                            }}
                          />
                          <Legend />
                          <Line 
                            type="monotone" 
                            dataKey="time" 
                            stroke="#2563eb" 
                            strokeWidth={2}
                            name="Race Time"
                            connectNulls={false}
                            dot={{ r: 4 }}
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
                    <div className="max-h-[400px] overflow-y-auto">
                      <table className="w-full text-sm">
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
                          </tr>
                        </thead>
                        <tbody>
                          {sortedRaces.map((race, idx) => {
                            const prBadge = getPRBadgeStyle(race.isPR || false, race.isSeasonPR || false);
                            return (
                              <tr key={idx} className={`border-b ${prBadge.className}`}>
                                <td className="p-2">
                                  {race.name}
                                  {race.isPR && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 font-bold">PR</span>}
                                  {race.isSeasonPR && !race.isPR && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 font-semibold">SB</span>}
                                </td>
                                <td className="text-right p-2">{race.season}</td>
                                <td className="text-right p-2">{race.distanceMi.toFixed(2)} mi</td>
                                <td className={`text-right p-2 ${race.isPR ? 'font-bold' : ''}`}>{formatTime(race.time)}</td>
                                <td className="text-right p-2">{formatPace(race.time / race.distanceMi)}</td>
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
                  
                  // Find the best race (fastest time)
                  const bestRace = currentSeasonRaces.find(r => r.time === fastestRaceTime);
                  const bestRaceName = bestRace?.name || '';
                  
                  // Calculate best mile pace from all races
                  const milePR = currentSeasonRaces.length > 0 
                    ? Math.min(...currentSeasonRaces.map(r => r.time / r.distanceMi))
                    : 0;
                  
                  // Get best races by distance category
                  const getDistanceCategory = (miles: number) => {
                    if (miles >= 3.0) return '5K'; // 3.0+ miles is 5K
                    if (miles >= 2.5) return '3 Mile';
                    if (miles >= 1.25) return '1.5 Mile';
                    return '1 Mile';
                  };
                  
                  const racesByDistance = allSeasonsRaces
                    .filter(r => r.season === currentSeasonData.season)
                    .reduce((acc, race) => {
                      const category = getDistanceCategory(race.distanceMi);
                      if (!acc[category] || race.time < acc[category].time) {
                        acc[category] = { distance: category, time: race.time, raceName: race.name };
                      }
                      return acc;
                    }, {} as Record<string, { distance: string; time: number; raceName: string }>);
                  
                  const bestRacesByDistance = Object.values(racesByDistance)
                    .sort((a, b) => {
                      const order = ['1 Mile', '1.5 Mile', '3 Mile', '5K'];
                      return order.indexOf(a.distance) - order.indexOf(b.distance);
                    });
                  
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
                          prTime: currentSeasonData.best5kTime || enhancedSelectedAthlete.bestTime,
                          sbTime: currentSeasonData.best5kTime,
                          avgPace: currentSeasonData.avgPace,
                          milePR: milePR > 0 ? milePR : undefined,
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
                    
                    // Find the best race (fastest time) across career
                    const bestCareerRace = all5KRaces.find(r => r.time === fastestCareerRaceTime);
                    const bestCareerRaceName = bestCareerRace?.name || '';
                    
                    // Calculate best mile pace from all career races
                    const careerMilePR = all5KRaces.length > 0 
                      ? Math.min(...all5KRaces.map(r => r.time / r.distanceMi))
                      : 0;
                    
                    // Get best races by distance category for career
                    const getDistanceCategory = (miles: number) => {
                      if (miles >= 3.0) return '5K'; // 3.0+ miles is 5K
                      if (miles >= 2.5) return '3 Mile';
                      if (miles >= 1.25) return '1.5 Mile';
                      return '1 Mile';
                    };
                    
                    const careerRacesByDistance = allSeasonsRaces
                      .reduce((acc, race) => {
                        const category = getDistanceCategory(race.distanceMi);
                        if (!acc[category] || race.time < acc[category].time) {
                          acc[category] = { distance: category, time: race.time, raceName: race.name };
                        }
                        return acc;
                      }, {} as Record<string, { distance: string; time: number; raceName: string }>);
                    
                    const careerBestRacesByDistance = Object.values(careerRacesByDistance)
                      .sort((a, b) => {
                        const order = ['1 Mile', '1.5 Mile', '3 Mile', '5K'];
                        return order.indexOf(a.distance) - order.indexOf(b.distance);
                      });
                    
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
                          prTime: enhancedCareerSummary.prBest5K || enhancedSelectedAthlete.bestTime,
                          avgPace: enhancedCareerSummary.avgPace || enhancedSelectedAthlete.avgPace,
                          milePR: careerMilePR > 0 ? careerMilePR : undefined,
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
