import React from 'react';
import { Check, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Photo } from '../state/types';

interface PhotoThumbProps {
  photo: Photo;
  size: number;
  selected: boolean;
  taggedWithArmed: boolean;
  pickedForArmed: boolean;
  initials: string[];
  /** Capture time plus tag/pick state — the thumbnail's only accessible name. */
  label: string;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
}

export const PhotoThumb: React.FC<PhotoThumbProps> = React.memo(function PhotoThumb({
  photo,
  size,
  selected,
  taggedWithArmed,
  pickedForArmed,
  initials,
  label,
  onClick,
  onDoubleClick,
}) {
  return (
    <button
      type="button"
      data-photo-id={photo.id}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        'group relative overflow-hidden rounded-md outline-offset-2 transition-shadow',
        selected ? 'ring-2 ring-accent' : 'ring-1 ring-ink-border/60 hover:ring-ink-border',
      )}
      style={{ width: size, height: size * 0.667 }}
    >
      <img
        src={photo.thumbUrl}
        alt=""
        draggable={false}
        loading="lazy"
        className="h-full w-full select-none object-cover"
      />

      {taggedWithArmed && (
        <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      )}
      {pickedForArmed && (
        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Star className="h-3 w-3" strokeWidth={2.5} fill="currentColor" />
        </span>
      )}

      {initials.length > 0 && (
        <div className="absolute bottom-1 left-1 flex gap-0.5">
          {initials.slice(0, 4).map((initial, i) => (
            <span
              key={i}
              className="flex h-4 min-w-4 items-center justify-center rounded bg-ink/80 px-0.5 text-[9px] font-medium text-ink-foreground"
            >
              {initial}
            </span>
          ))}
          {initials.length > 4 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded bg-ink/80 px-0.5 text-[9px] font-medium text-ink-foreground">
              +{initials.length - 4}
            </span>
          )}
        </div>
      )}
    </button>
  );
});
