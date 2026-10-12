import React, { useEffect, useRef, useState } from 'react';
import { renderCollage, type CollageHeaderText, type FocalPoint } from '../lib/collageRender';
import { templateFor } from '../lib/templates';
import { hitTestSlot, nextFocalPoint } from '../lib/focalDrag';
import type { AthleteBuildStats, Photo, TemplateSize } from '../state/types';

interface CollagePreviewProps {
  templateSize: TemplateSize;
  photos: (Photo | undefined)[];
  header: CollageHeaderText;
  // null while stats are still loading, or for an athlete with no race
  // results yet — renderCollage degrades gracefully, drawing nothing for
  // the stat strip/results block rather than failing.
  stats?: AthleteBuildStats | null;
  // Aligned 1:1 with `photos` — undefined means the default centered crop.
  focalPoints?: (FocalPoint | undefined)[];
  // Fires once, on drag release, with the slot's index into
  // `photos`/`focalPoints` — modules/BuildModule.tsx maps that back to the
  // actual photo + athlete to persist. Dragging itself is handled entirely
  // locally (see dragRef below) so every pointermove doesn't round-trip
  // through the parent's state.
  onFocalChange?: (index: number, focal: FocalPoint) => void;
  scale?: number;
}

// US letter at 300dpi is 2550x3300 — the preview renders at 1/3 that
// (850x1100) on a <canvas>, same template/draw code the full-res export
// uses, so what's on screen is exactly what gets exported.
const PAGE_W = 850;
const PAGE_H = 1100;

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
  ({ templateSize, photos, header, stats = null, focalPoints = [], onFocalChange }, ref) => {
    const innerRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = (ref as React.RefObject<HTMLCanvasElement>) ?? innerRef;
    const dragRef = useRef<DragState | null>(null);
    const rafRef = useRef<number | null>(null);
    // Overrides one slot's committed focal point while a drag is live, so
    // every pointermove redraws without waiting on the parent's state
    // (and without persisting anything until the drag actually ends).
    const [liveFocal, setLiveFocal] = useState<{ index: number; focal: FocalPoint } | null>(null);

    const effectiveFocalPoints =
      liveFocal != null ? focalPoints.map((f, i) => (i === liveFocal.index ? liveFocal.focal : f)) : focalPoints;

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const urls = photos.map((p) => p?.webUrl ?? '');
      // Preview only — never the export canvas, so this doesn't need (and
      // must not request) crossOrigin-loaded images; see collageRender.ts's
      // own comment on why that matters. Logged, not thrown: a blank slot
      // here is already visible as the gray placeholder box.
      renderCollage(canvas, PAGE_W, PAGE_H, templateSize, urls, header, false, stats, effectiveFocalPoints).catch(
        (error) => console.error('Collage preview failed to render:', error),
      );
      // effectiveFocalPoints is a fresh array each render by design (it
      // folds in the live drag override), so it's compared by its actual
      // entries here rather than by reference.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasRef, templateSize, photos, header, stats, JSON.stringify(effectiveFocalPoints)]);

    function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
      const rect = e.currentTarget.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * PAGE_W,
        y: ((e.clientY - rect.top) / rect.height) * PAGE_H,
      };
    }

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      const point = canvasPoint(e);
      const hit = hitTestSlot(
        templateFor(templateSize),
        PAGE_W,
        PAGE_H,
        point.x,
        point.y,
        photos.map((p) => p && { width: p.width, height: p.height }),
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
      const focal = nextFocalPoint(drag.startFocal, dxPx, dyPx, drag.overflowX, drag.overflowY);
      if (rafRef.current != null) return; // coalesce to at most one redraw per frame
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setLiveFocal({ index: drag.index, focal });
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
      const finalFocal = liveFocal?.index === drag.index ? liveFocal.focal : drag.startFocal;
      setLiveFocal(null);
      onFocalChange?.(drag.index, finalFocal);
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
        className="h-auto max-h-full w-auto cursor-grab touch-none rounded-sm shadow-2xl active:cursor-grabbing"
        style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
      />
    );
  },
);
CollagePreview.displayName = 'CollagePreview';
