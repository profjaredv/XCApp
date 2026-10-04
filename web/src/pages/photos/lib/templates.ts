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
  // Headline numbers (career PR, this season's miles/avg pace/race count)
  // — one line directly under the header.
  statStrip: TemplateRect;
  slots: TemplateRect[];
  // Best time per distance this season + the season's full race list —
  // see lib/collageRender.ts's drawResultsBlock.
  resultsBlock: TemplateRect;
}

const HEADER: TemplateRect = { x: 0.06, y: 0.03, w: 0.88, h: 0.08 };
const STAT_STRIP: TemplateRect = { x: 0.06, y: 0.115, w: 0.88, h: 0.04 };
const RESULTS_BLOCK: TemplateRect = { x: 0.06, y: 0.75, w: 0.88, h: 0.215 };

// The photo band shrank from the original templates' ~0.14-0.94 (height
// 0.80) to 0.17-0.735 (height 0.565) to make room for STAT_STRIP and
// RESULTS_BLOCK above and below it. Every slot below is that same ratio
// (0.565 / 0.80 = 0.70625) applied to the original templates' y and h,
// anchored at the new band's top (0.17) instead of the old one's (0.14) —
// x and w are untouched, since only vertical space was reclaimed.
export const TEMPLATES: Record<TemplateSize, CollageTemplate> = {
  3: {
    size: 3,
    header: HEADER,
    statStrip: STAT_STRIP,
    resultsBlock: RESULTS_BLOCK,
    slots: [
      { x: 0.06, y: 0.17, w: 0.88, h: 0.2684 },
      { x: 0.06, y: 0.4525, w: 0.42, h: 0.2825 },
      { x: 0.52, y: 0.4525, w: 0.42, h: 0.2825 },
    ],
  },
  4: {
    size: 4,
    header: HEADER,
    statStrip: STAT_STRIP,
    resultsBlock: RESULTS_BLOCK,
    slots: [
      { x: 0.06, y: 0.17, w: 0.42, h: 0.2684 },
      { x: 0.52, y: 0.17, w: 0.42, h: 0.2684 },
      { x: 0.06, y: 0.4666, w: 0.42, h: 0.2684 },
      { x: 0.52, y: 0.4666, w: 0.42, h: 0.2684 },
    ],
  },
  5: {
    size: 5,
    header: HEADER,
    statStrip: STAT_STRIP,
    resultsBlock: RESULTS_BLOCK,
    slots: [
      { x: 0.06, y: 0.17, w: 0.88, h: 0.2119 },
      { x: 0.06, y: 0.4031, w: 0.282, h: 0.3319 },
      { x: 0.359, y: 0.4031, w: 0.282, h: 0.3319 },
      { x: 0.638, y: 0.4031, w: 0.282, h: 0.166 },
      { x: 0.638, y: 0.5761, w: 0.282, h: 0.166 },
    ],
  },
};

export function templateFor(size: TemplateSize): CollageTemplate {
  return TEMPLATES[size];
}
