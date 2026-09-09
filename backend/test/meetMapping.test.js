const test = require('node:test');
const assert = require('node:assert/strict');
const {
  stripLevelGenderSuffix,
  buildMeetMappingProposal,
  raceIdentityKey,
  groupMeetMetricsByMeet,
  groupRacesIntoColumns,
} = require('../lib/meetMapping');

test('stripLevelGenderSuffix', () => {
  assert.equal(stripLevelGenderSuffix('Sunfair Invite - Boys Varsity'), 'Sunfair Invite');
  assert.equal(stripLevelGenderSuffix('Sunfair Invite - Girls JV'), 'Sunfair Invite');
  assert.equal(stripLevelGenderSuffix('Sunfair Invite — Boy Frosh'), 'Sunfair Invite');
  assert.equal(stripLevelGenderSuffix('District Championships'), 'District Championships');
});

test('buildMeetMappingProposal groups races by exact (team, season, date), not name similarity', () => {
  const races = [
    { id: 'r1', teamId: 't1', seasonId: 's1', name: 'Sunfair Invite - Boys Varsity', date: '2024-09-07', location: 'Sunfair Park' },
    { id: 'r2', teamId: 't1', seasonId: 's1', name: 'Sunfair Invite - Girls Varsity', date: '2024-09-07', location: 'Sunfair Park' },
    { id: 'r3', teamId: 't1', seasonId: 's1', name: 'District Meet', date: '2024-10-05', location: 'Franklin Park' },
    // Same team, same day next year — a different Season, so a different meet.
    { id: 'r4', teamId: 't1', seasonId: 's2', name: 'Sunfair Invite - Boys Varsity', date: '2024-09-07', location: 'Sunfair Park' },
  ];

  const { meets, noSeason } = buildMeetMappingProposal({ races });

  assert.equal(noSeason.length, 0);
  assert.equal(meets.length, 3);

  const sunfair2024 = meets.find((m) => m.raceIds.includes('r1'));
  assert.deepEqual(sunfair2024.raceIds.sort(), ['r1', 'r2']);
  assert.equal(sunfair2024.proposedName, 'Sunfair Invite');
  assert.equal(sunfair2024.location, 'Sunfair Park');

  const district = meets.find((m) => m.raceIds.includes('r3'));
  assert.deepEqual(district.raceIds, ['r3']);
  assert.equal(district.proposedName, 'District Meet');

  const sunfairOtherSeason = meets.find((m) => m.raceIds.includes('r4'));
  assert.notEqual(sunfairOtherSeason, sunfair2024);
  assert.deepEqual(sunfairOtherSeason.raceIds, ['r4']);
});

test('races with no matching Season row are reported separately, never grouped by guesswork', () => {
  const races = [
    { id: 'r1', teamId: 't1', seasonId: null, name: 'Mystery Meet', date: '2024-09-01', location: null },
    { id: 'r2', teamId: 't1', seasonId: 's1', name: 'Real Meet', date: '2024-09-08', location: 'Franklin Park' },
  ];

  const { meets, noSeason } = buildMeetMappingProposal({ races });

  assert.equal(meets.length, 1);
  assert.equal(noSeason.length, 1);
  assert.equal(noSeason[0].id, 'r1');
});

test('proposedName falls back to the most common raw race name when every name is stripped to nothing', () => {
  const races = [
    { id: 'r1', teamId: 't1', seasonId: 's1', name: 'Boys Varsity', date: '2024-09-01', location: null },
    { id: 'r2', teamId: 't1', seasonId: 's1', name: 'Boys Varsity', date: '2024-09-01', location: null },
  ];

  const { meets } = buildMeetMappingProposal({ races });

  assert.equal(meets.length, 1);
  assert.equal(meets[0].proposedName, 'Boys Varsity');
  assert.equal(meets[0].location, null);
});

test('location uses the most common non-null value across the group', () => {
  const races = [
    { id: 'r1', teamId: 't1', seasonId: 's1', name: 'Invite - Boys Varsity', date: '2024-09-01', location: 'Sunfair Park' },
    { id: 'r2', teamId: 't1', seasonId: 's1', name: 'Invite - Girls Varsity', date: '2024-09-01', location: null },
  ];

  const { meets } = buildMeetMappingProposal({ races });

  assert.equal(meets[0].location, 'Sunfair Park');
});

// POST /scrape (routes/teams.js) deletes and recreates every non-manual
// race for a season on every re-import — this is what carries an
// already-grouped race's meetId across that cycle, so re-scraping a
// season a coach already ran Import on doesn't silently un-group it.
test('raceIdentityKey', async (t) => {
  await t.test('matches for the same name/date/distance regardless of Date vs string date', () => {
    const d = new Date('2024-09-07T00:00:00.000Z');
    assert.equal(raceIdentityKey('Sunfair Invite', d, '5000'), raceIdentityKey('Sunfair Invite', d.toISOString(), '5000'));
  });

  await t.test('differs when name, date, or distance differs', () => {
    const d = new Date('2024-09-07T00:00:00.000Z');
    const base = raceIdentityKey('Sunfair Invite', d, '5000');
    assert.notEqual(base, raceIdentityKey('District Meet', d, '5000'));
    assert.notEqual(base, raceIdentityKey('Sunfair Invite', new Date('2024-09-08T00:00:00.000Z'), '5000'));
    assert.notEqual(base, raceIdentityKey('Sunfair Invite', d, '3200'));
  });
});

// Season > Meets list (GET /analytics/overview) — a coach's 4-heat meet
// should read as one entry, not four, without touching the per-race
// analytics (IQR/scoring/splits) that stay per-heat.
test('groupMeetMetricsByMeet', async (t) => {
  const row = (raceId, overrides = {}) => ({
    raceId,
    meetName: `Race ${raceId}`,
    meetDate: '2024-09-07',
    distance: 5000,
    averagePace: 420,
    participantCount: 10,
    ...overrides,
  });

  await t.test('groups races sharing a meetId into one entry', () => {
    const rows = [row('r1'), row('r2'), row('r3')];
    const meetInfo = new Map([
      ['r1', { id: 'm1', name: 'Sunfair Invite', location: 'Sunfair Park' }],
      ['r2', { id: 'm1', name: 'Sunfair Invite', location: 'Sunfair Park' }],
      ['r3', { id: 'm1', name: 'Sunfair Invite', location: 'Sunfair Park' }],
    ]);
    const meets = groupMeetMetricsByMeet(rows, meetInfo, new Set());
    assert.equal(meets.length, 1);
    assert.equal(meets[0].id, 'm1');
    assert.equal(meets[0].name, 'Sunfair Invite');
    assert.equal(meets[0].heats.length, 3);
  });

  await t.test('leaves an unlinked race (no Meet, e.g. never run through Import) as its own single entry', () => {
    const rows = [row('r1'), row('r2')];
    const meets = groupMeetMetricsByMeet(rows, new Map(), new Set());
    assert.equal(meets.length, 2);
    assert.equal(meets[0].heats, undefined);
    assert.equal(meets[1].heats, undefined);
  });

  await t.test('sums runner counts across heats rather than keeping just one heat\'s count', () => {
    const rows = [row('r1', { participantCount: 40 }), row('r2', { participantCount: 12 })];
    const meetInfo = new Map([
      ['r1', { id: 'm1', name: 'Meet', location: null }],
      ['r2', { id: 'm1', name: 'Meet', location: null }],
    ]);
    const meets = groupMeetMetricsByMeet(rows, meetInfo, new Set());
    assert.equal(meets[0].runners, 52);
  });

  await t.test('weights average pace by field size, not a naive average of the heats\' averages', () => {
    // A 40-runner heat at 6:00/mi and a 10-runner heat at 8:00/mi should
    // land much closer to 6:00 than to a naive midpoint of 7:00.
    const rows = [
      row('r1', { participantCount: 40, averagePace: 360 }),
      row('r2', { participantCount: 10, averagePace: 480 }),
    ];
    const meetInfo = new Map([
      ['r1', { id: 'm1', name: 'Meet', location: null }],
      ['r2', { id: 'm1', name: 'Meet', location: null }],
    ]);
    const meets = groupMeetMetricsByMeet(rows, meetInfo, new Set());
    const expected = (40 * 360 + 10 * 480) / 50;
    assert.ok(Math.abs(meets[0].avgPace - expected) < 0.001);
    assert.ok(meets[0].avgPace < 420); // strictly closer to 360 than the naive 420 midpoint
  });

  await t.test('marks the group as having splits if any one heat does', () => {
    const rows = [row('r1'), row('r2')];
    const meetInfo = new Map([
      ['r1', { id: 'm1', name: 'Meet', location: null }],
      ['r2', { id: 'm1', name: 'Meet', location: null }],
    ]);
    const meets = groupMeetMetricsByMeet(rows, meetInfo, new Set(['r2']));
    assert.equal(meets[0].hasSplits, true);
  });

  await t.test('never groups races from different meets together, even on the same day', () => {
    const rows = [row('r1'), row('r2')];
    const meetInfo = new Map([
      ['r1', { id: 'm1', name: 'Meet A', location: null }],
      ['r2', { id: 'm2', name: 'Meet B', location: null }],
    ]);
    const meets = groupMeetMetricsByMeet(rows, meetInfo, new Set());
    assert.equal(meets.length, 2);
  });

  await t.test('sorts the result by date', () => {
    const rows = [row('r1', { meetDate: '2024-10-01' }), row('r2', { meetDate: '2024-09-01' })];
    const meets = groupMeetMetricsByMeet(rows, new Map(), new Set());
    assert.deepEqual(meets.map((m) => m.id), ['r2', 'r1']);
  });
});

// Results Grid (GET /teams/results-grid) — a multi-heat meet should be
// one column, not one per heat.
test('groupRacesIntoColumns', async (t) => {
  await t.test('combines races sharing a meetId into one column', () => {
    const races = [
      { id: 'r1', name: 'Sunfair Invite - Boys Varsity', meetId: 'm1', meetName: 'Sunfair Invite' },
      { id: 'r2', name: 'Sunfair Invite - Girls Varsity', meetId: 'm1', meetName: 'Sunfair Invite' },
    ];
    const columns = groupRacesIntoColumns(races);
    assert.equal(columns.length, 1);
    assert.equal(columns[0].name, 'Sunfair Invite');
    assert.deepEqual(columns[0].raceIds, ['r1', 'r2']);
  });

  await t.test('keeps an unlinked race (no meetId) as its own column, using its own name', () => {
    const races = [{ id: 'r1', name: 'District Meet', meetId: null, meetName: null }];
    const columns = groupRacesIntoColumns(races);
    assert.equal(columns.length, 1);
    assert.equal(columns[0].name, 'District Meet');
    assert.deepEqual(columns[0].raceIds, ['r1']);
  });

  await t.test('never merges races from two different meets', () => {
    const races = [
      { id: 'r1', name: 'Race A', meetId: 'm1', meetName: 'Meet A' },
      { id: 'r2', name: 'Race B', meetId: 'm2', meetName: 'Meet B' },
    ];
    const columns = groupRacesIntoColumns(races);
    assert.equal(columns.length, 2);
  });

  await t.test('preserves input order, matching the date-ascending order races are queried in', () => {
    const races = [
      { id: 'r1', name: 'A', meetId: null, meetName: null },
      { id: 'r2', name: 'B', meetId: null, meetName: null },
    ];
    const columns = groupRacesIntoColumns(races);
    assert.deepEqual(columns.map((c) => c.name), ['A', 'B']);
  });
});
