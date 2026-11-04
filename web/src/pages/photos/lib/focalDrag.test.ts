import { describe, it, expect } from 'vitest';
import { hitTestSlot, nextFocalPoint } from './focalDrag';
import { HERO, PANELS } from './templates';

// hitTestSlot reads geometry straight off lib/templates.ts's HERO/PANELS
// now (the one fixed design — see that file), not a fixture template, so
// these tests exercise the real hero circle and the real panel A's
// bounding box. Index 0 is always the hero circle; PANELS fills every
// index after it, shifted by one — see hitTestSlot's own header comment.
const PAGE_W = 1000;
const PAGE_H = 1000;
const hero = { cx: HERO.cx * PAGE_W, cy: HERO.cy * PAGE_H, radius: HERO.radius * PAGE_W };
const panelA = {
  x: PANELS[0].rect.x * PAGE_W,
  y: PANELS[0].rect.y * PAGE_H,
  w: PANELS[0].rect.w * PAGE_W,
  h: PANELS[0].rect.h * PAGE_H,
};

describe('hitTestSlot', () => {
  it('finds the hero circle at index 0', () => {
    const hit = hitTestSlot(PAGE_W, PAGE_H, hero.cx, hero.cy, [
      { width: 1000, height: 1000 },
      { width: 400, height: 400 },
    ]);
    expect(hit?.index).toBe(0);
  });

  it('finds a grid panel, index shifted by one past the hero', () => {
    const hit = hitTestSlot(PAGE_W, PAGE_H, panelA.x + panelA.w / 2, panelA.y + panelA.h / 2, [
      { width: 1000, height: 1000 },
      { width: 400, height: 400 },
    ]);
    expect(hit?.index).toBe(1);
  });

  it('misses a point inside the hero\'s bounding square but outside the actual circle', () => {
    // A corner of the hero's bounding square, well outside the circle —
    // proves the hit test is circular, not just "inside the square".
    const hit = hitTestSlot(PAGE_W, PAGE_H, hero.cx + hero.radius * 0.9, hero.cy - hero.radius * 0.9, [
      { width: 1000, height: 1000 },
    ]);
    expect(hit).toBeNull();
  });

  it('returns null outside every slot', () => {
    const hit = hitTestSlot(PAGE_W, PAGE_H, 1, 999, [{ width: 1000, height: 1000 }, undefined]);
    expect(hit).toBeNull();
  });

  it('returns null for a slot with no photo', () => {
    const hit = hitTestSlot(PAGE_W, PAGE_H, panelA.x + 1, panelA.y + 1, [{ width: 1000, height: 1000 }, undefined]);
    expect(hit).toBeNull();
  });

  it('returns null for a photo with zero/unknown dimensions', () => {
    const hit = hitTestSlot(PAGE_W, PAGE_H, panelA.x + 1, panelA.y + 1, [
      { width: 1000, height: 1000 },
      { width: 0, height: 0 },
    ]);
    expect(hit).toBeNull();
  });

  it('reports a grid panel\'s pannable overflow for a square photo in its (landscape) frame', () => {
    // Panel A's bounding box is wider than it is tall. A 1000x1000 image
    // cover-fit into it scales to panelA.w x panelA.w — vertical overflow,
    // none horizontal.
    const hit = hitTestSlot(PAGE_W, PAGE_H, panelA.x + 1, panelA.y + 1, [
      { width: 1000, height: 1000 },
      { width: 1000, height: 1000 },
    ]);
    expect(hit?.overflowX).toBe(0);
    expect(hit?.overflowY).toBeCloseTo(panelA.w - panelA.h, 5);
  });

  it('reports the hero\'s pannable overflow for a landscape photo in its square frame', () => {
    // A 2x1 image cover-fit into the hero's square frame overflows
    // horizontally by exactly the frame's own diameter.
    const hit = hitTestSlot(PAGE_W, PAGE_H, hero.cx, hero.cy, [{ width: 600, height: 300 }]);
    expect(hit?.overflowX).toBeCloseTo(hero.radius * 2, 5);
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
