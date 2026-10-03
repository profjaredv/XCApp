// middleware/photosVolunteer.js: the no-account entry to the Photos Tag
// module, verified only by a team's shared tagging password (see
// routes/photos.js's POST /volunteer-login, which issues the token this
// checks). authenticateUserOrVolunteer is a drop-in replacement for
// `authenticate` on exactly the routes a volunteer session should reach —
// a real Bearer token must still work through it unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../lib/db');
const { authenticateUserOrVolunteer } = require('../middleware/photosVolunteer');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function stub(model, method, impl) {
  const original = prisma[model][method];
  prisma[model][method] = async (...args) => impl(...args);
  return () => {
    prisma[model][method] = original;
  };
}

test('with a valid volunteer token header and no Authorization header: sets photosTeamId and isPhotoVolunteer, calls next', async () => {
  const restore = stub('photoVolunteerSession', 'findUnique', (args) => {
    assert.deepEqual(args.where, { token: 'good-token' });
    return { id: 'session-1', teamId: 'team-1', token: 'good-token' };
  });
  const req = { headers: { 'x-photos-volunteer-token': 'good-token' } };
  let nexted = false;
  try {
    await authenticateUserOrVolunteer(req, mockRes(), () => {
      nexted = true;
    });
  } finally {
    restore();
  }
  assert.equal(nexted, true);
  assert.equal(req.isPhotoVolunteer, true);
  assert.equal(req.photosTeamId, 'team-1');
  assert.equal(req.user, undefined); // no account, ever
});

test('an unknown volunteer token 401s with no team or actor ever attached', async () => {
  const restore = stub('photoVolunteerSession', 'findUnique', () => null);
  const req = { headers: { 'x-photos-volunteer-token': 'not-a-real-token' } };
  const res = mockRes();
  let nexted = false;
  try {
    await authenticateUserOrVolunteer(req, res, () => {
      nexted = true;
    });
  } finally {
    restore();
  }
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 401);
  assert.equal(req.isPhotoVolunteer, undefined);
  assert.equal(req.photosTeamId, undefined);
});

test('no Authorization header and no volunteer token header: 401s, no database lookup at all', async () => {
  let lookedUp = false;
  const restore = stub('photoVolunteerSession', 'findUnique', () => {
    lookedUp = true;
    return null;
  });
  const req = { headers: {} };
  const res = mockRes();
  let nexted = false;
  try {
    await authenticateUserOrVolunteer(req, res, () => {
      nexted = true;
    });
  } finally {
    restore();
  }
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 401);
  assert.equal(lookedUp, false);
});

test('an Authorization header present delegates to the real authenticate — a bad token 403s there, never reaching the volunteer path', async () => {
  // Doesn't stand up a real JWKS/JWT — just confirms the header's presence
  // routes this through middleware/auth.js's authenticate (which rejects
  // an unparseable token with 403) rather than silently falling through
  // to "no volunteer token, 401". A 403 (not 401) is the signal that
  // delegation actually happened.
  let lookedUp = false;
  const restore = stub('photoVolunteerSession', 'findUnique', () => {
    lookedUp = true;
    return null;
  });
  const req = { headers: { authorization: 'Bearer not-a-real-jwt' } };
  const res = mockRes();
  let nexted = false;
  try {
    await authenticateUserOrVolunteer(req, res, () => {
      nexted = true;
    });
  } finally {
    restore();
  }
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 403);
  assert.equal(lookedUp, false);
});
