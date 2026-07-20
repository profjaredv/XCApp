import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Badge } from "../../components/ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { Loader2, Users, Timer, Target, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import enhancedAnalyticsService, { EnhancedTeamMetrics } from '../../api/enhancedAnalyticsService';
// Simple formatTime function
const formatTime = (timeInSeconds: number): string => {
  if (!timeInSeconds || isNaN(timeInSeconds)) return '-';
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = (timeInSeconds % 60).toFixed(1);
  return `${minutes}:${seconds.padStart(4, '0')}`;
};

interface EnhancedOverviewTabProps {
  teamId: string;
  season: string;
}

export function EnhancedOverviewTab({ teamId, season }: EnhancedOverviewTabProps) {
  const [teamMetrics, setTeamMetrics] = useState<EnhancedTeamMetrics | null>(null);
  // const [athleteMetrics, setAthleteMetrics] = useState<EnhancedAthleteMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEnhancedMetrics = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch team metrics
        const teamData = await enhancedAnalyticsService.getEnhancedTeamMetrics(teamId, season);
        setTeamMetrics(teamData);

        // For now, we'll get athlete metrics via the distance analysis endpoint
        // In a full implementation, you'd have a dedicated endpoint for all athletes
        await enhancedAnalyticsService.getDistanceAnalysis(teamId, season);
        // This is a simplified approach - in reality you'd want a proper athlete metrics endpoint
        
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching enhanced metrics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load enhanced metrics');
        setIsLoading(false);
      }
    };

    if (teamId && season) {
      fetchEnhancedMetrics();
    }
  }, [teamId, season]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading enhanced analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}. Enhanced metrics may not be calculated yet. Please run enhanced calculations in Data Management.
        </AlertDescription>
      </Alert>
    );
  }

  if (!teamMetrics) {
    return (
      <Alert>
        <AlertDescription>
          No enhanced metrics found for this season. Please run enhanced calculations in Data Management first.
        </AlertDescription>
      </Alert>
    );
  }

  // Prepare data for charts
  const genderData = [
    {
      name: 'Men',
      count: teamMetrics.byGender.men.count,
      avgPace: teamMetrics.byGender.men.avgPace,
      bestTime: teamMetrics.byGender.men.bestTime
    },
    {
      name: 'Women',
      count: teamMetrics.byGender.women.count,
      avgPace: teamMetrics.byGender.women.avgPace,
      bestTime: teamMetrics.byGender.women.bestTime
    }
  ];

  const gradeData = [
    { name: 'Freshmen', count: teamMetrics.byGrade.grade9?.count || 0, avgPace: teamMetrics.byGrade.grade9?.avgPace || 0 },
    { name: 'Sophomores', count: teamMetrics.byGrade.grade10?.count || 0, avgPace: teamMetrics.byGrade.grade10?.avgPace || 0 },
    { name: 'Juniors', count: teamMetrics.byGrade.grade11?.count || 0, avgPace: teamMetrics.byGrade.grade11?.avgPace || 0 },
    { name: 'Seniors', count: teamMetrics.byGrade.grade12?.count || 0, avgPace: teamMetrics.byGrade.grade12?.avgPace || 0 }
  ].filter(grade => grade.count > 0);

  const distanceData = Object.entries(teamMetrics.byDistance)
    .filter(([, data]) => data.athleteCount > 0)
    .map(([distance, data]) => ({
      distance: distance.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
      athleteCount: data.athleteCount,
      avgTime: data.avgTime,
      bestTime: data.bestTime,
      avgPace: data.avgPace
    }));

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

  return (
    <div className="space-y-6">
      {/* Enhanced Team Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Athletes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamMetrics.totalAthletes}</div>
            <p className="text-xs text-muted-foreground">
              {teamMetrics.byGender.men.count}M / {teamMetrics.byGender.women.count}W
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Depth Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamMetrics.teamDepth.depthScore.toFixed(3)}</div>
            <p className="text-xs text-muted-foreground">
              Top 5 spread: {formatTime(teamMetrics.teamDepth.top5Spread)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Pace</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTime(teamMetrics.avgMilePace.overall)}/mi</div>
            <p className="text-xs text-muted-foreground">
              {teamMetrics.totalMiles.toFixed(1)} total miles
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Races</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamMetrics.totalRaces}</div>
            <p className="text-xs text-muted-foreground">
              Across all distances
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Analytics Tabs */}
      <Tabs defaultValue="gender" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="gender">Gender Analysis</TabsTrigger>
          <TabsTrigger value="grade">Grade Breakdown</TabsTrigger>
          <TabsTrigger value="distance">Distance Performance</TabsTrigger>
          <TabsTrigger value="depth">Team Depth</TabsTrigger>
        </TabsList>

        <TabsContent value="gender" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Gender Distribution</CardTitle>
                <CardDescription>Team composition by gender</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={genderData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, count }) => `${name}: ${count}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {COLORS.map((color, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance by Gender</CardTitle>
                <CardDescription>Average pace comparison</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={genderData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(value) => formatTime(value)} />
                    <Tooltip formatter={(value) => [formatTime(value as number), 'Avg Pace']} />
                    <Bar dataKey="avgPace" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="grade" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Grade Level Analysis</CardTitle>
              <CardDescription>Performance and participation by grade</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={gradeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" orientation="left" />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatTime(value)} />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === 'count' ? value : formatTime(value as number),
                      name === 'count' ? 'Athletes' : 'Avg Pace'
                    ]} 
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" fill="#8884d8" name="Athletes" />
                  <Bar yAxisId="right" dataKey="avgPace" fill="#82ca9d" name="Avg Pace" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Distance-Specific Performance</CardTitle>
              <CardDescription>Team performance across different race distances</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={distanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="distance" />
                  <YAxis yAxisId="left" orientation="left" />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatTime(value)} />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === 'athleteCount' ? value : formatTime(value as number),
                      name === 'athleteCount' ? 'Athletes' : name === 'avgTime' ? 'Avg Time' : 'Best Time'
                    ]} 
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="athleteCount" fill="#8884d8" name="Athletes" />
                  <Bar yAxisId="right" dataKey="avgTime" fill="#82ca9d" name="Avg Time" />
                  <Bar yAxisId="right" dataKey="bestTime" fill="#ffc658" name="Best Time" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="depth" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Team Depth Metrics</CardTitle>
                <CardDescription>Competitive depth analysis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Top 5 Spread</span>
                  <Badge variant="outline">{formatTime(teamMetrics.teamDepth.top5Spread)}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Top 7 Spread</span>
                  <Badge variant="outline">{formatTime(teamMetrics.teamDepth.top7Spread)}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Depth Score</span>
                  <Badge variant={teamMetrics.teamDepth.depthScore < 0.1 ? "default" : "secondary"}>
                    {teamMetrics.teamDepth.depthScore.toFixed(3)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Lower depth score indicates tighter pack running (better team depth)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pack Running Analysis</CardTitle>
                <CardDescription>Team cohesion metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Avg Gap Between Runners</span>
                  <Badge variant="outline">{formatTime(teamMetrics.packRunning.avgGapBetweenRunners)}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Pack Tightness</span>
                  <Badge variant="outline">{teamMetrics.packRunning.packTightness.toFixed(2)}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Pack Consistency</span>
                  <Badge variant="outline">{teamMetrics.packRunning.packConsistency.toFixed(2)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Pack running metrics help evaluate team racing strategy effectiveness
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
