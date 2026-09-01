// Guards on the platform usage view, and on the privacy shape it reads.
//
// The bug that prompted these: /admin/overview computed "active teams" by
// querying PageView for a teamId. PageView has no teamId — it stores a
// normalized route, a coarse role and a timestamp, deliberately (see
// lib/pageViewLogging.js: "log route, role, timestamp. No athlete
// identifiers. Aggregate counts only."). The query would have thrown at
// runtime and 500'd the whole dashboard.
//
// The fix was not to add teamId. That column would turn aggregate product
// telemetry into per-team tracking, and would contradict what the
// classification registry and the public policy page both say about this
// table. So these tests pin the absence as a design decision.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const BACKEND = path.join(__dirname, '..');
const SCHEMA = fs.readFileSync(path.join(BACKEND, 'prisma', 'schema.prisma'), 'utf8');
const ADMIN = fs.readFileSync(path.join(BACKEND, 'routes', 'admin.js'), 'utf8');
const { CLASSIFICATION } = require('../lib/dataClassification');

function modelBlock(name) {
  const m = SCHEMA.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm'));
  assert.ok(m, `${name} should exist`);
  return m[1];
}

test('PageView identifies nobody — no user, team or athlete', () => {
  const block = modelBlock('PageView');
  for (const forbidden of ['userId', 'teamId', 'athleteId', 'email', 'ip']) {
    assert.doesNotMatch(
      block,
      new RegExp(`\\b${forbidden}\\b`),
      `PageView must not carry ${forbidden} — it is aggregate-only telemetry`
    );
  }
  // What it may carry.
  for (const expected of ['route', 'role', 'createdAt']) {
    assert.match(block, new RegExp(`\\b${expected}\\b`), `PageView needs ${expected}`);
  }
});

test('nothing queries PageView for a field it does not have', () => {
  // The exact shape of the original bug.
  assert.doesNotMatch(
    ADMIN,
    /pageView[\s\S]{0,200}teamId/,
    'PageView has no teamId — per-team activity must come from work actually done'
  );
});

test('"active teams" is measured by work done, not screens opened', () => {
  const overview = ADMIN.slice(
    ADMIN.indexOf("router.get('/overview'"),
    ADMIN.indexOf("router.get('/activity'")
  );
  assert.ok(overview.length > 0);
  // Results, races and attendance all carry teamId and createdAt.
  for (const model of ['prisma.result', 'prisma.race', 'prisma.attendanceSession']) {
    assert.ok(overview.includes(model), `active-team count should consider ${model}`);
  }
  assert.doesNotMatch(overview, /prisma\.pageView/, 'page opens are not the activity signal');
});

test('usage aggregates in the database, never by loading rows', () => {
  const usage = ADMIN.slice(
    ADMIN.indexOf("router.get('/usage'"),
    ADMIN.indexOf("router.get('/team-requests'")
  );
  assert.ok(usage.length > 0);
  assert.match(usage, /groupBy/, 'route and role counts must be grouped in SQL');
  assert.doesNotMatch(
    usage,
    /pageView\.findMany/,
    'this table gains a row per navigation — findMany would load the whole history'
  );
});

test('the usage window is clamped', () => {
  const usage = ADMIN.slice(ADMIN.indexOf("router.get('/usage'"));
  assert.match(usage, /Math\.min\(Math\.max\(parseInt\(req\.query\.days, 10\) \|\| 30, 1\), 365\)/);
});

test('the classification registry still describes PageView honestly', () => {
  // The policy page renders this verbatim. If PageView ever gained an
  // identifier, this sentence would become a false statement shown to a
  // parent — so the two are checked together.
  const entry = CLASSIFICATION.PageView;
  assert.equal(entry.class, 'OPERATIONAL');
  assert.match(entry.why, /telemetry/i);
});
