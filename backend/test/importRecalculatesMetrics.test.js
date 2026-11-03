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

test('a season import fires calculateAllMetrics after importing, without awaiting it', () => {
  // The import (used by POST /teams/import-season-csv)
  // lives in importSeasonCsv; the route awaits it and only then answer.
  const start = TEAMS.indexOf('async function importSeasonCsv(');
  const end = TEAMS.indexOf('\n// POST /api/teams/import-season-csv', start);
  const fn = TEAMS.slice(start, end);
  const calcAt = fn.indexOf('.calculateAllMetrics(team.id, yearNum)');
  assert.ok(calcAt > -1, 'import must trigger the metrics calculation');
  assert.match(fn.slice(calcAt - 60, calcAt), /calculationService\s*$/, 'not awaited: the import response must not wait on it');
  assert.match(fn.slice(calcAt, calcAt + 200), /\.catch\(/, 'a calculation failure must not fail the import');
  assert.ok(calcAt < fn.indexOf('return { recordsProcessed'), 'fired before the import returns');
  for (const call of ['await importSeasonCsv(req.user.team, yearNum, csv,']) {
    const at = TEAMS.indexOf(call);
    assert.ok(at > -1 && at < TEAMS.indexOf('success: true', at), `${call} answers only after the import`);
  }
});

test('the manual Recalculate Metrics step stays on Data Management', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'src', 'pages', 'DataManagementPage.tsx'), 'utf8');
  assert.match(page, /<EnhancedCalculateMetricsPanel/);
});
