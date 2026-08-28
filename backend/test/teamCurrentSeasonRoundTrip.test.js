// GET /api/teams/current has to return every field the Settings form then
// PUTs back. It did not return currentSeason, so the form read undefined,
// fell back to the current CALENDAR year, and saving silently overwrote a
// team's real season with it — a coach opening Settings and pressing Save
// could move their whole team to the wrong season without touching that
// field. Team.currentSeason drives season-scoped screens across the app,
// so this was quiet and expensive.
//
// Static, like the other route guards here: no database needed, and it
// fails the moment the two ends drift apart again.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROUTES = fs.readFileSync(path.join(__dirname, '..', 'routes', 'teams.js'), 'utf8');
const SETTINGS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'web', 'src', 'pages', 'SettingsPage.tsx'),
  'utf8'
);

function handlerFor(marker) {
  const start = ROUTES.indexOf(marker);
  assert.ok(start > -1, `could not find ${marker}`);
  return ROUTES.slice(start, ROUTES.indexOf('\n});', start));
}

test('GET /teams/current returns every field the settings form edits', () => {
  const get = handlerFor("router.get('/current'");
  for (const field of ['id', 'name', 'athleticTeamId', 'currentSeason']) {
    assert.match(get, new RegExp(`\\b${field}:`), `GET /current must return ${field}`);
  }
});

test('the settings form reads currentSeason under the name the API sends it', () => {
  assert.match(SETTINGS, /currentSeason: response\.data\.currentSeason/);
  assert.doesNotMatch(
    SETTINGS,
    /response\.data\.current_season/,
    'snake_case here always read undefined — that was the bug'
  );
});

test('PUT accepts what the form actually sends', () => {
  const put = handlerFor("router.put('/:id'");
  assert.match(put, /body\.currentSeason/, 'must accept the camelCase the form now sends');
  // And still the old spelling, so a stale cached client keeps working.
  assert.match(put, /body\.current_season/, 'must still accept the old snake_case');
});

test('the form sends currentSeason, not current_season', () => {
  const save = SETTINGS.slice(SETTINGS.indexOf('handleSaveTeamSettings'));
  const body = save.slice(save.indexOf('api.put'), save.indexOf('});', save.indexOf('api.put')));
  assert.match(body, /currentSeason/);
  assert.doesNotMatch(body, /current_season/);
});

test('a season that is not a number is ignored rather than written as NaN', () => {
  const put = handlerFor("router.put('/:id'");
  assert.match(put, /Number\.isFinite\(parseInt\(currentSeason, 10\)\)/);
});
