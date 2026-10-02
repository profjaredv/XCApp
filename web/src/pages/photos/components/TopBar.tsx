import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Redo2, Undo2, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import type { Module } from '../state/types';

const MODULES: { key: Module; label: string }[] = [
  { key: 'load', label: 'Load' },
  { key: 'tag', label: 'Tag' },
  { key: 'build', label: 'Build' },
];

export const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const { state, actor, setModule, armAthlete, undo, redo, setPreviewRole } = usePhotosWorkspace();
  const armedAthlete = state.athletes.find((a) => a.id === state.armedAthleteId);

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-ink-border px-3">
      <span className="text-sm font-semibold text-ink-foreground">LeadPack Photos</span>

      <div className="hidden items-center gap-1 rounded-full bg-ink-border/40 p-0.5 md:flex">
        {MODULES.filter((m) => m.key !== 'load' || actor.isCoach).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setModule(m.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              state.module === m.key ? 'bg-accent text-accent-foreground' : 'text-ink-muted hover:text-ink-foreground',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {actor.isCoach && armedAthlete && (
        <button
          type="button"
          onClick={() => armAthlete(null)}
          className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground"
          title="Press T to arm a different athlete, or click to clear"
        >
          <User className="h-3 w-3" />
          {armedAthlete.preferredName || armedAthlete.name}
        </button>
      )}
      {actor.isCoach && !armedAthlete && (
        <span className="hidden text-xs text-ink-muted sm:inline">Press T to arm an athlete</span>
      )}

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={undo}
          disabled={state.past.length === 0}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-ink-border/40 hover:text-ink-foreground disabled:opacity-30"
          aria-label="Undo"
          title="Undo (Ctrl/Cmd+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={state.future.length === 0}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-ink-border/40 hover:text-ink-foreground disabled:opacity-30"
          aria-label="Redo"
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {/* Dev-only: Phase 1 has no real guardian/role wiring yet, so this
          stands in for "sign in as a coach" vs. "sign in as a family" —
          see the comment on DEV_FAMILY_LINKED_ATHLETE_IDS. Gated on the
          build mode itself (not just "not linked from nav"), so it can't
          be exercised by a production user even if the route it lives on
          is ever reached — e.g. before Phase 2's real feature flag lands. */}
      {import.meta.env.DEV && (
        <select
          value={state.previewRole}
          onChange={(e) => setPreviewRole(e.target.value as 'coach' | 'family')}
          className="rounded-md border border-ink-border bg-transparent px-1.5 py-1 text-[11px] text-ink-muted"
          title="Preview as (dev only)"
        >
          <option value="coach">Preview: Coach</option>
          <option value="family">Preview: Family</option>
        </select>
      )}

      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-ink-border/40 hover:text-ink-foreground"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
