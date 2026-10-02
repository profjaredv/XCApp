import type { TemplateSize } from '../state/types';

// US letter portrait at 300dpi (spec's "Collage generation" section):
// 2550 x 3300px. Rects are fractions of the page (0-1) so the on-screen
// canvas preview and the eventual full-res render share one definition.

export interface TemplateRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CollageTemplate {
  size: TemplateSize;
  header: TemplateRect;
  slots: TemplateRect[];
}

const HEADER: TemplateRect = { x: 0.06, y: 0.03, w: 0.88, h: 0.08 };

export const TEMPLATES: Record<TemplateSize, CollageTemplate> = {
  3: {
    size: 3,
    header: HEADER,
    slots: [
      { x: 0.06, y: 0.14, w: 0.88, h: 0.38 },
      { x: 0.06, y: 0.54, w: 0.42, h: 0.4 },
      { x: 0.52, y: 0.54, w: 0.42, h: 0.4 },
    ],
  },
  4: {
    size: 4,
    header: HEADER,
    slots: [
      { x: 0.06, y: 0.14, w: 0.42, h: 0.38 },
      { x: 0.52, y: 0.14, w: 0.42, h: 0.38 },
      { x: 0.06, y: 0.56, w: 0.42, h: 0.38 },
      { x: 0.52, y: 0.56, w: 0.42, h: 0.38 },
    ],
  },
  5: {
    size: 5,
    header: HEADER,
    slots: [
      { x: 0.06, y: 0.14, w: 0.88, h: 0.3 },
      { x: 0.06, y: 0.47, w: 0.282, h: 0.47 },
      { x: 0.359, y: 0.47, w: 0.282, h: 0.47 },
      { x: 0.638, y: 0.47, w: 0.282, h: 0.235 },
      { x: 0.638, y: 0.715, w: 0.282, h: 0.235 },
    ],
  },
};

export function templateFor(size: TemplateSize): CollageTemplate {
  return TEMPLATES[size];
}
