import { describe, it, expect } from 'vitest';
import { hitTestSlot, nextFocalPoint } from './focalDrag';
import type { CollageTemplate } from './templates';

// Index 0 is always the hero circle; template.slots (the grid) fills
// every index after it, shifted by one — see hitTestSlot's own header
// comment. This fixture's `size` is just a type-required label, not a
// pick-count promise (see lib/templates.ts's minPicksFor for the real one).
const TEMPLATE: CollageTemplate = {
  size: 3,
  header: { x: 0, y: 0, w: 1, h: 0.1 },
  statStrip: { x: 0, y: 0.1, w: 1, h: 0.05 },
  bestByDistance: { x: 0, y: 0.15, w: 1, h: 0.03 },
  hero: { cx: 0.5, cy: 0.3, radius: 0.15 },
  slots: [
    { x: 0, y: 0.6, w: 0.5, h: 0.3 },
    { x: 0.5, y: 0.6, w: 0.5, h: 0.3 },
  ],
};
const PAGE_W = 1000;
const PAGE_H = 1000;

describe('hitTestSlot', () => {
  it('finds the hero circle at index 0', () => {
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 500, 300, [
      { width: 1000, height: 1000 },
      { width: 400, height: 400 },
      { width: 400, height: 400 },
    ]);
    expect(hit?.index).toBe(0);
  });

  it('finds a grid slot, index shifted by one past the hero', () => {
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 100, 750, [
      { width: 1000, height: 1000 },
      { width: 400, height: 400 },
      { width: 400, height: 400 },
    ]);
    expect(hit?.index).toBe(1);
  });

  it('misses a point inside the hero\'s bounding square but outside the actual circle', () => {
    // The hero's bounding square runs (350,150)-(650,450); this point sits
    // in a corner of that square, well outside the 150px-radius circle —
    // proves the hit test is circular, not just "inside the square".
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 645, 155, [{ width: 1000, height: 1000 }]);
    expect(hit).toBeNull();
  });

  it('returns null outside every slot', () => {
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 100, 950, [
      { width: 1000, height: 1000 },
      { width: 400, height: 400 },
      undefined,
    ]);
    expect(hit).toBeNull();
  });

  it('returns null for a slot with no photo', () => {
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 100, 750, [{ width: 1000, height: 1000 }, undefined, undefined]);
    expect(hit).toBeNull();
  });

  it('returns null for a photo with zero/unknown dimensions', () => {
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 100, 750, [
      { width: 1000, height: 1000 },
      { width: 0, height: 0 },
      undefined,
    ]);
    expect(hit).toBeNull();
  });

  it('reports a grid slot\'s pannable overflow for a landscape photo in a square-ish frame', () => {
    // Grid slot 1 is 500x300px. A 1000x1000 (square) image cover-fit into
    // that scales to 500x500 — 200px of vertical overflow, none horizontal.
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 100, 750, [
      { width: 1000, height: 1000 },
      { width: 1000, height: 1000 },
      undefined,
    ]);
    expect(hit?.overflowX).toBe(0);
    expect(hit?.overflowY).toBe(200);
  });

  it('reports the hero\'s pannable overflow for a landscape photo in its square frame', () => {
    // The hero frame is 300x300px (radius 0.15 * pageWidth 1000 = 150, so
    // diameter 300). A 600x300 image cover-fit into a 300x300 square
    // scales by max(300/600, 300/300) = 1 -> drawW=600, drawH=300: 300px
    // of horizontal overflow, none vertical.
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 500, 300, [{ width: 600, height: 300 }]);
    expect(hit?.overflowX).toBe(300);
    expect(hit?.overflowY).toBe(0);
  });
});

describe('nextFocalPoint', () => {
  it('moves the image with the pointer: dragging right reveals the left edge (focalX decreases)', () => {
    const next = nextFocalPoint({ x: 0.5, y: 0.5 }, 50, 0, 200, 0);
    expect(next.x).toBeCloseTo(0.25);
    expect(next.y).toBe(0.5);
  });

  it('dragging down reveals the top edge (focalY decreases)', () => {
    const next = nextFocalPoint({ x: 0.5, y: 0.5 }, 0, 100, 0, 200);
    expect(next.y).toBeCloseTo(0);
  });

  it('clamps to [0, 1] even for a drag far past either edge', () => {
    const next = nextFocalPoint({ x: 0.1, y: 0.9 }, 1000, -1000, 200, 200);
    expect(next.x).toBe(0);
    expect(next.y).toBe(1);
  });

  it('never moves an axis with no overflow', () => {
    const next = nextFocalPoint({ x: 0.5, y: 0.5 }, 999, 999, 0, 0);
    expect(next).toEqual({ x: 0.5, y: 0.5 });
  });
});
