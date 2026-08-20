import { useState, useMemo, useEffect, useCallback, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useTeamPath } from '@/hooks/useTeamRoute';
import VDOTCalculator from '@/components/tools/VDOTCalculator';
import ResultsGridPage from '@/pages/ResultsGridPage';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { useAthleteAllSeasons } from '@/hooks/usePerformanceMetrics';
import { performanceService } from '@/api/performanceService';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateShort } from '@/lib/formatUtils';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTabsList } from '@/components/ui/responsive-tabs';
import { api } from '@/api/axios';
import { useTeamSeasonSeries } from '@/hooks/useTeamSeasonSeries';
import { useInvalidatePerformanceCache } from '@/hooks/useInvalidatePerformanceCache';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import RaceVisualization from '@/components/analytics/RaceVisualization';
import { AnalyticsHeader } from '@/components/analytics/AnalyticsHeader';
import { DashboardTab } from '@/components/analytics/DashboardTab';
import { AthletesTab } from '@/components/analytics/AthletesTab';
import { MeetsTab } from '@/components/analytics/MeetsTab';
import { AthleteDetailModal } from '@/components/analytics/AthleteDetailModal';
import { SeasonMode } from '@/components/analytics/types';
import type { Athlete, Race, RaceResult } from '@/types/analytics';
import { AuthContext } from '@/contexts/AuthContext';
import { DistanceAnalysisTab } from '@/components/analytics/DistanceAnalysisTab';
import { RaceComparisonTab } from '@/components/analytics/RaceComparisonTab';
import { GroupAnalyticsTab } from '@/components/analytics/GroupAnalyticsTab';
import { useEnhancedTeamMetrics } from '@/hooks/useEnhancedAnalytics';
import { useQueryParam, useQueryParamNumber, useSetQueryParams } from '@/hooks/useQueryState';
import { useTeamContext } from '@/hooks/useTeamContext';
import { SetupChecklist } from '@/components/SetupChecklist';
import { currentCalendarSeason } from '@/lib/seasonUtils';

// Values must match Layout.tsx's SeasonNavSection ANALYTICS_TABS exactly
// — that's what sets ?tab= now that the in-page tab row is gone.
const ANALYTICS_TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  athletes: 'Athletes',
  meets: 'Meets',
  performance: 'Performance',
  byGroup: 'By Group',
  resultsGrid: 'Results Grid',
  tools: 'Pace Calculator',
  coach: 'Coach Insights',
};

const gradeBorderColors: Record<number, string> = {
  9: 'border-blue-800',
  10: 'border-green-600',
  11: 'border-amber-400',
  12: 'border-black'
};

const getGradeBorderColor = (grade: number): string => {
  return gradeBorderColors[grade] || 'border-gray-300';
};

interface RaceData {
  name: string;
  date: string;
  distanceMi: number;
  time: number;
  season?: number;
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

const AnalyticsPage = () => {
  const [selectedRace, setSelectedRace] = useState<{
    id: string;
    name: string;
    results: RaceResult[];
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
  const [genderFilter, setGenderFilter] = useState<'all' | 'M' | 'F'>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const authContext = useContext(AuthContext);
  const currentUser = authContext?.currentUser;
  const teamId = currentUser?.team?.id || (currentUser as unknown as { team_id?: string })?.team_id;
  const teamPath = useTeamPath();

  // Tab/season/athlete selection live directly in the URL — plain params
  // (?tab=athletes&season=2025&athlete=abc123), not local state mirrored
  // into a namespaced, JSON-quoted param keyed by the internal team UUID
  // (the old useTeamURLState). That older scheme re-keyed itself the moment
  // teamId resolved from undefined to a real value, which reset whatever
  // was in the URL — a real cause of state feeling like it didn't persist.
  const [tabParam, setTabParam] = useQueryParam('tab');
  const activeTab = tabParam ?? 'dashboard';
  const [seasonModeParam] = useQueryParam('seasonMode');
  const seasonMode = (seasonModeParam as SeasonMode | undefined) ?? 'current';
  const [selectedSeason, setSelectedSeasonParam] = useQueryParamNumber('season');
  const [urlSelectedAthleteId, setUrlSelectedAthleteId] = useQueryParam('athlete');
  const setQueryParams = useSetQueryParams();
  // Not URL-backed like activeTab above — this one's nested inside the
  // Performance tab and doesn't need to survive a refresh/share. Plain
  // local state, but still needs to be controlled (not defaultValue) so
  // ResponsiveTabsList's mobile dropdown can stay in sync with it.
  const [performanceSubTab, setPerformanceSubTab] = useState('distance');

  const { data: analyticsData, isLoading, error, refetch } = useAnalyticsData(selectedSeason);

  const { athletes = [], team, meets = [], mostImproved = [] } = analyticsData || {};

  const { data: availableSeasons = [], isLoading: isLoadingSeasons, refetch: refetchSeasons } = useAvailableSeasons(teamId);
  const { data: teamContext } = useTeamContext();
  const activeSeason = teamContext?.activeSeason;
  const viewedSeason = selectedSeason ?? activeSeason;

  // Two-way sync with the shared header's season picker (SeasonContext) —
  // that picker is now the only visible "which year" control while in
  // historical mode (AnalyticsHeader's own copy was removed as a literal
  // duplicate). This page's mode-aware (current/historical) logic above
  // stays the source of truth for itself and is otherwise untouched:
  // - Out: whenever selectedSeason changes (including this page's own
  //   auto-detected preseason fallback), mirror it to the shared picker so
  //   it never shows a stale year.
  // - In: picking a year in the shared picker while sitting on this page
  //   should actually change what the page shows, not just update a badge
  //   nobody's looking at — switches into historical mode if needed.
  // Both directions are idempotent once the two values match, so this
  // can't ping-pong.
  const { selectedYear: sharedSelectedYear, setSelectedYear: setSharedSelectedYear } = useSeasonSelection();
  useEffect(() => {
    if (selectedSeason != null) setSharedSelectedYear(selectedSeason);
  }, [selectedSeason, setSharedSelectedYear]);
  useEffect(() => {
    if (sharedSelectedYear == null || sharedSelectedYear === selectedSeason) return;
    setQueryParams({ seasonMode: 'historical', season: sharedSelectedYear });
  }, [sharedSelectedYear, selectedSeason, setQueryParams]);
  const viewedSeasonMeta = availableSeasons.find((s) => s.year === viewedSeason);
  // The Groups tab's roster always comes from the team's actively-managed
  // season, not whichever year is being viewed — a coach setting up 2026
  // groups in the preseason should be able to look at what that same
  // roster did in 2024 without 2024 needing its own Group rows (see
  // GroupAnalyticsTab's own comment for why those are deliberately
  // decoupled).
  const activeSeasonMeta = availableSeasons.find((s) => s.year === activeSeason);
  // A season can have real races imported but no computed metrics yet — an
  // older season that predates the last recalculation, say. That state was
  // previously invisible: the overview endpoint just returns zeros for
  // everything (no error), so the whole page looked broken/empty, and the
  // enhanced-metrics endpoint 404s repeatedly trying to fetch data that was
  // never calculated. Detect it explicitly and skip the doomed fetch.
  const needsCalculation =
    Boolean(viewedSeasonMeta?.hasData) &&
    !isLoading &&
    (analyticsData?.team?.overview?.totalRaces ?? 0) === 0;
  const { data: enhancedTeamMetrics, isLoading: isLoadingEnhanced } = useEnhancedTeamMetrics(
    teamId || '',
    viewedSeason?.toString() ?? '',
    !needsCalculation
  );
  const { data: seasonSeriesData } = useTeamSeasonSeries(teamId, selectedSeason ? selectedSeason.toString() : undefined);

  useEffect(() => {
    if (urlSelectedAthleteId) {
      const athlete = athletes.find(a => a.id === urlSelectedAthleteId);
      setSelectedAthlete(athlete || null);
    } else {
      setSelectedAthlete(null);
    }
  }, [urlSelectedAthleteId, athletes]);

  // Default to the season the *server* says is active — which accounts for
  // what has actually been imported — rather than the calendar year. Using
  // `new Date().getFullYear()` here is what left a team that imported 2025
  // staring at an empty 2026.
  useEffect(() => {
    if (activeSeason === undefined) return;

    // Nobody has picked a mode yet (no `seasonMode` in the URL) and the
    // active season has no races — a fresh preseason. Forcing "Current
    // Season" in that case landed every visit on a genuinely empty page
    // even when past seasons have real data. Default to the most recent
    // season that actually has data instead. A user who explicitly clicks
    // "Current Season" sets seasonModeParam and this no longer applies —
    // that's a deliberate choice to view the (possibly empty) active season.
    if (
      seasonModeParam === undefined &&
      availableSeasons.length > 0 &&
      !availableSeasons.find((s) => s.year === activeSeason)?.hasData &&
      availableSeasons.some((s) => s.hasData)
    ) {
      const defaultSeason =
        availableSeasons.find((s) => s.year !== activeSeason && s.hasData)?.year ??
        availableSeasons.find((s) => s.hasData)?.year;
      if (defaultSeason && defaultSeason !== selectedSeason) {
        // One call, not two — setSeasonModeParam() and setSelectedSeasonParam()
        // each snapshot the URL independently and navigate off that snapshot,
        // so calling both back to back drops whichever one lands first. See
        // useSetQueryParams' comment for the full explanation.
        setQueryParams({ seasonMode: 'historical', season: defaultSeason });
      }
      return;
    }

    if (seasonMode === 'current') {
      if (selectedSeason !== activeSeason) {
        setSelectedSeasonParam(activeSeason);
      }
    } else if (seasonMode === 'historical' && availableSeasons.length > 0 && !selectedSeason) {
      // Default to the most recent PAST season, not the active one — the
      // whole point of switching to "Past Seasons" is to look at a season
      // other than the one Current Season already shows. Falling back to
      // activeSeason here made switching modes look like it did nothing:
      // same season, same data, just a picker appeared.
      const pastSeasons = availableSeasons.filter((s) => s.year !== activeSeason);
      const defaultSeason =
        pastSeasons.find((s) => s.hasData)?.year ??
        pastSeasons[0]?.year ??
        availableSeasons[0]?.year;
      if (defaultSeason) {
        setSelectedSeasonParam(defaultSeason);
      }
    }
  }, [
    seasonMode,
    seasonModeParam,
    availableSeasons,
    selectedSeason,
    setSelectedSeasonParam,
    setQueryParams,
    activeSeason,
  ]);

  const { toast } = useToast();
  const invalidatePerf = useInvalidatePerformanceCache();

  useEffect(() => {
    if (selectedSeason) {
      invalidatePerf.invalidateAll();
      refetch();
    }
  }, [selectedSeason, refetch, invalidatePerf]);

  const displayedStats = useMemo(() => {
    if (!team?.overview) {
      return { 
        totalMeets: 0, 
        totalRaces: 0, 
        totalAthletes: 0, 
        avgAthletesPerRace: 0, 
        totalMilesRun: 0, 
        avgMilePace: 0, 
        totalPRs: 0, 
        top10Finishes: 0 
      };
    }
    return {
      totalMeets: team.overview.totalMeets || 0,
      totalRaces: team.overview.totalRaces || 0,
      totalAthletes: team.overview.totalAthletes || 0,
      avgAthletesPerRace: team.overview.avgAthletesPerRace || 0,
      totalMilesRun: team.overview.totalMilesRun || 0,
      avgMilePace: team.overview.avgMilePace || 0,
      totalPRs: team.overview.totalPRs || 0,
      top10Finishes: team.overview.top10Finishes || 0,
    };
  }, [team]);

  const currentAthleteId = selectedAthlete?.id || '';
  const { data: athleteAllSeasons } = useAthleteAllSeasons(currentAthleteId, { enabled: !!currentAthleteId });

  useEffect(() => {
    if (currentAthleteId) {
      invalidatePerf.invalidateAthletePerformance(currentAthleteId);
    }
  }, [currentAthleteId, selectedSeason, invalidatePerf]);

  const handleRecalculateMetrics = useCallback(async () => {
    if (!teamId) {
      toast({ title: 'Error', description: 'Team ID is not available', variant: 'destructive' });
      return;
    }
    try {
      setIsRecalculating(true);
      await performanceService.recalculateMetrics(teamId, selectedSeason ?? activeSeason ?? currentCalendarSeason());
      await new Promise((r) => setTimeout(r, 750));
      invalidatePerf.invalidateAll();
      await refetch();
      toast({ title: 'Success', description: 'Performance metrics recalculated', variant: 'default' });
    } catch (error) {
      console.error('Error recalculating metrics:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'An error occurred', variant: 'destructive' });
    } finally {
      setIsRecalculating(false);
    }
  }, [teamId, selectedSeason, refetch, invalidatePerf, toast]);

  const handleClearTeamData = useCallback(async () => {
    // Athletes and roster membership survive this endpoint (see its own
    // comment in routes/teams.js) — only imported races/results are
    // removed, so the confirm/success copy below says that, not "all
    // athletes."
    if (!window.confirm('This will delete all imported races and results for your team. Athletes and rosters are not affected. This action cannot be undone. Continue?')) return;
    const athleticTeamId = currentUser?.team?.athleticTeamId;
    if (!athleticTeamId) {
      toast({ title: 'Error', description: 'No team selected.', variant: 'destructive' });
      return;
    }
    try {
      // Was hitting the nonexistent /teams/data (a bare, param-less path
      // that never matched any route — DELETE /:athleticTeamId/results is
      // two segments — so this always 404'd). SettingsPage's "Clear Data"
      // action already calls the real endpoint; mirrored here.
      await api.delete(`/teams/${athleticTeamId}/results`);
      await refetch();
      toast({ title: 'Race data cleared', description: 'Imported races and results were deleted.', variant: 'default' });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = status === 403 ? 'You must be the coach to clear team data.' : 'Failed to clear team data';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      console.error('Error clearing team data:', err);
    }
  }, [refetch, toast]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value);
  const handleGenderFilterChange = (value: 'all' | 'M' | 'F') => setGenderFilter(value);
  const handleGradeFilterChange = (value: string) => setGradeFilter(value);

  const handleSeasonModeChange = useCallback((newMode: SeasonMode) => {
    // Single call — see useSetQueryParams' comment. Setting seasonMode and
    // season via two separate setSearchParams calls was silently dropping
    // the seasonMode change: "Past Seasons" appeared to do nothing.
    setQueryParams({ seasonMode: newMode, season: undefined });
    if (newMode === 'historical' && (!availableSeasons || availableSeasons.length === 0)) {
      refetchSeasons();
    }
  }, [availableSeasons, refetchSeasons, setQueryParams]);

  const handleTabChange = useCallback((tab: string) => {
    setTabParam(tab);
  }, [setTabParam]);

  const handleAthleteSelect = useCallback((athlete: Athlete | null) => {
    setSelectedAthlete(athlete);
    setUrlSelectedAthleteId(athlete?.id);
  }, [setUrlSelectedAthleteId]);

  type EnhancedAthlete = Athlete & {
    bestTimeDate?: string;
    raceCount?: number;
    firstRaceTime?: number;
    currentGrade?: number;
    gender?: 'M' | 'F';
    name?: string;
    lastRaceTime?: number;
    races: Race[];
  };

  const enhancedSelectedAthlete = selectedAthlete ? {
    ...(selectedAthlete as EnhancedAthlete),
    bestTimeDate: (selectedAthlete as EnhancedAthlete).bestTimeDate || '',
    raceCount: (selectedAthlete as EnhancedAthlete).raceCount || 0,
    firstRaceTime: (selectedAthlete as EnhancedAthlete).firstRaceTime || 0,
    lastRaceTime: (selectedAthlete as EnhancedAthlete).lastRaceTime || 0,
    races: (selectedAthlete as EnhancedAthlete).races || []
  } : null;

  const careerSummary = useMemo<CareerSummary>(() => {
    const seasons = athleteAllSeasons?.data?.seasons || [];
    if (!seasons.length) return { totalRaces: 0, totalMiles: 0, avgPace: 0, best5kTime: 0 };
    const totals = seasons.reduce((acc, season) => {
      // GET /performance/athlete/:id/all-seasons spreads the raw
      // AthleteSeasonMetrics row, whose fields are flat camelCase
      // (totalRaces, totalMiles, averagePace) — never snake_case, never
      // nested under `.metrics`. Only best5kTime is separately set by the
      // route handler, which is why PR/SB 5K worked while races/miles/pace
      // silently zeroed out: those were the only two fallbacks that could
      // ever actually match.
      const totalRaces = season.totalRaces ?? season.total_races ?? season.metrics?.totalRaces ?? 0;
      const totalMiles = season.totalMiles ?? season.total_miles ?? season.metrics?.totalMiles ?? 0;
      const avgPace = season.averagePace ?? season.average_pace ?? season.metrics?.avgMilePace?.overall ?? 0;
      const best5k = season.best5kTime ?? season.best_time_5k ?? season.metrics?.best5kTime ?? Infinity;
      
      return {
        totalRaces: acc.totalRaces + totalRaces,
        totalMiles: acc.totalMiles + totalMiles,
        totalTime: acc.totalTime + (totalMiles > 0 && avgPace > 0 ? totalMiles * avgPace : 0),
        best5kTime: Math.min(acc.best5kTime, best5k)
      };
    }, { totalRaces: 0, totalMiles: 0, totalTime: 0, best5kTime: Infinity });
    return {
      totalRaces: totals.totalRaces,
      totalMiles: parseFloat(totals.totalMiles.toFixed(2)),
      avgPace: totals.totalMiles > 0 ? Math.round(totals.totalTime / totals.totalMiles) : 0,
      best5kTime: Number.isFinite(totals.best5kTime) ? totals.best5kTime : 0
    };
  }, [athleteAllSeasons?.data?.seasons]);

  const seasonBreakdown = useMemo<SeasonBreakdown[]>(() => {
    // Same field-name fix as careerSummary above: the real response is flat
    // camelCase.
    return (athleteAllSeasons?.data?.seasons || []).map(s => ({
      season: s.season,
      totalRaces: s.totalRaces ?? s.total_races ?? s.metrics?.totalRaces ?? 0,
      totalMiles: s.totalMiles ?? s.total_miles ?? s.metrics?.totalMiles ?? 0,
      avgPace: s.averagePace ?? s.average_pace ?? s.metrics?.avgMilePace?.overall ?? 0,
      best5kTime: s.best5kTime ?? s.best_time_5k ?? s.metrics?.best5kTime ?? 0,
    }));
  }, [athleteAllSeasons?.data?.seasons]);

  const allSeasonsRaces = useMemo<RaceData[]>(() => {
    const races = (athleteAllSeasons?.data?.seasons || []).flatMap(s => 
      (s.races || []).map(r => ({
        name: r.meetName,
        date: formatDateShort(r.date),
        distanceMi: r.distance,
        time: r.time,
        season: s.season,
        division: r.division,
        place: r.place,
        fieldSize: r.fieldSize,
        overallPlace: r.overallPlace,
        overallFieldSize: r.overallFieldSize,
        teamPlace: r.teamPlace
      }))
    );
    return races.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [athleteAllSeasons?.data?.seasons]);

  const athleteNameMap = useMemo(() => {
    return new Map(athletes.map((a: Athlete) => [a.id, a.name]));
  }, [athletes]);

  const grades = useMemo(() => {
    const gradeSet = new Set<number>();
    athletes.forEach((athlete: Athlete) => { if (athlete.currentGrade) gradeSet.add(athlete.currentGrade); });
    return Array.from(gradeSet).sort((a, b) => a - b);
  }, [athletes]);

  const filteredAthletes = useMemo(() => {
    if (!athletes) return [];
    return athletes.filter((athlete: Athlete) => 
      (!searchTerm || athlete.name.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (genderFilter === 'all' || athlete.gender === genderFilter) &&
      (gradeFilter === 'all' || (athlete.currentGrade && athlete.currentGrade.toString() === gradeFilter))
    );
  }, [athletes, searchTerm, genderFilter, gradeFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <img src="/stickman-running.gif" alt="Loading..." className="h-32 w-32 mx-auto mb-4" />
          <p className="text-lg font-medium">Loading team data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-6 bg-card rounded-lg shadow-md">
          <h2 className="text-xl font-bold mb-2">Error Loading Data</h2>
          <p className="mb-4">There was an error loading the analytics data. Please try again.</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }


  // A team that hasn't imported anything yet isn't an error state and isn't a
  // wall of empty charts — it's a team that needs setting up. Show the path
  // forward instead of a dozen zeroed-out dashboards.
  if (teamContext && !teamContext.setup.hasResults) {
    return (
      <div className="container mx-auto max-w-3xl space-y-6 py-10 px-4">
        <div>
          <h1 className="text-3xl font-bold">Welcome to LeadPack XC</h1>
          <p className="text-muted-foreground">
            A few steps and your team's analytics come to life.
          </p>
        </div>
        <SetupChecklist />
      </div>
    );
  }

  if (!teamId || !analyticsData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg font-medium">No team data found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4">
      {selectedRace && (
        <RaceVisualization race={{ id: selectedRace.id, name: selectedRace.name, results: selectedRace.results }} athleteNameMap={athleteNameMap} onClose={() => setSelectedRace(null)} />
      )}
      <AnalyticsHeader 
        currentUser={currentUser}
        isLoadingSeasons={isLoadingSeasons}
        availableSeasons={availableSeasons}
        seasonMode={seasonMode}
        handleSeasonModeChange={handleSeasonModeChange}
        handleRecalculateMetrics={handleRecalculateMetrics}
        isRecalculating={isRecalculating}
        team={team}
        handleClearTeamData={handleClearTeamData}
      />
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* The sidebar's Season dropdown (Layout.tsx's SeasonNavSection) is
            now how these 8 views are navigated between — it links straight
            to each one's ?tab= param. This heading is just "where am I",
            not a second copy of that navigation; the sidebar sub-item
            highlight already covers that when it's open, but the drawer is
            closed by default on mobile, so the page itself still needs to
            say which view it's showing. */}
        <h2 className="text-xl font-semibold mb-4">{ANALYTICS_TAB_LABELS[activeTab] ?? 'Dashboard'}</h2>
        {needsCalculation ? (
          <Card className="mx-auto max-w-xl">
            <CardHeader className="text-center">
              <CardTitle>Metrics haven't been calculated for {viewedSeason} yet</CardTitle>
              <CardDescription>
                This season has {viewedSeasonMeta?.raceCount} race
                {viewedSeasonMeta?.raceCount === 1 ? '' : 's'} imported, but analytics haven't been
                calculated from them — that's a separate step from importing.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button onClick={handleRecalculateMetrics} disabled={isRecalculating}>
                {isRecalculating ? 'Calculating…' : `Calculate Metrics for ${viewedSeason}`}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <TabsContent value="dashboard">
              <DashboardTab
                displayedStats={displayedStats}
                mostImproved={mostImproved}
                seasonSeriesData={seasonSeriesData}
                enhancedMetrics={enhancedTeamMetrics || null}
                isLoadingEnhanced={isLoadingEnhanced}
              />
            </TabsContent>
            <TabsContent value="athletes">
              <AthletesTab
                searchTerm={searchTerm}
                handleSearch={handleSearch}
                genderFilter={genderFilter}
                handleGenderFilterChange={handleGenderFilterChange}
                gradeFilter={gradeFilter}
                handleGradeFilterChange={handleGradeFilterChange}
                grades={grades}
                filteredAthletes={filteredAthletes}
                setSelectedAthlete={handleAthleteSelect}
                getGradeBorderColor={getGradeBorderColor}
              />
            </TabsContent>
            <TabsContent value="meets">
              <MeetsTab meets={meets} athletes={athletes} setSelectedRace={setSelectedRace} />
            </TabsContent>
            <TabsContent value="performance">
              <Tabs value={performanceSubTab} onValueChange={setPerformanceSubTab} className="w-full">
                <ResponsiveTabsList value={performanceSubTab} onValueChange={setPerformanceSubTab} className="mb-4">
                    <TabsTrigger value="distance">Distance Analysis</TabsTrigger>
                    <TabsTrigger value="compare">Head-to-Head</TabsTrigger>
                </ResponsiveTabsList>
                <TabsContent value="distance">
                     {isLoadingEnhanced ? (
                        <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        <span className="ml-2">Loading distance analysis...</span>
                        </div>
                    ) : enhancedTeamMetrics ? (
                        <DistanceAnalysisTab teamId={teamId || ''} season={selectedSeason?.toString() || '2025'} />
                    ) : (
                        <div className="text-center py-12">
                        <p className="text-muted-foreground">Distance analysis not available. Please calculate enhanced metrics first.</p>
                        </div>
                    )}
                </TabsContent>
                <TabsContent value="compare">
                    {athletes.length > 0 ? (
                        <RaceComparisonTab
                        teamId={teamId || ''}
                        />
                    ) : (
                        <div className="text-center py-12">
                        <p className="text-muted-foreground">No athlete data available for race comparison.</p>
                        </div>
                    )}
                </TabsContent>
              </Tabs>
            </TabsContent>
          </>
        )}
        {/* Deliberately outside the needsCalculation gate above — this tab is
            computed live from race results, not the AthleteSeasonMetrics
            cache table, so it works in preseason before anything has been
            calculated. That's the whole point of it. */}
        <TabsContent value="byGroup">
          <GroupAnalyticsTab groupSeasonId={activeSeasonMeta?.id ?? null} dataYear={viewedSeason} />
        </TabsContent>
        {/* Workstream B (LeadPack Master Build Handoff): Results Grid and
            Pace Calculator moved in from the sidebar — Season absorbs them
            rather than the app carrying separate top-level nav items for a
            grid view and a utility calculator. Neither depends on
            AthleteSeasonMetrics, so both work in preseason too. */}
        <TabsContent value="resultsGrid">
          <ResultsGridPage />
        </TabsContent>
        <TabsContent value="tools">
          <VDOTCalculator />
        </TabsContent>
        <TabsContent value="coach">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Coach Insights
              </CardTitle>
              <CardDescription>
                AI performance insights and the deterministic "Who to Watch" consistency/growth analysis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to={teamPath('/coaches-tools')}>Open Coach Insights</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <AthleteDetailModal 
        selectedAthlete={selectedAthlete}
        enhancedSelectedAthlete={enhancedSelectedAthlete}
        careerSummary={careerSummary}
        seasonBreakdown={seasonBreakdown}
        allSeasonsRaces={allSeasonsRaces}
        onClose={() => handleAthleteSelect(null)}
      />
    </div>
  );
};

export default AnalyticsPage;
