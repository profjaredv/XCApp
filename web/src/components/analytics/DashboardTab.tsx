import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Timer, Zap, Target, TrendingUp, ArrowUpRight } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatTime, formatPace, formatDateShort } from '@/lib/formatUtils';
import { EnhancedTeamMetrics } from '@/api/enhancedAnalyticsService';
import { TeamSeasonSeriesPoint } from '@/types/performance';
import { MostImprovedAthlete } from '@/types/analytics';

interface DashboardTabProps {
  // Basic Stats
  displayedStats: {
    totalMeets: number;
    totalRaces: number;
    totalAthletes: number;
    totalMilesRun: number;
    avgMilePace: number;
  };
  
  // Time Series Data
  seasonSeriesData?: {
    series: TeamSeasonSeriesPoint[];
  };
  
  // Enhanced Data (Optional/Nullable)
  enhancedMetrics: EnhancedTeamMetrics | null;
  
  // Improvement Data
  mostImproved: MostImprovedAthlete[];
  
  // Loading States
  isLoadingEnhanced: boolean;
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

export function DashboardTab({
  displayedStats,
  seasonSeriesData,
  enhancedMetrics,
  mostImproved,
  isLoadingEnhanced
}: DashboardTabProps) {

  // Prepare Gender Data for Pie Chart
  const genderData = enhancedMetrics ? [
    { name: 'Men', count: enhancedMetrics.byGender.men.count },
    { name: 'Women', count: enhancedMetrics.byGender.women.count }
  ] : [];

  // Prepare Grade Data for Bar Chart
  const gradeData = enhancedMetrics ? [
    { name: 'Fr', count: enhancedMetrics.byGrade.grade9?.count || 0, avgPace: enhancedMetrics.byGrade.grade9?.avgPace || 0 },
    { name: 'So', count: enhancedMetrics.byGrade.grade10?.count || 0, avgPace: enhancedMetrics.byGrade.grade10?.avgPace || 0 },
    { name: 'Jr', count: enhancedMetrics.byGrade.grade11?.count || 0, avgPace: enhancedMetrics.byGrade.grade11?.avgPace || 0 },
    { name: 'Sr', count: enhancedMetrics.byGrade.grade12?.count || 0, avgPace: enhancedMetrics.byGrade.grade12?.avgPace || 0 }
  ].filter(g => g.count > 0) : [];

  return (
    <div className="space-y-6">
      {/* Top Row: Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Athletes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayedStats.totalAthletes}</div>
            {enhancedMetrics ? (
              <p className="text-xs text-muted-foreground">
                {enhancedMetrics.byGender.men.count} Men / {enhancedMetrics.byGender.women.count} Women
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Active roster size</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Pace (Mile)</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPace(displayedStats.avgMilePace)}</div>
            <p className="text-xs text-muted-foreground">
              {displayedStats.totalMilesRun.toFixed(0)} total miles raced
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Races & Meets</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayedStats.totalRaces}</div>
            <p className="text-xs text-muted-foreground">
              Across {displayedStats.totalMeets} meets
            </p>
          </CardContent>
        </Card>

        {/* Conditional Card: Show Depth Score if Enhanced is available, else show Most Improved Count */}
        {enhancedMetrics ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Depth Score</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{enhancedMetrics.teamDepth.depthScore.toFixed(3)}</div>
              <p className="text-xs text-muted-foreground">
                Top 5 Spread: {formatTime(enhancedMetrics.teamDepth.top5Spread)}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Improvement</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mostImproved.length}</div>
              <p className="text-xs text-muted-foreground">
                Athletes with PRs
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Middle Row: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
        {/* Main Chart: Season Pace Trend (Takes up 4/7 columns) */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Season Pace Trend</CardTitle>
            <CardDescription>Average mile pace over the season</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={seasonSeriesData?.series?.map((pt: TeamSeasonSeriesPoint) => ({
                name: pt.meetName || 'Unknown Meet',
                date: formatDateShort(pt.meetDate),
                overall: pt.overall?.avgMilePace?.overall || 0,
                boys: pt.byGender?.M?.avgMilePace?.overall || 0,
                girls: pt.byGender?.F?.avgMilePace?.overall || 0,
              })) || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  tickFormatter={(value) => value.length > 15 ? `${value.substring(0, 12)}...` : value}
                  interval={0}
                  fontSize={12}
                />
                <YAxis 
                  domain={['dataMin - 15', 'dataMax + 15']} 
                  tickFormatter={(val) => formatPace(val)}
                  fontSize={12}
                />
                <Tooltip 
                  formatter={(value: number) => formatPace(value)} 
                  labelStyle={{ color: '#000' }}
                />
                <Legend />
                <Line type="monotone" dataKey="overall" stroke="#8884d8" strokeWidth={2} dot={{ r: 4 }} name="Overall" />
                <Line type="monotone" dataKey="boys" stroke="#82ca9d" strokeWidth={2} dot={{ r: 4 }} name="Boys" />
                <Line type="monotone" dataKey="girls" stroke="#ffc658" strokeWidth={2} dot={{ r: 4 }} name="Girls" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Secondary Charts: Demographics (Takes up 3/7 columns) */}
        <div className="lg:col-span-3 space-y-6">
          {/* If enhanced metrics available, show Grade Breakdown, otherwise show Top Improved */}
          {enhancedMetrics ? (
             <Card className="h-full">
              <CardHeader>
                <CardTitle>Grade Breakdown</CardTitle>
                <CardDescription>Athletes per grade level</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={gradeData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={30} />
                    <Tooltip cursor={{fill: 'transparent'}} />
                    <Bar dataKey="count" fill="#8884d8" radius={[0, 4, 4, 0]} barSize={30}>
                        <div className="custom-label">
                            {/* Custom label rendering logic could go here if needed */}
                        </div>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Top Improvements</CardTitle>
                <CardDescription>Biggest gains this season</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mostImproved.slice(0, 5).map((athlete, idx) => (
                    <div key={athlete.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="w-6 h-6 flex items-center justify-center p-0 rounded-full">
                            {idx + 1}
                        </Badge>
                        <span className="font-medium text-sm">{athlete.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-green-600">
                        <ArrowUpRight className="h-3 w-3" />
                        <span className="font-bold text-sm">
                            {typeof athlete.improvementPercent === 'number' ? `${athlete.improvementPercent.toFixed(1)}%` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Bottom Section: Advanced Metrics (Only if Enhanced Available) */}
      {enhancedMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>Pack Running</CardTitle>
                    <CardDescription>How tight your team runs together</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Avg Gap Between Runners</span>
                        <span className="font-mono font-medium">{formatTime(enhancedMetrics.packRunning.avgGapBetweenRunners)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Pack Tightness Score</span>
                        <span className="font-mono font-medium">{enhancedMetrics.packRunning.packTightness.toFixed(2)}</span>
                    </div>
                     <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                        <div 
                            className="h-full bg-blue-500 transition-all duration-500" 
                            style={{ width: `${Math.min(100, (1 / enhancedMetrics.packRunning.packTightness) * 100)}%` }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                        Lower tightness score is better. Bar indicates efficiency.
                    </p>
                </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gender Distribution</CardTitle>
                 <CardDescription>Team composition</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center h-[180px]">
                 <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={genderData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="count"
                    >
                      {genderData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="middle" align="right" layout="vertical" />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
        </div>
      )}
      
      {!enhancedMetrics && !isLoadingEnhanced && (
          <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm flex items-center justify-between">
              <span>Want deeper insights like Pack Spread and Depth Scores?</span>
              <Badge variant="outline" className="bg-white text-blue-600 border-blue-200">
                 Go to Data Management &gt; Calculate Enhanced Metrics
              </Badge>
          </div>
      )}
    </div>
  );
}
