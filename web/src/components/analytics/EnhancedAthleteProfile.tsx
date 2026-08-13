import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsTrigger } from "../ui/tabs";
import { ResponsiveTabsList } from "../ui/responsive-tabs";
import { Badge } from "../../components/ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import enhancedAnalyticsService, { EnhancedAthleteMetrics } from '../../api/enhancedAnalyticsService';
// Simple formatTime function
const formatTime = (timeInSeconds: number): string => {
  if (!timeInSeconds || isNaN(timeInSeconds)) return '-';
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = (timeInSeconds % 60).toFixed(1);
  return `${minutes}:${seconds.padStart(4, '0')}`;
};

interface EnhancedAthleteProfileProps {
  athleteId: string;
  athleteName: string;
  season: string;
}

export function EnhancedAthleteProfile({ athleteId, athleteName, season }: EnhancedAthleteProfileProps) {
  const [athleteMetrics, setAthleteMetrics] = useState<EnhancedAthleteMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enhancedTab, setEnhancedTab] = useState('distances');

  useEffect(() => {
    const fetchAthleteMetrics = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const metrics = await enhancedAnalyticsService.getEnhancedAthleteMetrics(athleteId, season);
        setAthleteMetrics(metrics);
      } catch (err) {
        console.error('Error fetching enhanced athlete metrics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load enhanced athlete metrics');
      } finally {
        setIsLoading(false);
      }
    };

    if (athleteId && season) {
      fetchAthleteMetrics();
    }
  }, [athleteId, season]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading enhanced athlete profile...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!athleteMetrics) {
    return (
      <Alert>
        <AlertDescription>
          No enhanced metrics found for this athlete. Please run enhanced calculations first.
        </AlertDescription>
      </Alert>
    );
  }

  // Distance performance data
  const distanceData = Object.entries(athleteMetrics.byDistance)
    .filter(([, data]) => data.count > 0)
    .map(([distance, data]) => ({
      distance: distance.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
      pace: data.avgPace,
      races: data.count,
      avgTime: data.avgTime
    }));

  // Course performance data
  const courseData = athleteMetrics.coursePerformance
    .sort((a, b) => a.avgTime - b.avgTime)
    .slice(0, 8); // Top 8 courses

  // Season progression indicators
  const getProgressionIcon = (rate: number) => {
    return rate < 0 ? (
      <TrendingUp className="h-4 w-4 text-green-500" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-500" />
    );
  };

  const getGradeColor = (grade?: number) => {
    switch (grade) {
      case 9: return 'bg-blue-500';
      case 10: return 'bg-green-500';
      case 11: return 'bg-yellow-500';
      case 12: return 'bg-gray-800';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Athlete Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">{athleteName}</CardTitle>
              <CardDescription>
                {athleteMetrics.gender} • Grade {athleteMetrics.grade} • Season {season}
              </CardDescription>
            </div>
            <div className={`w-4 h-16 rounded ${getGradeColor(athleteMetrics.grade)}`} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{athleteMetrics.totalRaces}</div>
              <div className="text-sm text-muted-foreground">Total Races</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{athleteMetrics.totalMiles.toFixed(1)}</div>
              <div className="text-sm text-muted-foreground">Total Miles</div>
            </div>
            <div className="text-2xl font-bold text-center">
              <div>{formatTime(athleteMetrics.avgMilePace.overall)}/mi</div>
              <div className="text-sm text-muted-foreground">Avg Pace</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{formatTime(athleteMetrics.bestTime)}</div>
              <div className="text-sm text-muted-foreground">Best Time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Analytics Tabs */}
      <Tabs value={enhancedTab} onValueChange={setEnhancedTab} className="space-y-4">
        <ResponsiveTabsList value={enhancedTab} onValueChange={setEnhancedTab} className="grid w-full grid-cols-4">
          <TabsTrigger value="distances">Distance Analysis</TabsTrigger>
          <TabsTrigger value="progression">Season Progression</TabsTrigger>
          <TabsTrigger value="courses">Course Performance</TabsTrigger>
          <TabsTrigger value="comparisons">Race Comparisons</TabsTrigger>
        </ResponsiveTabsList>

        <TabsContent value="distances" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Distance Performance Profile</CardTitle>
                <CardDescription>Performance and consistency across distances</CardDescription>
              </CardHeader>
              <CardContent>
                {distanceData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={distanceData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="distance" />
                      <PolarRadiusAxis angle={90} domain={[0, 'dataMax']} />
                      <Radar
                        name="Pace Rank"
                        dataKey="pace"
                        stroke="#8884d8"
                        fill="#8884d8"
                        fillOpacity={0.3}
                      />
                      <Radar
                        name="Consistency"
                        dataKey="consistency"
                        stroke="#82ca9d"
                        fill="#82ca9d"
                        fillOpacity={0.3}
                      />
                      <Legend />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No distance data available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distance Breakdown</CardTitle>
                <CardDescription>Detailed performance by distance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(athleteMetrics.byDistance)
                    .filter(([, data]) => data.count > 0)
                    .map(([distance, data]) => (
                      <div key={distance} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">
                            {distance.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                          </h4>
                          <Badge variant="outline">{data.count} races</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Best:</span> {formatTime((data as {bestTime?: number}).bestTime || 0)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Avg:</span> {formatTime(data.avgTime)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Pace:</span> {formatTime(data.avgPace)}/mi
                          </div>
                          <div>
                            <span className="text-muted-foreground">Consistency:</span> ±{((data as {consistency?: number}).consistency || 0).toFixed(1)}s
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="progression" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Season Progression</CardTitle>
                <CardDescription>Performance trends throughout the season</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center space-x-2">
                    {getProgressionIcon(athleteMetrics.seasonProgression.improvementRate)}
                    <span className="font-medium">Improvement Rate</span>
                  </div>
                  <span className={athleteMetrics.seasonProgression.improvementRate < 0 ? 'text-green-600' : 'text-red-600'}>
                    {athleteMetrics.seasonProgression.improvementRate.toFixed(2)}s/race
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 border rounded">
                    <div className="text-lg font-bold">{formatTime(athleteMetrics.seasonProgression.earlySeasonAvg)}/mi</div>
                    <div className="text-sm text-muted-foreground">Early Season</div>
                  </div>
                  <div className="text-center p-3 border rounded">
                    <div className="text-lg font-bold">{formatTime(athleteMetrics.seasonProgression.lateSeasonAvg)}/mi</div>
                    <div className="text-sm text-muted-foreground">Late Season</div>
                  </div>
                </div>

                <div className="text-center p-3 border rounded">
                  <div className="text-lg font-bold">Race #{athleteMetrics.seasonProgression.peakPerformanceRace}</div>
                  <div className="text-sm text-muted-foreground">Peak Performance</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Placement Analysis</CardTitle>
                <CardDescription>Race placement trends and achievements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 border rounded">
                    <div className="text-lg font-bold">{athleteMetrics.placement.bestPlace}</div>
                    <div className="text-sm text-muted-foreground">Best Place</div>
                  </div>
                  <div className="p-3 border rounded">
                    <div className="text-lg font-bold">{athleteMetrics.placement.avgPlace.toFixed(1)}</div>
                    <div className="text-sm text-muted-foreground">Avg Place</div>
                  </div>
                  <div className="p-3 border rounded">
                    <div className="text-lg font-bold">{athleteMetrics.placement.worstPlace}</div>
                    <div className="text-sm text-muted-foreground">Worst Place</div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded">
                  <span className="font-medium">Top 10 Finishes</span>
                  <Badge variant="default">{athleteMetrics.placement.top10Finishes}</Badge>
                </div>

                <div className="flex items-center justify-between p-3 border rounded">
                  <span className="font-medium">Top 25 Finishes</span>
                  <Badge variant="secondary">{athleteMetrics.placement.top25Finishes}</Badge>
                </div>

                <div className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center space-x-2">
                    {getProgressionIcon(athleteMetrics.placement.placementTrend)}
                    <span className="font-medium">Placement Trend</span>
                  </div>
                  <span className={athleteMetrics.placement.placementTrend < 0 ? 'text-green-600' : 'text-red-600'}>
                    {athleteMetrics.placement.placementTrend > 0 ? '+' : ''}{athleteMetrics.placement.placementTrend.toFixed(1)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="courses" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Course Performance</CardTitle>
              <CardDescription>Performance analysis by race venue</CardDescription>
            </CardHeader>
            <CardContent>
              {courseData.length > 0 ? (
                <div className="space-y-3">
                  {courseData.map((course, index) => (
                    <div key={course.courseName} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center space-x-3">
                        <Badge variant={index < 3 ? "default" : "secondary"}>
                          #{index + 1}
                        </Badge>
                        <div>
                          <div className="font-medium">{course.courseName}</div>
                          <div className="text-sm text-muted-foreground">
                            {course.raceCount} race{course.raceCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatTime(course.avgTime)}</div>
                        <div className="text-sm text-muted-foreground">
                          Best: {formatTime(course.bestTime)}
                        </div>
                        {course.improvementOnCourse !== 0 && (
                          <div className={`text-xs ${course.improvementOnCourse < 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {course.improvementOnCourse < 0 ? '↓' : '↑'} {formatTime(Math.abs(course.improvementOnCourse))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No course performance data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparisons" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Season-over-Season Race Comparisons</CardTitle>
              <CardDescription>Performance at the same races across different seasons</CardDescription>
            </CardHeader>
            <CardContent>
              {athleteMetrics.raceComparisons.length > 0 ? (
                <div className="space-y-4">
                  {athleteMetrics.raceComparisons.map((comparison, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <h4 className="font-medium mb-3">{comparison.meetName}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {comparison.seasons.map((seasonData) => (
                          <div key={seasonData.season} className="p-3 border rounded">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{seasonData.season}</span>
                              <Badge variant="outline">{seasonData.athleteCount} athletes</Badge>
                            </div>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Avg Time:</span>
                                <span>{formatTime(seasonData.avgTime)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Best Time:</span>
                                <span>{formatTime(seasonData.bestTime)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Avg Place:</span>
                                <span>{seasonData.avgPlace.toFixed(1)}</span>
                              </div>
                              {seasonData.timeImprovement !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Improvement:</span>
                                  <span className={seasonData.timeImprovement < 0 ? 'text-green-600' : 'text-red-600'}>
                                    {seasonData.timeImprovement < 0 ? '-' : '+'}{formatTime(Math.abs(seasonData.timeImprovement))}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No multi-season race comparisons available for this athlete
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
