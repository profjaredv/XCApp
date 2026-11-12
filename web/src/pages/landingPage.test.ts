import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const page = read('pages/LandingPage.tsx');
const showcases = read('components/landing/Showcases.tsx');

describe('landing page', () => {
  it('leads its features with Photos, then Footsteps, meet day and practice', () => {
    const order = ["id: 'photos'", "id: 'footsteps'", "id: 'meet-day'", "id: 'practice'"].map((s) => page.indexOf(s));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('says results are entered by the coach and names no results provider', () => {
    expect(page).toContain('Nothing is fetched for you');
    expect(`${page}${showcases}`).not.toMatch(/athletic\.net|milesplit|scrap/i);
  });

  it('uses theme tokens only, so light and dark cannot disagree', () => {
    expect(`${page}${showcases}`).not.toMatch(/#[0-9a-f]{6}\b|\b(?:slate|gray|zinc)-\d{2,3}\b/i);
  });

  it('labels every picture as an example', () => {
    expect(page).toContain('Example with made-up names and numbers.');
  });
});
