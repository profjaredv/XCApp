import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { Photo } from '../state/types';

interface FilmStripProps {
  photos: Photo[];
  /** True once the caller has actually scoped `photos` to one meet. */
  scoped: boolean;
  selectedId: string | null;
  onSelect: (photoId: string) => void;
}

const MAX_RENDERED = 400;

// Not virtualized: the caller is required to pass a meet-scoped list (a
// season tops out around 300 photos per meet, well under MAX_RENDERED),
// never "All meets" — that's the ~2000-photo case the main grid's
// virtualizer exists for, and this component doesn't window.
export const FilmStrip: React.FC<FilmStripProps> = ({ photos, scoped, selectedId, onSelect }) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const shown = photos.slice(0, MAX_RENDERED);

  useEffect(() => {
    if (!selectedId) return;
    const el = stripRef.current?.querySelector(`[data-photo-id="${selectedId}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [selectedId]);

  if (!scoped) {
    return <div className="flex h-full items-center px-3 text-xs text-ink-muted">Select a meet to see its filmstrip.</div>;
  }

  if (photos.length === 0) {
    return <div className="flex h-full items-center px-3 text-xs text-ink-muted">No photos in this view.</div>;
  }

  return (
    <div ref={stripRef} className="flex h-full items-center gap-1.5 overflow-x-auto px-3">
      {shown.map((photo) => (
        <button
          key={photo.id}
          type="button"
          data-photo-id={photo.id}
          onClick={() => onSelect(photo.id)}
          className={cn(
            'h-12 w-16 shrink-0 overflow-hidden rounded ring-1 ring-ink-border/60',
            selectedId === photo.id && 'ring-2 ring-accent',
          )}
        >
          <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" draggable={false} loading="lazy" />
        </button>
      ))}
      {photos.length > MAX_RENDERED && (
        <span className="shrink-0 px-2 text-xs text-ink-muted">+{photos.length - MAX_RENDERED} more</span>
      )}
    </div>
  );
};
