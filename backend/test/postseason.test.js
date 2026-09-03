// Postseason marking: how far a program got, and the reason nothing here
// infers it from a meet name.
const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestLevel, isValidLevel, countPostseason, LEVELS } = require('../lib/postseason');

test('championship names suggest the right rung of the ladder', () => {
  assert.equal(suggestLevel('OHSAA State Championship'), 'STATE');
  assert.equal(suggestLevel('State Meet'), 'STATE');
  assert.equal(suggestLevel('Region 3 Regional'), 'REGIONAL');
  assert.equal(suggestLevel('District 7 Championship'), 'DISTRICT');
  assert.equal(suggestLevel('Sectional Championship'), 'DISTRICT');
  assert.equal(suggestLevel('League Championship'), 'LEAGUE');
  assert.equal(suggestLevel('Nike Cross Nationals'), 'NATIONAL');
});

test('a meet with a state in its name is not a state meet', () => {
  // The reason this module suggests instead of applying. Marking one of
  // these silently would write a program's postseason history wrong, and
  // the coach would only ever see a number that looked plausible.
  assert.equal(suggestLevel('Penn State Invitational'), null);
  assert.equal(suggestLevel('Upstate Classic'), null);
  assert.equal(suggestLevel('Stateline Invite'), null);
  assert.equal(suggestLevel('Garden State Relays'), null);
  assert.equal(suggestLevel('Ohio State Preview'), null);
});

test('an ordinary meet suggests nothing at all', () => {
  // Null is the common and correct answer — a missing suggestion costs a
  // coach one dropdown; a wrong one they accept costs them the record.
  assert.equal(suggestLevel('Early Bird Invitational'), null);
  assert.equal(suggestLevel('Tuesday Dual'), null);
  assert.equal(suggestLevel(''), null);
  assert.equal(suggestLevel(null), null);
});

test('the first matching rung wins, so a regional qualifier is not the state meet', () => {
  assert.equal(suggestLevel('State Qualifier Regional'), 'REGIONAL');
});

test('only real levels, or null, can be stored', () => {
  assert.equal(isValidLevel(null), true);
  for (const level of LEVELS) assert.equal(isValidLevel(level), true);
  assert.equal(isValidLevel('CONFERENCE'), false);
  assert.equal(isValidLevel('state'), false, 'case matters — the enum is uppercase');
});

test('counts are distinct athletes, not results', () => {
  // Two races at the same level is not twice the depth.
  const rows = [
    { athleteId: 'a', gender: 'M', season: 2025, level: 'STATE' },
    { athleteId: 'a', gender: 'M', season: 2025, level: 'STATE' },
    { athleteId: 'b', gender: 'F', season: 2025, level: 'STATE' },
  ];
  const [season] = countPostseason(rows, [2025]);
  assert.deepEqual(season.counts.STATE, { total: 2, men: 1, women: 1 });
});

test('an athlete who ran districts and state counts at both', () => {
  const rows = [
    { athleteId: 'a', gender: 'M', season: 2025, level: 'DISTRICT' },
    { athleteId: 'a', gender: 'M', season: 2025, level: 'STATE' },
    { athleteId: 'b', gender: 'M', season: 2025, level: 'DISTRICT' },
  ];
  const [season] = countPostseason(rows, [2025]);
  assert.equal(season.counts.DISTRICT.total, 2);
  assert.equal(season.counts.STATE.total, 1);
  assert.equal(season.furthestLevel, 'STATE', 'the furthest anyone got');
});

test('a season with nothing marked is flagged, not reported as zero qualifiers', () => {
  // "Nobody reached districts" and "nobody has marked the district meet"
  // are different facts, and only one of them is about the team.
  const [season] = countPostseason([], [2025]);
  assert.equal(season.marked, false);
  assert.equal(season.furthestLevel, null);
});

test('an unknown level in the data is ignored rather than counted', () => {
  const [season] = countPostseason([{ athleteId: 'a', gender: 'M', season: 2025, level: 'GALACTIC' }], [2025]);
  assert.equal(season.marked, false);
});
