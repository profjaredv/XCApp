import React, { useMemo, useState } from 'react';
import { useTeamContext } from '@/hooks/useTeamContext';
import { useAvailableSeasons } from '@/hooks/useAvailableSeasons';
import { SeasonContext, type SeasonContextValue } from './SeasonContext';

export const SeasonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: context } = useTeamContext();
  const { data: seasons = [], isLoading: isLoadingSeasons } = useAvailableSeasons(context?.team?.id);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const activeYear = selectedYear ?? context?.activeSeason ?? seasons[0]?.year ?? null;

  const value = useMemo<SeasonContextValue>(
    () => ({ seasons, isLoadingSeasons, activeSeason: context?.activeSeason, selectedYear, setSelectedYear, activeYear }),
    [seasons, isLoadingSeasons, context?.activeSeason, selectedYear, activeYear]
  );

  return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
};
