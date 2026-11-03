// "Try the new LeadPack" UI trial — docs/leadpack-new-ui-trial.md §1.
//
// The pure pieces (role resolution against a stub client, the switch-back
// reason cap) are unit-tested for real. The routes need a database this
// sandbox can't reach, so their shape is pinned by source-text assertions,
// the same pattern as racePredictionsRoute.test.js.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTeamRole, resolveLoggingRole } = require('../lib/loggingRole');
const { switchReason, MAX_REASON_LENGTH } = require('../lib/uiSwitch');

const BACKEND = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(BACKEND, ...p), 'utf8');
const SCHEMA = read('prisma', 'schema.prisma');
const PROFILE = read('routes', 'profile.js');
const PAGE_VIEWS = read('routes', 'pageViews.js');
const ADMIN = read('routes', 'admin.js');
const USERS = read('routes', 'users.js');

function sectionFor(source, marker, windowSize = 1400) {
  const start = source.indexOf(marker);
  assert.ok(start > -1, `could not find ${marker}`);
  return source.slice(start, start + windowSize);
}

function modelBlock(name) {
  const m = SCHEMA.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm'));
  assert.ok(m, `${name} should exist`);
  return m[1];
}

// A stub with just the two calls loggingRole makes, counting them so the
// "one count query" budget is checkable.
function stubPrisma({ membership = null, approvedLinks = 0 } = {}) {
  const calls = { teamMember: 0, guardianCount: 0, guardianWhere: null };
  return {
    calls,
    teamMember: {
      findUnique: async () => {
        calls.teamMember += 1;
        return membership;
      },
    },
    guardianLink: {
      count: async ({ where }) => {
        calls.guardianCount += 1;
        calls.guardianWhere = where;
        return approvedLinks;
      },
    },
  };
}

// --- role resolution --------------------------------------------------------

test('resolveTeamRole: the team owner is HEAD_COACH without a membership lookup', async () => {
  const prisma = stubPrisma();
  const role = await resolveTeamRole(prisma, { id: 'u1', teamId: 't1', team: { coachUid: 'u1' } });
  assert.equal(role, 'HEAD_COACH');
  assert.equal(prisma.calls.teamMember, 0);
});

test('resolveTeamRole: an active membership supplies the role; an inactive one is no role', async () => {
  const user = { id: 'u1', teamId: 't1', team: { coachUid: 'someone-else' } };
  assert.equal(await resolveTeamRole(stubPrisma({ membership: { role: 'COACH', active: true } }), user), 'COACH');
  assert.equal(await resolveTeamRole(stubPrisma({ membership: { role: 'COACH', active: false } }), user), null);
  assert.equal(await resolveTeamRole(stubPrisma(), { id: 'u1', teamId: null }), null);
});

test('resolveLoggingRole: a team member is bucketed by role and the guardian query is skipped', async () => {
  const prisma = stubPrisma({ membership: { role: 'ATHLETE', active: true } });
  const role = await resolveLoggingRole(prisma, { id: 'u1', teamId: 't1', team: {} });
  assert.equal(role, 'athlete');
  assert.equal(prisma.calls.guardianCount, 0, 'only users with no team role cost the guardian count');
});

test('resolveLoggingRole: head coach gets its own bucket', async () => {
  const prisma = stubPrisma();
  assert.equal(await resolveLoggingRole(prisma, { id: 'u1', teamId: 't1', team: { coachUid: 'u1' } }), 'head_coach');
});

test('resolveLoggingRole: no team role + an approved guardian link is "parent", in one count query', async () => {
  const prisma = stubPrisma({ approvedLinks: 2 });
  const role = await resolveLoggingRole(prisma, { id: 'g1', teamId: null });
  assert.equal(role, 'parent');
  assert.equal(prisma.calls.guardianCount, 1);
  assert.deepEqual(prisma.calls.guardianWhere, { userId: 'g1', status: 'approved' });
});

test('resolveLoggingRole: no team role and no approved link is "other"', async () => {
  assert.equal(await resolveLoggingRole(stubPrisma({ approvedLinks: 0 }), { id: 'g1', teamId: null }), 'other');
});

test('resolveLoggingRole: super admin short-circuits before any query', async () => {
  const prisma = stubPrisma();
  assert.equal(await resolveLoggingRole(prisma, { id: 'a', teamId: 't', isSuperAdmin: true }), 'super_admin');
  assert.equal(prisma.calls.teamMember + prisma.calls.guardianCount, 0);
});

// --- switch-back reason -----------------------------------------------------

test('switchReason: blank or missing answers are stored as null', () => {
  assert.equal(switchReason(undefined), null);
  assert.equal(switchReason(null), null);
  assert.equal(switchReason(''), null);
  assert.equal(switchReason('   '), null);
  assert.equal(switchReason(42), null);
});

test('switchReason: trims, and caps at 500 characters', () => {
  assert.equal(MAX_REASON_LENGTH, 500);
  assert.equal(switchReason('  too many taps  '), 'too many taps');
  assert.equal(switchReason('x'.repeat(800)).length, 500);
});

// --- schema -----------------------------------------------------------------

test('User carries uiVersion defaulting to classic', () => {
  assert.match(modelBlock('User'), /uiVersion\s+String\s+@default\("classic"\)\s+@map\("ui_version"\)/);
});

test('PageView carries ui defaulting to classic, and still identifies nobody', () => {
  const block = modelBlock('PageView');
  assert.match(block, /\bui\s+String\s+@default\("classic"\)/);
  for (const forbidden of ['userId', 'teamId', 'athleteId', 'email']) {
    assert.doesNotMatch(block, new RegExp(`\\b${forbidden}\\b`));
  }
});

test('UiSwitchEvent has the specified fields and no user, team or athlete id', () => {
  const block = modelBlock('UiSwitchEvent');
  for (const field of ['id', 'fromUi', 'toUi', 'role', 'reason', 'createdAt']) {
    assert.match(block, new RegExp(`\\b${field}\\b`), `UiSwitchEvent needs ${field}`);
  }
  for (const forbidden of ['userId', 'teamId', 'athleteId', 'email', '@relation']) {
    assert.doesNotMatch(block, new RegExp(forbidden.startsWith('@') ? forbidden : `\\b${forbidden}\\b`));
  }
});

test('the migration is additive and defaults every existing row to classic', () => {
  const sql = read('prisma', 'migrations', '20261013000000_ui_trial', 'migration.sql');
  assert.match(sql, /ALTER TABLE "users" ADD COLUMN "ui_version" TEXT NOT NULL DEFAULT 'classic'/);
  assert.match(sql, /ALTER TABLE "page_views" ADD COLUMN "ui" TEXT NOT NULL DEFAULT 'classic'/);
  assert.match(sql, /CREATE TABLE "ui_switch_events"/);
  assert.doesNotMatch(sql, /DROP|DELETE|UPDATE /);
});

// --- routes -----------------------------------------------------------------

test('PATCH /profile/ui-version validates against the two values and logs a switch event', () => {
  const fn = sectionFor(PROFILE, "router.patch('/ui-version'", 1600);
  assert.match(fn, /authenticate/);
  assert.match(fn, /UI_VERSIONS\.includes\(uiVersion\)/, 'must validate the value');
  assert.match(fn, /status\(400\)/);
  assert.match(fn, /if \(fromUi === uiVersion\)/, 'a no-op save must not log a switch');
  assert.match(fn, /uiSwitchEvent\.create/);
  assert.match(fn, /switchReason\(reason\)/, 'reason goes through the 500-char cap');
  const create = sectionFor(fn, 'uiSwitchEvent.create', 200);
  assert.doesNotMatch(create, /userId|req\.user\.id|email/, 'switch events carry no user identifier');
});

test('GET /users/me returns the full user row (and so uiVersion) plus teamRole', () => {
  const fn = sectionFor(USERS, "router.get('/me'", 600);
  assert.match(fn, /\.\.\.req\.user/);
  assert.match(fn, /resolveTeamRole\(prisma, req\.user\)/);
});

test('POST /page-views stores a validated ui and a resolved role (req.user has no teamRole)', () => {
  assert.match(PAGE_VIEWS, /ui: normalizeUi\(ui\)/);
  assert.match(PAGE_VIEWS, /role: await resolveLoggingRole\(prisma, req\.user\)/);
  assert.doesNotMatch(PAGE_VIEWS, /req\.user\.teamRole/, 'authenticate() never sets teamRole on req.user');
});

test('GET /admin/usage adds the UI split, users by uiVersion, and switch events', () => {
  const fn = sectionFor(ADMIN, "router.get('/usage'", 6000);
  assert.match(fn, /by: \['ui', 'role'\]/);
  assert.match(fn, /u\.ui_version AS ui/);
  assert.match(fn, /uiSwitchEvent\.groupBy/);
  assert.match(fn, /orderBy: \{ createdAt: 'desc' \}/, 'reasons newest first');
  for (const key of ['uiRoles', 'usersByUi', 'switches', 'switchReasons']) {
    assert.match(fn, new RegExp(`${key}:`));
  }
  // Aggregate only: the users query must not select an identifier.
  const usersQuery = sectionFor(fn, 'u.ui_version AS ui', 900);
  assert.doesNotMatch(usersQuery, /u\.email|u\.name|u\.id AS|SELECT u\.id/);
});
