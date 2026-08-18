import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, Loader2, Lightbulb, AlertCircle, Download, Play, Eye, X, RotateCcw, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentSeasonWithData } from '@/hooks/useCurrentSeasonWithData';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { useQueryParamNumber } from '@/hooks/useQueryState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPace } from '@/lib/formatUtils';
import { gradeLabel } from '@/lib/seasonUtils';
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

// Deterministic scoring output — see backend/lib/coachUpAnalysis.js. No AI
// involved: z-scored consistency/growth against the athlete's own gender
// group, combined into one score, team's already-fastest excluded.
type CoachUpCategory = 'watch' | 'consistency' | 'regression';

interface CoachUpAthlete {
  id: string;
  name: string;
  gender: string | null;
  grade: number | null;
  raceCount: number;
  avgPaceSecPerMile: number;
  mostRecentPaceSecPerMile: number;
  improvementPct: number;
  consistencyPct: number;
  consistencyZ: number;
  growthZ: number;
  combinedScore: number;
  alreadyVisible: boolean;
  // False means their improvement, however large, hasn't actually landed
  // them near the team's current pace yet — the "40:00 5K down to 30:00,
  // still nowhere close" guard. Only gates the watch list, not the
  // consistency/regression flags.
  isCompetitive: boolean;
  acknowledgedCategories: CoachUpCategory[];
}

interface CoachUpData {
  athletes: CoachUpAthlete[];
  watchList: CoachUpAthlete[];
  consistencyConcerns: CoachUpAthlete[];
  regressionRisks: CoachUpAthlete[];
  usingSeason?: number;
  isPreseasonFallback?: boolean;
}

// Mirrors backend/lib/coachUpAnalysis.js's defaults — needed here only so
// the athlete-lookup panel can independently tell "would this person
// qualify for category X" regardless of whether they've been dismissed
// (the three server-filtered lists already exclude dismissed athletes, so
// this logic never runs against them — only against the full `athletes`
// array in the search panel). Keep in sync if those defaults change.
const COACH_UP_CONCERN_THRESHOLD = -1.5;
const COACH_UP_MIN_RACES_FOR_REGRESSION = 3;

function qualifiesForCoachUpCategory(athlete: CoachUpAthlete, category: CoachUpCategory): boolean {
  if (category === 'watch') return !athlete.alreadyVisible && athlete.isCompetitive;
  if (category === 'consistency') return athlete.consistencyZ <= COACH_UP_CONCERN_THRESHOLD;
  return athlete.growthZ <= COACH_UP_CONCERN_THRESHOLD && athlete.raceCount >= COACH_UP_MIN_RACES_FOR_REGRESSION;
}

const COACH_UP_CATEGORY_LABEL: Record<CoachUpCategory, string> = {
  watch: 'Watch List',
  consistency: 'Consistency',
  regression: 'Regression',
};

const CoachUpRow: React.FC<{
  athlete: CoachUpAthlete;
  category: CoachUpCategory;
  statText: React.ReactNode;
  busy: boolean;
  onDismiss: () => void;
}> = ({ athlete, statText, busy, onDismiss }) => (
  <div className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
    <div>
      <span className="font-medium">{athlete.name}</span>
      <span className="text-muted-foreground ml-2">
        {gradeLabel(athlete.grade)} · {athlete.raceCount} races
      </span>
    </div>
    <div className="flex items-center gap-2">
      <div className="text-right text-xs text-muted-foreground">{statText}</div>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={busy} title="Dismiss — stop showing this flag" onClick={onDismiss}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
      </Button>
    </div>
  </div>
);

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
  const [improvements, setImprovements] = useState<ImprovementData[]>([]);
  const [aiInsights, setAiInsights] = useState<AiInsightsData | null>(null);
  const [coachUp, setCoachUp] = useState<CoachUpData | null>(null);
  const [loadingImprovements, setLoadingImprovements] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [loadingCoachUp, setLoadingCoachUp] = useState(false);
  const [acknowledgingKey, setAcknowledgingKey] = useState<string | null>(null);
  const [coachUpSearch, setCoachUpSearch] = useState('');
  const [showFullWatchList, setShowFullWatchList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teamId && currentSeason) {
      fetchImprovements();
      // Deterministic, cheap, no API key needed — load it automatically
      // like Improvement Tracking, not on a button click like AI Insights.
      fetchCoachUp();
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

  const fetchCoachUp = async () => {
    try {
      setLoadingCoachUp(true);
      const response = await axiosInstance.get(`/coaches-tools/coach-up/${currentSeason}`);
      setCoachUp(response.data.data);
    } catch (err: unknown) {
      console.error('Error fetching coach-up analysis:', err);
      toast.error(extractErrorMessage(err, 'Failed to load who-to-watch analysis'));
    } finally {
      setLoadingCoachUp(false);
    }
  };

  // Acknowledge against `coachUp.usingSeason`, not `currentSeason` — a
  // preseason view is showing last season's data, and that's the season
  // the acknowledgment needs to be scoped to for it to actually suppress
  // anything on the next load.
  const setCoachUpAcknowledged = async (athleteId: string, category: CoachUpCategory, acknowledged: boolean) => {
    const season = coachUp?.usingSeason ?? currentSeason;
    const key = `${athleteId}::${category}`;
    setAcknowledgingKey(key);
    try {
      if (acknowledged) {
        await axiosInstance.post('/coaches-tools/coach-up/acknowledge', { athleteId, category, season });
      } else {
        await axiosInstance.delete('/coaches-tools/coach-up/acknowledge', { data: { athleteId, category, season } });
      }
      await fetchCoachUp();
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, 'Could not update that acknowledgment'));
    } finally {
      setAcknowledgingKey(null);
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

  // The full ranked pool eligible for the watch list, mirroring the
  // backend's own filter (see computeCoachUpAnalysis) so "Show more"
  // doesn't need another round trip — everyone's metrics are already here.
  const fullEligibleWatchPool = useMemo(() => {
    if (!coachUp) return [];
    return [...coachUp.athletes]
      .filter((a) => !a.alreadyVisible && a.isCompetitive && !a.acknowledgedCategories.includes('watch'))
      .sort((a, b) => b.combinedScore - a.combinedScore);
  }, [coachUp]);

  const coachUpSearchResults = useMemo(() => {
    const term = coachUpSearch.trim().toLowerCase();
    if (!term || !coachUp) return [];
    return coachUp.athletes.filter((a) => a.name.toLowerCase().includes(term));
  }, [coachUp, coachUpSearch]);

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

      {/* Who to Watch — deterministic, no AI involved. See
          backend/lib/coachUpAnalysis.js: consistency and season-long trend
          are z-scored against each athlete's own gender group, combined
          into one score, and the team's already-fastest runners are
          filtered out — what's left is the athletes flying under the
          radar. Loads automatically, same as Improvement Tracking, since
          it's free and instant (no API key, no third-party call). */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-green-500" />
                Who to Watch
              </CardTitle>
              <CardDescription>
                Deterministic scoring, not AI — consistency and season trend vs. the team, with the obvious stars filtered out
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={coachUpSearch}
                onChange={(e) => setCoachUpSearch(e.target.value)}
                placeholder="Look up an athlete…"
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingCoachUp ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !coachUp || coachUp.athletes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Not enough race data yet — athletes need at least 2 races this season.</p>
            </div>
          ) : coachUpSearch.trim() ? (
            // Lookup mode: every match, regardless of dismissal, with a
            // toggle per category so a dismissal can be undone here.
            <div className="space-y-2">
              {coachUpSearchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No athlete matches "{coachUpSearch.trim()}".</p>
              ) : (
                coachUpSearchResults.map((a) => {
                  const categories = (['watch', 'consistency', 'regression'] as CoachUpCategory[]).filter((c) =>
                    qualifiesForCoachUpCategory(a, c)
                  );
                  return (
                    <div key={a.id} className="rounded-md border p-3 text-sm space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">
                          {a.name} <span className="text-muted-foreground font-normal">{gradeLabel(a.grade)} · {a.raceCount} races</span>
                        </span>
                        <span className="text-xs text-muted-foreground text-right">
                          {formatPace(a.mostRecentPaceSecPerMile)} current · {formatPace(a.avgPaceSecPerMile)} season avg
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {a.improvementPct > 0 ? '+' : ''}
                        {a.improvementPct}% season trend · {a.consistencyPct}% variance · combined score {a.combinedScore}
                        {!a.isCompetitive && ' · not yet at team pace'}
                      </p>
                      {categories.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Not currently flagged for anything.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {categories.map((category) => {
                            const acknowledged = a.acknowledgedCategories.includes(category);
                            const busy = acknowledgingKey === `${a.id}::${category}`;
                            return (
                              <Button
                                key={category}
                                size="sm"
                                variant={acknowledged ? 'outline' : 'secondary'}
                                className="h-7 text-xs gap-1"
                                disabled={busy}
                                onClick={() => setCoachUpAcknowledged(a.id, category, !acknowledged)}
                              >
                                {busy ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : acknowledged ? (
                                  <RotateCcw className="h-3 w-3" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                                {COACH_UP_CATEGORY_LABEL[category]}
                                {acknowledged ? ' (dismissed — undo)' : ''}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {coachUp.isPreseasonFallback && (
                <Alert>
                  <AlertDescription>
                    No races yet in {currentSeason} — this analysis is based on the {coachUp.usingSeason} season instead.
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Flying under the radar</h3>
                {coachUp.watchList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody stands out beyond the team's usual names yet.</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {(showFullWatchList ? fullEligibleWatchPool : coachUp.watchList).map((a) => (
                        <CoachUpRow
                          key={a.id}
                          athlete={a}
                          category="watch"
                          busy={acknowledgingKey === `${a.id}::watch`}
                          onDismiss={() => setCoachUpAcknowledged(a.id, 'watch', true)}
                          statText={
                            <>
                              <div>{formatPace(a.avgPaceSecPerMile)}</div>
                              <div>
                                {a.improvementPct > 0 ? '+' : ''}
                                {a.improvementPct}% trend · {a.consistencyPct}% variance
                              </div>
                            </>
                          }
                        />
                      ))}
                    </div>
                    {fullEligibleWatchPool.length > coachUp.watchList.length && (
                      <Button variant="link" size="sm" className="mt-1 px-0" onClick={() => setShowFullWatchList((v) => !v)}>
                        {showFullWatchList ? 'Show fewer' : `Show more (${fullEligibleWatchPool.length - coachUp.watchList.length} more)`}
                      </Button>
                    )}
                  </>
                )}
              </div>

              {coachUp.consistencyConcerns.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Consistency concerns</h3>
                  <div className="space-y-2">
                    {coachUp.consistencyConcerns.map((a) => (
                      <CoachUpRow
                        key={a.id}
                        athlete={a}
                        category="consistency"
                        busy={acknowledgingKey === `${a.id}::consistency`}
                        onDismiss={() => setCoachUpAcknowledged(a.id, 'consistency', true)}
                        statText={<div>{a.consistencyPct}% variance</div>}
                      />
                    ))}
                  </div>
                </div>
              )}

              {coachUp.regressionRisks.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Regression risk</h3>
                  <div className="space-y-2">
                    {coachUp.regressionRisks.map((a) => (
                      <CoachUpRow
                        key={a.id}
                        athlete={a}
                        category="regression"
                        busy={acknowledgingKey === `${a.id}::regression`}
                        onDismiss={() => setCoachUpAcknowledged(a.id, 'regression', true)}
                        statText={
                          <div>
                            {a.improvementPct > 0 ? '+' : ''}
                            {a.improvementPct}% trend
                          </div>
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
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
