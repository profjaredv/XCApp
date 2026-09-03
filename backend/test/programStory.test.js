// Story mode on the Program screen.
//
// The sentences are computed, not generated: every one of them is a rule
// in lib/programStory.js applied to numbers on the same screen. That is
// the property worth testing — a beat that appears when it shouldn't, or
// claims more than the data supports, is the failure mode here, not a
// crash.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProgramStory, MEANINGFUL_PACE_SEC } = require('../lib/programStory');
const { buildSeasonShapes } = require('../lib/programSeasons');

const FIVE_K = 5000;

function seasonRows(year, times, gender = 'M') {
  return times.map((timeSec, i) => ({
    athleteId: `${gender}${i}`,
    gender,
    season: year,
    raceId: `race-${year}`,
    raceName: 'League Championship',
    date: `${year}-10-01`,
    timeSec,
    distanceMeters: FIVE_K,
  }));
}

function build({ rows, rosterByYear, years, attrition, meta, participants }) {
  const shapes = buildSeasonShapes(rows, rosterByYear, years);
  return buildProgramStory(shapes, attrition ?? {}, meta ?? [], participants ?? new Map());
}

function find(story, id) {
  return story.find((b) => b.id === id) ?? null;
}

test('an empty program gets one beat that says what to do, not silence', () => {
  const story = buildProgramStory([], null, [], new Map());
  assert.equal(story.length, 1);
  assert.equal(story[0].kind, 'gap');
  assert.match(story[0].detail, /Import a season/);
});

test('every beat carries the evidence it rests on', () => {
  const story = build({
    rows: [...seasonRows(2024, [1200, 1220, 1240, 1260, 1300]), ...seasonRows(2025, [1150, 1170, 1190, 1210, 1280])],
    rosterByYear: new Map([
      [2024, new Set(['M0', 'M1', 'M2', 'M3', 'M4'])],
      [2025, new Set(['M0', 'M1', 'M2', 'M3', 'M4'])],
    ]),
    years: [2024, 2025],
    meta: [
      { season: 2024, topField: { men: null, women: null }, metricsCalculated: true },
      { season: 2025, topField: { men: null, women: null }, metricsCalculated: true },
    ],
    participants: new Map([[2024, { total: 5 }], [2025, { total: 5 }]]),
  });
  for (const b of story) {
    assert.ok(b.id && b.kind && b.headline, `beat is missing identity: ${JSON.stringify(b)}`);
    assert.ok(b.evidence && typeof b.evidence === 'object', `${b.id} has no evidence`);
  }
});

test('a pace change smaller than the noise floor is called unchanged, not an improvement', () => {
  // Four seconds a mile, on a different course, in different weather, is
  // not a program getting faster.
  const smallChange = MEANINGFUL_PACE_SEC - 1;
  const base = 1200;
  const story = build({
    rows: [
      ...seasonRows(2024, [base, base + 20, base + 40]),
      ...seasonRows(2025, [base - smallChange * 3.1, base + 20 - smallChange * 3.1, base + 40 - smallChange * 3.1]),
    ],
    rosterByYear: new Map([[2024, new Set(['M0', 'M1', 'M2'])], [2025, new Set(['M0', 'M1', 'M2'])]]),
    years: [2024, 2025],
    participants: new Map([[2024, { total: 3 }], [2025, { total: 3 }]]),
  });
  assert.match(find(story, 'pace-men').detail, /unchanged/i);
});

test('a real improvement says which direction and by how much', () => {
  const story = build({
    rows: [...seasonRows(2024, [1300, 1320, 1340]), ...seasonRows(2025, [1200, 1220, 1240])],
    rosterByYear: new Map([[2024, new Set(['M0', 'M1', 'M2'])], [2025, new Set(['M0', 'M1', 'M2'])]]),
    years: [2024, 2025],
    participants: new Map([[2024, { total: 3 }], [2025, { total: 3 }]]),
  });
  const pace = find(story, 'pace-men');
  assert.match(pace.detail, /faster than 2024/);
  assert.ok(pace.evidence.changeSec > 0);
});

test('one season of pace data makes no claim about a trend', () => {
  const story = build({
    rows: seasonRows(2025, [1200, 1220, 1240]),
    rosterByYear: new Map([[2025, new Set(['M0', 'M1', 'M2'])]]),
    years: [2025],
    participants: new Map([[2025, { total: 3 }]]),
  });
  const pace = find(story, 'pace-men');
  assert.match(pace.detail, /no trend to read yet/);
  assert.ok(!/faster|slower/.test(pace.detail));
});

test('a gender with no races gets no beat rather than an empty one', () => {
  const story = build({
    rows: seasonRows(2025, [1200, 1220, 1240], 'M'),
    rosterByYear: new Map([[2025, new Set(['M0', 'M1', 'M2'])]]),
    years: [2025],
    participants: new Map([[2025, { total: 3 }]]),
  });
  assert.equal(find(story, 'pace-women'), null);
  assert.equal(find(story, 'pack-women'), null);
});

test('retention reports the longest window it can actually observe', () => {
  const story = build({
    rows: seasonRows(2025, [1200, 1220, 1240]),
    rosterByYear: new Map([[2025, new Set(['M0'])]]),
    years: [2025],
    participants: new Map([[2025, { total: 1 }]]),
    attrition: {
      windows: [1, 2, 3, 4],
      retention: { 1: 80, 2: 60, 3: null, 4: null },
      cohortSizes: { 1: 20, 2: 12, 3: 0, 4: 0 },
      leftCensored: 0,
    },
  });
  const retention = find(story, 'retention');
  assert.equal(retention.evidence.window, 2, 'the longest window with a real cohort');
  assert.match(retention.headline, /2 years after/);
});

test('retention says when its own cohort may be mis-dated', () => {
  const story = build({
    rows: seasonRows(2025, [1200, 1220, 1240]),
    rosterByYear: new Map([[2025, new Set(['M0'])]]),
    years: [2025],
    participants: new Map([[2025, { total: 1 }]]),
    attrition: {
      windows: [1],
      retention: { 1: 55 },
      cohortSizes: { 1: 20 },
      leftCensored: 9,
      earliestSeason: 2023,
    },
  });
  assert.match(find(story, 'retention').detail, /9 of them first appear in 2023/);
});

test('the missing-data beats name the screen that fixes them', () => {
  const story = build({
    rows: seasonRows(2025, [1200, 1220, 1240]),
    rosterByYear: new Map([[2025, new Set(['M0', 'M1', 'M2'])]]),
    years: [2025],
    participants: new Map([[2025, { total: 3 }]]),
    meta: [{ season: 2025, topField: { men: null, women: null }, metricsCalculated: false }],
  });
  assert.match(find(story, 'gap-field').detail, /Field Results/);
  assert.match(find(story, 'gap-metrics').detail, /2025/);
  assert.ok(find(story, 'gap-seasons'), 'one season on file is itself worth saying');
});

test('field-standing gap disappears once any season has field data', () => {
  const story = build({
    rows: seasonRows(2025, [1200, 1220, 1240]),
    rosterByYear: new Map([[2025, new Set(['M0', 'M1', 'M2'])]]),
    years: [2025],
    participants: new Map([[2025, { total: 3 }]]),
    meta: [{ season: 2025, topField: { men: 42, women: null }, metricsCalculated: true }],
  });
  assert.equal(find(story, 'gap-field'), null);
});

test('no beat praises or scolds', () => {
  const story = build({
    rows: [...seasonRows(2024, [1300, 1320, 1340, 1360, 1380]), ...seasonRows(2025, [1200, 1220, 1240, 1260, 1280])],
    rosterByYear: new Map([
      [2024, new Set(['M0', 'M1', 'M2', 'M3', 'M4'])],
      [2025, new Set(['M0', 'M1', 'M2', 'M3', 'M4'])],
    ]),
    years: [2024, 2025],
    participants: new Map([[2024, { total: 5 }], [2025, { total: 5 }]]),
  });
  const prose = story.map((b) => `${b.headline} ${b.detail}`).join(' ');
  for (const word of ['great', 'excellent', 'poor', 'concerning', 'impressive', 'worrying', 'disappointing']) {
    assert.ok(!new RegExp(word, 'i').test(prose), `story should not editorialize: found "${word}"`);
  }
});
