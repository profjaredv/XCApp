// Per-team feature switches. Two things are worth a test here: what an
// unconfigured team gets (everything, unchanged — this shipped to teams
// that never asked for it), and that turning a feature off actually closes
// the API rather than only hiding a button.
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const {
  FEATURES,
  resolveFeatures,
  isFeatureEnabled,
  describeFeatures,
  applyFeatureUpdate,
} = require('../lib/teamFeatures');
const { requireFeature } = require('../middleware/teamFeatures');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function stubTeamFindUnique(t, impl) {
  const original = prisma.team.findUnique;
  prisma.team.findUnique = async (...args) => impl(...args);
  t.after(() => {
    prisma.team.findUnique = original;
  });
}

test('every feature defaults on, so an existing team sees no change', () => {
  const resolved = resolveFeatures(null);
  assert.equal(Object.keys(resolved).length, FEATURES.length);
  for (const feature of FEATURES) {
    assert.equal(feature.default, true, `${feature.key} must default on`);
    assert.equal(resolved[feature.key], true);
  }
});

test('stored values win over defaults, one key at a time', () => {
  const resolved = resolveFeatures({ attendance: false });
  assert.equal(resolved.attendance, false);
  assert.equal(resolved.equipment, true, 'untouched features stay on');
});

test('junk in the column does not turn features off', () => {
  // A row could hold anything; only booleans on known keys are honoured.
  assert.equal(resolveFeatures({ attendance: 'no' }).attendance, true);
  assert.equal(resolveFeatures('nonsense').attendance, true);
  assert.equal(resolveFeatures({ notAFeature: false }).attendance, true);
});

test('an unknown key reads as enabled rather than silently 403ing a working route', () => {
  assert.equal(isFeatureEnabled(null, 'somethingNobodyDefined'), true);
});

test('describeFeatures carries the copy the settings screen renders', () => {
  const described = describeFeatures({ equipment: false });
  const equipment = described.find((f) => f.key === 'equipment');
  assert.equal(equipment.enabled, false);
  assert.ok(equipment.label);
  assert.ok(equipment.description);
});

test('an update rejects unknown keys and non-booleans instead of ignoring them', () => {
  const { features, unknownKeys } = applyFeatureUpdate(null, {
    attendance: false,
    madeUp: true,
    equipment: 'off',
  });
  assert.deepEqual(unknownKeys.sort(), ['equipment', 'madeUp']);
  assert.equal(features.attendance, false);
});

test('an update only writes the keys it was given', () => {
  const { features } = applyFeatureUpdate({ equipment: false }, { attendance: false });
  assert.equal(features.attendance, false);
  assert.equal(features.equipment, false, 'an earlier choice is not reset by a later one');
});

test('requireFeature 403s when the team turned the feature off', async (t) => {
  stubTeamFindUnique(t, async () => ({ features: { attendance: false } }));
  const res = mockRes();
  let nexted = false;
  await requireFeature('attendance')({ user: { teamId: 'team-1' } }, res, () => {
    nexted = true;
  });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FEATURE_DISABLED');
  assert.equal(res.body.feature, 'attendance');
});

test('requireFeature lets an unconfigured team through', async (t) => {
  stubTeamFindUnique(t, async () => ({ features: null }));
  let nexted = false;
  await requireFeature('attendance')({ user: { teamId: 'team-1' } }, mockRes(), () => {
    nexted = true;
  });
  assert.equal(nexted, true);
});

test('requireFeature gates one feature without touching the others', async (t) => {
  stubTeamFindUnique(t, async () => ({ features: { attendance: false } }));
  let nexted = false;
  await requireFeature('equipment')({ user: { teamId: 'team-1' } }, mockRes(), () => {
    nexted = true;
  });
  assert.equal(nexted, true);
});

test('a request with no team is left to the route own team check', async (t) => {
  stubTeamFindUnique(t, async () => {
    throw new Error('should not be queried without a team');
  });
  let nexted = false;
  await requireFeature('attendance')({ user: {} }, mockRes(), () => {
    nexted = true;
  });
  assert.equal(nexted, true);
});

// The gate is only real if it is actually on the routes. A feature the
// settings screen offers to turn off, whose API stays open, is worse than
// no switch at all: the coach believes it is off.
test('every route of an optional feature carries the gate', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const gated = {
    'attendance.js': 'attendance',
    'equipment.js': 'equipment',
    'fieldResults.js': 'fieldResults',
    'raceReflections.js': 'reflections',
  };

  for (const [file, key] of Object.entries(gated)) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'routes', file), 'utf8');
    const routes = source.match(/^router\.(get|post|put|patch|delete)\([^\n]*$/gm) || [];
    assert.ok(routes.length > 0, `${file} has routes`);
    for (const route of routes) {
      assert.ok(
        route.includes(`requireFeature('${key}')`),
        `${file}: ${route.slice(0, 60)}… is missing requireFeature('${key}')`
      );
    }
  }
});
