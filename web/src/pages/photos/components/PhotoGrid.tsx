import React, { useEffect, useRef } from 'react';
import { PhotoThumb } from './PhotoThumb';
import { useVirtualizedGrid } from '../hooks/useVirtualizedGrid';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import type { Athlete, Photo, PhotoAthleteTags } from '../state/types';

const GAP = 8;
// A real click/tap fires fast; waiting this long before acting on a plain
// click lets a following dblclick cancel it, so double-clicking a photo
// doesn't toggle its tag on and back off while also opening the loupe.
const CLICK_DEFER_MS = 220;
const LONG_PRESS_MS = 450;
const TOUCH_MOVE_CANCEL_PX = 10;

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

function labelFor(photo: Photo, taggedWithArmed: boolean, pickedForArmed: boolean, initials: string[]): string {
  const time = new Date(photo.takenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const parts = [`Photo taken ${time}`];
  if (initials.length > 0) parts.push(`tagged: ${initials.join(', ')}`);
  if (taggedWithArmed) parts.push('tagged with armed athlete');
  if (pickedForArmed) parts.push('picked for armed athlete');
  return parts.join(', ');
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
  const { containerRef, columns, itemSize, totalHeight, startIndex, endIndex, offsetY } = useVirtualizedGrid({
    itemCount: photos.length,
    thumbSize,
    gap: GAP,
  });
  const { setGridOrder } = usePhotosWorkspace();
  const dragAnchorRef = useRef<string | null>(null);
  const isDraggingRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; photoId: string } | null>(null);
  const clickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setGridOrder({ orderedIds: photos.map((p) => p.id), columns });
  }, [photos, columns, setGridOrder]);

  useEffect(() => {
    const onUp = () => {
      isDraggingRef.current = false;
      dragAnchorRef.current = null;
      touchStartRef.current = null;
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    };
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

  function runSingleClick(photo: Photo) {
    onSelectionChange([photo.id], photo.id);
    if (armedAthleteId) onToggleTagImmediate(photo.id);
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
    // Deferred so a following dblclick (see handleDoubleClick) can cancel
    // it — otherwise two clicks toggle the tag on then off while also
    // opening the loupe.
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      runSingleClick(photo);
    }, CLICK_DEFER_MS);
  }

  function handleDoubleClick(photo: Photo) {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onOpenLoupe(photo.id);
  }

  // Mouse: dragging across thumbnails range-selects immediately, matching
  // the spec's "drag across photos to select a range." Touch: the same
  // drag-select instead starts on a long-press, so a plain tap still just
  // taps (tags/selects one photo) and doesn't require a steady hold.
  function handlePointerDown(e: React.PointerEvent, photo: Photo) {
    if (e.pointerType === 'mouse') {
      isDraggingRef.current = true;
      dragAnchorRef.current = photo.id;
      return;
    }
    if (e.pointerType === 'touch') {
      touchStartRef.current = { x: e.clientX, y: e.clientY, photoId: photo.id };
      longPressTimerRef.current = window.setTimeout(() => {
        isDraggingRef.current = true;
        dragAnchorRef.current = photo.id;
        onSelectionChange([photo.id], photo.id);
        longPressTimerRef.current = null;
      }, LONG_PRESS_MS);
    }
  }

  function handlePointerMoveOnThumb(photo: Photo) {
    if (isDraggingRef.current && dragAnchorRef.current) {
      onSelectionChange(rangeBetween(dragAnchorRef.current, photo.id), dragAnchorRef.current);
    }
  }

  function handleContainerPointerMove(e: React.PointerEvent) {
    if (touchStartRef.current && longPressTimerRef.current && !isDraggingRef.current) {
      const dx = e.clientX - touchStartRef.current.x;
      const dy = e.clientY - touchStartRef.current.y;
      if (Math.hypot(dx, dy) > TOUCH_MOVE_CANCEL_PX) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }
    if (!isDraggingRef.current || e.pointerType !== 'touch') return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const photoId = (el?.closest('[data-photo-id]') as HTMLElement | null)?.dataset.photoId;
    if (photoId && dragAnchorRef.current) {
      onSelectionChange(rangeBetween(dragAnchorRef.current, photoId), dragAnchorRef.current);
    }
  }

  const visible = photos.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-y-auto"
      data-testid="photo-grid"
      onPointerMove={handleContainerPointerMove}
    >
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
            gridAutoRows: itemSize,
            justifyContent: 'start',
          }}
        >
          {visible.map((photo) => {
            const entries = tags[photo.id] ?? [];
            const initials = entries.map((t) => initialsOf(athletesById.get(t.athleteId)));
            const taggedWithArmed = Boolean(armedAthleteId) && entries.some((t) => t.athleteId === armedAthleteId);
            const pickedForArmed = pickedSet.has(photo.id);
            return (
              <div
                key={photo.id}
                data-photo-id={photo.id}
                onPointerDown={(e) => handlePointerDown(e, photo)}
                onPointerMove={() => handlePointerMoveOnThumb(photo)}
                onMouseEnter={() => handlePointerMoveOnThumb(photo)}
              >
                <PhotoThumb
                  photo={photo}
                  size={itemSize}
                  selected={selectedSet.has(photo.id)}
                  taggedWithArmed={taggedWithArmed}
                  pickedForArmed={pickedForArmed}
                  initials={initials}
                  label={labelFor(photo, taggedWithArmed, pickedForArmed, initials)}
                  onClick={(e) => handleClick(e, photo)}
                  onDoubleClick={() => handleDoubleClick(photo)}
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
