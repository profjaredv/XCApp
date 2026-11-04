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

// The front page's big circular "hero" photo — see lib/collageRender.ts's
// drawHeroPhoto. cx/cy are fractions of pageWidth/pageHeight respectively
// (same convention as every other rect's x/y), but `radius` is a fraction
// of pageWidth ALONE, used as the one shared basis for both axes in
// pixels — the page itself isn't square, so a radius can't be a single
// fraction of both axes at once without distorting the circle. See
// heroPixelRect below for how a caller turns this into actual pixels.
export interface HeroRect {
  cx: number;
  cy: number;
  radius: number;
}

/**
 * The hero photo's bounding square in real pixels. pageWidth/pageHeight
 * differ between the on-screen preview (850x1100) and the full-res export
 * (2550x3300), but always share the same aspect ratio, so computing the
 * diameter from pageWidth alone and applying it to both axes always
 * produces a true circle regardless of which canvas size calls this.
 */
export function heroPixelRect(
  hero: HeroRect,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; w: number; h: number; radius: number } {
  const diameter = hero.radius * 2 * pageWidth;
  return {
    x: hero.cx * pageWidth - diameter / 2,
    y: hero.cy * pageHeight - diameter / 2,
    w: diameter,
    h: diameter,
    radius: diameter / 2,
  };
}

export interface CollageTemplate {
  size: TemplateSize;
  header: TemplateRect;
  // Headline numbers (career PR, this season's miles/avg pace/race count)
  // — one line directly under the header.
  statStrip: TemplateRect;
  // "5K 17:32 · 2 Mile 11:05" — one line, directly under statStrip and
  // above the hero photo. The season's full race list used to live down
  // here too (as a table); it's been dropped from the front page
  // entirely now that the back page's own season timeline lists every
  // race in full — see lib/collageRender.ts's drawBestByDistance.
  bestByDistance: TemplateRect;
  // The one big circled "hero" photo — always the athlete's FIRST pick
  // (picks[0]/photos[0]), the same reorder-arrows-in-BuildRightPanel
  // control that used to just mean "top-left slot" now also decides
  // which photo gets the hero treatment.
  hero: HeroRect;
  // The remaining picks (picks[1..]), full-bleed in a band below the
  // hero that runs to the very bottom page edge — one fewer slot than
  // `size`, since picks[0] is drawn as the hero instead of a grid slot.
  slots: TemplateRect[];
}

const HEADER: TemplateRect = { x: 0.06, y: 0.03, w: 0.88, h: 0.08 };
const STAT_STRIP: TemplateRect = { x: 0.06, y: 0.115, w: 0.88, h: 0.04 };
const BEST_BY_DISTANCE: TemplateRect = { x: 0.06, y: 0.165, w: 0.88, h: 0.025 };
// Big and centered — see HeroRect's own comment on the radius/aspect
// tradeoff. At this radius the hero (plus its three decorative rings,
// drawn out to roughly 1.35x the photo radius — see drawRings) spans
// about y 0.196-0.614, comfortably inside the 0.19-0.62 band
// BEST_BY_DISTANCE and the grid slots below leave open for it.
const HERO: HeroRect = { cx: 0.5, cy: 0.405, radius: 0.2 };

// Photos run full bleed — x:0, w:1 (or edge-to-edge columns with a thin
// gap between them) — right to the page's left/right edges, unlike
// HEADER/STAT_STRIP/BEST_BY_DISTANCE above, which keep their 0.06 margin
// since running text edge-to-edge reads poorly. The grid band spans
// 0.62-1.0 (the page's own bottom edge — a deliberate bleed, not a
// margin) for every template size; only how that band splits into
// (size - 1) slots varies.
export const TEMPLATES: Record<TemplateSize, CollageTemplate> = {
  3: {
    size: 3,
    header: HEADER,
    statStrip: STAT_STRIP,
    bestByDistance: BEST_BY_DISTANCE,
    hero: HERO,
    slots: [
      { x: 0, y: 0.62, w: 0.495, h: 0.38 },
      { x: 0.505, y: 0.62, w: 0.495, h: 0.38 },
    ],
  },
  4: {
    size: 4,
    header: HEADER,
    statStrip: STAT_STRIP,
    bestByDistance: BEST_BY_DISTANCE,
    hero: HERO,
    slots: [
      { x: 0, y: 0.62, w: 0.3267, h: 0.38 },
      { x: 0.3367, y: 0.62, w: 0.3267, h: 0.38 },
      { x: 0.6734, y: 0.62, w: 0.3266, h: 0.38 },
    ],
  },
  5: {
    size: 5,
    header: HEADER,
    statStrip: STAT_STRIP,
    bestByDistance: BEST_BY_DISTANCE,
    hero: HERO,
    slots: [
      { x: 0, y: 0.62, w: 0.495, h: 0.185 },
      { x: 0.505, y: 0.62, w: 0.495, h: 0.185 },
      { x: 0, y: 0.815, w: 0.495, h: 0.185 },
      { x: 0.505, y: 0.815, w: 0.495, h: 0.185 },
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
