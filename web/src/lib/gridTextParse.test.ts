import { describe, expect, it } from 'vitest';
import text from './fixtures/grid-boys.txt?raw';
import backendPayload from '../../../backend/test/fixtures/grid-boys-payload.json';
import { buildGridPayload, countRaw, parseGridText, parseMeetInfo } from './gridTextParse';

// grid-boys.txt is Jared's real Boys paste (Ellensburg 2026) with every
// athlete name replaced by a made-up one. Everything else is as pasted:
// initials lines, the sparse age column, blank cells, three DNS cells, the
// mixed-case initials ("Iv"), the wrapped continuation line, the distance
// key and the meet list.

describe('parseGridText on the Boys fixture', () => {
  const grid = parseGridText(text);

  it('reads 71 athletes, 415 finishes, 3 non-finishes, 7 meets', () => {
    expect(grid.errors).toEqual([]);
    expect(countRaw(grid)).toEqual({ athletes: 71, finishes: 415, nonFinishes: 3, meets: 7 });
    expect(grid.dates).toHaveLength(7);
    expect(grid.legend).toMatchObject({ '1': '1 Miles', '4': '4200 Meters', '6': '5000 Meters' });
  });

  it('joins the continuation line and keeps the rest of that row', () => {
    const kai = grid.athletes.find((a) => a.name === 'Kai Yates')!;
    expect(kai.cells).toHaveLength(7);
    expect(kai.cells[0].map((e) => e.time)).toEqual(['6:07.0', '6:39.0']);
    // The five results after the wrapped cell are the ones a line-by-line parse lost.
    expect(kai.cells.slice(2, 6).map((c) => c[0].time)).toEqual(['19:55.8', '20:32.9', '20:49.0', '20:44.5']);
    expect(kai.cells[1]).toEqual([]);
    expect(kai.age).toBe(17);
  });

  it('handles mixed-case and hyphenated initials and the sparse age column', () => {
    expect(grid.athletes.find((a) => a.name === 'Ivor vanDerBeek')?.initials).toBe('Iv');
    expect(grid.athletes.find((a) => a.name === 'Fenn Marsh-Dale')?.initials).toBe('FM');
    expect(grid.athletes.filter((a) => a.age != null).length).toBeGreaterThan(0);
    expect(grid.athletes.filter((a) => a.age == null).length).toBeGreaterThan(40);
  });

  it('reads the three DNS cells as non-finishes with their distance code', () => {
    const dns = grid.athletes.flatMap((a) => a.cells.flat()).filter((e) => e.status === 'DNS');
    expect(dns).toHaveLength(3);
    expect(dns.every((e) => e.time === null && e.code === '4')).toBe(true);
  });

  it('survives a PB badge wrapped inside a cell', () => {
    const g = parseGridText('Gr\tAge\t\tAthlete\tSep 8\tSep 11\n11\t\t\nAB\nAmy Bee\t5:53.0 1\t8:54.2 \nPB\n2\n');
    expect(g.athletes[0].cells[1][0]).toEqual({ time: '8:54.2', status: 'FINISHED', code: '2' });
    expect(g.athletes[0].junk).toBe(false);
  });

  it('accepts h:mm:ss times', () => {
    const g = parseGridText('Gr\tAge\t\tAthlete\tSep 8\n11\t\t\nAB\nAmy Bee\t1:02:03.4 6\n');
    expect(g.athletes[0].cells[0][0].time).toBe('1:02:03.4');
  });
});

describe('parseMeetInfo', () => {
  it('reads the key and the meet list from a fallback paste', () => {
    const info = parseMeetInfo('Race Distances:1 1 Miles |2 1.5 Miles\n(Useful for copying to Excel)\nMeet List\nSep 8\nReed Park Time Trial\nSep 11\tRelays\n');
    expect(info.legend).toEqual({ '1': '1 Miles', '2': '1.5 Miles' });
    expect(info.meets).toEqual([{ date: 'Sep 8', name: 'Reed Park Time Trial' }, { date: 'Sep 11', name: 'Relays' }]);
  });
});

describe('buildGridPayload', () => {
  it('matches the payload fixture the backend tests plan from (regenerate it if this fails)', () => {
    expect(buildGridPayload(parseGridText(text), 'Men').payload).toEqual(backendPayload);
  });

  it('builds the payload: one race per meet and distance, the faster of two attempts preselected', () => {
    const r = buildGridPayload(parseGridText(text), 'Men');
    expect(r.errors).toEqual([]);
    const p = r.payload!;
    expect(p.meets).toHaveLength(7);
    expect(p.athletes).toHaveLength(71);
    const distancesByMeet = (i: number) =>
      [...new Set(p.athletes.flatMap((a) => a.cells.filter((c) => c.meet === i).map((c) => c.distance)))].sort();
    expect(distancesByMeet(2)).toEqual(['4200 Meters', '5000 Meters']); // Bellevue
    expect(distancesByMeet(4)).toEqual(['2 Miles', '3 Miles']); // Sunfair
    expect(distancesByMeet(0)).toEqual(['1 Miles']);
    const kai = p.athletes.find((a) => a.name === 'Kai Yates')!;
    expect(kai.cells[0]).toMatchObject({ meet: 0, time: '6:07.0', alternatives: ['6:07.0', '6:39.0'] });
    // 414 finishes (415 minus the not-picked attempt) + 3 DNS.
    expect(p.athletes.flatMap((a) => a.cells)).toHaveLength(417);
    expect(p.athletes.flatMap((a) => a.cells).filter((c) => c.status === 'DNS')).toHaveLength(3);
  });

  it('refuses a grid copied with subscripts off', () => {
    const off = text.replace(/(\d:\d\d(?:\.\d)?) \d\b/g, '$1').replace(/DNS \d/g, 'DNS');
    const r = buildGridPayload(parseGridText(off), 'Men');
    expect(r.payload).toBeNull();
    expect(r.errors[0]).toMatch(/Turn subscripts back on/);
  });

  it('asks for the meet list and key when the paste has neither, and accepts them from the fallback box', () => {
    const tableOnly = text.slice(0, text.indexOf('Race Distances:'));
    const first = buildGridPayload(parseGridText(tableOnly), 'Men');
    expect(first).toMatchObject({ payload: null, needsMeetInfo: true, errors: [] });
    const below = text.slice(text.indexOf('Race Distances:'));
    const second = buildGridPayload(parseGridText(tableOnly), 'Men', below);
    expect(second.errors).toEqual([]);
    expect(second.payload?.athletes).toHaveLength(71);
  });

  it('refuses a header and meet list that disagree', () => {
    const bad = text.replace('Sep 19\nBellevue', 'Sep 20\nBellevue');
    const r = buildGridPayload(parseGridText(bad), 'Men');
    expect(r.errors[0]).toBe("The meet list doesn't line up with the grid. Copy the whole page again.");
  });

  it('refuses a row with more cells than dates, naming the athlete', () => {
    const bad = text.replace('Aiden Dunmore\t', 'Aiden Dunmore\t \t \t \t \t \t \t \t ');
    const r = buildGridPayload(parseGridText(bad), 'Men');
    expect(r.errors[0]).toBe("Row for Aiden Dunmore doesn't line up. Copy the whole page again.");
  });

  it('refuses a distance code that is not in the key', () => {
    const bad = text.replace('6:39.0 1\t9:59.8 2', '6:39.0 1\t9:59.8 9');
    const r = buildGridPayload(parseGridText(bad), 'Men');
    expect(r.errors[0]).toBe('Unknown distance code 9.');
  });

  it('tolerates trailing blank cells being trimmed from a row', () => {
    const trimmed = text.replace(/\t \t $/gm, '').replace(/\t $/gm, '');
    const r = buildGridPayload(parseGridText(trimmed), 'Men');
    expect(r.errors).toEqual([]);
    expect(r.payload?.athletes).toHaveLength(71);
  });

  it('rejects something that is not a Results Grid', () => {
    expect(buildGridPayload(parseGridText('hello world'), 'Men').errors[0]).toMatch(/Ctrl\+A/);
  });
});
