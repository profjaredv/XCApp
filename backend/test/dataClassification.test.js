// Guards on the data classification registry.
//
// The registry answers "what kind of student data is in this table" for
// every table, and two things read it: the data-practices page a parent
// can open in the app, and the appendix a district asks for during
// procurement. Both are promises. These tests exist so the promises
// cannot silently stop matching the schema.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CLASSES,
  CLASSIFICATION,
  byClass,
  needsAgreementReview,
} = require('../lib/dataClassification');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
const MODELS = [...SCHEMA.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);

test('every model in the schema is classified', () => {
  // A table nobody classified is a category of student data nobody made a
  // decision about. This is where they find out — the same guard on
  // exportManifest.js caught a table the week it was added.
  const unclassified = MODELS.filter((m) => !CLASSIFICATION[m]);
  assert.deepEqual(
    unclassified,
    [],
    `unclassified models: ${unclassified.join(', ')} — add them to lib/dataClassification.js`
  );
});

test('the registry names no model that does not exist', () => {
  const known = new Set(MODELS);
  const phantom = Object.keys(CLASSIFICATION).filter((m) => !known.has(m));
  assert.deepEqual(phantom, [], `classified models that are not in the schema: ${phantom.join(', ')}`);
});

test('every entry has a real class and explains itself', () => {
  const valid = new Set(Object.values(CLASSES));
  for (const [model, entry] of Object.entries(CLASSIFICATION)) {
    assert.ok(valid.has(entry.class), `${model}: "${entry.class}" is not a class`);
    // These strings are shown to parents verbatim. A one-word placeholder
    // would ship straight to the page.
    assert.ok(entry.what.length > 15, `${model}: "what" must describe the data`);
    assert.ok(entry.why.length > 25, `${model}: "why" must justify the classification`);
    assert.ok(entry.what.trim().endsWith('.'), `${model}: "what" should read as a sentence`);
  }
});

test('directory data is only ever the enumerated 99.3 categories', () => {
  // 34 CFR 99.3 is a list, not a principle. The risk this catches is
  // someone reasoning "sports data is public" and marking attendance or a
  // training log DIRECTORY — which would say, on a page a parent reads,
  // that the school may publish it without consent.
  const directory = new Set(byClass().DIRECTORY.map((e) => e.model));
  const neverDirectory = [
    'AttendanceRecord',
    'AttendanceSession',
    'TrainingLog',
    'RaceReflection',
    'GroupMembership',
    'MeetPlan',
    'PracticePlan',
    'AiInsightSnapshot',
    'CoachUpAcknowledgement',
    'EquipmentAssignment',
    'GuardianLink',
    'AthleteSeasonMetrics',
  ];
  for (const model of neverDirectory) {
    assert.ok(
      !directory.has(model),
      `${model} is not directory information under 34 CFR 99.3 and must not be classified as publishable`
    );
  }
});

test('the athlete-authored set is exactly the material she controls', () => {
  // This is the set whose FERPA status turns on a school agreement, so it
  // is the list that goes to counsel. It should track the tables that
  // actually carry a sharing flag the athlete owns.
  assert.deepEqual(needsAgreementReview(), [
    'RaceReflection',
    'TrainingLog',
    'TrainingLogImportBatch',
  ]);
});

test('athlete-authored tables really do have an athlete-controlled flag', () => {
  // If a table is described to a parent as "private to her unless she
  // shares it", the schema had better have the switch that makes that
  // true. TrainingLogImportBatch is the deliberate exception: it is never
  // shown to anyone but her, so it needs no flag.
  for (const model of ['TrainingLog', 'RaceReflection']) {
    const block = SCHEMA.match(new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm'));
    assert.ok(block, `${model} not found in schema`);
    assert.match(
      block[1],
      /sharedWithCoach/,
      `${model} is classified ATHLETE_AUTHORED but has no sharing flag she controls`
    );
  }
});

test('nothing about a student is filed as operational', () => {
  // OPERATIONAL means "not about a student". Mis-filing here would drop a
  // table out of every student-data answer we give a district.
  const operational = new Set(byClass().OPERATIONAL.map((e) => e.model));
  for (const model of ['Athlete', 'Result', 'AttendanceRecord', 'TrainingLog', 'SeasonRoster']) {
    assert.ok(!operational.has(model), `${model} is student data and cannot be OPERATIONAL`);
  }
});

test('every class is populated', () => {
  // An empty class means the taxonomy stopped describing the product.
  for (const [name, entries] of Object.entries(byClass())) {
    assert.ok(entries.length > 0, `no models are classified ${name}`);
  }
});
