import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { placeholderThumbUrl } from '../data/placeholderPhoto';
import type { Photo } from '../state/types';

interface FilmStripProps {
  photos: Photo[];
  selectedId: string | null;
  onSelect: (photoId: string) => void;
}

const MAX_RENDERED = 400;

// Not virtualized: capped to one meet's worth of photos (callers pass a
// meet-scoped slice), which never approaches the count the main grid
// needs windowing for.
export const FilmStrip: React.FC<FilmStripProps> = ({ photos, selectedId, onSelect }) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const shown = photos.slice(0, MAX_RENDERED);

  useEffect(() => {
    if (!selectedId) return;
    const el = stripRef.current?.querySelector(`[data-photo-id="${selectedId}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [selectedId]);

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
          <img src={placeholderThumbUrl(photo.seed, 64, 48)} alt="" className="h-full w-full object-cover" draggable={false} />
        </button>
      ))}
      {photos.length > MAX_RENDERED && (
        <span className="shrink-0 px-2 text-xs text-ink-muted">+{photos.length - MAX_RENDERED} more</span>
      )}
    </div>
  );
};
