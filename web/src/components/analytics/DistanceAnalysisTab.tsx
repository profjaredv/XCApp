import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Target } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import enhancedAnalyticsService, { DistanceAnalysis } from '../../api/enhancedAnalyticsService';
import { formatTime } from '../../utils/formatters';

interface DistanceAnalysisTabProps {
  teamId: string;
  season: string;
}

export function DistanceAnalysisTab({ teamId, season }: DistanceAnalysisTabProps) {
  const [distanceData, setDistanceData] = useState<DistanceAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDistanceAnalysis = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const data = await enhancedAnalyticsService.getDistanceAnalysis(teamId, season);
        setDistanceData(data);
      } catch (err) {
        console.error('Error fetching distance analysis:', err);
        // Don't set error for 404, just show the instruction message
        if (err instanceof Error && err.message.includes('404')) {
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load distance analysis');
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (teamId && season) {
      fetchDistanceAnalysis();
    }
  }, [teamId, season]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading distance analysis...</span>
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

  if (!distanceData) {
    return (
      <Alert>
        <Target className="h-4 w-4" />
        <AlertDescription>
          Distance analysis requires enhanced calculations. Go to <strong>Data Management</strong> and run "Calculate Enhanced Metrics" to unlock distance analysis features.
        </AlertDescription>
      </Alert>
    );
  }

  // Format distance labels properly
  const formatDistanceLabel = (key: string): string => {
    const labels: Record<string, string> = {
      'oneMile': '1 Mile',
      'onePointFiveMile': '1.5 Mile',
      'threeMile': '3 Mile',
      'fiveK': '5K'
    };
    return labels[key] || key;
  };

  // Prepare team distance data for charts
  const teamDistanceData = Object.entries(distanceData.team)
    .filter(([, data]) => data && data.athleteCount > 0)
    .map(([distance, data]) => ({
      distance: formatDistanceLabel(distance),
      athleteCount: data!.athleteCount,
      avgTime: data!.avgTime,
      bestTime: data!.bestTime,
      avgPace: data!.avgPace
    }));

  // Prepare athlete comparison data
  const athleteComparisonData = distanceData.athletes
    .filter(athlete => {
      // Only include athletes who have data for multiple distances
      const distances = Object.values(athlete.byDistance);
      return distances.filter(d => d.count > 0).length >= 2;
    })
    .slice(0, 10) // Limit to top 10 for readability
    .map(athlete => {
      const data: Record<string, string | number> = {
        name: athlete.athleteName.split(' ').map(n => n[0]).join(''), // Initials for chart
        fullName: athlete.athleteName
      };
      
      Object.entries(athlete.byDistance).forEach(([distance, metrics]) => {
        if (metrics.count > 0) {
          data[distance] = metrics.avgPace;
        }
      });
      
      return data;
    });

  // Distance specialization analysis
  const getDistanceSpecialists = () => {
    const specialists: { [key: string]: Array<{ name: string; pace: number; consistency: number }> } = {};
    
    distanceData.athletes.forEach(athlete => {
      Object.entries(athlete.byDistance).forEach(([distance, metrics]) => {
        if (metrics.count >= 2) { // At least 2 races in this distance
          if (!specialists[distance]) specialists[distance] = [];
          specialists[distance].push({
            name: athlete.athleteName,
            pace: metrics.avgPace,
            consistency: 'consistency' in metrics ? metrics.consistency : 0
          });
        }
      });
    });

    // Sort by pace (fastest first) and take top 5
    Object.keys(specialists).forEach(distance => {
      specialists[distance] = specialists[distance]
        .sort((a, b) => a.pace - b.pace)
        .slice(0, 5);
    });

    return specialists;
  };

  const specialists = getDistanceSpecialists();

  return (
    <div className="space-y-6">
      {/* Team Distance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {teamDistanceData.map((distance) => (
          <Card key={distance.distance}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{distance.distance}</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatTime(distance.avgTime)}</div>
              <p className="text-xs text-muted-foreground">
                Avg Pace: {formatTime(distance.avgPace)}/mi
              </p>
              <p className="text-xs text-muted-foreground">
                Best: {formatTime(distance.bestTime)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Distance Analysis Tabs */}
      <Tabs defaultValue="team" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="team">Team Performance</TabsTrigger>
          <TabsTrigger value="athletes">Athlete Comparison</TabsTrigger>
          <TabsTrigger value="specialists">Distance Specialists</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Team Performance by Distance</CardTitle>
                <CardDescription>Average times across different race distances</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={teamDistanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="distance" />
                    <YAxis tickFormatter={(value) => formatTime(value)} />
                    <Tooltip 
                      formatter={(value, name) => [
                        formatTime(value as number),
                        name === 'avgTime' ? 'Avg Time' : 'Best Time'
                      ]} 
                    />
                    <Legend />
                    <Bar dataKey="avgTime" fill="#8884d8" name="Avg Time" />
                    <Bar dataKey="bestTime" fill="#82ca9d" name="Best Time" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Participation by Distance</CardTitle>
                <CardDescription>Number of athletes competing at each distance</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={teamDistanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="distance" />
                    <YAxis />
                    <Tooltip formatter={(value) => [value, 'Athletes']} />
                    <Bar dataKey="athleteCount" fill="#ffc658" name="Athletes" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="athletes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Multi-Distance Athlete Comparison</CardTitle>
              <CardDescription>
                Pace comparison across distances for athletes who compete in multiple events
              </CardDescription>
            </CardHeader>
            <CardContent>
              {athleteComparisonData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={athleteComparisonData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="name" />
                    <PolarRadiusAxis 
                      angle={90} 
                      domain={['dataMin', 'dataMax']} 
                      tickFormatter={(value) => formatTime(value)}
                    />
                    <Radar
                      name="One Mile"
                      dataKey="oneMile"
                      stroke="#8884d8"
                      fill="#8884d8"
                      fillOpacity={0.1}
                      connectNulls={false}
                    />
                    <Radar
                      name="Three Mile"
                      dataKey="threeMile"
                      stroke="#82ca9d"
                      fill="#82ca9d"
                      fillOpacity={0.1}
                      connectNulls={false}
                    />
                    <Radar
                      name="5K"
                      dataKey="fiveK"
                      stroke="#ffc658"
                      fill="#ffc658"
                      fillOpacity={0.1}
                      connectNulls={false}
                    />
                    <Legend />
                    <Tooltip formatter={(value) => formatTime(value as number)} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No multi-distance athletes found. Athletes need to compete in at least 2 different distances.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="specialists" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Object.entries(specialists).map(([distance, athletes]) => (
              <Card key={distance}>
                <CardHeader>
                  <CardTitle>
                    {formatDistanceLabel(distance)} Specialists
                  </CardTitle>
                  <CardDescription>Top performers in this distance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {athletes.map((athlete, index) => (
                      <div key={athlete.name} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Badge variant={index === 0 ? "default" : "secondary"}>
                            #{index + 1}
                          </Badge>
                          <span className="font-medium">{athlete.name}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatTime(athlete.pace)}/mi</div>
                          <p className="text-sm text-muted-foreground">
                            Consistency: {'consistency' in athlete ? athlete.consistency?.toFixed(2) : 'N/A'}
                          </p>
                        </div>
                      </div>
                    ))}
                    {athletes.length === 0 && (
                      <div className="text-center py-4 text-muted-foreground">
                        No specialists found for this distance
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
