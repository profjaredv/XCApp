// Stubs prisma model methods by direct property assignment, same reasoning
// as test/requireRole.test.js: Prisma's model delegates are Proxy-based, so
// node:test's t.mock.method rejects them as "not a method."
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const { importEventProgressCsv } = require('../lib/trackEventProgressImport');

const EVENTS = [
  { id: 'evt-400', name: '400 Meters', unit: 'SECONDS' },
  { id: 'evt-shotput', name: 'Shot Put', unit: 'FEET_INCHES' },
];

function stub(obj, method, impl) {
  const original = obj[method];
  obj[method] = impl;
  return () => {
    obj[method] = original;
  };
}

function csv(rows) {
  const header = ['Athlete Name', 'Athletic Athlete ID', 'Grade', 'Gender', 'Event', 'Place', 'Result', 'Wind', 'Round', 'Date', 'Season', 'Meet Name', 'Meet URL', 'Athletic Meet ID'];
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map((h) => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
  return lines.join('\n');
}

function withStubs(t, { athletes = [], meets = [] } = {}) {
  const created = { athletes: [], meets: [], resultUpserts: [] };
  const restores = [
    stub(prisma.event, 'findMany', async () => EVENTS),
    stub(prisma.athlete, 'findMany', async () => athletes),
    stub(prisma.athleteAliasId, 'findMany', async () => []),
    stub(prisma.trackMeet, 'findMany', async () => meets),
    stub(prisma.athlete, 'create', async ({ data }) => {
      const athlete = { id: `athlete-${created.athletes.length + 1}`, ...data };
      created.athletes.push(athlete);
      return athlete;
    }),
    stub(prisma.athlete, 'update', async ({ where, data }) => {
      const existing = athletes.find((a) => a.id === where.id);
      return { ...existing, ...data };
    }),
    stub(prisma.trackMeet, 'create', async ({ data }) => {
      const meet = { id: `meet-${created.meets.length + 1}`, ...data };
      created.meets.push(meet);
      return meet;
    }),
    stub(prisma.trackResult, 'upsert', async (args) => {
      created.resultUpserts.push(args);
      return { id: `result-${created.resultUpserts.length}` };
    }),
  ];
  t.after(() => restores.forEach((r) => r()));
  return created;
}

test('imports a new athlete, meet and a feet-inches result', async (t) => {
  const created = withStubs(t);
  const data = csv([
    { 'Athlete Name': 'Sam Example', 'Athletic Athlete ID': 'https://www.athletic.net/athlete/1000001/track-and-field', Grade: '11', Gender: 'M', Event: 'Shot Put', Place: '5', Result: '34\' 2.5"', Wind: '', Round: 'JV F', Date: '3/19/26', Season: '2026', 'Meet Name': 'Sample JV Invite', 'Meet URL': 'https://www.athletic.net/TrackAndField/meet/900003', 'Athletic Meet ID': '900003' },
  ]);

  const summary = await importEventProgressCsv({ id: 'team-1' }, 2026, data);

  assert.equal(summary.recordsProcessed, 1);
  assert.equal(summary.skippedMissing, 0);
  assert.equal(summary.skippedDate, 0);
  assert.deepEqual(summary.unmatchedEvents, []);
  assert.equal(created.athletes.length, 1);
  assert.equal(created.athletes[0].name, 'Sam Example');
  assert.equal(created.meets.length, 1);
  assert.equal(created.meets[0].name, 'Sample JV Invite');
  assert.equal(created.resultUpserts.length, 1);
  assert.equal(created.resultUpserts[0].create.markValue, 410.5); // 34' 2.5" -> 410.5 total inches
  assert.equal(created.resultUpserts[0].create.round, 'FINAL'); // "JV F" -> FINAL
});

test('a DNS result imports with a null markValue, never a fabricated 0', async (t) => {
  const created = withStubs(t);
  const data = csv([
    { 'Athlete Name': 'Sam Example', Event: '400 Meters', Result: 'DNS', Round: 'V F', Date: '5/7/26', Season: '2026', 'Meet Name': 'Sample Dual' },
  ]);

  await importEventProgressCsv({ id: 'team-1' }, 2026, data);

  assert.equal(created.resultUpserts.length, 1);
  assert.equal(created.resultUpserts[0].create.markValue, null);
  assert.equal(created.resultUpserts[0].create.status, 'DNS');
});

test('an event not in the catalog is reported, not silently dropped', async (t) => {
  const created = withStubs(t);
  const data = csv([
    { 'Athlete Name': 'Sam Example', Event: '1 Mile', Result: '5:12.0', Round: 'V F', Date: '4/2/26', Season: '2026', 'Meet Name': 'Another Invite' },
  ]);

  const summary = await importEventProgressCsv({ id: 'team-1' }, 2026, data);

  assert.equal(summary.recordsProcessed, 0);
  assert.deepEqual(summary.unmatchedEvents, ['1 Mile']);
  assert.equal(created.resultUpserts.length, 0);
});

test('a row missing a required field is skipped and counted', async (t) => {
  const created = withStubs(t);
  const data = csv([{ 'Athlete Name': '', Event: '400 Meters', Result: '51.20', Date: '4/30/26', Season: '2026', 'Meet Name': 'Sample Invitational' }]);

  const summary = await importEventProgressCsv({ id: 'team-1' }, 2026, data);

  assert.equal(summary.skippedMissing, 1);
  assert.equal(created.resultUpserts.length, 0);
});

test('re-importing the same row matches the existing athlete and meet instead of duplicating', async (t) => {
  const existingAthlete = { id: 'athlete-1', name: 'Sam Example', athleticAthleteId: 'https://www.athletic.net/athlete/1000001/track-and-field' };
  const existingMeet = { id: 'meet-1', name: 'Sample Invitational', date: new Date('2026-04-30'), season: 2026 };
  const created = withStubs(t, { athletes: [existingAthlete], meets: [existingMeet] });

  const data = csv([
    { 'Athlete Name': 'Sam Example', 'Athletic Athlete ID': 'https://www.athletic.net/athlete/1000001/track-and-field', Event: '400 Meters', Result: '51.20', Round: 'V F', Date: '4/30/26', Season: '2026', 'Meet Name': 'Sample Invitational' },
  ]);

  const summary = await importEventProgressCsv({ id: 'team-1' }, 2026, data);

  assert.equal(summary.recordsProcessed, 1);
  assert.equal(created.athletes.length, 0); // matched, not re-created
  assert.equal(created.meets.length, 0); // matched, not re-created
  assert.equal(created.resultUpserts[0].create.athleteId, 'athlete-1');
  assert.equal(created.resultUpserts[0].create.trackMeetId, 'meet-1');
});
