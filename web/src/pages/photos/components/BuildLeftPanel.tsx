import React, { useState } from 'react';
import { Layers, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { filterByGroup, searchAthletes } from '../lib/selectors';
import { canBrowseFullRoster } from '../lib/tagRules';
import { GroupFilterSelect } from './GroupFilterSelect';
import { REQUIRED_PICKS } from '../lib/templates';
import type { Athlete, AthletePicks, Photo } from '../state/types';
import type { CollageSettings } from '../../../api/photosService';
import { CollageSettingsPanel } from './CollageSettingsPanel';

interface BuildLeftPanelProps {
  athletes: Athlete[];
  picks: AthletePicks;
  // "Generate all" (build spec: Admin extras / Collage generation) — given
  // the roster this panel is currently showing (post group-filter), the
  // caller (BuildModule.tsx, which owns the hidden export canvas) renders
  // and zips one collage per eligible athlete. This panel only decides
  // *which* athletes that means; BuildModule decides eligibility (opt-out,
  // pick count) and does the actual rendering.
  onGenerateAll: (candidates: Athlete[]) => void;
  generatingAll: boolean;
  // Build settings (accent/logo/team photo) — set once for the whole team,
  // not per athlete, so this lives up here rather than in the per-athlete
  // right panel. photosById backs the team-photo picker inside the panel.
  photosById: Map<string, Photo>;
  collageSettings: CollageSettings | null;
  onCollageSettingsChange: (settings: CollageSettings) => void;
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

export const BuildLeftPanel: React.FC<BuildLeftPanelProps> = ({
  athletes,
  picks,
  onGenerateAll,
  generatingAll,
  photosById,
  collageSettings,
  onCollageSettingsChange,
}) => {
  const { state, actor, setBuildAthlete, setGroupFilter } = usePhotosWorkspace();
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!canBrowseFullRoster(actor)) {
    // Families land straight on their own athlete — no roster to browse.
    // A Photos Admin falls through to the full roster view below instead
    // (same Build authority as a coach, minus the settings gear button).
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

  const groupFilteredAthletes = filterByGroup(athletes, state.groupFilter);

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <GroupFilterSelect groups={state.groups} value={state.groupFilter} onChange={setGroupFilter} />
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onGenerateAll(groupFilteredAthletes)}
          disabled={generatingAll}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-ink-border/40 px-2 py-1.5 text-xs text-ink-foreground hover:bg-ink-border/60 disabled:opacity-50"
          title={state.groupFilter ? 'Generate a collage for every eligible athlete in this group' : 'Generate a collage for every eligible athlete on the roster'}
        >
          <Layers className="h-3.5 w-3.5" /> {generatingAll ? 'Generating…' : 'Generate all (ZIP)'}
        </button>
        {actor.isCoach && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center justify-center rounded-md bg-ink-border/40 px-2 py-1.5 text-ink-foreground hover:bg-ink-border/60"
            title="Collage settings — accent color, logo, team photo"
            aria-label="Collage settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {actor.isCoach && (
        <CollageSettingsPanel
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          photosById={photosById}
          settings={collageSettings}
          onSettingsChange={onCollageSettingsChange}
        />
      )}
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
        {searchAthletes(groupFilteredAthletes, query).map((athlete) => {
          const count = picks[athlete.id]?.length ?? 0;
          return (
            <li key={athlete.id}>
              <button
                type="button"
                onClick={() => setBuildAthlete(athlete.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                  state.buildAthleteId === athlete.id ? 'bg-accent text-accent-foreground' : 'hover:bg-ink-border/40',
                  count < REQUIRED_PICKS && 'text-ink-muted',
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
