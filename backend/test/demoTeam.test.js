const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { generateDemoPlan, anchorSeason, calendar } = require('../lib/demo/generate');
const { TEAM, DEMO_EMAIL_DOMAIN, SCHOOLS, MEETS } = require('../lib/demo/catalog');
const { isDemoTeam, deleteDemoTeam } = require('../lib/demo');

const NOW = new Date('2026-11-02T12:00:00Z');
const plan = generateDemoPlan({ now: NOW });
const byKey = new Map(plan.athletes.map((a) => [a.key, a]));
const hash = (p) => crypto.createHash('sha1').update(JSON.stringify(p)).digest('hex');
const cur = plan.seasons[plan.seasons.length - 1];
const allRaces = plan.seasons.flatMap((s) => s.meets.flatMap((m) => m.races));

test('eight consecutive seasons ending in the current one', () => {
  assert.equal(plan.seasons.length, 8);
  plan.seasons.forEach((s, i) => assert.equal(s.year, cur.year - 7 + i));
  assert.equal(plan.team.currentSeason, cur.year);
  assert.deepEqual(plan.seasons.filter((s) => s.isActive).map((s) => s.year), [cur.year]);
});

test('same seed, same team; different seed, different team', () => {
  assert.equal(hash(generateDemoPlan({ now: NOW })), hash(plan));
  assert.notEqual(hash(generateDemoPlan({ now: NOW, seed: 'another' })), hash(plan));
});

test('staff are the silly ones, Ron McDonald runs the team, and every email is on the reserved domain', () => {
  const ron = plan.staff.find((s) => s.name === 'Ron McDonald');
  assert.equal(ron.role, 'HEAD_COACH');
  assert.ok(plan.staff.some((s) => s.role === 'VOLUNTEER_COACH'));
  for (const s of plan.staff) assert.ok(s.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`), s.email);
  for (const p of [...plan.pending.claims, ...plan.pending.guardians, ...plan.pending.parentRequests, ...plan.pending.athleteInvites]) assert.ok(p.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`), p.email);
});

test('every opponent is invented: no school on the list is one of the real programs the demo races beside', () => {
  const names = SCHOOLS.map((s) => s.name);
  assert.equal(new Set(names).size, names.length);
  for (const bad of ['Ellensburg', 'Quincy', 'Ephrata', 'Yakima', 'Wenatchee', 'Kennewick', 'Pasco']) {
    assert.ok(!names.some((n) => n.includes(bad) && !n.includes('Ridge Christian')), bad);
  }
});

test('real meets, real distances: a time trial mile, 5000m varsity, 3-mile and 2-mile JV, a state meet at Sun Willows', () => {
  const names = new Set(allRaces.map((r) => r.name));
  for (const n of ['Sunfair Invitational', 'Nike Hole in the Wall XC Invitational', 'Stumptown Showdown', 'WIAA State Championships']) assert.ok(names.has(n), n);
  const dist = new Set(allRaces.map((r) => r.distance));
  for (const d of ['1 Miles', '5000 Meters', '3 Miles', '2 Miles']) assert.ok(dist.has(d), d);
  const tt = allRaces.filter((r) => r.name.includes('Time Trial'));
  assert.equal(tt.length, 8);
  tt.forEach((r) => assert.equal(r.distanceMeters, 1609.34));
  assert.ok(cur.meets.find((m) => m.name === 'WIAA State Championships').location.includes('Sun Willows'));
});

test('meets fall on Saturdays (the time trial on a Tuesday) and postseason races are tagged', () => {
  for (const s of plan.seasons) {
    for (const m of s.meets) {
      const day = new Date(`${m.date}T00:00:00Z`).getUTCDay();
      const unshifted = s.year !== cur.year || anchorSeason(NOW).shift === 0;
      if (unshifted) assert.equal(day, m.name.includes('Time Trial') ? 2 : 6, `${s.year} ${m.name}`);
    }
  }
  const levels = new Set(allRaces.map((r) => r.postseasonLevel).filter(Boolean));
  assert.deepEqual([...levels].sort(), ['DISTRICT', 'LEAGUE', 'REGIONAL', 'STATE']);
});

test('every result belongs to a rostered athlete in grades 9-12 with a believable time', () => {
  for (const s of plan.seasons) {
    const rostered = new Map(s.roster.map((r) => [r.athleteKey, r]));
    for (const m of s.meets) for (const race of m.races) for (const res of race.results) {
      const r = rostered.get(res.athleteKey);
      assert.ok(r, `${res.athleteKey} not on the ${s.year} roster`);
      assert.ok(r.grade >= 9 && r.grade <= 12);
      assert.equal(res.grade, r.grade);
      if (res.status !== 'FINISHED') { assert.equal(res.time, null); continue; }
      const miles = race.distanceMeters / 1609.34;
      const pace = res.time / miles;
      const g = byKey.get(res.athleteKey).gender;
      assert.ok(pace > (g === 'M' ? 270 : 300) && pace < (g === 'M' ? 640 : 760), `${race.key} ${res.athleteKey} pace ${pace}`);
    }
  }
});

test('field results: opponents are unnamed, ours are named, places run 1..N in each division', () => {
  for (const race of allRaces) {
    if (!race.field.length) continue;
    for (const f of race.field) {
      if (f.schoolName === TEAM.short) assert.ok(f.athleteName, 'our runner has a name');
      else { assert.equal(f.athleteName, null); assert.equal(f.grade, null); }
    }
    for (const d of new Set(race.field.map((f) => f.division))) {
      const places = race.field.filter((f) => f.division === d && f.status === 'FINISHED').map((f) => f.place).sort((a, b) => a - b);
      assert.deepEqual(places, places.map((_, i) => i + 1), `${race.key} ${d}`);
    }
  }
});

test('field means are recorded for every race that has a field', () => {
  const raced = allRaces.filter((r) => r.field.length);
  assert.ok(raced.length > 80);
  for (const r of raced) assert.equal(r.fieldFinisherCount > 0, true);
});

test('splits are cumulative, increasing, and end before the finish', () => {
  let n = 0;
  for (const race of allRaces) for (const res of race.results) {
    if (!res.splits) continue;
    n += 1;
    assert.equal(res.splits.length, 2);
    assert.ok(res.splits[0].elapsedSec < res.splits[1].elapsedSec && res.splits[1].elapsedSec < res.time);
    assert.equal(race.splitMarkerScheme, 'MILE');
  }
  assert.ok(n > 300);
});

test('Today has something to show: an upcoming meet, today’s plan, a partly marked attendance session', () => {
  const today = plan.generatedFor;
  assert.ok(cur.meets.some((m) => m.upcoming && m.races.length), 'an upcoming meet with races');
  for (const m of cur.meets.filter((x) => x.upcoming)) for (const r of m.races) assert.equal(r.results.length, 0);
  assert.ok(cur.practicePlans.some((p) => p.date === today && p.published), 'a published plan for today');
  const session = cur.attendance.find((a) => a.date === today);
  assert.ok(session && session.records.length > 0 && session.records.length < cur.roster.length, 'partly marked');
  assert.ok(cur.practicePlans.some((p) => p.date > today && !p.published), 'a draft plan ahead');
});

test('the calendar slides when today is outside the season, so a championship is always ahead', () => {
  for (const iso of ['2027-01-15', '2026-07-01', '2026-11-20', '2026-09-10']) {
    const now = new Date(`${iso}T12:00:00Z`);
    const a = anchorSeason(now);
    const state = calendar(a.year, a.shift).find((m) => m.key === 'state').ms;
    assert.ok(state > a.today, `${iso}: state meet is ahead`);
    const p = generateDemoPlan({ now });
    assert.ok(p.seasons[7].meets.some((m) => m.upcoming), iso);
  }
});

test('groups, captains, cross-training and equipment are all populated', () => {
  const types = new Set(cur.groups.map((g) => g.type));
  for (const t of ['TRAINING', 'CAPTAIN', 'CUSTOM', 'X_TRAINING']) assert.ok(types.has(t), t);
  assert.ok(cur.roster.some((r) => r.isCaptain));
  assert.ok(cur.memberships.some((m) => m.groupKey === 'xt' && m.reason));
  assert.ok(plan.equipment.assignments.some((a) => !a.returnedAt && a.dueDate < plan.generatedFor), 'an overdue item');
  assert.ok(plan.equipment.assignments.some((a) => a.returnedAt));
});

test('meet series span many seasons so history pages have something to compare', () => {
  assert.equal(plan.meetSeries['Sunfair Invitational'].length, 8);
  assert.ok(Object.keys(plan.meetSeries).length >= 8);
});

test('the demo is its own team: a fixed id, a fixed domain, and no leftovers from the plan can point elsewhere', () => {
  assert.equal(TEAM.athleticTeamId, 'demo-huckleberry-ridge');
  assert.equal(MEETS.find((m) => m.key === 'state').course, 'state');
});

// ---- safety ------------------------------------------------------------------------

const fakePrisma = (team, coachEmail) => ({
  team: { findUnique: async () => team, delete: async () => { throw new Error('should not delete'); } },
  user: { findUnique: async () => (coachEmail ? { email: coachEmail } : null), deleteMany: async () => { throw new Error('should not delete users'); } },
  teamRequest: { deleteMany: async () => { throw new Error('should not delete'); } },
});

test('deleteDemoTeam refuses any team that is not the demo team', async () => {
  const notDemo = { id: 'x', athleticTeamId: 'some-real-team', coachUid: 'u' };
  assert.equal(await isDemoTeam(fakePrisma(notDemo, `coach@${DEMO_EMAIL_DOMAIN}`), notDemo), false);
  const demoIdRealCoach = { id: 'x', athleticTeamId: TEAM.athleticTeamId, coachUid: 'u' };
  assert.equal(await isDemoTeam(fakePrisma(demoIdRealCoach, 'real.coach@school.org'), demoIdRealCoach), false);
  await assert.rejects(() => deleteDemoTeam(fakePrisma(demoIdRealCoach, 'real.coach@school.org')), /not the demo team/);
  assert.deepEqual(await deleteDemoTeam({ team: { findUnique: async () => null } }), { deleted: false });
});

test('the admin routes are super-admin only and the writer never deletes or edits other teams’ rows', () => {
  const admin = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');
  for (const verb of ['get', 'post', 'delete']) assert.match(admin, new RegExp(`router\\.${verb}\\('/demo-team', authenticate, requireSuperAdmin`));
  const writer = fs.readFileSync(path.join(__dirname, '..', 'lib', 'demo', 'write.js'), 'utf8');
  assert.doesNotMatch(writer, /deleteMany|\.delete\(|\.updateMany|\.upsert/);
  assert.match(writer, /prisma\.team\.update\(\{ where: \{ id: teamId \}/);
});
