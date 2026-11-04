// Pure pointer-drag math for the Build module's "move the photo to see
// faces" control (components/CollagePreview.tsx) — kept separate from the
// canvas/pointer-event plumbing so the geometry itself is unit-testable
// without a DOM.

import { coverFitOffset, type FocalPoint } from './collageRender';
import { heroPixelRect, type CollageTemplate } from './templates';

export interface SlotHit {
  index: number;
  overflowX: number;
  overflowY: number;
}

/**
 * Which slot (if any) a canvas-space point falls inside, and how far that
 * slot's image can be panned on each axis. Null when the point isn't over
 * a slot, or that slot has no photo (or the photo has no known
 * dimensions) to drag.
 *
 * Index 0 is always the hero circle (hit-tested as a circle, not its
 * bounding square); every index after it is one of template.slots'
 * grid slots, shifted by one — matching how lib/collageRender.ts's
 * renderCollage splits photoUrls/focalPoints into [hero, ...grid].
 */
export function hitTestSlot(
  template: CollageTemplate,
  pageWidth: number,
  pageHeight: number,
  canvasX: number,
  canvasY: number,
  photoSizes: ({ width: number; height: number } | undefined)[],
): SlotHit | null {
  const hero = heroPixelRect(template.hero, pageWidth, pageHeight);
  const heroCx = hero.x + hero.w / 2;
  const heroCy = hero.y + hero.h / 2;
  const dx = canvasX - heroCx;
  const dy = canvasY - heroCy;
  if (dx * dx + dy * dy <= hero.radius * hero.radius) {
    const size = photoSizes[0];
    if (!size || size.width <= 0 || size.height <= 0) return null;
    const { overflowX, overflowY } = coverFitOffset(hero.w, hero.h, size.width, size.height);
    return { index: 0, overflowX, overflowY };
  }

  const gridIndex = template.slots.findIndex((rect) => {
    const x = rect.x * pageWidth;
    const y = rect.y * pageHeight;
    return canvasX >= x && canvasX <= x + rect.w * pageWidth && canvasY >= y && canvasY <= y + rect.h * pageHeight;
  });
  if (gridIndex === -1) return null;
  // Shifted by one — template.slots is the grid alone; index 0 belongs to the hero above.
  const index = gridIndex + 1;
  const size = photoSizes[index];
  if (!size || size.width <= 0 || size.height <= 0) return null;
  const rect = template.slots[gridIndex];
  const { overflowX, overflowY } = coverFitOffset(rect.w * pageWidth, rect.h * pageHeight, size.width, size.height);
  return { index, overflowX, overflowY };
}

/**
 * The focal point after dragging (dxPx, dyPx) canvas pixels from `start`.
 * Dragging the pointer right/down moves the image's content with it
 * (reveals more of the image's left/top edge), matching a typical
 * crop/pan gesture. An axis with no overflow (the image and frame share
 * that axis's aspect exactly) never moves, since there's nothing to pan
 * into. Always clamped to [0, 1].
 */
export function nextFocalPoint(start: FocalPoint, dxPx: number, dyPx: number, overflowX: number, overflowY: number): FocalPoint {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return {
    x: overflowX > 0 ? clamp(start.x - dxPx / overflowX) : start.x,
    y: overflowY > 0 ? clamp(start.y - dyPx / overflowY) : start.y,
  };
}
