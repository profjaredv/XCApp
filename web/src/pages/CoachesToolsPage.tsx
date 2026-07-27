import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, Users, Loader2, Lightbulb, AlertCircle, Download, Play } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentSeasonWithData } from '@/hooks/useCurrentSeasonWithData';
import axiosInstance from '@/api/axios';

interface Athlete {
  id: string;
  name: string;
  grade: string;
  gender: string;
}

interface TrainingGroup {
  name: string;
  athletes: string[];
  focus: string;
}

interface ImprovementData {
  athlete: Athlete;
  firstRace: {
    name: string;
    date: string;
    time: number;
    place: number;
    distance?: string;
  };
  bestRace: {
    name: string;
    date: string;
    time: number;
    place: number;
    distance?: string;
  };
  mostRecentRace: {
    name: string;
    date: string;
    time: number;
    place: number;
    distance?: string;
  };
  metrics: {
    meetOverMeetImprovement: number | null;
    seasonImprovement: number;
    totalRaces: number;
    comparisonDistance?: string;
  };
}

interface AiInsight {
  title: string;
  description: string;
  athletes?: string[];
  priority: 'high' | 'medium' | 'low';
}

interface AiInsightsData {
  insights: AiInsight[];
  summary: string;
}

export default function CoachesToolsPage() {
  const { currentUser } = useAuth();
  const teamId = currentUser?.team?.id;
  // No season picker on this page — default past an empty active/preseason
  // to the most recent season that actually has races, or every tool here
  // (training groups, improvement tracking, AI insights) looks broken on a
  // team that just rolled into a new season.
  const currentSeason = useCurrentSeasonWithData(teamId);

  const [trainingGroups, setTrainingGroups] = useState<TrainingGroup[]>([]);
  const [groupsRationale, setGroupsRationale] = useState<string>('');
  const [improvements, setImprovements] = useState<ImprovementData[]>([]);
  const [aiInsights, setAiInsights] = useState<AiInsightsData | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingImprovements, setLoadingImprovements] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teamId) {
      fetchImprovements();
    }
  }, [teamId]);

  const fetchImprovements = async () => {
    try {
      setLoadingImprovements(true);
      setError(null);
      const response = await axiosInstance.get(
        `/coaches-tools/improvement-tracking/${currentSeason}`
      );
      setImprovements(response.data.data || []);
    } catch (err: unknown) {
      console.error('Error fetching improvements:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load improvement data';
      setError(errorMessage);
    } finally {
      setLoadingImprovements(false);
    }
  };

  const generateTrainingGroups = async () => {
    try {
      setLoadingGroups(true);
      setError(null);
      console.log('Generating training groups for season:', currentSeason);
      const response = await axiosInstance.post(
        `/coaches-tools/generate-training-groups/${currentSeason}`
      );
      console.log('Training groups response:', response.data);
      setTrainingGroups(response.data.data.groups || []);
      setGroupsRationale(response.data.data.rationale || '');
    } catch (err: unknown) {
      console.error('Error generating training groups:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate training groups';
      setError(errorMessage);
    } finally {
      setLoadingGroups(false);
    }
  };

  const generateAiInsights = async () => {
    try {
      setLoadingInsights(true);
      setError(null);
      const response = await axiosInstance.post(
        `/coaches-tools/ai-insights/${currentSeason}`
      );
      setAiInsights(response.data.data);
    } catch (err: unknown) {
      console.error('Error generating AI insights:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate AI insights';
      setError(errorMessage);
    } finally {
      setLoadingInsights(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDistance = (distance: string | undefined) => {
    if (!distance) return '5K';
    const meters = parseInt(distance);
    if (meters === 5000) return '5K';
    if (meters === 3200) return '3200m';
    if (meters === 4000) return '4K';
    return `${meters}m`;
  };

  const formatTimeDrop = (firstTime: number, bestTime: number) => {
    const dropSeconds = firstTime - bestTime;
    if (dropSeconds <= 0) return { display: 'N/A', color: 'text-muted-foreground' };
    
    const mins = Math.floor(dropSeconds / 60);
    const secs = Math.floor(dropSeconds % 60);
    const percentage = ((dropSeconds / firstTime) * 100).toFixed(1);
    
    return {
      display: `${mins}:${secs.toString().padStart(2, '0')} (${percentage}%)`,
      color: dropSeconds > 30 ? 'text-green-600' : dropSeconds > 10 ? 'text-yellow-600' : 'text-muted-foreground'
    };
  };

  const getImprovementColor = (improvement: number) => {
    if (improvement > 5) return 'text-green-600 bg-green-50';
    if (improvement > 1) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getImprovementLabel = (improvement: number) => {
    if (improvement > 5) return '🟢 Excellent';
    if (improvement > 1) return '🟡 Good';
    if (improvement > 0) return '⚪ Slight';
    return '🔴 Decline';
  };

  const exportToCSV = () => {
    if (improvements.length === 0) return;

    // CSV Headers
    const headers = [
      'Athlete',
      'Grade',
      'Gender',
      'Distance',
      'First Race Time',
      'First Race Date',
      'Best Race Time (PR)',
      'Best Race Date',
      'Time Dropped',
      'Season Improvement %',
      'Meet-to-Meet Improvement %',
      'Total Races',
      'Status'
    ];

    // CSV Rows
    const rows = improvements.map(data => {
      const timeDrop = formatTimeDrop(data.firstRace.time, data.bestRace.time);
      return [
        data.athlete.name,
        data.athlete.grade,
        data.athlete.gender,
        formatDistance(data.metrics.comparisonDistance),
        formatTime(data.firstRace.time),
        new Date(data.firstRace.date).toLocaleDateString(),
        formatTime(data.bestRace.time),
        new Date(data.bestRace.date).toLocaleDateString(),
        timeDrop.display,
        `${data.metrics.seasonImprovement.toFixed(1)}%`,
        data.metrics.meetOverMeetImprovement !== null 
          ? `${data.metrics.meetOverMeetImprovement.toFixed(1)}%` 
          : 'N/A',
        data.metrics.totalRaces,
        getImprovementLabel(data.metrics.seasonImprovement).replace(/[\u{1F7E2}\u{1F7E1}\u{26AA}\u{1F534}]/gu, '').trim()
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `athlete-improvement-${currentSeason}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!teamId) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Please join or create a team to access Coaches Tools.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Coaches Tools</h1>
        <p className="text-muted-foreground mt-2">
          AI-powered training insights and athlete improvement tracking for {currentSeason} season
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Training Groups */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-500" />
                Training Groups
              </CardTitle>
              <CardDescription>
                Performance-based training groups organized by pace and ability
              </CardDescription>
            </div>
            <Button
              onClick={generateTrainingGroups}
              disabled={loadingGroups}
              className="gap-2"
            >
              {loadingGroups ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Groups
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {trainingGroups.length === 0 && !loadingGroups ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Click "Generate Groups" to create performance-based training groups</p>
              <p className="text-sm mt-2">Groups are organized by pace, gender, and ability level</p>
            </div>
          ) : (
            <>
              {groupsRationale && (
                <Alert className="mb-4">
                  <AlertDescription>
                    <strong>Strategy:</strong> {groupsRationale}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {trainingGroups.map((group, idx) => (
                  <Card key={idx} className="border-2">
                    <CardHeader>
                      <CardTitle className="text-lg">{group.name}</CardTitle>
                      <CardDescription>{group.focus}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1">
                        {group.athletes.map((athlete, athleteIdx) => (
                          <li key={athleteIdx} className="text-sm">
                            • {athlete}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Improvement Tracking */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                Athlete Improvement Tracking
              </CardTitle>
              <CardDescription>
                Season-long and meet-over-meet improvement metrics
              </CardDescription>
            </div>
            {improvements.length > 0 && (
              <div className="flex gap-2">
                <Button
                  onClick={() => window.open('/race-visualization', '_blank', 'fullscreen=yes,width=1920,height=1080')}
                  variant="default"
                  size="sm"
                  className="gap-2"
                >
                  <Play className="h-4 w-4" />
                  Race Visualization
                </Button>
                <Button
                  onClick={exportToCSV}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingImprovements ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : improvements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No improvement data available for this season</p>
              <p className="text-sm mt-2">Athletes need at least 2 races to track improvement</p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{improvements.length}</div>
                    <p className="text-xs text-muted-foreground">Athletes Tracked</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-green-600">
                      {(() => {
                        const totalSeconds = improvements.reduce((sum, data) => {
                          const drop = data.firstRace.time - data.bestRace.time;
                          return sum + (drop > 0 ? drop : 0);
                        }, 0);
                        const mins = Math.floor(totalSeconds / 60);
                        const secs = Math.floor(totalSeconds % 60);
                        return `${mins}:${secs.toString().padStart(2, '0')}`;
                      })()}
                    </div>
                    <p className="text-xs text-muted-foreground">Total Time Dropped</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">
                      {(() => {
                        const avgImprovement = improvements.reduce((sum, data) => 
                          sum + data.metrics.seasonImprovement, 0) / improvements.length;
                        return `${avgImprovement.toFixed(1)}%`;
                      })()}
                    </div>
                    <p className="text-xs text-muted-foreground">Avg Improvement</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">
                      {improvements.filter(d => d.metrics.seasonImprovement > 5).length}
                    </div>
                    <p className="text-xs text-muted-foreground">Excellent Progress (5%+)</p>
                  </CardContent>
                </Card>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Athlete</th>
                    <th className="text-left p-2">Grade</th>
                    <th className="text-center p-2">Distance</th>
                    <th className="text-right p-2">First Race</th>
                    <th className="text-right p-2">Best Race (PR)</th>
                    <th className="text-right p-2">Time Dropped</th>
                    <th className="text-right p-2">Meet-to-Meet Δ</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {improvements.map((data, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{data.athlete.name}</td>
                      <td className="p-2">{data.athlete.grade}</td>
                      <td className="p-2 text-center">
                        <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {formatDistance(data.metrics.comparisonDistance)}
                        </span>
                      </td>
                      <td className="p-2 text-right text-sm">
                        <div>{formatTime(data.firstRace.time)}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(data.firstRace.date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="p-2 text-right text-sm">
                        <div className="font-semibold text-green-600">{formatTime(data.bestRace.time)}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(data.bestRace.date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        {(() => {
                          const timeDrop = formatTimeDrop(data.firstRace.time, data.bestRace.time);
                          return (
                            <div className={`font-semibold ${timeDrop.color}`}>
                              {timeDrop.display}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-2 text-right text-sm">
                        {data.metrics.meetOverMeetImprovement !== null ? (
                          <span className={getImprovementColor(data.metrics.meetOverMeetImprovement)}>
                            {data.metrics.meetOverMeetImprovement > 0 ? '+' : ''}
                            {data.metrics.meetOverMeetImprovement.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </td>
                      <td className="p-2 text-center text-sm">
                        {getImprovementLabel(data.metrics.seasonImprovement)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                AI Performance Insights
              </CardTitle>
              <CardDescription>
                AI-powered pattern analysis and coaching recommendations
              </CardDescription>
            </div>
            <Button 
              onClick={generateAiInsights} 
              disabled={loadingInsights}
              variant="outline"
            >
              {loadingInsights ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Insights
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!aiInsights && !loadingInsights ? (
            <div className="text-center py-8 text-muted-foreground">
              <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Click "Generate Insights" to discover patterns in your team's performance</p>
              <p className="text-sm mt-2">AI will analyze trends and provide strategic recommendations</p>
            </div>
          ) : loadingInsights ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : aiInsights ? (
            <>
              {/* Summary */}
              {aiInsights.summary && (
                <Alert className="mb-6">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="ml-2">
                    <strong>Team Overview:</strong> {aiInsights.summary}
                  </AlertDescription>
                </Alert>
              )}

              {/* Insights */}
              <div className="space-y-4">
                {aiInsights.insights.map((insight, idx) => (
                  <Card key={idx} className="border-l-4" style={{
                    borderLeftColor: insight.priority === 'high' ? '#ef4444' : 
                                    insight.priority === 'medium' ? '#f59e0b' : '#10b981'
                  }}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{insight.title}</CardTitle>
                        <Badge variant={
                          insight.priority === 'high' ? 'destructive' : 
                          insight.priority === 'medium' ? 'default' : 
                          'secondary'
                        }>
                          {insight.priority}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-2">{insight.description}</p>
                      {insight.athletes && insight.athletes.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {insight.athletes.map((athlete, athleteIdx) => (
                            <Badge key={athleteIdx} variant="outline" className="text-xs">
                              {athlete}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
