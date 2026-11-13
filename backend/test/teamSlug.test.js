const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { slugifyTeamName, uniqueTeamSlug, findTeamByAddress } = require('../lib/teamSlug');

test('team slug: made from the name, without "high school"', () => {
  assert.equal(slugifyTeamName('Huckleberry Ridge High School'), 'huckleberry-ridge');
  assert.equal(slugifyTeamName("St. Mary's HS"), 'st-marys');
  assert.equal(slugifyTeamName('  Águila   XC Club '), 'aguila-xc-club');
  assert.equal(slugifyTeamName('High School'), 'high-school');
  assert.equal(slugifyTeamName('!!!'), '');
});

test('team slug: unique, never digits-only, never a reserved word', async () => {
  const used = new Set(['ridgeview', 'ridgeview-2']);
  assert.equal(await uniqueTeamSlug('Ridgeview High School', async (s) => used.has(s)), 'ridgeview-3');
  assert.equal(await uniqueTeamSlug('460', async () => false), 'team-460');
  assert.equal(await uniqueTeamSlug('Admin', async () => false), 'team-admin');
  assert.equal(await uniqueTeamSlug('???', async () => false), 'team');
});

test('team address: slug first, then the Athletic.net id for old links', async () => {
  const rows = [{ id: 'a', slug: 'ridgeview', athleticTeamId: '460' }];
  const db = { team: { findUnique: async ({ where }) => rows.find((r) => (where.slug ? r.slug === where.slug : r.athleticTeamId === where.athleticTeamId)) || null } };
  assert.equal((await findTeamByAddress(db, 'Ridgeview')).id, 'a');
  assert.equal((await findTeamByAddress(db, '460')).id, 'a');
  assert.equal(await findTeamByAddress(db, 'nope'), null);
  assert.equal(await findTeamByAddress(db, ''), null);
});

test('team slug: every place that creates a team gives it one', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  for (const file of ['routes/admin.js', 'lib/demo/write.js']) {
    const src = read(file);
    const creates = src.split('team.create(').length - 1;
    const slugs = src.split('slug: await uniqueTeamSlugInDb(').length - 1;
    assert.ok(creates > 0 && creates === slugs, `${file}: ${creates} creates, ${slugs} slugs`);
  }
  const migration = read('prisma/migrations/20261111090000_team_slug/migration.sql');
  assert.match(migration, /ALTER COLUMN "slug" SET NOT NULL/);
  assert.doesNotMatch(migration, /DROP COLUMN|athletic_team_id" DROP/);
});
