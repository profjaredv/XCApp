import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft } from 'lucide-react';
import { useAthletePerformance, useAthleteAllSeasons } from '@/hooks/usePerformanceMetrics';
import { useMultiSeasonTrends } from '@/hooks/useMultiSeasonTrends';
import { performanceService } from '@/api/performanceService';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { SeasonModeSelector, SeasonMode } from '@/components/SeasonModeSelector';
import { AthleteDetailModal } from '@/components/analytics/AthleteDetailModal';
import { formatDateShort } from '@/lib/formatUtils';
import type { Athlete, Race, AthleteSeasonData } from '@/types/analytics';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { useCurrentSeason } from '@/hooks/useCurrentSeason';
import { useQueryParamNumber } from '@/hooks/useQueryState';

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

const TeamAthleteProfilePage = () => {
  // The route no longer carries a :teamId param — the team is identified once,
  // higher up, by :athleticTeamId (see router/index.tsx). The internal team
  // UUID some hooks below still need comes from the signed-in user's own team.
  const { athleteId } = useParams<{ athleteId: string }>();
  const { currentUser } = useAuth();
  const teamId = currentUser?.team?.id;
  const isCoach = currentUser?.role === 'coach';
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const defaultSeason = useCurrentSeason();
  const [seasonParam, setSeasonParam] = useQueryParamNumber('season');
  const [seasonMode, setSeasonMode] = useState<'current' | 'all' | 'custom'>('current');
  const [isRecalculating, setIsRecalculating] = useState(false);

  const { data: athleteAllSeasons } = useAthleteAllSeasons(athleteId || '', { enabled: !!athleteId });

  // When landing with no explicit ?season= and this athlete has no races in
  // the team's current/active season but does have races in a past one,
  // default to the most recent season with data instead of showing an
  // empty "no results" page — the same class of bug fixed on RosterPage
  // (season not carried on navigation) and AnalyticsPage (defaulted to an
  // empty preseason). `seasons` comes back ordered ascending by the
  // backend, so the last entry with races is the most recent one.
  const seasonsWithData = athleteAllSeasons?.data?.seasons;
  const smartDefaultSeason = useMemo(() => {
    if (!seasonsWithData) return undefined;
    const hasCurrentData = (seasonsWithData.find(s => s.season === defaultSeason)?.metrics?.totalRaces ?? 0) > 0;
    if (hasCurrentData) return undefined;
    return [...seasonsWithData].reverse().find(s => (s.metrics?.totalRaces ?? 0) > 0)?.season;
  }, [seasonsWithData, defaultSeason]);

  useEffect(() => {
    if (seasonParam === undefined && smartDefaultSeason !== undefined) {
      setSeasonParam(smartDefaultSeason);
    }
  }, [seasonParam, smartDefaultSeason, setSeasonParam]);

  const selectedSeason = seasonParam ?? smartDefaultSeason ?? defaultSeason;
  const setSelectedSeason = setSeasonParam;

  const handleSeasonModeChange = (newMode: 'current' | 'all' | 'historical') => {
    setSeasonMode(newMode as 'current' | 'all' | 'custom');
  };

  // Fetch athlete data
  const {
    data: athletePerf,
    isLoading: isLoadingAthlete,
    refetch: refetchAthletePerf,
  } = useAthletePerformance(athleteId || '', selectedSeason);
  const { data: multiSeasonTrendsData, isLoading: isLoadingMultiSeasonTrends } = useMultiSeasonTrends(teamId || '', selectedSeason);

  // Derived values
  const enhancedAthlete: (Athlete & { bestTimeDate?: string; raceCount?: number; firstRaceTime?: number; lastRaceTime?: number; races: Race[] }) | null = useMemo(() => {
    if (!athletePerf?.data) return null;
    const { data } = athletePerf;
    return {
      id: athleteId || '',
      name: data.athleteName || '',
      firstName: data.athleteName?.split(' ')[0] || '',
      lastName: data.athleteName?.split(' ').slice(1).join(' ') || '',
      currentGrade: data.grade || 0,
      gender: data.gender as 'M' | 'F',
      teamName: '', // This can be populated if available from the API
      seasons: [], // This will be populated by athleteAllSeasons
      currentSeason: {} as AthleteSeasonData, // Placeholder
      personalBests: {}, // Placeholder
      races: (data.metrics?.races as unknown as Race[]) || [],
      bestTime: data.metrics?.best?.bestTime || 0,
      avgPace: data.metrics?.current?.avgMilePace?.overall || 0,
      improvementPercent: 0, // Placeholder
      raceCount: data.metrics?.current?.totalRaces || 0,
      firstRaceTime: 0, // Placeholder
      lastRaceTime: 0, // Placeholder
      bestTimeDate: '' // Placeholder
    };
  }, [athletePerf, athleteId]);

  const careerSummary = useMemo<CareerSummary>(() => {
    const seasons = athleteAllSeasons?.data?.seasons || [];
    if (!seasons.length) return { totalRaces: 0, totalMiles: 0, avgPace: 0, best5kTime: 0 };
    const totals = seasons.reduce((acc, season) => {
      const metrics = season.metrics;
      const miles = metrics?.totalMiles ?? 0;
      return {
        totalRaces: acc.totalRaces + (metrics?.totalRaces ?? 0),
        totalMiles: acc.totalMiles + miles,
        totalTime: acc.totalTime + (miles > 0 && (metrics?.avgMilePace?.overall ?? 0) > 0 ? miles * metrics.avgMilePace.overall : 0),
        best5kTime: Math.min(acc.best5kTime, metrics?.best5kTime ?? Infinity)
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
      totalRaces: s.metrics?.totalRaces ?? 0,
      totalMiles: s.metrics?.totalMiles ?? 0,
      avgPace: s.metrics?.avgMilePace?.overall ?? 0,
      best5kTime: s.metrics?.best5kTime ?? 0,
    }));
  }, [athleteAllSeasons?.data?.seasons]);

  const allSeasonsRaces = useMemo<RaceData[]>(() => {
    const races = (athleteAllSeasons?.data?.seasons || []).flatMap(s =>
      // Races come back at the top level of the season payload, not nested
      // under `metrics` — reading `s.metrics.races` silently produced an
      // empty career history on every athlete.
      (s.races || []).map(r => ({
        name: r.meetName,
        date: formatDateShort(r.date),
        distanceMi: r.distanceMeters / 1609.34,
        time: r.time,
        season: s.season
      }))
    );
    return races.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [athleteAllSeasons?.data?.seasons]);
  
  // Handle back button
  const handleBack = () => {
    // '/team' (bare roster listing) was merged into '/roster' — this used to
    // point at a route that no longer exists.
    navigate(teamPath('/roster'));
  };

  const handleRecalculate = async () => {
    if (!selectedSeason) return;
    setIsRecalculating(true);
    try {
      await performanceService.recalculateMetrics(teamId || '', selectedSeason);
      await refetchAthletePerf();
      toast.success('Metrics calculated');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 403
          ? 'Only a coach can calculate metrics.'
          : 'Could not calculate metrics for this season.'
      );
    } finally {
      setIsRecalculating(false);
    }
  };

  if (isLoadingAthlete) {
    return (
      <div className="container py-8">
        <div className="flex items-center mb-6">
          <Button variant="ghost" onClick={handleBack} className="mr-4">
            <ChevronLeft className="h-5 w-5 mr-1" />
            Back to Team
          </Button>
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="space-y-8">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // The season query settled but returned nothing — almost always because
  // this season's metrics were never calculated (a separate step from
  // importing results), not a genuine "this athlete has no data" state.
  // Previously this fell through to `!enhancedAthlete` and stayed on the
  // loading skeleton forever, which is exactly what "the athlete screen is
  // largely blank" looked like.
  if (!enhancedAthlete) {
    return (
      <div className="container py-8">
        <div className="flex items-center mb-6">
          <Button variant="ghost" onClick={handleBack} className="mr-4">
            <ChevronLeft className="h-5 w-5 mr-1" />
            Back to Team
          </Button>
        </div>
        <Card className="mx-auto max-w-xl">
          <CardHeader className="text-center">
            <CardTitle>Metrics haven't been calculated for {selectedSeason} yet</CardTitle>
            <CardDescription>
              This athlete's {selectedSeason} results haven't been run through analytics yet.
            </CardDescription>
          </CardHeader>
          {isCoach && (
            <CardContent className="flex justify-center">
              <Button onClick={handleRecalculate} disabled={isRecalculating}>
                {isRecalculating ? 'Calculating…' : `Calculate Metrics for ${selectedSeason}`}
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={handleBack} className="mr-4">
            <ChevronLeft className="h-5 w-5 mr-1" />
            Back to Team
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{enhancedAthlete.name}</h1>
            <p className="text-muted-foreground">
              Grade {enhancedAthlete.currentGrade} • {enhancedAthlete.gender === 'M' ? 'Boys' : 'Girls'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <SeasonModeSelector 
            currentMode={seasonMode as SeasonMode}
            onModeChange={handleSeasonModeChange as (mode: SeasonMode) => void}
            selectedSeason={selectedSeason}
            onSeasonChange={setSelectedSeason}
          />
        </div>
      </div>
      
      {/* Use the AthleteDetailModal component as a full page */}
      <AthleteDetailModal 
        selectedAthlete={{
          id: enhancedAthlete.id,
          name: enhancedAthlete.name,
          firstName: enhancedAthlete.firstName,
          lastName: enhancedAthlete.lastName,
          currentGrade: enhancedAthlete.currentGrade,
          gender: enhancedAthlete.gender,
          teamName: enhancedAthlete.teamName,
          seasons: enhancedAthlete.seasons,
          currentSeason: enhancedAthlete.currentSeason,
          personalBests: enhancedAthlete.personalBests,
          races: enhancedAthlete.races,
          bestTime: enhancedAthlete.bestTime,
          avgPace: enhancedAthlete.avgPace,
          improvementPercent: enhancedAthlete.improvementPercent,
          raceCount: enhancedAthlete.raceCount,
          firstRaceTime: enhancedAthlete.firstRaceTime,
          lastRaceTime: enhancedAthlete.lastRaceTime,
          bestTimeDate: enhancedAthlete.bestTimeDate
        }}
        enhancedSelectedAthlete={enhancedAthlete}
        careerSummary={careerSummary}
        seasonBreakdown={seasonBreakdown}
        allSeasonsRaces={allSeasonsRaces}
        multiSeasonTrendsData={multiSeasonTrendsData}
        isLoadingMultiSeasonTrends={isLoadingMultiSeasonTrends}
        onClose={() => {}} // No-op since this is a dedicated page
      />
    </div>
  );
};

export default TeamAthleteProfilePage;
