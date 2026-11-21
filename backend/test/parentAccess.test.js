const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { joinNames, maskEmail, sameEmail } = require('../lib/parentAccess');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const routeBody = (src, signature) => {
  const start = src.indexOf(signature);
  assert.ok(start > -1, `missing ${signature}`);
  const next = src.indexOf('\nrouter.', start + signature.length);
  return src.slice(start, next === -1 ? undefined : next);
};

test('parent access helpers', () => {
  assert.equal(joinNames(['Maya']), 'Maya');
  assert.equal(joinNames(['Maya', 'Eli']), 'Maya and Eli');
  assert.equal(joinNames(['Maya', 'Eli', 'Zoe']), 'Maya, Eli and Zoe');
  assert.equal(maskEmail('jared@example.com'), 'j***@example.com');
  assert.equal(maskEmail('nope'), '');
  assert.ok(sameEmail(' Parent@Example.com', 'parent@example.com'));
  assert.ok(!sameEmail('a@x.com', 'b@x.com'));
});

test('parent invites: coach side is full-coach only and scoped to the team', () => {
  const src = read('routes/team.js');
  for (const sig of ["router.get('/parent-invites'", "router.post('/parent-invites'", "router.delete('/parent-invites/:id'"]) {
    const body = routeBody(src, sig);
    assert.match(body, /requireRole\(FULL_COACH\)/, sig);
    assert.match(body, /teamId: req\.user\.teamId/, sig);
  }
  const create = routeBody(src, "router.post('/parent-invites'");
  assert.match(create, /requireActivePlan/);
  assert.match(create, /athletes\.length !== ids\.length/);
});

test('parent invites: accepting needs the invited email and creates approved links', () => {
  const src = read('routes/guardian.js');
  const accept = routeBody(src, "router.post('/invites/:token/accept'");
  assert.match(accept, /sameEmail\(invite\.email, req\.user\.email\)/);
  assert.match(accept, /status: 'approved'/);
  assert.match(accept, /expiresAt < new Date\(\)/);
  const preview = routeBody(src, "router.get('/invites/:token'");
  assert.match(preview, /emailMatches \? athletes/);
});

test('approving a parent emails them', () => {
  const src = read('routes/team.js');
  assert.match(routeBody(src, "router.post('/approve-guardian-link'"), /sendGuardianApprovedEmail/);
  assert.match(routeBody(src, "router.post('/parent-requests/:id/link'"), /sendGuardianApprovedEmail/);
});

test('Today nudges only coaches who can approve parents', () => {
  const src = read('routes/today.js');
  assert.match(src, /canApproveParents = await hasTeamRole\(req\.user, FULL_COACH\)/);
  assert.match(src, /type: 'parent-requests'/);
});
