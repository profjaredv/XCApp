// F4 (docs/leadpack-new-ui-trial.md §2): a successful Athletic.net season
// import must recalculate the season's metrics on its own, the same
// fire-and-forget way routes/athletes.js does after roster edits, imports
// and merges — the coach shouldn't have to know to press "Recalculate
// Metrics" afterwards (that button stays, on the Data Management page).
// No database in this sandbox, so this pins the route's shape.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const TEAMS = fs.readFileSync(path.join(__dirname, '..', 'routes', 'teams.js'), 'utf8');

test('POST /teams/scrape fires calculateAllMetrics after a successful import, without awaiting it', () => {
  const start = TEAMS.indexOf("router.post('/scrape',");
  const end = TEAMS.indexOf('router.', start + 10);
  const route = TEAMS.slice(start, end);
  const calcAt = route.indexOf('.calculateAllMetrics(team.id, yearNum)');
  assert.ok(calcAt > -1, 'import must trigger the metrics calculation');
  assert.match(route.slice(calcAt - 60, calcAt), /calculationService\s*$/, 'not awaited: the import response must not wait on it');
  assert.match(route.slice(calcAt, calcAt + 200), /\.catch\(/, 'a calculation failure must not fail the import');
  assert.ok(calcAt < route.indexOf('success: true'), 'fired before the success response');
});

test('the manual Recalculate Metrics step stays on Data Management', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'src', 'pages', 'DataManagementPage.tsx'), 'utf8');
  assert.match(page, /<EnhancedCalculateMetricsPanel/);
});
