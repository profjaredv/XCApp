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

// Photos run full bleed — x:0, w:1 (or edge-to-edge columns with a thin
// gap between them) — right to the page's left/right edges, unlike
// HEADER/STAT_STRIP/RESULTS_BLOCK above, which keep their 0.06 margin
// since running text edge-to-edge reads poorly. The photo band itself
// also grew to fill the space between STAT_STRIP's bottom (0.155) and
// RESULTS_BLOCK's top (0.75) exactly — no gap on either side — instead
// of the small margins the previous 0.17-0.735 band left on both ends.
// Each template's slots keep the same relative split of that band (and
// the same relative column gaps) as before; only the outer edges moved.
export const TEMPLATES: Record<TemplateSize, CollageTemplate> = {
  3: {
    size: 3,
    header: HEADER,
    statStrip: STAT_STRIP,
    resultsBlock: RESULTS_BLOCK,
    slots: [
      { x: 0, y: 0.155, w: 1, h: 0.2827 },
      { x: 0, y: 0.4525, w: 0.495, h: 0.2975 },
      { x: 0.505, y: 0.4525, w: 0.495, h: 0.2975 },
    ],
  },
  4: {
    size: 4,
    header: HEADER,
    statStrip: STAT_STRIP,
    resultsBlock: RESULTS_BLOCK,
    slots: [
      { x: 0, y: 0.155, w: 0.495, h: 0.2827 },
      { x: 0.505, y: 0.155, w: 0.495, h: 0.2827 },
      { x: 0, y: 0.4674, w: 0.495, h: 0.2826 },
      { x: 0.505, y: 0.4674, w: 0.495, h: 0.2826 },
    ],
  },
  5: {
    size: 5,
    header: HEADER,
    statStrip: STAT_STRIP,
    resultsBlock: RESULTS_BLOCK,
    slots: [
      { x: 0, y: 0.155, w: 1, h: 0.2232 },
      { x: 0, y: 0.4005, w: 0.328, h: 0.3494 },
      { x: 0.336, y: 0.4005, w: 0.328, h: 0.3494 },
      { x: 0.672, y: 0.4005, w: 0.328, h: 0.1764 },
      { x: 0.672, y: 0.5827, w: 0.328, h: 0.1675 },
    ],
  },
};

export function templateFor(size: TemplateSize): CollageTemplate {
  return TEMPLATES[size];
}

// The back page (lib/collageRender.ts's renderCollageBack) — stats only,
// so unlike the front it doesn't vary by pick count/template size. One
// fixed layout: a header, a row of highlight stat cards, the pace trend
// chart, the season's race timeline, then a full-bleed team group photo
// and small-print coach credit filling the rest of the page.
export interface BackTemplate {
  header: TemplateRect;
  highlightCards: TemplateRect;
  paceChart: TemplateRect;
  timeline: TemplateRect;
  // Full-bleed (x:0, w:1), like the front page's own photo slots — the
  // one deliberate break from everyone else's 0.06 margin on this page.
  groupPhoto: TemplateRect;
  // A thin solid credit strip directly under the group photo, not part
  // of the photo band itself — see drawCoachCredit's own comment on why
  // this is a separate band rather than text overlaid on the image.
  coachCredit: TemplateRect;
}

export const BACK_TEMPLATE: BackTemplate = {
  header: { x: 0.06, y: 0.03, w: 0.88, h: 0.07 },
  highlightCards: { x: 0.06, y: 0.115, w: 0.88, h: 0.1 },
  paceChart: { x: 0.06, y: 0.235, w: 0.88, h: 0.3 },
  timeline: { x: 0.06, y: 0.56, w: 0.88, h: 0.29 },
  groupPhoto: { x: 0, y: 0.85, w: 1, h: 0.12 },
  coachCredit: { x: 0, y: 0.97, w: 1, h: 0.03 },
};
