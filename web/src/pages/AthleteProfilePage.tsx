import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { useAthletePerformance } from '@/hooks/usePerformanceMetrics';
import { Skeleton } from '@/components/ui/skeleton';
import { SeasonModeSelector, SeasonMode } from '@/components/SeasonModeSelector';
import type { Athlete, Race, AthleteSeasonData } from '@/types/analytics';
import { useCurrentSeason } from '@/hooks/useCurrentSeason';
import { useQueryParamNumber } from '@/hooks/useQueryState';

const AthleteProfilePage = () => {
  const { athleteId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();
  const defaultSeason = useCurrentSeason();
  const [seasonParam, setSeasonParam] = useQueryParamNumber('season');
  const selectedSeason = seasonParam ?? defaultSeason;
  const setSelectedSeason = setSeasonParam;
  const [seasonMode, setSeasonMode] = useState<'current' | 'all' | 'custom'>('current');

  const handleSeasonModeChange = (newMode: 'current' | 'all' | 'historical') => {
    setSeasonMode(newMode as 'current' | 'all' | 'custom');
  };
  
  
  // Fetch athlete data
  const { data: athletePerf, isLoading: isLoadingAthlete } = useAthletePerformance(athleteId || '', selectedSeason);
  
  // Derived values
  const enhancedAthlete: Athlete | null = React.useMemo(() => {
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
  
  
  // Handle back button
  const handleBack = () => {
    navigate(-1);
  };
  
  if (isLoadingAthlete || !enhancedAthlete) {
    return (
      <div className="container py-8">
        <div className="flex items-center mb-6">
          <Button variant="ghost" onClick={handleBack} className="mr-4">
            <ChevronLeft className="h-5 w-5 mr-1" />
            Back
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
  
  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={handleBack} className="mr-4">
            <ChevronLeft className="h-5 w-5 mr-1" />
            Back
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
      
      {/* Placeholder for future additional features */}
      <div className="mb-8">
        {/* Additional athlete stats, achievements, etc. will go here */}
      </div>
      
      {/* Main athlete profile content */}
      <div className="bg-card rounded-lg shadow-sm p-6">
        {/* This is where we'll integrate the AthleteProfile component */}
        {/* For now, we'll just display a message */}
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold mb-4">Athlete Profile Coming Soon</h2>
          <p className="text-muted-foreground">
            The detailed athlete profile will be integrated here, showing performance metrics,
            career progress charts, race history, and more.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AthleteProfilePage;

