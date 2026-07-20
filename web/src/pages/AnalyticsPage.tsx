import { useState, useMemo, useEffect, useCallback, useContext } from 'react';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { useAthleteAllSeasons } from '@/hooks/usePerformanceMetrics';
import { performanceService } from '@/api/performanceService';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { formatDateShort } from '@/lib/formatUtils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/api/axios';
import { useTeamSeasonSeries } from '@/hooks/useTeamSeasonSeries';
import { useInvalidatePerformanceCache } from '@/hooks/useInvalidatePerformanceCache';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { useMultiSeasonTrends } from '@/hooks/useMultiSeasonTrends';
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
import { useEnhancedTeamMetrics } from '@/hooks/useEnhancedAnalytics';
import { useTeamURLState } from '@/hooks/useURLState';

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

  // URL state for navigation only (tab, season, seasonMode, selectedAthleteId)
  const { state: urlState, setValue } = useTeamURLState<{
    tab: string;
    season?: number;
    seasonMode: SeasonMode;
    selectedAthleteId?: string;
  }>(teamId, {
    defaultValues: {
      tab: 'dashboard',
      seasonMode: 'current'
    }
  });

  // Extract navigation state from URL
  const [activeTab, setActiveTab] = useState(urlState.tab);
  const [seasonMode, setSeasonMode] = useState<SeasonMode>(urlState.seasonMode);
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(urlState.season);
  const urlSelectedAthleteId = urlState.selectedAthleteId;

  const { data: analyticsData, isLoading, error, refetch } = useAnalyticsData(selectedSeason);

  const { athletes = [], team, meets = [], mostImproved = [] } = analyticsData || {};

  const { data: availableSeasons = [], isLoading: isLoadingSeasons, refetch: refetchSeasons } = useAvailableSeasons(teamId);
  const { data: multiSeasonTrendsData, isLoading: isLoadingMultiSeasonTrends } = useMultiSeasonTrends(teamId || '', seasonMode === 'historical' ? selectedSeason : undefined);
  const { data: enhancedTeamMetrics, isLoading: isLoadingEnhanced } = useEnhancedTeamMetrics(teamId || '', selectedSeason?.toString() || '2025');
  const { data: seasonSeriesData } = useTeamSeasonSeries(teamId, selectedSeason ? selectedSeason.toString() : undefined);

  // Sync URL state with local state
  useEffect(() => {
    setActiveTab(urlState.tab);
  }, [urlState.tab]);

  useEffect(() => {
    setSeasonMode(urlState.seasonMode);
  }, [urlState.seasonMode]);

  useEffect(() => {
    setSelectedSeason(urlState.season);
  }, [urlState.season]);

  useEffect(() => {
    if (urlSelectedAthleteId) {
      const athlete = athletes.find(a => a.id === urlSelectedAthleteId);
      setSelectedAthlete(athlete || null);
    } else {
      setSelectedAthlete(null);
    }
  }, [urlSelectedAthleteId, athletes]);

  useEffect(() => {
    if (seasonMode === 'current') {
      const currentYear = new Date().getFullYear();
      setSelectedSeason(currentYear);
      setValue('season', currentYear);
    } else if (seasonMode === 'historical' && availableSeasons.length > 0 && !selectedSeason) {
      const currentYear = new Date().getFullYear();
      const defaultSeason = availableSeasons.find(s => s.year === currentYear)?.year || availableSeasons[0]?.year;
      if (defaultSeason) {
        setSelectedSeason(defaultSeason);
        setValue('season', defaultSeason);
      }
    }
  }, [seasonMode, availableSeasons, selectedSeason, setValue]);

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
      await performanceService.recalculateMetrics(teamId, selectedSeason || new Date().getFullYear());
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
    if (!window.confirm('This will delete ALL athletes, races, and results for your team. This action cannot be undone. Continue?')) return;
    try {
      await api.delete('/teams/data');
      await refetch();
      toast({ title: 'Team data cleared', description: 'All team data was deleted.', variant: 'default' });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = status === 403 ? 'You must be the coach to clear team data.' : 'Failed to clear team data';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      console.error('Error clearing team data:', err);
    }
  }, [refetch, toast]);

  const seasonDisplay = `${selectedSeason} Cross Country${selectedSeason === new Date().getFullYear() ? ' (Current)' : ''}`;

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value);
  const handleGenderFilterChange = (value: 'all' | 'M' | 'F') => setGenderFilter(value);
  const handleGradeFilterChange = (value: string) => setGradeFilter(value);

  const handleSeasonModeChange = useCallback((newMode: SeasonMode) => {
    setSeasonMode(newMode);
    setValue('seasonMode', newMode);
    setSelectedSeason(undefined);
    setValue('season', undefined);
    if (newMode === 'historical' && (!availableSeasons || availableSeasons.length === 0)) {
      refetchSeasons();
    }
  }, [availableSeasons, refetchSeasons, setValue]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setValue('tab', tab);
  }, [setValue]);

  const handleSeasonChange = useCallback((season: number | undefined) => {
    setSelectedSeason(season);
    setValue('season', season);
  }, [setValue]);

  const handleAthleteSelect = useCallback((athlete: Athlete | null) => {
    setSelectedAthlete(athlete);
    setValue('selectedAthleteId', athlete?.id);
  }, [setValue]);

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
      // Check both snake_case (top-level) and nested metrics object
      const totalRaces = season.total_races ?? season.metrics?.totalRaces ?? 0;
      const totalMiles = season.total_miles ?? season.metrics?.totalMiles ?? 0;
      const avgPace = season.average_pace ?? season.metrics?.avgMilePace?.overall ?? 0;
      const best5k = season.best_time_5k ?? season.best5kTime ?? season.metrics?.best5kTime ?? Infinity;
      
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
    return (athleteAllSeasons?.data?.seasons || []).map(s => ({
      season: s.season,
      totalRaces: s.total_races ?? s.metrics?.totalRaces ?? 0,
      totalMiles: s.total_miles ?? s.metrics?.totalMiles ?? 0,
      avgPace: s.average_pace ?? s.metrics?.avgMilePace?.overall ?? 0,
      best5kTime: s.best_time_5k ?? s.best5kTime ?? s.metrics?.best5kTime ?? 0,
    }));
  }, [athleteAllSeasons?.data?.seasons]);

  const allSeasonsRaces = useMemo<RaceData[]>(() => {
    const races = (athleteAllSeasons?.data?.seasons || []).flatMap(s => 
      (s.races || []).map(r => ({
        name: r.meetName,
        date: formatDateShort(r.date),
        distanceMi: r.distance,
        time: r.time,
        season: s.season
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
        selectedSeason={selectedSeason}
        setSelectedSeason={handleSeasonChange}
        handleRecalculateMetrics={handleRecalculateMetrics}
        isRecalculating={isRecalculating}
        team={team}
        handleClearTeamData={handleClearTeamData}
        seasonDisplay={seasonDisplay}
      />
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="overflow-x-auto mb-4 -mx-3 px-3 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-4">
            <TabsTrigger value="dashboard" className="whitespace-nowrap">Dashboard</TabsTrigger>
            <TabsTrigger value="athletes" className="whitespace-nowrap">Athletes</TabsTrigger>
            <TabsTrigger value="meets" className="whitespace-nowrap">Meets</TabsTrigger>
            <TabsTrigger value="performance" className="whitespace-nowrap">Performance</TabsTrigger>
          </TabsList>
        </div>
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
          <Tabs defaultValue="distance" className="w-full">
            <TabsList className="mb-4">
                <TabsTrigger value="distance">Distance Analysis</TabsTrigger>
                <TabsTrigger value="compare">Head-to-Head</TabsTrigger>
            </TabsList>
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
      </Tabs>
      <AthleteDetailModal 
        selectedAthlete={selectedAthlete}
        enhancedSelectedAthlete={enhancedSelectedAthlete}
        careerSummary={careerSummary}
        seasonBreakdown={seasonBreakdown}
        allSeasonsRaces={allSeasonsRaces}
        multiSeasonTrendsData={multiSeasonTrendsData}
        isLoadingMultiSeasonTrends={isLoadingMultiSeasonTrends}
        onClose={() => handleAthleteSelect(null)}
      />
    </div>
  );
};

export default AnalyticsPage;
