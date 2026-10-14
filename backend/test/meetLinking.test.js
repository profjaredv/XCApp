const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planMeetLinks, linkRacesToMeets } = require('../lib/meetLinking');

const meets = [
  { id: 'meet-ar-2026', athleticMeetId: '500', seasonYear: 2026 },
  { id: 'meet-ar-2025', athleticMeetId: '400', seasonYear: 2025 },
  { id: 'meet-manual', athleticMeetId: null, seasonYear: 2026 },
];

test('planMeetLinks', async (t) => {
  await t.test('links unlinked races by Athletic.net meet ID within the same season', () => {
    const plan = planMeetLinks(meets, [
      { id: 'r1', season: 2026, athleticMeetId: '500', meetId: null },
      { id: 'r2', season: 2026, athleticMeetId: '500', meetId: null },
      { id: 'r3', season: 2025, athleticMeetId: '400', meetId: null },
    ]);
    assert.deepEqual(plan, [
      { meetId: 'meet-ar-2026', raceIds: ['r1', 'r2'] },
      { meetId: 'meet-ar-2025', raceIds: ['r3'] },
    ]);
  });
  await t.test('never moves a race a coach already grouped', () => {
    assert.deepEqual(planMeetLinks(meets, [{ id: 'r1', season: 2026, athleticMeetId: '500', meetId: 'other' }]), []);
  });
  await t.test('a matching meet ID in a different season is not a match', () => {
    assert.deepEqual(planMeetLinks(meets, [{ id: 'r1', season: 2025, athleticMeetId: '500', meetId: null }]), []);
  });
  await t.test('races and meets without a meet ID are left alone', () => {
    assert.deepEqual(planMeetLinks(meets, [{ id: 'r1', season: 2026, athleticMeetId: null, meetId: null }]), []);
  });
});

test('linkRacesToMeets updates only unlinked races of the team', async () => {
  const updates = [];
  const prisma = {
    meet: { findMany: async () => [{ id: 'meet-ar-2026', athleticMeetId: '500', season: { year: 2026 } }] },
    race: {
      findMany: async ({ where }) => {
        assert.equal(where.teamId, 'team-1');
        assert.equal(where.meetId, null);
        return [{ id: 'r1', season: 2026, athleticMeetId: '500', meetId: null }];
      },
      updateMany: async (args) => {
        updates.push(args);
        return { count: args.where.id.in.length };
      },
    },
  };
  assert.equal(await linkRacesToMeets(prisma, 'team-1', 2026), 1);
  assert.deepEqual(updates, [{ where: { id: { in: ['r1'] }, teamId: 'team-1', meetId: null }, data: { meetId: 'meet-ar-2026' } }]);
});

test('the season scrape links new races to existing meets', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'teams.js'), 'utf8');
  assert.match(src, /await linkRacesToMeets\(prisma, team\.id, yearNum\);/);
});

test('the backfill migration follows the same rule', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'migrations', '20261014000000_link_races_to_meets', 'migration.sql'), 'utf8');
  for (const clause of ['r."meet_id" IS NULL', 'r."athletic_meet_id" = m."athletic_meet_id"', 'r."team_id" = m."team_id"', 'r."season" = s."year"']) {
    assert.ok(sql.includes(clause), clause);
  }
});
