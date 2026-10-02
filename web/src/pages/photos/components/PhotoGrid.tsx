import React, { useEffect, useRef } from 'react';
import { PhotoThumb } from './PhotoThumb';
import { useVirtualizedGrid } from '../hooks/useVirtualizedGrid';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import type { Athlete, Photo, PhotoAthleteTags } from '../state/types';

const GAP = 8;

interface PhotoGridProps {
  photos: Photo[];
  tags: PhotoAthleteTags;
  athletesById: Map<string, Athlete>;
  selectedIds: string[];
  anchorId: string | null;
  armedAthleteId: string | null;
  picks: string[] | undefined;
  thumbSize: number;
  onSelectionChange: (ids: string[], anchorId: string | null) => void;
  onToggleTagImmediate: (photoId: string) => void;
  onOpenLoupe: (photoId: string) => void;
}

function initialsOf(athlete: Athlete | undefined): string {
  if (!athlete) return '?';
  const parts = (athlete.preferredName || athlete.name).split(' ');
  return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0].slice(0, 2);
}

export const PhotoGrid: React.FC<PhotoGridProps> = ({
  photos,
  tags,
  athletesById,
  selectedIds,
  anchorId,
  armedAthleteId,
  picks,
  thumbSize,
  onSelectionChange,
  onToggleTagImmediate,
  onOpenLoupe,
}) => {
  const { containerRef, columns, itemSize, rowHeight, totalHeight, startIndex, endIndex, offsetY } = useVirtualizedGrid({
    itemCount: photos.length,
    thumbSize,
    gap: GAP,
  });
  const { setGridOrder } = usePhotosWorkspace();
  const dragAnchorRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    setGridOrder({ orderedIds: photos.map((p) => p.id), columns });
  }, [photos, columns, setGridOrder]);

  useEffect(() => {
    const onUp = () => {
      isDraggingRef.current = false;
      dragAnchorRef.current = null;
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  const selectedSet = new Set(selectedIds);
  const pickedSet = new Set(picks ?? []);

  function rangeBetween(fromId: string, toId: string): string[] {
    const fromIdx = photos.findIndex((p) => p.id === fromId);
    const toIdx = photos.findIndex((p) => p.id === toId);
    if (fromIdx === -1 || toIdx === -1) return [toId];
    const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    return photos.slice(lo, hi + 1).map((p) => p.id);
  }

  function handleClick(e: React.MouseEvent, photo: Photo) {
    if (e.shiftKey && anchorId) {
      onSelectionChange(rangeBetween(anchorId, photo.id), anchorId);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      const next = selectedSet.has(photo.id) ? selectedIds.filter((id) => id !== photo.id) : [...selectedIds, photo.id];
      onSelectionChange(next, photo.id);
      return;
    }
    onSelectionChange([photo.id], photo.id);
    if (armedAthleteId) onToggleTagImmediate(photo.id);
  }

  function handleMouseDown(photo: Photo) {
    isDraggingRef.current = true;
    dragAnchorRef.current = photo.id;
  }

  function handleMouseEnter(photo: Photo) {
    if (!isDraggingRef.current || !dragAnchorRef.current) return;
    onSelectionChange(rangeBetween(dragAnchorRef.current, photo.id), dragAnchorRef.current);
  }

  const visible = photos.slice(startIndex, endIndex);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-y-auto" data-testid="photo-grid">
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, ${itemSize}px)`,
            gap: GAP,
            gridAutoRows: rowHeight,
            justifyContent: 'start',
          }}
        >
          {visible.map((photo) => {
            const entries = tags[photo.id] ?? [];
            const initials = entries.map((t) => initialsOf(athletesById.get(t.athleteId)));
            return (
              <div key={photo.id} onMouseDown={() => handleMouseDown(photo)} onMouseEnter={() => handleMouseEnter(photo)}>
                <PhotoThumb
                  photo={photo}
                  size={itemSize}
                  selected={selectedSet.has(photo.id)}
                  taggedWithArmed={Boolean(armedAthleteId) && entries.some((t) => t.athleteId === armedAthleteId)}
                  pickedForArmed={pickedSet.has(photo.id)}
                  initials={initials}
                  onClick={(e) => handleClick(e, photo)}
                  onDoubleClick={() => onOpenLoupe(photo.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
      {photos.length === 0 && (
        <div className="flex h-40 items-center justify-center text-sm text-ink-muted">No photos match this view.</div>
      )}
    </div>
  );
};
