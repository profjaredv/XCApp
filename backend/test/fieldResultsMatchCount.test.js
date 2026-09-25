// GET /api/field-results/races — a CSV can upload and normalize fine
// (fieldMeanSec/fieldFinisherCount both set) while matching NONE of this
// team's own athletes by name (a different export's "Last, First" vs the
// roster's "First Last", say). The upload looks like it worked and this
// team's own scoring, standing, and Program-tab numbers silently see none
// of it. ourResultCount/ourMatchedCount surface that instead of leaving a
// coach to guess why a recalculation "didn't make a difference."
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'fieldResults.js'), 'utf8');
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .join('\n');

const listRoute = code.slice(code.indexOf("router.get('/races',"), code.indexOf("router.post('/:raceId',"));

test('imports the same matcher every other field-results feature uses, not a new one', () => {
  assert.match(code, /finishedFieldResults, matchResultsToFieldResults \} = require\('\.\.\/lib\/fieldPlacement'\)/);
});

test('counts a match only when there is field data to match against', () => {
  assert.match(listRoute, /const ourMatchedCount = hasFieldData\s*\n?\s*\? matchResultsToFieldResults\(r\.results, finishedFieldResults\(r\.fieldResults\)\)\.size\s*\n?\s*: 0;/);
});

test('ourResultCount reflects this race\'s own results regardless of upload state', () => {
  assert.match(listRoute, /const ourResultCount = r\.results\.length;/);
});

test('both counts are returned to the client', () => {
  assert.match(listRoute, /ourResultCount,/);
  assert.match(listRoute, /ourMatchedCount,/);
});

test('pulls results/fieldResults for every race in the season, not just uploaded ones', () => {
  const query = code.slice(code.indexOf('const races = await prisma.race.findMany'), code.indexOf('const result = await Promise.all'));
  assert.match(query, /results: \{ select: \{ id: true, athlete: \{ select: \{ name: true \} \} \} \}/);
  assert.match(query, /fieldResults: true/);
});
