import { describe, it, expect } from 'vitest';
import { hitTestSlot, nextFocalPoint } from './focalDrag';
import type { CollageTemplate } from './templates';

const TEMPLATE: CollageTemplate = {
  size: 3,
  header: { x: 0, y: 0, w: 1, h: 0.1 },
  statStrip: { x: 0, y: 0.1, w: 1, h: 0.05 },
  resultsBlock: { x: 0, y: 0.8, w: 1, h: 0.2 },
  slots: [
    { x: 0, y: 0.2, w: 0.5, h: 0.3 },
    { x: 0.5, y: 0.2, w: 0.5, h: 0.3 },
  ],
};
const PAGE_W = 1000;
const PAGE_H = 1000;

describe('hitTestSlot', () => {
  it('finds the slot containing the point', () => {
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 100, 250, [
      { width: 400, height: 400 },
      { width: 400, height: 400 },
    ]);
    expect(hit?.index).toBe(0);
  });

  it('returns null outside every slot', () => {
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 100, 900, [{ width: 400, height: 400 }, undefined]);
    expect(hit).toBeNull();
  });

  it('returns null for a slot with no photo', () => {
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 100, 250, [undefined, undefined]);
    expect(hit).toBeNull();
  });

  it('returns null for a photo with zero/unknown dimensions', () => {
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 100, 250, [{ width: 0, height: 0 }, undefined]);
    expect(hit).toBeNull();
  });

  it('reports the slot\'s pannable overflow for a landscape photo in a square-ish frame', () => {
    // Slot 0 is 500x300px. A 1000x1000 (square) image cover-fit into that
    // scales to 500x500 — 200px of vertical overflow, none horizontal.
    const hit = hitTestSlot(TEMPLATE, PAGE_W, PAGE_H, 100, 250, [
      { width: 1000, height: 1000 },
      undefined,
    ]);
    expect(hit?.overflowX).toBe(0);
    expect(hit?.overflowY).toBe(200);
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
