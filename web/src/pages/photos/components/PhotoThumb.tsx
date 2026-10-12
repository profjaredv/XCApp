import React from 'react';
import { Check, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Photo } from '../state/types';

export interface PhotoThumbTag {
  athleteId: string;
  initial: string;
}

// Fixed, not derived from `size` — every grid cell reserves this much
// height above the photo whether or not anyone's tagged yet, so adding or
// removing a tag never changes the image's own rendered size. h-4 (16px)
// matches the chip's own height, and comfortably fits even the smallest
// phone-clamped thumbnail (useVirtualizedGrid's 60px floor already leaves
// ~20px of slack between a thumb's photo height and its grid row).
const TAG_STRIP_HEIGHT = 16;

interface PhotoThumbProps {
  photo: Photo;
  size: number;
  selected: boolean;
  taggedWithArmed: boolean;
  pickedForArmed: boolean;
  tags: PhotoThumbTag[];
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
  tags,
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
        'group relative flex flex-col overflow-hidden rounded-md outline-offset-2 transition-shadow',
        selected ? 'ring-2 ring-accent' : 'ring-1 ring-ink-border/60 hover:ring-ink-border',
      )}
      style={{ width: size, height: size * 0.667 + TAG_STRIP_HEIGHT }}
    >
      {/* Tagged names live in their own strip above the photo, never
          overlaid on it — tagging several people in a row used to grow a
          pile of initials over the bottom-left corner of the image,
          making it hard to tell whether the last tap actually landed.
          Each chip is keyed by athleteId (not index) and animates in on
          mount, so a freshly-added tag visibly pops into place instead of
          just silently appearing. */}
      <div className="flex h-4 shrink-0 items-center gap-0.5 overflow-hidden px-0.5">
        {tags.slice(0, 4).map(({ athleteId, initial }) => (
          <span
            key={athleteId}
            className="flex h-4 min-w-4 animate-in items-center justify-center rounded bg-ink/80 px-0.5 text-[9px] font-medium text-ink-foreground fade-in zoom-in-50 duration-200"
          >
            {initial}
          </span>
        ))}
        {tags.length > 4 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded bg-ink/80 px-0.5 text-[9px] font-medium text-ink-foreground">
            +{tags.length - 4}
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
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
      </div>
    </button>
  );
});
