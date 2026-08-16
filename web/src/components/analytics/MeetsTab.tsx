import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTabsList } from '@/components/ui/responsive-tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPace, formatDateShort, formatTime } from '@/lib/formatUtils';
import { gradeLabel } from '@/lib/seasonUtils';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { meetService } from '@/api/meetService';
import { X, Split } from 'lucide-react';
import { RaceSplitsModal } from './RaceSplitsModal';
import type { Meet, RaceResult, Athlete } from '@/types/analytics';

interface MeetsTabProps {
  meets: Meet[];
  athletes: Athlete[];
  setSelectedRace: (race: { id: string; name: string; results: RaceResult[] }) => void;
}

export const MeetsTab = ({ meets, athletes, setSelectedRace }: MeetsTabProps) => {
  const [selectedMeet, setSelectedMeet] = useState<Meet | null>(null);
  const [selectedMeetWithResults, setSelectedMeetWithResults] = useState<Meet | null>(null);
  const [isLoadingMeetDetails, setIsLoadingMeetDetails] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'all' | 'M' | 'F'>('all');
  const [gradeFilter, setGradeFilter] = useState<'all' | number>('all');
  const [splitsModalOpen, setSplitsModalOpen] = useState(false);
  const [splitsModalMeet, setSplitsModalMeet] = useState<Meet | null>(null);
  const [meetStatsTab, setMeetStatsTab] = useState('overview');

  // Fetch full meet details when a meet is selected
  useEffect(() => {
    if (selectedMeet && !selectedMeet.results) {
      setIsLoadingMeetDetails(true);
      meetService.getMeet(selectedMeet.id)
        .then((meetData) => {
          setSelectedMeetWithResults({
            ...selectedMeet,
            results: meetData.results || [],
            scoring: meetData.scoring || []
          });
        })
        .catch((error) => {
          console.error('Error fetching meet details:', error);
          setSelectedMeetWithResults(selectedMeet); // Fallback to meet without results
        })
        .finally(() => {
          setIsLoadingMeetDetails(false);
        });
    } else if (selectedMeet) {
      setSelectedMeetWithResults(selectedMeet);
    } else {
      setSelectedMeetWithResults(null);
    }
  }, [selectedMeet]);

  // Create athlete lookup map
  const athleteMap = useMemo(() => {
    return new Map(athletes.map(athlete => [athlete.id, athlete]));
  }, [athletes]);

  // Helper function to get IQR color for performance
  const getIQRColor = (time: number, q1: number, median: number, q3: number) => {
    if (time <= q1) return 'text-green-600 bg-green-50'; // Top 25%
    if (time <= median) return 'text-blue-600 bg-blue-50'; // Top 50%
    if (time <= q3) return 'text-yellow-600 bg-yellow-50'; // Top 75%
    return 'text-red-600 bg-red-50'; // Bottom 25%
  };

  // Helper function to get IQR label
  const getIQRLabel = (time: number, q1: number, median: number, q3: number) => {
    if (time <= q1) return 'Top 25%';
    if (time <= median) return 'Top 50%';
    if (time <= q3) return 'Top 75%';
    return 'Bottom 25%';
  };

  // Filter results based on gender and grade
  const filterResults = (results: Array<{athleteGender: string; athleteGrade: number; time: number; place: number; division?: string | null; overallPlace?: number | null; overallFieldSize?: number | null; teamPlace?: number | null; athleteName: string; [key: string]: unknown}>) => {
    return results.filter(result => {
      const genderMatch = genderFilter === 'all' || result.athleteGender === genderFilter;
      const gradeMatch = gradeFilter === 'all' || result.athleteGrade === gradeFilter;
      return genderMatch && gradeMatch;
    });
  };

  // Calculate filtered statistics for display
  const calculateFilteredStats = (enrichedResults: Array<{time: number; athleteGender: string; athleteGrade: number; place: number; athleteName: string; [key: string]: unknown}>) => {
    const filteredResults = filterResults(enrichedResults);
    if (filteredResults.length === 0) return null;
    
    const times = filteredResults.map(r => r.time).sort((a, b) => a - b);
    
    // IQR calculations
    const q1Index = Math.floor(times.length * 0.25);
    const q3Index = Math.floor(times.length * 0.75);
    const q1 = times[q1Index];
    const q3 = times[q3Index];
    const iqr = q3 - q1;
    const median = times[Math.floor(times.length / 2)];
    
    return {
      totalRunners: filteredResults.length,
      filteredResults,
      q1, q3, iqr, median,
      fastest: times[0],
      slowest: times[times.length - 1],
      average: times.reduce((sum, t) => sum + t, 0) / times.length
    };
  };

  // Calculate cohort statistics for a meet
  const calculateMeetStats = (meet: Meet) => {
    if (!meet.results || meet.results.length === 0) return null;

    // Enrich results with athlete data
    const enrichedResults = meet.results.map(result => {
      const athlete = athleteMap.get(result.athleteId);
      return {
        ...result,
        athleteName: athlete?.name || 'Unknown',
        athleteGrade: athlete?.currentGrade || 0,
        athleteGender: athlete?.gender || 'U'
      };
    }).sort((a, b) => a.time - b.time);

    const times = enrichedResults.map(r => r.time);
    
    // Basic stats
    const totalRunners = enrichedResults.length;
    
    // Gender-separated analysis
    const boysResults = enrichedResults.filter(r => r.athleteGender === 'M');
    const girlsResults = enrichedResults.filter(r => r.athleteGender === 'F');
    
    // Top performers by gender
    const boysTop7 = boysResults.slice(0, 7);
    const boysTop15 = boysResults.slice(0, 15);
    const girlsTop7 = girlsResults.slice(0, 7);
    const girlsTop15 = girlsResults.slice(0, 15);
    
    // Overall top performers
    const overallTop7 = enrichedResults.slice(0, 7);
    const overallTop15 = enrichedResults.slice(0, 15);
    
    // Team scoring calculations
    const boysTop7TotalTime = boysTop7.reduce((sum, r) => sum + r.time, 0);
    const girlsTop7TotalTime = girlsTop7.reduce((sum, r) => sum + r.time, 0);
    const boysFirstToSeventhGap = boysTop7.length >= 7 ? boysTop7[6].time - boysTop7[0].time : 0;
    const girlsFirstToSeventhGap = girlsTop7.length >= 7 ? girlsTop7[6].time - girlsTop7[0].time : 0;
    
    // Grade cohort analysis
    const gradeGroups = enrichedResults.reduce((acc, result) => {
      const grade = result.athleteGrade;
      if (!acc[grade]) acc[grade] = [];
      acc[grade].push(result);
      return acc;
    }, {} as Record<number, typeof enrichedResults>);
    
    const gradeCohorts = Object.entries(gradeGroups).map(([grade, results]) => {
      const gradeTimes = results.map(r => r.time);
      return {
        grade: parseInt(grade),
        count: results.length,
        average: gradeTimes.reduce((sum, t) => sum + t, 0) / gradeTimes.length,
        fastest: Math.min(...gradeTimes),
        slowest: Math.max(...gradeTimes),
        median: gradeTimes.sort((a, b) => a - b)[Math.floor(gradeTimes.length / 2)]
      };
    }).sort((a, b) => a.grade - b.grade);
    
    // IQR calculations
    const q1Index = Math.floor(times.length * 0.25);
    const q3Index = Math.floor(times.length * 0.75);
    const q1 = times[q1Index];
    const q3 = times[q3Index];
    const iqr = q3 - q1;
    const median = times[Math.floor(times.length / 2)];
    
    return {
      totalRunners,
      enrichedResults,
      // Overall stats
      overallTop7,
      overallTop15,
      // Gender-separated stats
      boysResults,
      girlsResults,
      boysTop7,
      boysTop15,
      girlsTop7,
      girlsTop15,
      boysTop7TotalTime,
      girlsTop7TotalTime,
      boysFirstToSeventhGap,
      girlsFirstToSeventhGap,
      // Grade cohorts
      gradeCohorts,
      // Statistical measures
      q1, q3, iqr, median,
      fastest: times[0],
      slowest: times[times.length - 1],
      average: times.reduce((sum, t) => sum + t, 0) / times.length
    };
  };

  // Prepare swarmplot data
  const swarmplotData = useMemo(() => {
    if (!selectedMeetWithResults?.results) return [];
    
    const enrichedResults = selectedMeetWithResults.results.map(result => {
      const athlete = athleteMap.get(result.athleteId);
      return {
        ...result,
        athleteName: athlete?.name || 'Unknown',
        athleteGrade: athlete?.currentGrade || 0,
        athleteGender: athlete?.gender || 'U'
      };
    }).sort((a, b) => a.time - b.time);
    
    return enrichedResults.map((result, index) => ({
      x: index + 1, // Place
      y: result.time,
      time: result.time,
      division: result.division,
      place: result.place,
      overallPlace: result.overallPlace,
      overallFieldSize: result.overallFieldSize,
      teamPlace: result.teamPlace,
      athleteId: result.athleteId,
      athleteName: result.athleteName,
      athleteGrade: result.athleteGrade,
      athleteGender: result.athleteGender,
      isPR: result.pr,
      isSeasonBest: result.seasonBest
    }));
  }, [selectedMeetWithResults, athleteMap]);

  // Race place needs the race's own field size as a denominator ("5th of
  // 42") — overall place (when present) carries its own denominator per
  // result, since it's a different, larger combined field.
  const raceFieldSize = selectedMeetWithResults?.fieldFinisherCount ?? null;

  const meetStats = selectedMeetWithResults ? calculateMeetStats(selectedMeetWithResults) : null;
  const filteredStats = useMemo(() => {
    if (!swarmplotData.length) return null;
    return calculateFilteredStats(swarmplotData);
  }, [swarmplotData, genderFilter, gradeFilter]);

  return (
    <div className="space-y-6">
      {/* Meet Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {meets.map((meet: Meet) => (
          <Card key={meet.id} className={selectedMeet?.id === meet.id ? 'ring-2 ring-blue-500' : ''}>
            <CardHeader>
              <CardTitle className="text-lg">{meet.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{formatDateShort(meet.date)}</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Avg. Pace</p>
                  <p className="font-semibold">{formatPace(meet.avgPace)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Runners</p>
                  <p className="font-semibold">{meet.runners}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedMeet(meet)}
                >
                  Analyze Meet
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    // Fetch meet details if not already loaded
                    if (!meet.results || meet.results.length === 0) {
                      try {
                        const meetData = await meetService.getMeet(meet.id);
                        setSplitsModalMeet({ ...meet, results: meetData.results || [] });
                        setSplitsModalOpen(true);
                      } catch (error) {
                        console.error('Error fetching meet for splits:', error);
                      }
                    } else {
                      setSplitsModalMeet(meet);
                      setSplitsModalOpen(true);
                    }
                  }}
                >
                  <Split className="h-4 w-4 mr-1" />
                  Add Splits
                </Button>
                <Button 
                  variant="link" 
                  size="sm"
                  onClick={async () => {
                    // Fetch meet details if not already loaded
                    if (!meet.results || meet.results.length === 0) {
                      try {
                        const meetData = await meetService.getMeet(meet.id);
                        setSelectedRace({ id: meet.id, name: meet.name, results: meetData.results || [] });
                      } catch (error) {
                        console.error('Error fetching meet for chart:', error);
                        setSelectedRace({ id: meet.id, name: meet.name, results: [] });
                      }
                    } else {
                      setSelectedRace({ id: meet.id, name: meet.name, results: meet.results });
                    }
                  }}
                >
                  View Chart
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Enhanced Meet Analysis Modal */}
      {selectedMeet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto" onClick={() => setSelectedMeet(null)}>
          <div className="min-h-screen px-4 py-8">
            <Card className="max-w-7xl mx-auto" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{selectedMeet.name} - Detailed Analysis</CardTitle>
                    <p className="text-sm text-muted-foreground">{formatDateShort(selectedMeet.date)}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedMeet(null)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                
                {isLoadingMeetDetails && (
                  <p className="text-sm text-muted-foreground mt-2">Loading meet details...</p>
                )}
            
            {/* Filtering Controls */}
            <div className="flex flex-wrap gap-4 mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Gender:</label>
                <Select value={genderFilter} onValueChange={(value: 'all' | 'M' | 'F') => setGenderFilter(value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="M">Boys</SelectItem>
                    <SelectItem value="F">Girls</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Grade:</label>
                <Select value={gradeFilter.toString()} onValueChange={(value) => setGradeFilter(value === 'all' ? 'all' : parseInt(value))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="9">{gradeLabel(9)}</SelectItem>
                    <SelectItem value="10">{gradeLabel(10)}</SelectItem>
                    <SelectItem value="11">{gradeLabel(11)}</SelectItem>
                    <SelectItem value="12">{gradeLabel(12)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="text-sm text-muted-foreground flex items-center">
                Showing: {genderFilter === 'all' ? 'All' : genderFilter === 'M' ? 'Boys' : 'Girls'} • {gradeFilter === 'all' ? 'All Grades' : gradeLabel(Number(gradeFilter))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!meetStats && !isLoadingMeetDetails && (
              <div className="text-center py-8 text-muted-foreground">
                No results available for this meet
              </div>
            )}
            
            {meetStats && (
              <Tabs value={meetStatsTab} onValueChange={setMeetStatsTab} className="w-full">
                <ResponsiveTabsList
                  value={meetStatsTab}
                  onValueChange={setMeetStatsTab}
                  className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
                >
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="cohort">Cohort Analysis</TabsTrigger>
                  <TabsTrigger value="team-scoring">Team Scoring</TabsTrigger>
                  <TabsTrigger value="grade-cohorts">Grade Analysis</TabsTrigger>
                  <TabsTrigger value="swarmplot">Performance Plot</TabsTrigger>
                </ResponsiveTabsList>

                <TabsContent value="overview" className="mt-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground uppercase">Total Runners</p>
                      <p className="text-2xl font-bold">{meetStats.totalRunners}</p>
                    </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground uppercase">Fastest Time</p>
                    <p className="text-2xl font-bold">{formatTime(meetStats.fastest)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground uppercase">Average Time</p>
                    <p className="text-2xl font-bold">{formatTime(meetStats.average)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground uppercase">Median Time</p>
                    <p className="text-2xl font-bold">{formatTime(meetStats.median)}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="cohort" className="mt-6">
                <div className="space-y-6">
                  {/* Statistical Explanations */}
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
                    <h3 className="font-semibold mb-2">Understanding the Statistics</h3>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p><strong>Q1 (25th percentile):</strong> 25% of runners finished faster than this time</p>
                      <p><strong>Median (50th percentile):</strong> Half the field finished faster, half slower</p>
                      <p><strong>Q3 (75th percentile):</strong> 75% of runners finished faster than this time</p>
                      <p><strong>IQR (Interquartile Range):</strong> The middle 50% of times fall within this range</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950">
                      <h3 className="font-semibold text-blue-900 dark:text-blue-100">Quartile Analysis</h3>
                      <div className="mt-2 space-y-1">
                        <p className="text-sm">Q1 (25th): {formatTime(meetStats.q1)}</p>
                        <p className="text-sm">Median (50th): {formatTime(meetStats.median)}</p>
                        <p className="text-sm">Q3 (75th): {formatTime(meetStats.q3)}</p>
                        <p className="text-sm font-medium">IQR: {formatTime(meetStats.iqr)}</p>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950">
                      <h3 className="font-semibold text-green-900 dark:text-green-100">Performance Spread</h3>
                      <div className="mt-2 space-y-1">
                        <p className="text-sm">Total Range: {formatTime(meetStats.slowest - meetStats.fastest)}</p>
                        <p className="text-sm">Std Dev Region: {formatTime(meetStats.iqr / 1.35)}</p>
                        <p className="text-sm">Field Depth: {meetStats.totalRunners} runners</p>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950">
                      <h3 className="font-semibold text-purple-900 dark:text-purple-100">Gender Breakdown</h3>
                      <div className="mt-2 space-y-1">
                        <p className="text-sm">Boys: {meetStats.boysResults.length} runners</p>
                        <p className="text-sm">Girls: {meetStats.girlsResults.length} runners</p>
                        <p className="text-sm">Boys Fastest: {meetStats.boysResults.length > 0 ? formatTime(meetStats.boysResults[0].time) : 'N/A'}</p>
                        <p className="text-sm">Girls Fastest: {meetStats.girlsResults.length > 0 ? formatTime(meetStats.girlsResults[0].time) : 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Top Finishers by Gender */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Boys Top Finishers */}
                    {meetStats.boysResults.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-blue-600">Boys Top Finishers</h3>
                        
                        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950">
                          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-3">Top 7 Boys</h4>
                          <div className="space-y-2">
                            {meetStats.boysTop7.map((result, index) => (
                              <div key={result.athleteId} className="flex justify-between items-center text-sm">
                                <span>{index + 1}. {result.athleteName} ({gradeLabel(result.athleteGrade)})</span>
                                <span className="font-mono">{formatTime(result.time)}</span>
                              </div>
                            ))}
                          </div>
                          {meetStats.boysTop7.length > 0 && (
                            <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                              <p>Average: {formatTime(meetStats.boysTop7TotalTime / meetStats.boysTop7.length)}</p>
                              <p>1st-7th Gap: {formatTime(meetStats.boysFirstToSeventhGap)}</p>
                            </div>
                          )}
                        </div>

                        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950">
                          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-3">Top 15 Boys</h4>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {meetStats.boysTop15.map((result, index) => (
                              <div key={result.athleteId} className="flex justify-between items-center text-sm">
                                <span>{index + 1}. {result.athleteName} ({gradeLabel(result.athleteGrade)})</span>
                                <span className="font-mono">{formatTime(result.time)}</span>
                              </div>
                            ))}
                          </div>
                          {meetStats.boysTop15.length > 0 && (
                            <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                              <p>Average: {formatTime(meetStats.boysTop15.reduce((sum, r) => sum + r.time, 0) / meetStats.boysTop15.length)}</p>
                              <p>Range: {formatTime(meetStats.boysTop15[meetStats.boysTop15.length - 1].time - meetStats.boysTop15[0].time)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Girls Top Finishers */}
                    {meetStats.girlsResults.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-pink-600">Girls Top Finishers</h3>
                        
                        <div className="p-4 rounded-lg bg-pink-50 dark:bg-pink-950">
                          <h4 className="font-medium text-pink-900 dark:text-pink-100 mb-3">Top 7 Girls</h4>
                          <div className="space-y-2">
                            {meetStats.girlsTop7.map((result, index) => (
                              <div key={result.athleteId} className="flex justify-between items-center text-sm">
                                <span>{index + 1}. {result.athleteName} ({gradeLabel(result.athleteGrade)})</span>
                                <span className="font-mono">{formatTime(result.time)}</span>
                              </div>
                            ))}
                          </div>
                          {meetStats.girlsTop7.length > 0 && (
                            <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                              <p>Average: {formatTime(meetStats.girlsTop7TotalTime / meetStats.girlsTop7.length)}</p>
                              <p>1st-7th Gap: {formatTime(meetStats.girlsFirstToSeventhGap)}</p>
                            </div>
                          )}
                        </div>

                        <div className="p-4 rounded-lg bg-pink-50 dark:bg-pink-950">
                          <h4 className="font-medium text-pink-900 dark:text-pink-100 mb-3">Top 15 Girls</h4>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {meetStats.girlsTop15.map((result, index) => (
                              <div key={result.athleteId} className="flex justify-between items-center text-sm">
                                <span>{index + 1}. {result.athleteName} ({gradeLabel(result.athleteGrade)})</span>
                                <span className="font-mono">{formatTime(result.time)}</span>
                              </div>
                            ))}
                          </div>
                          {meetStats.girlsTop15.length > 0 && (
                            <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                              <p>Average: {formatTime(meetStats.girlsTop15.reduce((sum, r) => sum + r.time, 0) / meetStats.girlsTop15.length)}</p>
                              <p>Range: {formatTime(meetStats.girlsTop15[meetStats.girlsTop15.length - 1].time - meetStats.girlsTop15[0].time)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="team-scoring" className="mt-6">
                <div className="space-y-8">
                  {/* Official scoring — computed from the uploaded field results
                      (every school in the division, not just our own team). See
                      backend lib/meetScoring.js. Empty until a Field Results
                      upload exists for this race. */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Meet Scoring</h3>
                    {(!selectedMeetWithResults?.scoring || selectedMeetWithResults.scoring.length === 0) ? (
                      <div className="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                        No official scoring yet — upload this meet's field results to see team points, standings, and where our runners placed against the full field.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedMeetWithResults.scoring.map((division) => (
                          <div key={`${division.division}-${division.gender ?? 'unknown'}`} className="p-4 rounded-lg border border-border">
                            <h4 className="font-semibold mb-3">
                              {division.gender === 'M' ? 'Boys' : division.gender === 'F' ? 'Girls' : division.gender ?? 'Unknown Gender'} • {division.division}
                            </h4>

                            {division.scoringTeams.length > 0 ? (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-muted-foreground">
                                      <th className="py-1 pr-4">Rank</th>
                                      <th className="py-1 pr-4">School</th>
                                      <th className="py-1 pr-4">Score</th>
                                      <th className="py-1">Scorers (place)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {division.scoringTeams.map((team) => (
                                      <tr key={team.schoolName} className={team.isOurTeam ? 'bg-primary/10 font-medium' : ''}>
                                        <td className="py-1 pr-4">{team.rank}</td>
                                        <td className="py-1 pr-4">{team.schoolName}</td>
                                        <td className="py-1 pr-4">{team.score}</td>
                                        <td className="py-1">
                                          {team.scorers.map((s) => s.place).join(', ')}
                                          {team.displacers.length > 0 && (
                                            <span className="text-muted-foreground"> (+{team.displacers.map((d) => d.place).join(', ')})</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No team scored this division — every school had fewer than 5 finishers.</p>
                            )}

                            {division.incompleteTeams.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Didn't score (need 5 finishers): {division.incompleteTeams.map((t) => `${t.schoolName} (${t.finisherCount})`).join(', ')}
                              </p>
                            )}

                            {division.individualTop.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Leaders: {division.individualTop.map((r) => `${r.place}. ${r.athleteName} (${r.schoolName ?? 'Unattached'})`).join('  ·  ')}
                              </p>
                            )}

                            {division.ourTeamFinishers.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-border">
                                <p className="text-xs font-medium mb-1">Our finishers in this division ({division.ourTeamFinisherCount} total)</p>
                                <p className="text-sm">
                                  {division.ourTeamFinishers.map((r) => `${r.place}. ${r.athleteName}`).join('  ·  ')}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Team-internal pack metrics — our own roster only, no field
                      data needed. Kept separate from official scoring above so
                      the two are never confused for each other. */}
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-3">Team Depth (Our Roster Only)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-6 rounded-lg bg-orange-50 dark:bg-orange-950">
                        <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-4">Top 7 Analysis</h4>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-muted-foreground">Total Time (Top 7)</p>
                            <p className="text-xl font-bold">{formatTime(meetStats.overallTop7.reduce((sum, r) => sum + r.time, 0))}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">1st to 7th Gap</p>
                            <p className="text-xl font-bold">{formatTime(meetStats.overallTop7.length >= 7 ? meetStats.overallTop7[6].time - meetStats.overallTop7[0].time : 0)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Average (Top 7)</p>
                            <p className="text-xl font-bold">{formatTime(meetStats.overallTop7.reduce((sum, r) => sum + r.time, 0) / meetStats.overallTop7.length)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-6 rounded-lg bg-teal-50 dark:bg-teal-950">
                        <h4 className="font-semibold text-teal-900 dark:text-teal-100 mb-4">Team Scoring Metrics</h4>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm text-muted-foreground">Pack Running Quality</p>
                            <p className="text-xl font-bold">
                              {(() => {
                                const gap = meetStats.overallTop7.length >= 7 ? meetStats.overallTop7[6].time - meetStats.overallTop7[0].time : 0;
                                return gap < 60 ? 'Excellent' : gap < 120 ? 'Good' : gap < 180 ? 'Fair' : 'Needs Work';
                              })()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Depth Score</p>
                            <p className="text-xl font-bold">
                              {(() => {
                                const totalTime = meetStats.overallTop7.reduce((sum, r) => sum + r.time, 0);
                                return ((meetStats.totalRunners / totalTime) * 1000).toFixed(0);
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="grade-cohorts" className="mt-6">
                <div className="space-y-6">
                  {/* Grade Cohort Explanation */}
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
                    <h3 className="font-semibold mb-2">Grade Cohort Analysis</h3>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p><strong>Purpose:</strong> Compare performance across different grade levels to identify development patterns</p>
                      <p><strong>Average:</strong> Mean time for all runners in that grade</p>
                      <p><strong>Median:</strong> Middle time when all grade times are sorted (less affected by outliers)</p>
                      <p><strong>Range:</strong> Difference between fastest and slowest in the grade</p>
                    </div>
                  </div>

                  {/* Grade Cohorts Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {meetStats.gradeCohorts.map((cohort) => (
                      <div key={cohort.grade} className="p-4 rounded-lg bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950">
                        <h4 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-3">
                          {gradeLabel(cohort.grade)}
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Runners:</span>
                            <span className="font-medium">{cohort.count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Average:</span>
                            <span className="font-mono">{formatTime(cohort.average)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Median:</span>
                            <span className="font-mono">{formatTime(cohort.median)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Fastest:</span>
                            <span className="font-mono text-green-600">{formatTime(cohort.fastest)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Range:</span>
                            <span className="font-mono">{formatTime(cohort.slowest - cohort.fastest)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Grade Comparison Insights */}
                  {meetStats.gradeCohorts.length > 1 && (
                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950">
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">Grade Comparison Insights</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-medium mb-2">Fastest by Grade:</p>
                          {meetStats.gradeCohorts
                            .sort((a, b) => a.fastest - b.fastest)
                            .slice(0, 3)
                            .map((cohort, index) => (
                              <p key={cohort.grade} className="text-muted-foreground">
                                {index + 1}. {gradeLabel(cohort.grade)}: {formatTime(cohort.fastest)}
                              </p>
                            ))}
                        </div>
                        <div>
                          <p className="font-medium mb-2">Most Consistent (Smallest Range):</p>
                          {meetStats.gradeCohorts
                            .sort((a, b) => (a.slowest - a.fastest) - (b.slowest - b.fastest))
                            .slice(0, 3)
                            .map((cohort, index) => (
                              <p key={cohort.grade} className="text-muted-foreground">
                                {index + 1}. {gradeLabel(cohort.grade)}: {formatTime(cohort.slowest - cohort.fastest)} range
                              </p>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="swarmplot" className="mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Performance Plot */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart data={filterResults(swarmplotData)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="x" 
                            type="number" 
                            domain={[0, 'dataMax + 5']}
                            label={{ value: 'Finish Place', position: 'insideBottom', offset: -10 }}
                          />
                          <YAxis 
                            dataKey="y"
                            type="number"
                            tickFormatter={(value) => formatTime(value)}
                            label={{ value: 'Time', angle: -90, position: 'insideLeft' }}
                          />
                          <Tooltip 
                            formatter={(value: number) => [formatTime(value), 'Time']}
                            labelFormatter={(label) => `Place: ${label}`}
                            content={({ active, payload }) => {
                              if (active && payload && payload[0]) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white dark:bg-gray-800 p-3 border rounded shadow-lg">
                                    <p className="font-semibold">{data.athleteName}</p>
                                    <p className="text-sm text-muted-foreground">{gradeLabel(data.athleteGrade)} • {data.athleteGender === 'M' ? 'Boys' : 'Girls'}</p>
                                    {data.division && <p className="text-xs text-muted-foreground">{data.division}</p>}
                                    <div className="mt-2 space-y-1">
                                      <p>Team Place: {data.teamPlace != null ? `#${data.teamPlace}` : '—'}</p>
                                      <p>
                                        Race Place: {data.place != null ? `${data.place}${raceFieldSize ? ` of ${raceFieldSize}` : ''}` : '—'}
                                      </p>
                                      {data.overallPlace != null && (
                                        <p>Overall Place: {data.overallPlace}{data.overallFieldSize ? ` of ${data.overallFieldSize}` : ''}</p>
                                      )}
                                      <p>Time: {formatTime(data.time)}</p>
                                      <p className="text-xs font-medium">{filteredStats ? getIQRLabel(data.time, filteredStats.q1, filteredStats.median, filteredStats.q3) : ''}</p>
                                    </div>
                                    {data.isPR && <p className="text-green-600 font-medium mt-2">🏆 PR!</p>}
                                    {data.isSeasonBest && <p className="text-blue-600 font-medium mt-1">⭐ Season Best!</p>}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Scatter 
                            dataKey="y" 
                            fill="#2563eb" 
                            r={8}
                            fillOpacity={0.8}
                          />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-sm text-muted-foreground text-center">
                      Performance plot with IQR-based filtering. Larger dots for better visibility.
                    </p>
                  </div>

                  {/* Color-Coded Athlete List */}
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
                      <h4 className="font-semibold mb-3">Performance Breakdown</h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div>
                          <span className="text-green-700 font-medium">Top 25% (Q1)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></div>
                          <span className="text-blue-700 font-medium">Top 50% (Median)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></div>
                          <span className="text-yellow-700 font-medium">Top 75% (Q3)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded bg-red-100 border border-red-300"></div>
                          <span className="text-red-700 font-medium">Bottom 25%</span>
                        </div>
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto space-y-1">
                      {filterResults(swarmplotData)
                        .sort((a, b) => a.time - b.time)
                        .map((athlete, index) => (
                          <div 
                            key={`${athlete.athleteId}-${index}`}
                            className={`p-3 rounded-lg border text-sm ${filteredStats ? getIQRColor(athlete.time, filteredStats.q1, filteredStats.median, filteredStats.q3) : 'bg-gray-50'}`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">{athlete.athleteName}</p>
                                <p className="text-xs opacity-75">
                                  {gradeLabel(athlete.athleteGrade)} • {athlete.athleteGender === 'M' ? 'Boys' : 'Girls'}
                                </p>
                                {athlete.division && <p className="text-xs opacity-60">{athlete.division}</p>}
                              </div>
                              <div className="text-right">
                                <p className="font-mono font-medium">{formatTime(athlete.time)}</p>
                                <p className="text-xs opacity-75">
                                  Team #{athlete.teamPlace ?? '—'}
                                </p>
                                <p className="text-xs opacity-75">
                                  {athlete.place != null ? `#${athlete.place}${raceFieldSize ? ` of ${raceFieldSize}` : ''}` : 'No field data'}
                                </p>
                                {athlete.overallPlace != null && (
                                  <p className="text-xs opacity-75">
                                    Overall #{athlete.overallPlace}{athlete.overallFieldSize ? ` of ${athlete.overallFieldSize}` : ''}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex justify-between items-center mt-2">
                              <span className="text-xs font-medium px-2 py-1 rounded bg-white/50">
                                {filteredStats ? getIQRLabel(athlete.time, filteredStats.q1, filteredStats.median, filteredStats.q3) : 'N/A'}
                              </span>
                              <div className="flex gap-1">
                                {athlete.isPR && <span className="text-xs">🏆</span>}
                                {athlete.isSeasonBest && <span className="text-xs">⭐</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            )}
          </CardContent>
        </Card>
          </div>
        </div>
      )}

      {/* Splits Modal */}
      {splitsModalOpen && splitsModalMeet && splitsModalMeet.results && (
        <RaceSplitsModal
          raceId={splitsModalMeet.id}
          raceName={splitsModalMeet.name}
          raceDistance={splitsModalMeet.distance || 5000}
          results={splitsModalMeet.results}
          onClose={() => {
            setSplitsModalOpen(false);
            setSplitsModalMeet(null);
          }}
          onSave={() => {
            // Optionally refresh meet data here
            console.log('Splits saved successfully');
          }}
        />
      )}
    </div>
  );
};
