// LeadPack Photos collage geometry — the single fixed template (approved
// design, see docs handoff "LeadPack Collage: Build Spec"). Every athlete
// gets exactly 5 photos: pick #1 is the big circled hero, picks #2-#5 fill
// four angled grid panels. There is no template-size picker anymore — one
// design, same for every athlete, only the photos/stats/header differ.
//
// Design units are on an 816 x 1056 page (US Letter at 96 px/in) — see the
// build spec's "Coordinate system." Everything below is expressed as a
// fraction of pageWidth/pageHeight so the on-screen preview (850x1100) and
// the full-res export (2550x3300) share one definition; lib/collageRender.ts
// is what actually turns these into pixels and polygons.

export interface TemplateRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The front page's big circular "hero" photo. cx/cy are fractions of
// pageWidth/pageHeight respectively (same convention as every other rect's
// x/y), but `radius` is a fraction of pageWidth ALONE, used as the one
// shared basis for both axes in pixels — the page itself isn't square, so a
// radius can't be a single fraction of both axes at once without distorting
// the circle. See heroPixelRect below for how a caller turns this into
// actual pixels.
export interface HeroRect {
  cx: number;
  cy: number;
  radius: number;
}

/**
 * The hero photo's bounding square in real pixels. pageWidth/pageHeight
 * differ between the on-screen preview and the full-res export, but always
 * share the same aspect ratio, so computing the diameter from pageWidth
 * alone and applying it to both axes always produces a true circle
 * regardless of which canvas size calls this.
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

// Center (408, 410), outer radius 210 design units — build spec section 3,
// item 5. The circle deliberately straddles the row gap bar and the bottom
// stripe cut (lib/collageRender.ts draws it last, on top of both).
export const HERO: HeroRect = { cx: 408 / 816, cy: 410 / 1056, radius: 210 / 816 };

// Which corner of a grid panel's bounding box the slanted divider cuts
// into — see lib/collageRender.ts's panelPolygon. 'left' panels (A, C) keep
// their full top edge and lose PANEL_LEAN off the bottom-right corner;
// 'right' panels (B, D) lose PANEL_LEAN off the top-left corner and keep
// everything else. Every divider leans the same way; row 2's panels are
// just shifted left of row 1's by 56 design units on purpose (build spec
// section 3), not slanted differently.
export type PanelLean = 'left' | 'right';

export interface PhotoPanel {
  // Bounding box, fraction of the page — the cover-fit frame AND the
  // drag-to-reposition hit-test area (lib/focalDrag.ts). The actual visible
  // edge is narrower than this on the slanted side (see `lean`); hit-testing
  // against the full box is a deliberate, harmless over-inclusion.
  rect: TemplateRect;
  lean: PanelLean;
  // Default cover-fit crop anchor on the Y axis when the athlete hasn't
  // dragged this photo (0.5 = centered, matches the build spec's "Focus"
  // column: "center" or "y 70%").
  focusY: number;
}

// The amount (in design units) a panel's slanted edge moves horizontally
// over its own height — build spec section 3: "Each one moves 40 units
// left over 406 units of height, which is the same slope in both rows."
export const PANEL_LEAN = 40;

// Pick order: picks[0] is the hero (HERO above); picks[1..4] fill these
// four panels in order — A, B, C, D per the build spec's panel table.
export const PANELS: PhotoPanel[] = [
  { rect: { x: 0, y: 0, w: 436 / 816, h: 406 / 1056 }, lean: 'left', focusY: 0.5 }, // A — pick #2
  { rect: { x: 404 / 816, y: 0, w: 412 / 816, h: 406 / 1056 }, lean: 'right', focusY: 0.7 }, // B — pick #3
  { rect: { x: 0, y: 414 / 1056, w: 376 / 816, h: 406 / 1056 }, lean: 'left', focusY: 0.5 }, // C — pick #4
  { rect: { x: 344 / 816, y: 414 / 1056, w: 472 / 816, h: 406 / 1056 }, lean: 'right', focusY: 0.7 }, // D — pick #5
];

// The one fixed pick count — hero + four grid panels. No per-template
// variance anymore; see BuildRightPanel.tsx and lib/selectors.ts's
// eligibleForCollage, both of which used to read this off a template size.
export const REQUIRED_PICKS = 1 + PANELS.length;
