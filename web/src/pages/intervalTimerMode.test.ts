import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Timer mode: "start the set, then tap a name and it records the time" —
// the alternative to typing mm:ss by hand into each cell, for a coach at
// the track with everyone running the same rep at once.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('pages/IntervalSessionManagePage.tsx'));

describe('interval session timer mode', () => {
  it('offers a Manual/Timer switch alongside the existing typed-entry grid', () => {
    expect(page).toContain("{ value: 'manual', label: 'Manual' }");
    expect(page).toContain("{ value: 'timer', label: 'Timer' }");
    expect(page).toContain('setTimerMode');
  });

  it('records the elapsed time on tap, rounded to a whole second like manual entry', () => {
    expect(page).toContain('Math.round(elapsedMs / 1000)');
    // Reuses the same write path as typing a time by hand — one place
    // that actually calls updateEntry, not a second copy of it.
    expect(page).toContain('onRecord={(entry) => handleComplete(');
  });

  it('only lets a tap record while the clock is actually running', () => {
    const panel = page.slice(page.indexOf('const IntervalTimerPanel'), page.indexOf('const IntervalSessionManagePage'));
    expect(panel).toContain("tappable = recorded != null || phase === 'running'");
    expect(panel).toContain('disabled={!tappable}');
  });

  it('lets a mistap be cleared without needing the clock running', () => {
    const panel = page.slice(page.indexOf('const IntervalTimerPanel'), page.indexOf('const IntervalSessionManagePage'));
    expect(panel).toContain('recorded != null ? onClear(entry) : onRecord(entry)');
  });

  it('keeps the clock ticking independent of which panel is on screen', () => {
    // Switching to Manual and back to Timer must not silently reset a
    // clock that's mid-run — the stopwatch state lives in the page, not
    // inside IntervalTimerPanel itself.
    const panelDeclaration = page.slice(page.indexOf('const IntervalTimerPanel'), page.indexOf('IntervalTimerPanel: React.FC') + 400);
    expect(panelDeclaration).not.toContain('useState');
    expect(page).toContain("const [timerPhase, setTimerPhase] = useState<'idle' | 'running'>('idle')");
  });

  it('clears the running interval on unmount', () => {
    expect(page).toContain('if (intervalRef.current) clearInterval(intervalRef.current)');
  });

  it('records into whichever rep is currently selected, same state the manual grid uses', () => {
    expect(page).toContain('activeRep={activeRep}');
    expect(page).toContain('setActiveRep={setActiveRep}');
  });
});
