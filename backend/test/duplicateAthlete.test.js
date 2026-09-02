// Adding a returning athlete by hand.
//
// The failure this prevents: an athlete whose races are all in a past
// season is filtered out of the roster's default view, so they look
// missing; the coach adds them; a second Athlete row is created; the new
// row goes into groups and shows no history while several seasons of races
// stay on a row nothing points at any more. Every symptom after that
// ("he has no last race", "merge only shows one of him") is downstream of
// this one silent create.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'athletes.js'), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .join('\n');

const createRoute = code.slice(code.indexOf("router.post('/',"), code.indexOf("router.post('/import-roster'"));

test('adding a same-name athlete stops and reports the existing record', () => {
  assert.match(createRoute, /ATHLETE_EXISTS/);
  assert.match(createRoute, /status\(409\)/);
  assert.match(createRoute, /normalizeAthleteName/, 'matching must use the same normalization the scraper uses');
});

test('the conflict carries a CAREER race count, not this season', () => {
  // The existing record's races are, by definition, in a season the coach
  // is not looking at — a season-scoped count would read 0 and make the
  // duplicate look like the safe choice.
  assert.match(createRoute, /careerRaceCount/);
  const conflictBlock = createRoute.slice(createRoute.indexOf('ATHLETE_EXISTS') - 800, createRoute.indexOf('ATHLETE_EXISTS') + 400);
  assert.ok(!/race: \{ season/.test(conflictBlock), 'the conflict count must not be scoped to a season');
});

test('two genuinely same-named athletes are still possible', () => {
  // A 120-person roster having two Jack Smiths is normal; this is a
  // question, not a rule.
  assert.match(createRoute, /allowDuplicate/);
});

test('the roster payload carries both counts', () => {
  const listRoute = code.slice(code.indexOf("router.get('/',"), code.indexOf("router.get('/:athleteId'"));
  assert.match(listRoute, /raceCount: races\.length/);
  assert.match(listRoute, /careerRaceCount/);
  assert.match(listRoute, /result\.groupBy/);
});
