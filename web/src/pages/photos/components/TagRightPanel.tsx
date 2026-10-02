import React, { useState } from 'react';
import { EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import { searchAthletes } from '../lib/selectors';
import { canHidePhoto, canRemoveTag } from '../lib/tagRules';
import type { Athlete, Meet, Photo, PhotoAthleteTags } from '../state/types';

interface TagRightPanelProps {
  photos: Photo[];
  selectedPhotoId: string | null;
  tags: PhotoAthleteTags;
  athletes: Athlete[];
  meets: Meet[];
}

function initialsOf(athlete: Athlete | undefined): string {
  if (!athlete) return '?';
  return (athlete.preferredName || athlete.name).slice(0, 2).toUpperCase();
}

export const TagRightPanel: React.FC<TagRightPanelProps> = ({ photos, selectedPhotoId, tags, athletes, meets }) => {
  const { actor, tagPhoto, untagPhoto, hideSelected, setSelection } = usePhotosWorkspace();
  const [addQuery, setAddQuery] = useState('');
  const athletesById = new Map(athletes.map((a) => [a.id, a]));

  const photo = photos.find((p) => p.id === selectedPhotoId);
  if (!photo) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-ink-muted">
        Select a photo to see its tags.
      </div>
    );
  }

  const meet = meets.find((m) => m.id === photo.meetId);
  const entries = tags[photo.id] ?? [];
  const matches = addQuery ? searchAthletes(athletes, addQuery).slice(0, 5) : [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Tagged</div>
        <div className="flex flex-wrap gap-1.5">
          {entries.length === 0 && <span className="text-sm text-ink-muted">Nobody tagged yet</span>}
          {entries.map((entry) => {
            const athlete = athletesById.get(entry.athleteId);
            const removable = canRemoveTag(actor, entry);
            return (
              <span
                key={entry.athleteId}
                className="flex items-center gap-1 rounded-full bg-ink-border/50 px-2 py-1 text-xs text-ink-foreground"
              >
                {athlete?.preferredName || athlete?.name || 'Unknown'}
                {removable && (
                  <button
                    type="button"
                    onClick={() => untagPhoto(photo.id, entry.athleteId)}
                    aria-label={`Remove ${athlete?.name ?? 'athlete'}`}
                    className="opacity-70 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Add a tag</div>
        <input
          value={addQuery}
          onChange={(e) => setAddQuery(e.target.value)}
          placeholder="Type a name…"
          className="w-full rounded-md bg-ink-border/40 px-2 py-1.5 text-sm text-ink-foreground outline-none placeholder:text-ink-muted"
        />
        {matches.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {matches.map((athlete) => (
              <li key={athlete.id}>
                <button
                  type="button"
                  onClick={() => {
                    tagPhoto(photo.id, athlete.id);
                    setAddQuery('');
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-ink-border/40"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-border/60 text-[10px]">
                    {initialsOf(athlete)}
                  </span>
                  {athlete.preferredName || athlete.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1 text-sm text-ink-muted">
        <div>
          <span className="text-ink-foreground">{meet?.name ?? 'Unknown meet'}</span>
        </div>
        <div>
          {new Date(photo.takenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>

      {canHidePhoto(actor) && (
        <Button
          size="sm"
          variant="outline"
          className="mt-auto gap-1.5 border-ink-border text-ink-foreground hover:bg-ink-border/40"
          onClick={() => {
            setSelection([photo.id], photo.id);
            hideSelected();
          }}
        >
          <EyeOff className="h-3.5 w-3.5" /> Hide photo
        </Button>
      )}
    </div>
  );
};
