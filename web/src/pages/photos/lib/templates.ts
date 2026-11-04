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
  // hero that runs to the very bottom page edge. No longer always
  // `size - 1` — see minPicksFor below, which is the real source of
  // truth for how many total picks a template needs (slots.length + 1).
  slots: TemplateRect[];
}

/**
 * How many total picks a template actually needs (hero + every grid
 * slot) — the one place that number is computed, so BuildRightPanel's
 * "add N more" nudge, its Export button, and selectors.ts's
 * eligibleForCollage (the "Generate all" floor) never drift out of sync
 * with the real slot count as these layouts change.
 */
export function minPicksFor(size: TemplateSize): number {
  return TEMPLATES[size].slots.length + 1;
}

const HEADER: TemplateRect = { x: 0.06, y: 0.03, w: 0.88, h: 0.08 };
const STAT_STRIP: TemplateRect = { x: 0.06, y: 0.115, w: 0.88, h: 0.04 };
// A left column, not the full page width — the hero (below) floats up
// beside this text instead of below it, so this can no longer run edge
// to edge without running under the photo. Pure layout budget, not an
// enforced clip: drawBestByDistance wraps its content onto as many
// lines as this width needs, and this height is a generous (not exact)
// estimate of how tall that ever gets — see that function's own comment.
const BEST_BY_DISTANCE: TemplateRect = { x: 0.06, y: 0.165, w: 0.4, h: 0.275 };
// Floated toward the top-right, clipped flat against HEADER's own
// bottom edge (0.11) — as high and as early as the hero can start
// without the athlete's name itself ever being at risk of looking
// covered (STAT_STRIP, which does sit in the hero's path below that
// line, is drawn AFTER the hero, so it always stays legible on top of
// it regardless of the overlap). cy sits just enough above 0.11 for a
// small, deliberate sliver of the circle to be clipped off — see
// HeroRect's own comment on the radius/aspect tradeoff for why the
// radius is a fraction of pageWidth specifically. cx sits just past
// BEST_BY_DISTANCE's own right edge (0.46) so the two never overlap.
// The rings extend out to 1.245x the photo radius (see drawHeroRings);
// even with that, the whole motif stays inside the page's own margin
// stripes and bottoms out around y 0.43.
const HERO: HeroRect = { cx: 0.72, cy: 0.24, radius: 0.2 };

// Where BEST_BY_DISTANCE's own column ends — also where the grid's
// LEFTMOST slot in its first row starts, a bit taller than the slot(s)
// beside it, so that slot grows up to fill the gap between the end of
// the text column and the top of the "normal" grid start (GRID_TOP
// below) instead of leaving it empty. Every OTHER slot in that first
// row waits for the hero instead (it's what's actually above them).
const TEXT_BOTTOM = 0.44;
const GRID_TOP = 0.45;
// The shared bottom edge of the grid's first row — every slot in it
// reaches exactly this far down regardless of where it started, so the
// row (and whatever comes directly below it) still lines up cleanly.
const ROW1_BOTTOM = 0.73;
const ROW_GAP = 0.01;
const ROW2_TOP = ROW1_BOTTOM + ROW_GAP;
// The second row — always full-bleed to the page's own bottom edge (a
// deliberate bleed, not a margin), unlike HEADER/STAT_STRIP/
// BEST_BY_DISTANCE above, which keep their 0.06 margin since running
// text edge-to-edge reads poorly.
const ROW2_HEIGHT = 1 - ROW2_TOP;
const LEFT_SLOT_HEIGHT = ROW1_BOTTOM - TEXT_BOTTOM;
const OTHER_SLOT_HEIGHT = ROW1_BOTTOM - GRID_TOP;

// Each size's grid now ends in one full-width photo at the bottom, with
// whatever's above it split into an equal row of columns — a pair for
// "3", a triple for "4". "5" keeps its original even 2x2 grid unchanged
// (no full-width row) as an alternate style at the same total pick
// count as "4", since 5 total is the hard ceiling
// (backend/lib/photosAccess.js's MAX_PICKS) and there's no room for a
// fourth, strictly-larger option. In every size, the first row's
// LEFTMOST slot alone uses TEXT_BOTTOM/LEFT_SLOT_HEIGHT (see above);
// every other slot in that row uses GRID_TOP/OTHER_SLOT_HEIGHT.
export const TEMPLATES: Record<TemplateSize, CollageTemplate> = {
  // Hero + pair row + full-width row at the bottom = 4 total picks.
  3: {
    size: 3,
    header: HEADER,
    statStrip: STAT_STRIP,
    bestByDistance: BEST_BY_DISTANCE,
    hero: HERO,
    slots: [
      { x: 0, y: TEXT_BOTTOM, w: 0.495, h: LEFT_SLOT_HEIGHT },
      { x: 0.505, y: GRID_TOP, w: 0.495, h: OTHER_SLOT_HEIGHT },
      { x: 0, y: ROW2_TOP, w: 1, h: ROW2_HEIGHT },
    ],
  },
  // Hero + triple row + full-width row at the bottom = 5 total picks
  // (the MAX_PICKS ceiling) — the same idea as "3", one row bigger.
  4: {
    size: 4,
    header: HEADER,
    statStrip: STAT_STRIP,
    bestByDistance: BEST_BY_DISTANCE,
    hero: HERO,
    slots: [
      { x: 0, y: TEXT_BOTTOM, w: 0.3267, h: LEFT_SLOT_HEIGHT },
      { x: 0.3367, y: GRID_TOP, w: 0.3267, h: OTHER_SLOT_HEIGHT },
      { x: 0.6734, y: GRID_TOP, w: 0.3266, h: OTHER_SLOT_HEIGHT },
      { x: 0, y: ROW2_TOP, w: 1, h: ROW2_HEIGHT },
    ],
  },
  // Hero + even 2x2 grid, otherwise unchanged from before this
  // redesign — also 5 total picks, kept as a second "grid" style
  // alongside "4"'s "banner" style at the same pick count. Only the
  // top-left slot gets the taller treatment; the bottom row is fully
  // clear of both the hero and the text column, so it stays symmetric.
  5: {
    size: 5,
    header: HEADER,
    statStrip: STAT_STRIP,
    bestByDistance: BEST_BY_DISTANCE,
    hero: HERO,
    slots: [
      { x: 0, y: TEXT_BOTTOM, w: 0.495, h: LEFT_SLOT_HEIGHT },
      { x: 0.505, y: GRID_TOP, w: 0.495, h: OTHER_SLOT_HEIGHT },
      { x: 0, y: ROW2_TOP, w: 0.495, h: ROW2_HEIGHT },
      { x: 0.505, y: ROW2_TOP, w: 0.495, h: ROW2_HEIGHT },
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
