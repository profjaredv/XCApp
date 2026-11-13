import React, { useEffect, useRef, useState } from 'react';
import { renderCollage, renderCollageBack, type CollageHeaderText, type FocalPoint } from '../lib/collageRender';
import { hitTestSlot, nextFocalPoint, nextZoom } from '../lib/focalDrag';
import type { AthleteBuildStats, Photo } from '../state/types';

interface CollagePreviewProps {
  photos: (Photo | undefined)[];
  header: CollageHeaderText;
  // null while stats are still loading, or for an athlete with no race
  // results yet — renderCollage degrades gracefully, drawing nothing for
  // the stat strip/results block rather than failing.
  stats?: AthleteBuildStats | null;
  // Aligned 1:1 with `photos` — undefined means the default centered crop.
  focalPoints?: (FocalPoint | undefined)[];
  // Fires with the slot's index into `photos`/`focalPoints` and its new
  // focal point (position and/or zoom) — modules/BuildModule.tsx maps
  // that back to the actual photo + athlete to persist. Dragging and
  // wheel-zooming are both handled entirely locally (see dragRef/
  // liveOverride below) so every pointermove/wheel tick doesn't round-trip
  // through the parent's state; this only fires on drag release, and on a
  // short pause after the last wheel-zoom tick.
  onFocalChange?: (index: number, focal: FocalPoint) => void;
  scale?: number;
  // Which side of the printed sheet this canvas currently shows — see
  // modules/BuildModule.tsx's Front/Back toggle. 'front' (the default) is
  // the existing photo page; 'back' is the new stats-only page
  // (renderCollageBack), which has no photo slots so focal-point dragging
  // is disabled for it below.
  side?: 'front' | 'back';
  // The team's shared group photo (lib/photosAccess.js's setGroupPhoto),
  // drawn full-bleed at the bottom of the back page — null until a coach
  // sets one. Unused when side is 'front'.
  groupPhotoUrl?: string | null;
  // Build settings (components/CollageSettingsPanel.tsx) — a team's own
  // accent color/logo, independent of the app's own theme. Undefined/null
  // uses the collage's own built-in defaults.
  accent?: string;
  logoUrl?: string | null;
}

// US letter at 300dpi is 2550x3300 — the preview renders at 1/3 that
// (850x1100) on a <canvas>, same template/draw code the full-res export
// uses, so what's on screen is exactly what gets exported.
const PAGE_W = 850;
const PAGE_H = 1100;

// How long to wait after the last wheel-zoom tick before actually saving —
// a coach scrolling to zoom fires many wheel events in quick succession,
// and persisting on every one of them would hammer the server for no
// benefit (only the final zoom level matters).
const ZOOM_COMMIT_DEBOUNCE_MS = 400;

interface DragState {
  pointerId: number;
  index: number;
  startClientX: number;
  startClientY: number;
  startFocal: FocalPoint;
  overflowX: number;
  overflowY: number;
}

export const CollagePreview = React.forwardRef<HTMLCanvasElement, CollagePreviewProps>(
  ({ photos, header, stats = null, focalPoints = [], onFocalChange, side = 'front', groupPhotoUrl = null, accent, logoUrl = null }, ref) => {
    const innerRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = (ref as React.RefObject<HTMLCanvasElement>) ?? innerRef;
    const dragRef = useRef<DragState | null>(null);
    const rafRef = useRef<number | null>(null);
    const zoomCommitTimerRef = useRef<number | null>(null);
    // Overrides one slot's committed focal point (position and/or zoom)
    // while a drag or a wheel-zoom gesture is live, so every pointermove/
    // wheel tick redraws without waiting on the parent's state (and
    // without persisting anything until the gesture actually settles).
    const [liveOverride, setLiveOverride] = useState<{ index: number; focal: FocalPoint } | null>(null);

    const effectiveFocalPoints =
      liveOverride != null ? focalPoints.map((f, i) => (i === liveOverride.index ? liveOverride.focal : f)) : focalPoints;

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (side === 'back') {
        // Preview only, same as the front page's own photo loading below
        // — a plain (non-crossOrigin) URL, so this never needs the
        // export's same-origin blob fetch.
        renderCollageBack(canvas, PAGE_W, PAGE_H, header, stats, groupPhotoUrl, false, accent, logoUrl).catch((error) =>
          console.error('Collage back page failed to render:', error),
        );
        return;
      }
      const urls = photos.map((p) => p?.webUrl ?? '');
      // Preview only — never the export canvas, so this doesn't need (and
      // must not request) crossOrigin-loaded images; see collageRender.ts's
      // own comment on why that matters. Logged, not thrown: a blank slot
      // here is already visible as the gray placeholder box.
      renderCollage(canvas, PAGE_W, PAGE_H, urls, header, false, stats, effectiveFocalPoints, accent, logoUrl).catch((error) =>
        console.error('Collage preview failed to render:', error),
      );
      // effectiveFocalPoints is a fresh array each render by design (it
      // folds in the live drag/zoom override), so it's compared by its
      // actual entries here rather than by reference.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasRef, side, photos, header, stats, groupPhotoUrl, accent, logoUrl, JSON.stringify(effectiveFocalPoints)]);

    function canvasPoint(clientX: number, clientY: number): { x: number; y: number } {
      const rect = canvasRef.current!.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * PAGE_W,
        y: ((clientY - rect.top) / rect.height) * PAGE_H,
      };
    }

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      // The back page has no photo slots to drag — nothing to hit-test.
      if (side === 'back') return;
      const point = canvasPoint(e.clientX, e.clientY);
      const hit = hitTestSlot(
        PAGE_W,
        PAGE_H,
        point.x,
        point.y,
        photos.map((p) => p && { width: p.width, height: p.height }),
        focalPoints.map((f) => f?.zoom),
      );
      if (!hit) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        index: hit.index,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startFocal: focalPoints[hit.index] ?? { x: 0.5, y: 0.5 },
        overflowX: hit.overflowX,
        overflowY: hit.overflowY,
      };
    }

    function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const scaleX = PAGE_W / rect.width;
      const scaleY = PAGE_H / rect.height;
      const dxPx = (e.clientX - drag.startClientX) * scaleX;
      const dyPx = (e.clientY - drag.startClientY) * scaleY;
      // Panning never touches zoom — carry the slot's own zoom through
      // unchanged, rather than letting the pan override implicitly reset
      // it to the default.
      const panned = nextFocalPoint(drag.startFocal, dxPx, dyPx, drag.overflowX, drag.overflowY);
      const focal: FocalPoint = { ...panned, zoom: drag.startFocal.zoom };
      if (rafRef.current != null) return; // coalesce to at most one redraw per frame
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setLiveOverride({ index: drag.index, focal });
      });
    }

    function endDrag(e: React.PointerEvent<HTMLCanvasElement>) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const finalFocal = liveOverride?.index === drag.index ? liveOverride.focal : drag.startFocal;
      setLiveOverride(null);
      onFocalChange?.(drag.index, finalFocal);
    }

    // Scroll/pinch to zoom a photo tighter within its slot — "in case it
    // needs to be a little tighter" than the default cover-fit. Kept as a
    // plain DOM listener (not JSX onWheel) so preventDefault actually
    // stops the page from scrolling while zooming a photo; React 17+
    // attaches its own onWheel delegate as passive, which can't call
    // preventDefault at all. handleWheelRef always points at the latest
    // closure so this effect never needs to re-attach the listener.
    const handleWheelRef = useRef<(e: WheelEvent) => void>(() => {});
    handleWheelRef.current = (e: WheelEvent) => {
      if (side === 'back' || !canvasRef.current) return;
      const point = canvasPoint(e.clientX, e.clientY);
      const hit = hitTestSlot(
        PAGE_W,
        PAGE_H,
        point.x,
        point.y,
        photos.map((p) => p && { width: p.width, height: p.height }),
        focalPoints.map((f) => f?.zoom),
      );
      if (!hit) return;
      e.preventDefault();
      const current = (liveOverride?.index === hit.index ? liveOverride.focal : focalPoints[hit.index]) ?? { x: 0.5, y: 0.5 };
      const focal: FocalPoint = { ...current, zoom: nextZoom(current.zoom ?? 1, e.deltaY) };
      setLiveOverride({ index: hit.index, focal });

      if (zoomCommitTimerRef.current != null) window.clearTimeout(zoomCommitTimerRef.current);
      zoomCommitTimerRef.current = window.setTimeout(() => {
        zoomCommitTimerRef.current = null;
        onFocalChange?.(hit.index, focal);
      }, ZOOM_COMMIT_DEBOUNCE_MS);
    };

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const handler = (e: WheelEvent) => handleWheelRef.current(e);
      canvas.addEventListener('wheel', handler, { passive: false });
      return () => canvas.removeEventListener('wheel', handler);
    }, [canvasRef]);

    useEffect(
      () => () => {
        if (zoomCommitTimerRef.current != null) window.clearTimeout(zoomCommitTimerRef.current);
      },
      [],
    );

    // Double-click a photo to reset it back to the default (unzoomed)
    // crop — the one discoverable way to undo a zoom without scrolling
    // precisely back to 1.
    function handleDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
      if (side === 'back') return;
      const point = canvasPoint(e.clientX, e.clientY);
      const hit = hitTestSlot(
        PAGE_W,
        PAGE_H,
        point.x,
        point.y,
        photos.map((p) => p && { width: p.width, height: p.height }),
        focalPoints.map((f) => f?.zoom),
      );
      if (!hit) return;
      const current = focalPoints[hit.index];
      if (!current?.zoom || current.zoom === 1) return;
      const focal: FocalPoint = { x: current.x, y: current.y, zoom: 1 };
      setLiveOverride(null);
      onFocalChange?.(hit.index, focal);
    }

    return (
      <canvas
        ref={canvasRef}
        width={PAGE_W}
        height={PAGE_H}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={handleDoubleClick}
        className={`h-auto max-h-full w-auto touch-none rounded-sm shadow-2xl ${
          side === 'front' ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
        title={side === 'front' ? 'Drag to reposition, scroll to zoom, double-click to reset zoom' : undefined}
      />
    );
  },
);
CollagePreview.displayName = 'CollagePreview';
