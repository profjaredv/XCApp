// Dynamic groups — lists the data draws rather than ones a coach builds by
// hand. Ranking logic is arithmetic AND it decides who a coach sees as
// "fastest", so it gets tested directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { findRule, evaluateRule, buildAthleteRaces, clampLimit, MAX_LIMIT } = require('../lib/dynamicGroups');

const FIVE_K = 5000;

function race(athleteId, date, timeSec, overrides = {}) {
  return {
    athleteId,
    name: `Athlete ${athleteId}`,
    gender: 'M',
    grade: 11,
    timeSec,
    distanceMeters: FIVE_K,
    date,
    ...overrides,
  };
}

function membersOf(result, gender = 'M') {
  const list = result.lists.find((l) => l.gender === gender);
  return list ? list.members : [];
}

test('builds one race history per athlete, oldest race first', () => {
  const byAthlete = buildAthleteRaces([
    race('a', '2026-09-12', 1050),
    race('a', '2026-09-05', 1080),
  ]);
  const entry = byAthlete.get('a');
  assert.equal(entry.races.length, 2);
  assert.deepEqual(
    entry.races.map((r) => r.date),
    ['2026-09-05', '2026-09-12']
  );
});

test('a race with no usable time or distance is left out, never counted as zero', () => {
  const byAthlete = buildAthleteRaces([
    race('a', '2026-09-05', 1080),
    race('a', '2026-09-12', 0),
    race('a', '2026-09-19', 1000, { distanceMeters: 0 }),
  ]);
  assert.equal(byAthlete.get('a').races.length, 1);
});

test('an athlete with no usable race is simply absent', () => {
  const result = evaluateRule(findRule('fastest'), [race('a', '2026-09-05', 0)]);
  assert.deepEqual(result.lists, []);
});

test('fastest ranks by best pace, not most recent', () => {
  const rows = [
    race('a', '2026-09-05', 1000),
    race('a', '2026-09-12', 1200), // a bad day does not cost them the ranking
    race('b', '2026-09-12', 1100),
  ];
  const members = membersOf(evaluateRule(findRule('fastest'), rows));
  assert.deepEqual(members.map((m) => m.athleteId), ['a', 'b']);
  assert.deepEqual(members.map((m) => m.rank), [1, 2]);
});

test('boys and girls are ranked separately, always', () => {
  const rows = [
    race('boy', '2026-09-05', 1000),
    race('girl', '2026-09-05', 1100, { gender: 'F' }),
  ];
  const result = evaluateRule(findRule('fastest'), rows);
  assert.deepEqual(membersOf(result, 'M').map((m) => m.athleteId), ['boy']);
  assert.deepEqual(membersOf(result, 'F').map((m) => m.athleteId), ['girl']);
});

test('an athlete with no gender on file gets a list rather than disappearing', () => {
  const result = evaluateRule(findRule('fastest'), [race('a', '2026-09-05', 1000, { gender: null })]);
  const unknown = result.lists.find((l) => l.gender === null);
  assert.equal(unknown.members.length, 1);
});

test('most improved measures the first race against the best one since', () => {
  const rows = [
    race('a', '2026-09-05', 1200),
    race('a', '2026-09-12', 1100),
    race('a', '2026-09-19', 1150), // best is the middle race, not the last
    race('b', '2026-09-05', 1200),
    race('b', '2026-09-19', 1190),
  ];
  const members = membersOf(evaluateRule(findRule('most-improved'), rows));
  assert.deepEqual(members.map((m) => m.athleteId), ['a', 'b']);
  assert.ok(members[0].value > members[1].value);
});

test('nobody appears on an improvement list for getting slower', () => {
  const rows = [race('a', '2026-09-05', 1000), race('a', '2026-09-12', 1100)];
  assert.deepEqual(membersOf(evaluateRule(findRule('most-improved'), rows)), []);
  assert.deepEqual(membersOf(evaluateRule(findRule('recent-gains'), rows)), []);
});

test('a single race is not an improvement', () => {
  assert.deepEqual(membersOf(evaluateRule(findRule('most-improved'), [race('a', '2026-09-05', 1000)])), []);
});

test('recent gains compares the last two races, which season-long improvement cannot', () => {
  // 'a' is way up on the season but had a bad Saturday; 'b' is barely up
  // on the season but ran their best race last weekend.
  const rows = [
    race('a', '2026-09-05', 1300),
    race('a', '2026-09-12', 1000),
    race('a', '2026-09-19', 1080),
    race('b', '2026-09-12', 1200),
    race('b', '2026-09-19', 1150),
  ];
  assert.deepEqual(membersOf(evaluateRule(findRule('most-improved'), rows)).map((m) => m.athleteId), ['a', 'b']);
  assert.deepEqual(membersOf(evaluateRule(findRule('recent-gains'), rows)).map((m) => m.athleteId), ['b']);
});

test('next up starts at eighth and measures the gap to seventh', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    // 1000, 1010, 1020 … so seventh runs 1060 and eighth runs 1070.
    rows.push(race(`a${i}`, '2026-09-05', 1000 + i * 10));
  }
  const members = membersOf(evaluateRule(findRule('next-up'), rows));
  assert.deepEqual(members.map((m) => m.athleteId), ['a7', 'a8', 'a9']);
  assert.equal(members[0].rank, 8);
  assert.ok(members[0].value > 0, 'eighth is behind seventh, not level with them');
  assert.ok(members[0].value < members[1].value);
});

test('a squad of seven or fewer has no next seven', () => {
  const rows = Array.from({ length: 6 }, (_, i) => race(`a${i}`, '2026-09-05', 1000 + i * 10));
  assert.deepEqual(membersOf(evaluateRule(findRule('next-up'), rows)), []);
});

test('limit is honoured, bounded, and falls back to the rule default', () => {
  const rows = Array.from({ length: 30 }, (_, i) => race(`a${i}`, '2026-09-05', 1000 + i));
  assert.equal(membersOf(evaluateRule(findRule('fastest'), rows, { limit: 5 })).length, 5);
  assert.equal(membersOf(evaluateRule(findRule('fastest'), rows)).length, 20, 'the rule default');
  assert.equal(clampLimit('9999', 20), MAX_LIMIT);
  assert.equal(clampLimit('nonsense', 20), 20);
  assert.equal(clampLimit('0', 20), 20);
});

test('an unknown rule key is not a rule', () => {
  assert.equal(findRule('whatever'), null);
});

// The rule these lists must never break: they are computed, not stored.
// GroupMembership is effective-dated history that analytics segments race
// performance on; a list that reshuffles every meet must never write to it.
test('nothing here persists a membership', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'dynamicGroups.js'), 'utf8');
  const code = source
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  assert.ok(!code.includes('prisma'), 'dynamic groups are pure — no database writes to get wrong');
  assert.ok(!code.includes('groupMembership'));
});
