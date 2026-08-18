import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, Loader2, Lightbulb, AlertCircle, Download, Play, Timer } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentSeasonWithData } from '@/hooks/useCurrentSeasonWithData';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { useQueryParamNumber } from '@/hooks/useQueryState';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import axiosInstance from '@/api/axios';

interface Athlete {
  id: string;
  name: string;
  grade: string;
  gender: string;
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
  category?: 'consistency' | 'growth' | 'watch';
}

interface AiInsightsData {
  insights: AiInsight[];
  summary: string;
  // Set when the requested season had no races yet (preseason) and this
  // analysis fell back to the most recent season with data instead.
  usingSeason?: number;
  isPreseasonFallback?: boolean;
  // Athlete names are tokenized before this analysis runs — see
  // backend/lib/kippwitAnonymize.js — and this names who built that.
  anonymization?: { poweredBy: string; url: string };
}

const CATEGORY_LABEL: Record<NonNullable<AiInsight['category']>, string> = {
  consistency: 'Consistency',
  growth: 'Growth',
  watch: 'Watch List',
};

export default function CoachesToolsPage() {
  const { currentUser } = useAuth();
  const teamId = currentUser?.team?.id;
  // Default past an empty active/preseason to the most recent season that
  // actually has races, so a team that just rolled into a new season isn't
  // greeted with "no data" on every tool here — but a coach can still pick
  // any past season explicitly via the dropdown below.
  const defaultSeason = useCurrentSeasonWithData(teamId);
  const { data: availableSeasons = [] } = useAvailableSeasons(teamId);
  const [seasonParam, setSeasonParam] = useQueryParamNumber('season');
  const currentSeason = seasonParam ?? defaultSeason;
  const teamPath = useTeamPath();
  const navigate = useNavigate();

  const [improvements, setImprovements] = useState<ImprovementData[]>([]);
  const [aiInsights, setAiInsights] = useState<AiInsightsData | null>(null);
  const [loadingImprovements, setLoadingImprovements] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teamId && currentSeason) {
      fetchImprovements();
      // AI insights are generated on demand (button click) for whichever
      // season was current when the coach clicked — clear on season change
      // so a switch doesn't leave last season's insights on screen
      // mislabeled under the new season.
      setAiInsights(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, currentSeason]);

  // Axios's own err.message is a generic "Request failed with status code
  // 503" — the actually useful text (e.g. "GEMINI_API_KEY is not set") is
  // in the backend's response body, which every coaches-tools route
  // returns as { message }.
  const extractErrorMessage = (err: unknown, fallback: string): string => {
    const responseMessage = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    if (responseMessage) return responseMessage;
    return err instanceof Error ? err.message : fallback;
  };

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
      const errorMessage = extractErrorMessage(err, 'Failed to load improvement data');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoadingImprovements(false);
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
      if ((response.data.data?.insights?.length ?? 0) === 0) {
        toast.info(response.data.data?.summary || 'No insights available yet for this season.');
      }
    } catch (err: unknown) {
      console.error('Error generating AI insights:', err);
      const errorMessage = extractErrorMessage(err, 'Failed to generate AI insights');
      setError(errorMessage);
      toast.error(errorMessage);
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Coaches Tools</h1>
          <p className="text-muted-foreground mt-2">
            AI-powered training insights and athlete improvement tracking for {currentSeason} season
          </p>
        </div>
        {availableSeasons.length > 0 && (
          <Select value={currentSeason.toString()} onValueChange={(v) => setSeasonParam(Number(v))}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select season" /></SelectTrigger>
            <SelectContent>
              {availableSeasons.map((s) => (
                <SelectItem key={s.year} value={s.year.toString()}>
                  {s.year}{s.year === defaultSeason ? ' (Current)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Interval Sessions — the full capture tool lives at its own
          full-screen route (no sidebar/header), opened from here. Group
          creation is deliberately NOT offered here anymore — coaches build
          groups by hand on the Groups screen; this app doesn't suggest
          them. */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5 text-purple-500" />
                Interval Sessions
              </CardTitle>
              <CardDescription>
                Capture reps on a grid instead of paper — opens full screen
              </CardDescription>
            </div>
            <Button onClick={() => navigate(teamPath('/interval-sessions'))} className="gap-2">
              <Timer className="h-4 w-4" />
              Open Interval Sessions
            </Button>
          </div>
        </CardHeader>
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
                Consistency, growth, and who to watch — before the season starts, uses last season's data
              </CardDescription>
              <p className="text-xs text-muted-foreground mt-1">
                Athlete names are anonymized before analysis —{' '}
                <a
                  href="https://kippwit.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  powered by Kippwit
                </a>
              </p>
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
              {aiInsights.isPreseasonFallback && (
                <Alert className="mb-4">
                  <AlertDescription>
                    No races yet in {currentSeason} — this analysis is based on the {aiInsights.usingSeason} season instead.
                  </AlertDescription>
                </Alert>
              )}

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
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg">{insight.title}</CardTitle>
                        <div className="flex items-center gap-2 shrink-0">
                          {insight.category && <Badge variant="outline">{CATEGORY_LABEL[insight.category]}</Badge>}
                          <Badge variant={
                            insight.priority === 'high' ? 'destructive' :
                            insight.priority === 'medium' ? 'default' :
                            'secondary'
                          }>
                            {insight.priority}
                          </Badge>
                        </div>
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
