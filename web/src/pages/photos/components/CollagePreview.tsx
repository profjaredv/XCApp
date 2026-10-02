import React, { useEffect, useRef } from 'react';
import { renderCollage, type CollageHeaderText } from '../lib/collageRender';
import type { Photo, TemplateSize } from '../state/types';

interface CollagePreviewProps {
  templateSize: TemplateSize;
  photos: (Photo | undefined)[];
  header: CollageHeaderText;
  scale?: number;
}

// US letter at 300dpi is 2550x3300 — the preview renders at 1/3 that
// (850x1100) on a <canvas>, same template/draw code the full-res export
// uses, so what's on screen is exactly what gets exported.
const PAGE_W = 850;
const PAGE_H = 1100;

export const CollagePreview = React.forwardRef<HTMLCanvasElement, CollagePreviewProps>(
  ({ templateSize, photos, header }, ref) => {
    const innerRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = (ref as React.RefObject<HTMLCanvasElement>) ?? innerRef;

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const seeds = photos.map((p) => p?.seed ?? 0);
      void renderCollage(canvas, PAGE_W, PAGE_H, templateSize, seeds, header);
    }, [canvasRef, templateSize, photos, header]);

    return (
      <canvas
        ref={canvasRef}
        width={PAGE_W}
        height={PAGE_H}
        className="h-auto max-h-full w-auto rounded-sm shadow-2xl"
        style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
      />
    );
  },
);
CollagePreview.displayName = 'CollagePreview';
