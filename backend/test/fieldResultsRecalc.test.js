// A field-results upload wrote FieldResult rows and updated the race's
// own place/overallPlace, but never touched the precomputed
// TeamSeasonMetrics/AthleteSeasonMetrics rows that Season > Meets, the
// Program tab's "Top 20% of Field" chart, and band analytics
// normalization all actually read (calculationService.js). A coach who
// uploaded field results saw nothing change anywhere except that one
// race's own results table — invisible until a separate, undiscoverable
// "Recalculate Metrics" click.
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

const uploadRoute = code.slice(code.indexOf("router.post('/:raceId',"), code.indexOf("router.post('/:raceId/copy-from-meet'"));
const deleteRoute = code.slice(code.indexOf("router.delete('/:raceId'"));

test('imports the calculation service', () => {
  assert.match(code, /require\('\.\.\/services\/performance\/calculationService'\)/);
});

test('a field-results upload recalculates that race\'s season', () => {
  assert.match(uploadRoute, /calculationService\s*\n?\s*\.calculateAllMetrics\(teamId, race\.season\)/);
});

test('clearing field results also recalculates — an undo should not leave stale numbers', () => {
  assert.match(deleteRoute, /calculationService\s*\n?\s*\.calculateAllMetrics\(teamId, race\.season\)/);
});

test('the recalculation is fire-and-forget, not awaited — a coach should not wait on a full season recalc', () => {
  assert.doesNotMatch(uploadRoute, /await calculationService/);
  assert.doesNotMatch(deleteRoute, /await calculationService/);
});

test('a recalculation failure is caught, not left to crash the request', () => {
  const uploadCall = uploadRoute.slice(uploadRoute.indexOf('calculationService'), uploadRoute.indexOf('res.json({'));
  assert.match(uploadCall, /\.catch\(/);
  const deleteCall = deleteRoute.slice(deleteRoute.indexOf('calculationService'), deleteRoute.indexOf('res.json({ success: true });'));
  assert.match(deleteCall, /\.catch\(/);
});

test('recalculation runs after the placements are recomputed, not before', () => {
  const uploadOrder = uploadRoute.indexOf('recomputeRacePlacements');
  const uploadRecalc = uploadRoute.indexOf('calculationService');
  assert.ok(uploadOrder < uploadRecalc && uploadOrder !== -1);

  const deleteOrder = deleteRoute.indexOf('recomputeRacePlacements');
  const deleteRecalc = deleteRoute.indexOf('calculationService');
  assert.ok(deleteOrder < deleteRecalc && deleteOrder !== -1);
});

test('copying another team\'s shared aggregate stats does not trigger a recalc — it creates no FieldResult rows for this team to score against', () => {
  const copyRoute = code.slice(
    code.indexOf("router.post('/:raceId/copy-from-meet'"),
    code.indexOf("router.delete('/:raceId'")
  );
  assert.doesNotMatch(copyRoute, /calculationService/);
});
