import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { searchAthletes } from '../lib/selectors';
import type { Athlete, AthletePicks } from '../state/types';

interface BuildLeftPanelProps {
  athletes: Athlete[];
  picks: AthletePicks;
}

function PickDots({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < count ? 'bg-accent' : 'bg-ink-border')} />
      ))}
    </div>
  );
}

export const BuildLeftPanel: React.FC<BuildLeftPanelProps> = ({ athletes, picks }) => {
  const { state, actor, setBuildAthlete } = usePhotosWorkspace();
  const [query, setQuery] = useState('');

  if (!actor.isCoach) {
    // Families land straight on their own athlete — no roster to browse.
    const own = athletes.filter((a) => actor.linkedAthleteIds.includes(a.id));
    return (
      <ul className="space-y-0.5 p-3">
        {own.map((athlete) => (
          <li key={athlete.id}>
            <button
              type="button"
              onClick={() => setBuildAthlete(athlete.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                state.buildAthleteId === athlete.id ? 'bg-accent text-accent-foreground' : 'hover:bg-ink-border/40',
              )}
            >
              <span>{athlete.preferredName || athlete.name}</span>
              <PickDots count={picks[athlete.id]?.length ?? 0} />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center gap-1.5 px-1">
        <Search className="h-3.5 w-3.5 text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search roster"
          className="w-full bg-transparent text-xs text-ink-foreground outline-none placeholder:text-ink-muted"
        />
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {searchAthletes(athletes, query).map((athlete) => {
          const count = picks[athlete.id]?.length ?? 0;
          return (
            <li key={athlete.id}>
              <button
                type="button"
                onClick={() => setBuildAthlete(athlete.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                  state.buildAthleteId === athlete.id ? 'bg-accent text-accent-foreground' : 'hover:bg-ink-border/40',
                  count < 3 && 'text-ink-muted',
                )}
              >
                <span className="truncate">{athlete.preferredName || athlete.name}</span>
                <PickDots count={count} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
