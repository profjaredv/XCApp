// An export is a file that leaves the building. It gets emailed, dropped in
// shared drives, attached to support tickets. Two things have to be true of
// every one, and neither is the sort of thing to verify by reading:
//
//   1. Nothing in it is a live credential.
//   2. Nothing in it belongs to another team.
//
// These tests enforce both without a database — the second by checking every
// manifest entry's scoping against the real schema, so a typo'd relation
// name fails the build instead of 500ing (or, worse, being silently
// dropped by a permissive filter).
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SENSITIVE_FIELDS,
  EXCLUDED_MODELS,
  TEAM_EXPORT,
  ATHLETE_EXPORT,
  redactDeep,
} = require('../lib/exportManifest');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

function modelBlocks() {
  const out = {};
  const re = /^model (\w+) \{([\s\S]*?)^\}/gm;
  let m;
  while ((m = re.exec(SCHEMA)) !== null) out[m[1]] = m[2];
  return out;
}
const MODELS = modelBlocks();

/** 'athlete' -> 'Athlete'. Prisma client properties are the model, lower-camel. */
function modelNameFor(clientProp) {
  const target = clientProp.toLowerCase();
  return Object.keys(MODELS).find((n) => n.toLowerCase() === target) ?? null;
}

// --- redaction ---

test('every sensitive field is stripped, however deeply it is buried', () => {
  const payload = {
    team: { name: 'EHS', joinCode: 'SECRET1', stripeCustomerId: 'cus_x', stripeSubscriptionId: 'sub_x' },
    invites: [{ email: 'a@b.c', token: 'live-token' }],
    nested: { deeper: [{ also: { token: 'another' } }] },
  };
  const clean = redactDeep(payload);
  const serialized = JSON.stringify(clean);
  for (const field of SENSITIVE_FIELDS) {
    assert.ok(!serialized.includes(field), `${field} survived redaction`);
  }
  assert.ok(!serialized.includes('SECRET1'));
  assert.ok(!serialized.includes('live-token'));
  // ...while leaving everything else intact.
  assert.equal(clean.team.name, 'EHS');
  assert.equal(clean.invites[0].email, 'a@b.c');
});

test('redaction keeps dates as dates rather than flattening them to {}', () => {
  const when = new Date('2025-10-15T00:00:00Z');
  const clean = redactDeep({ date: when, rows: [{ createdAt: when }] });
  assert.ok(clean.date instanceof Date);
  assert.ok(clean.rows[0].createdAt instanceof Date);
  assert.equal(clean.date.toISOString(), when.toISOString());
});

test('redaction leaves nulls, numbers and empty collections alone', () => {
  const clean = redactDeep({ a: null, b: 0, c: '', d: [], e: {}, f: false });
  assert.deepEqual(clean, { a: null, b: 0, c: '', d: [], e: {}, f: false });
});

test('every field named as sensitive actually exists in the schema', () => {
  // A denylist that has drifted from the schema protects nothing. If a
  // field is renamed, this fails and someone has to look.
  for (const field of SENSITIVE_FIELDS) {
    assert.match(SCHEMA, new RegExp(`^\\s*${field}\\s`, 'm'), `${field} is not a schema field any more`);
  }
});

test('the schema has no OTHER token-ish field the denylist has missed', () => {
  // Catches a new credential column added later without anyone thinking
  // about exports. Names, not types, because that is what redactDeep keys
  // off — if this fails, either add the field to SENSITIVE_FIELDS or
  // exclude its whole model.
  const suspicious = new Set();
  const re = /^\s*(\w*(?:[tT]oken|[sS]ecret|[pP]assword|apiKey|ApiKey)\w*)\s+\w/gm;
  let m;
  while ((m = re.exec(SCHEMA)) !== null) suspicious.add(m[1]);
  for (const field of suspicious) {
    const covered =
      SENSITIVE_FIELDS.includes(field) ||
      // A field on a model that never gets exported at all is fine.
      Object.keys(EXCLUDED_MODELS).some((model) =>
        new RegExp(`^model ${model} \\{[\\s\\S]*?^\\s*${field}\\s`, 'm').test(SCHEMA)
      );
    assert.ok(covered, `"${field}" looks like a credential but is neither redacted nor on an excluded model`);
  }
});

// --- team export scoping ---

test('every team-export entry names a real model', () => {
  for (const entry of TEAM_EXPORT) {
    assert.ok(modelNameFor(entry.model), `${entry.key}: no model called "${entry.model}"`);
  }
});

test('every team-export entry is scoped to the team, one way or the other', () => {
  for (const entry of TEAM_EXPORT) {
    const modelName = modelNameFor(entry.model);
    const body = MODELS[modelName];
    const where = entry.where('TEAM-ID');

    if ('teamId' in where) {
      assert.match(body, /^\s*teamId\s/m, `${entry.key}: filtered on teamId but ${modelName} has no such field`);
      assert.equal(where.teamId, 'TEAM-ID');
      continue;
    }

    // Otherwise it must go through exactly one relation that itself lands
    // on something carrying teamId.
    const keys = Object.keys(where);
    assert.equal(keys.length, 1, `${entry.key}: expected a single scoping relation, got ${keys.join(', ')}`);
    const relation = keys[0];
    const relMatch = body.match(new RegExp(`^\\s*${relation}\\s+(\\w+)\\s+@relation`, 'm'));
    assert.ok(relMatch, `${entry.key}: ${modelName} has no relation called "${relation}"`);
    const targetBody = MODELS[relMatch[1]];
    assert.ok(targetBody, `${entry.key}: relation "${relation}" points at unknown model ${relMatch[1]}`);
    assert.match(
      targetBody,
      /^\s*teamId\s/m,
      `${entry.key}: scoped through ${relation} -> ${relMatch[1]}, which has no teamId of its own`
    );
    assert.deepEqual(where[relation], { teamId: 'TEAM-ID' });
  }
});

test('no team-export entry produces an unscoped query', () => {
  for (const entry of TEAM_EXPORT) {
    const where = entry.where('TEAM-ID');
    assert.ok(where && typeof where === 'object', `${entry.key}: no where clause`);
    assert.ok(Object.keys(where).length > 0, `${entry.key}: EMPTY where clause would export every team`);
    assert.ok(JSON.stringify(where).includes('TEAM-ID'), `${entry.key}: where clause ignores the team id`);
  }
});

test('team-export keys are unique — one table cannot overwrite another', () => {
  const keys = TEAM_EXPORT.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
});

// --- athlete export scoping ---

test('every athlete-export entry is scoped to that athlete, one way or the other', () => {
  // Same shape as the team check. It caught two real manifest bugs on the
  // first run: Split has no athleteId (it hangs off Result), and
  // FieldResult has no athlete link at all — only a free-text name.
  for (const entry of ATHLETE_EXPORT) {
    const modelName = modelNameFor(entry.model);
    assert.ok(modelName, `${entry.key}: no model called "${entry.model}"`);
    const body = MODELS[modelName];
    const where = entry.where('ATHLETE-ID');

    if ('athleteId' in where) {
      assert.match(body, /^\s*athleteId\s/m, `${entry.key}: filtered on athleteId but ${modelName} has none`);
      assert.equal(where.athleteId, 'ATHLETE-ID');
      continue;
    }

    const keys = Object.keys(where);
    assert.equal(keys.length, 1, `${entry.key}: expected a single scoping relation, got ${keys.join(', ')}`);
    const relation = keys[0];
    const relMatch = body.match(new RegExp(`^\\s*${relation}\\s+(\\w+)\\s+@relation`, 'm'));
    assert.ok(relMatch, `${entry.key}: ${modelName} has no relation called "${relation}"`);
    assert.match(
      MODELS[relMatch[1]],
      /^\s*athleteId\s/m,
      `${entry.key}: scoped through ${relation} -> ${relMatch[1]}, which has no athleteId of its own`
    );
    assert.deepEqual(where[relation], { athleteId: 'ATHLETE-ID' });
  }
});

test('no athlete-export entry produces an unscoped query', () => {
  for (const entry of ATHLETE_EXPORT) {
    const where = entry.where('ATHLETE-ID');
    assert.ok(Object.keys(where).length > 0, `${entry.key}: EMPTY where would export every athlete`);
    assert.ok(JSON.stringify(where).includes('ATHLETE-ID'), `${entry.key}: where ignores the athlete id`);
  }
});

test('nothing without an athlete link is claimed as an athlete\u2019s data', () => {
  // FieldResult stores athleteName as free text. Including it would mean
  // matching on a name, which can hand someone another school's result.
  assert.ok(!ATHLETE_EXPORT.some((e) => e.model === 'fieldResult'));
});

test('athlete-export keys are unique', () => {
  const keys = ATHLETE_EXPORT.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('the athlete export does not include coach-private material', () => {
  // An export is not the place to newly disclose something the app never
  // showed this person. If one of these should be included, that is a
  // product decision to make deliberately, not by adding a manifest line.
  const coachPrivate = ['coachUpAcknowledgement', 'aiInsightSnapshot', 'practicePlan'];
  for (const model of coachPrivate) {
    assert.ok(
      !ATHLETE_EXPORT.some((e) => e.model === model),
      `${model} is coach-private and should not be in the athlete export`
    );
  }
});

// --- coverage ---

test('every model in the schema is either exported or excluded on purpose', () => {
  // The point of the whole feature is that nothing is quietly left behind.
  // A model that is neither in the team manifest nor in EXCLUDED_MODELS is
  // a table someone forgot, and this is where they find out.
  const exported = new Set(TEAM_EXPORT.map((e) => modelNameFor(e.model)));
  const excluded = new Set(Object.keys(EXCLUDED_MODELS));
  const unaccounted = Object.keys(MODELS).filter(
    (m) => m !== 'Team' && !exported.has(m) && !excluded.has(m)
  );
  assert.deepEqual(
    unaccounted,
    [],
    `these models are in neither the export nor EXCLUDED_MODELS: ${unaccounted.join(', ')}`
  );
});

test('every excluded model names a real model and gives a reason', () => {
  for (const [model, reason] of Object.entries(EXCLUDED_MODELS)) {
    assert.ok(MODELS[model], `EXCLUDED_MODELS names "${model}", which is not a model`);
    assert.ok(reason.length > 20, `${model}: the exclusion reason should say why`);
  }
});
