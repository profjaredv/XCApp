import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { trackService, type TrackGender, type TrackSeason } from '@/api/trackService';
import { useTeamPath } from '@/hooks/useTeamRoute';

// What the Track & Field screens share: the list of seasons, the season and
// boys/girls choice (remembered as you move between screens), and the page
// frame. A track season is a year that has imported results.

const GENDERS: Array<{ value: TrackGender; label: string }> = [
  { value: 'M', label: 'Boys' },
  { value: 'F', label: 'Girls' },
];

const read = (key: string) => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Not remembered between screens, then.
  }
};

export function useTrackSeasons() {
  return useQuery({ queryKey: ['track', 'seasons'], queryFn: () => trackService.getSeasons() });
}

export function useTrackSelection(seasons: TrackSeason[] | undefined) {
  const [gender, setGenderState] = useState<TrackGender>(() => (read('track.gender') === 'F' ? 'F' : 'M'));
  const [year, setYearState] = useState<number | null>(() => Number(read('track.year')) || null);

  useEffect(() => {
    if (seasons?.length && (year == null || !seasons.some((s) => s.year === year))) setYearState(seasons[0].year);
  }, [seasons, year]);

  const setGender = (g: TrackGender) => {
    write('track.gender', g);
    setGenderState(g);
  };
  const setYear = (y: number) => {
    write('track.year', String(y));
    setYearState(y);
  };
  const validYear = seasons?.some((s) => s.year === year) ? year : null;
  return { gender, setGender, year: validYear, setYear };
}

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-sm text-muted-foreground">{children}</p>;

export const TrackControls: React.FC<{
  seasons: TrackSeason[];
  selection: ReturnType<typeof useTrackSelection>;
  showGender?: boolean;
  showSeason?: boolean;
}> = ({ seasons, selection, showGender, showSeason }) => (
  <div className="flex flex-wrap items-center gap-2">
    {showGender &&
      GENDERS.map((g) => (
        <Button key={g.value} type="button" size="sm" variant={selection.gender === g.value ? 'default' : 'outline'} onClick={() => selection.setGender(g.value)}>
          {g.label}
        </Button>
      ))}
    {showSeason && (
      <select
        aria-label="Season"
        value={selection.year ?? ''}
        onChange={(e) => selection.setYear(Number(e.target.value))}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        {seasons.map((s) => (
          <option key={s.year} value={s.year}>
            {s.year} Outdoor
          </option>
        ))}
      </select>
    )}
  </div>
);

/**
 * The frame every track screen sits in. Screens that need results get
 * `children` as a function, called only once at least one season exists;
 * until then the screen says so and points at the import.
 */
export const TrackScreen: React.FC<{
  icon: LucideIcon;
  title: string;
  description: string;
  showGender?: boolean;
  showSeason?: boolean;
  children: (ctx: { seasons: TrackSeason[]; gender: TrackGender; year: number }) => React.ReactNode;
}> = ({ icon, title, description, showGender, showSeason, children }) => {
  const teamPath = useTeamPath();
  const { data: seasons, isLoading, isError } = useTrackSeasons();
  const selection = useTrackSelection(seasons);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <PageHeader section="neutral" icon={icon} title={title} description={description} />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError || !seasons ? (
        <Empty>Could not load Track & Field. Try again in a moment.</Empty>
      ) : seasons.length === 0 ? (
        <div className="space-y-3">
          <Empty>No track and field results yet. Import a season to get started.</Empty>
          <Button asChild>
            <Link to={teamPath('/track/import')}>Import results</Link>
          </Button>
        </div>
      ) : selection.year == null ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <TrackControls seasons={seasons} selection={selection} showGender={showGender} showSeason={showSeason} />
          {children({ seasons, gender: selection.gender, year: selection.year })}
        </>
      )}
    </div>
  );
};
