import { describe, it, expect } from 'vitest';
import { groupColumnsByMeet, distanceLabel, type GridColumn } from './resultsGridColumns';

const col = (name: string, meetKey: string, distanceMeters: number | null): GridColumn => ({
  name,
  meetKey,
  distanceMeters,
});

describe('groupColumnsByMeet', () => {
  it('puts a meet that ran two distances under ONE heading with heats', () => {
    // Both columns are named after the meet — the scraper has no per-heat
    // name — so listed flat this is the same meet twice.
    const out = groupColumnsByMeet([
      col('Ellensburg Invite', 'meet:m1', 5000),
      col('Ellensburg Invite', 'meet:m1', 3200),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Ellensburg Invite');
    expect(out[0].hasHeats).toBe(true);
    expect(out[0].columns.map((c) => c.column.distanceMeters)).toEqual([5000, 3200]);
  });

  it('gives a single-distance meet no heats, so no toggle is offered', () => {
    const out = groupColumnsByMeet([col('Sunfair', 'meet:m1', 5000)]);
    expect(out[0].hasHeats).toBe(false);
  });

  it('keeps separate meets separate even when they share a name', () => {
    // The same invitational in two seasons, or two meets a team never linked.
    const out = groupColumnsByMeet([
      col('District', 'meet:m1', 5000),
      col('District', 'race:r9', 5000),
    ]);
    expect(out).toHaveLength(2);
  });

  it('carries the original column index, so the grid can still find its data', () => {
    const out = groupColumnsByMeet([
      col('A', 'meet:m1', 5000),
      col('B', 'meet:m2', 5000),
      col('A', 'meet:m1', 3200),
    ]);
    expect(out[0].columns.map((c) => c.index)).toEqual([0, 2]);
    expect(out[1].columns.map((c) => c.index)).toEqual([1]);
  });

  it('loses no column — every one lands in exactly one group', () => {
    const columns = [
      col('A', 'meet:m1', 5000),
      col('A', 'meet:m1', 3200),
      col('B', 'meet:m2', 5000),
    ];
    const out = groupColumnsByMeet(columns);
    expect(out.flatMap((g) => g.columns).length).toBe(columns.length);
  });

  it('preserves the order meets first appear', () => {
    const out = groupColumnsByMeet([
      col('Second', 'meet:m2', 5000),
      col('First', 'meet:m1', 5000),
      col('Second', 'meet:m2', 3200),
    ]);
    expect(out.map((g) => g.name)).toEqual(['Second', 'First']);
  });

  it('handles an empty grid', () => {
    expect(groupColumnsByMeet([])).toEqual([]);
  });
});

describe('distanceLabel', () => {
  it('reads the way a coach says it', () => {
    expect(distanceLabel(5000)).toBe('5K');
    expect(distanceLabel(2000)).toBe('2K');
    expect(distanceLabel(1609)).toBe('Mile');
    expect(distanceLabel(1609.34)).toBe('Mile');
    expect(distanceLabel(3200)).toBe('3200m');
  });

  it('says so rather than inventing a distance', () => {
    expect(distanceLabel(null)).toBe('Distance unknown');
  });
});
