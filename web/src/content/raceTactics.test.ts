import { describe, it, expect } from 'vitest';
import { RACE_TACTICS } from './raceTactics';

// Race tactics are the one part of the strategy session that is NOT this
// athlete's own data — common coaching cues instead. The tests here guard
// the two things that matter: the content covers a race start-to-finish,
// and nothing in it is written as if it were derived from someone's
// results (no seconds, no "you" framed as a measured fact).

describe('race tactics content', () => {
  it('covers the race in order, start to finish', () => {
    const phases = RACE_TACTICS.map((t) => t.phase.toLowerCase());
    expect(phases[0]).toMatch(/start|first/);
    expect(phases[phases.length - 1]).toMatch(/finish|last/);
  });

  it('has a short, memorable cue and a reason for every phase', () => {
    for (const tactic of RACE_TACTICS) {
      expect(tactic.id).toBeTruthy();
      expect(tactic.phase.length).toBeGreaterThan(0);
      expect(tactic.cue.length).toBeGreaterThan(0);
      expect(tactic.cue.length).toBeLessThan(80); // has to fit on a phone, mid-race
      expect(tactic.detail.length).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    const ids = RACE_TACTICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never claims to be measured from anyone results', () => {
    // This is generic coaching wisdom, not a finding. If a number or a
    // "your races show" framing sneaks in here, it stops being honest
    // about what it is.
    const prose = RACE_TACTICS.map((t) => `${t.cue} ${t.detail}`).join(' ');
    expect(prose).not.toMatch(/\d+\s*(s|sec|seconds)\b/i);
    expect(prose).not.toMatch(/your (race|split|pace|data|result)s? (show|were|was)/i);
  });

  it('includes the cues the coach asked for', () => {
    const all = RACE_TACTICS.map((t) => `${t.phase} ${t.cue} ${t.detail}`).join(' ').toLowerCase();
    expect(all).toMatch(/800/);
    expect(all).toMatch(/catch/);
    expect(all).toMatch(/form/);
  });
});
