// Guards on the under-9th-grade account gate.
//
// The strategy this enforces is "stay outside COPPA rather than comply
// with it": a student below 9th grade never gets an account, so nothing is
// collected online from a child. That only holds if EVERY path to a linked
// account checks — one unchecked route and the whole posture is a claim we
// cannot make.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { decideCanHaveAccount, MIN_ACCOUNT_GRADE } = require('../lib/minorPolicy');

const ATHLETES = fs.readFileSync(path.join(__dirname, '..', 'routes', 'athletes.js'), 'utf8');
const TEAM = fs.readFileSync(path.join(__dirname, '..', 'routes', 'team.js'), 'utf8');

test('the line is 9th grade', () => {
  assert.equal(MIN_ACCOUNT_GRADE, 9);
});

test('a middle schooler cannot have an account', () => {
  for (const [gradYear, grade] of [[2032, 6], [2031, 7], [2030, 8]]) {
    const decision = decideCanHaveAccount({ graduationYear: gradYear, season: 2025 });
    assert.equal(decision.allowed, false, `grade ${grade} should be refused`);
    assert.equal(decision.grade, grade);
    // The coach reads this. It has to say what they CAN do.
    assert.match(decision.reason, /roster/, 'the refusal should say the athlete can still be rostered');
  }
});

test('a high schooler can', () => {
  for (const gradYear of [2029, 2028, 2027, 2026]) {
    assert.equal(decideCanHaveAccount({ graduationYear: gradYear, season: 2025 }).allowed, true);
  }
});

test('an unknown class year allows the account', () => {
  // Most rosters import with no class year at all. Refusing everyone
  // unknown would break the ordinary high-school case to guard a rare one
  // — and the middle-school case only becomes visible when a coach enters
  // real class years, which is exactly when the gate bites.
  const decision = decideCanHaveAccount({ graduationYear: null, season: 2025 });
  assert.equal(decision.allowed, true);
  assert.equal(decision.grade, null);
  assert.equal(decision.reason, null);
});

test('a graduated athlete is not blocked by the minimum', () => {
  // Grade 13+ is past graduation; the gate is a floor, not a window.
  assert.equal(decideCanHaveAccount({ graduationYear: 2020, season: 2025 }).allowed, true);
});

test('every path to a linked account is gated', () => {
  // These are the only four routes that can end with athlete.userId set,
  // or with a request that leads there. If a fifth is ever added, this
  // test is where the omission should surface — so it counts call sites,
  // not just presence.
  const inviteSendAndAccept = [...ATHLETES.matchAll(/decideCanHaveAccount\(/g)].length;
  assert.equal(
    inviteSendAndAccept,
    2,
    'routes/athletes.js must gate BOTH sending an athlete invite and accepting one'
  );

  const claimRequestAndApprove = [...TEAM.matchAll(/decideCanHaveAccount\(/g)].length;
  assert.equal(
    claimRequestAndApprove,
    2,
    'routes/team.js must gate BOTH requesting a profile claim and approving one'
  );
});

test('the gate runs before the account is linked, not after', () => {
  // A check that runs after prisma.athlete.update({ data: { userId } })
  // would refuse the request while leaving the link in place.
  const acceptGate = ATHLETES.indexOf('acceptEligibility.allowed');
  const acceptLink = ATHLETES.indexOf("prisma.athlete.update({ where: { id: invite.athleteId }, data: { userId } })");
  assert.ok(acceptGate > 0 && acceptLink > 0, 'both markers should exist');
  assert.ok(acceptGate < acceptLink, 'the eligibility check must precede the link');
});
