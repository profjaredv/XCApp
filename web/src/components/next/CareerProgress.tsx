import React from 'react';
import AthleteProgressChart from '@/components/analytics/AthleteProgressChart';
import { useCareerComparison } from '@/hooks/usePerformanceMetrics';

// Career Progress in the next shell: classic's season-over-season chart
// (5K time and average pace against the team, boys and girls averages for
// each year), fed by the same /career-comparison endpoint the classic
// athlete modal uses. Draws nothing until the athlete has a finished race.
export const CareerProgress: React.FC<{ athleteId: string; name: string; gender: string | null }> = ({ athleteId, name, gender }) => {
  const { data, isLoading } = useCareerComparison(athleteId);
  const rows = data?.data ?? [];
  if (!isLoading && rows.length === 0) return null;
  return <AthleteProgressChart athleteName={name} athleteGender={gender === 'F' ? 'F' : 'M'} data={rows} isLoading={isLoading} />;
};
