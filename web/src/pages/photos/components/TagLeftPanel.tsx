import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { searchAthletes, tagCountForAthlete } from '../lib/selectors';
import { TimeWindowJump } from './TimeWindowJump';
import type { Athlete, Meet, Photo, PhotoAthleteTags } from '../state/types';
import type { TagFilter } from '../state/reducer';

interface TagLeftPanelProps {
  meets: Meet[];
  photos: Photo[];
  tags: PhotoAthleteTags;
  athletes: Athlete[];
}

function meetCounts(meetId: string, photos: Photo[], tags: PhotoAthleteTags) {
  const ready = photos.filter((p) => p.meetId === meetId && p.status === 'ready');
  const tagged = ready.filter((p) => (tags[p.id] ?? []).length > 0).length;
  return { total: ready.length, tagged, untagged: ready.length - tagged };
}

export const TagLeftPanel: React.FC<TagLeftPanelProps> = ({ meets, photos, tags, athletes }) => {
  const { state, actor, setMeetFilter, setTagFilter, setSearch, armAthlete } = usePhotosWorkspace();
  const [query, setQuery] = useState('');

  const SAVED_FILTERS: { key: TagFilter; label: string }[] = [
    { key: 'untagged', label: 'Untagged' },
    { key: 'mine', label: 'Mine' },
  ];

  if (!actor.isCoach) {
    // Families skip the roster and arming entirely — see the Tag module
    // description's "families skip arming" note. A guardian of more than
    // one athlete still gets to switch who they're tagging for.
    const own = athletes.filter((a) => actor.linkedAthleteIds.includes(a.id));
    const currentMeet = meets.find((m) => m.id === state.meetFilter) ?? meets[meets.length - 1];
    return (
      <div className="flex h-full flex-col gap-4 p-3">
        <div>
          <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Your athletes</div>
          <ul className="space-y-0.5">
            {own.map((athlete) => (
              <li key={athlete.id}>
                <button
                  type="button"
                  onClick={() => armAthlete(athlete.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                    state.armedAthleteId === athlete.id ? 'bg-accent text-accent-foreground' : 'hover:bg-ink-border/40',
                  )}
                >
                  <span>{athlete.preferredName || athlete.name}</span>
                  <span className="text-xs opacity-70">{tagCountForAthlete(athlete.id, tags)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Meet</div>
          <select
            value={state.meetFilter ?? currentMeet?.id ?? ''}
            onChange={(e) => setMeetFilter(e.target.value || null)}
            className="w-full rounded-md bg-ink-border/40 px-2 py-1.5 text-sm text-ink-foreground"
          >
            {meets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <TimeWindowJump meet={currentMeet} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <div>
        <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Meets</div>
        <ul className="space-y-0.5">
          <li>
            <button
              type="button"
              onClick={() => setMeetFilter(null)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                state.meetFilter === null ? 'bg-accent text-accent-foreground' : 'hover:bg-ink-border/40',
              )}
            >
              All meets
            </button>
          </li>
          {meets.map((meet) => {
            const counts = meetCounts(meet.id, photos, tags);
            return (
              <li key={meet.id}>
                <button
                  type="button"
                  onClick={() => setMeetFilter(meet.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                    state.meetFilter === meet.id ? 'bg-accent text-accent-foreground' : 'hover:bg-ink-border/40',
                  )}
                >
                  <span className="truncate">{meet.name}</span>
                  <span className="shrink-0 text-xs opacity-70">
                    {counts.tagged}/{counts.total}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {state.meetFilter && <TimeWindowJump meet={meets.find((m) => m.id === state.meetFilter)} />}

      <div>
        <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Saved filters</div>
        <div className="flex flex-wrap gap-1.5 px-1">
          <button
            type="button"
            onClick={() => setTagFilter('all')}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs',
              state.tagFilter === 'all' ? 'bg-accent text-accent-foreground' : 'bg-ink-border/40 hover:bg-ink-border/60',
            )}
          >
            All
          </button>
          {SAVED_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setTagFilter(f.key)}
              disabled={f.key === 'mine' && !state.armedAthleteId}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs disabled:opacity-40',
                state.tagFilter === f.key ? 'bg-accent text-accent-foreground' : 'bg-ink-border/40 hover:bg-ink-border/60',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 flex items-center gap-1.5 px-1">
          <Search className="h-3.5 w-3.5 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearch(e.target.value);
            }}
            placeholder="Search roster"
            className="w-full bg-transparent text-xs text-ink-foreground outline-none placeholder:text-ink-muted"
          />
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {searchAthletes(athletes, query).map((athlete) => (
            <li key={athlete.id}>
              <button
                type="button"
                onClick={() => armAthlete(athlete.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                  state.armedAthleteId === athlete.id ? 'bg-accent text-accent-foreground' : 'hover:bg-ink-border/40',
                  athlete.photosOptOut && 'opacity-50',
                )}
                title={athlete.photosOptOut ? 'Opted out of photos' : undefined}
              >
                <span className="truncate">{athlete.preferredName || athlete.name}</span>
                <span className="shrink-0 text-xs opacity-70">{tagCountForAthlete(athlete.id, tags)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
