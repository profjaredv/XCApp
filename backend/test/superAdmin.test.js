const test = require('node:test');
const assert = require('node:assert/strict');
const { isSuperAdminEmail } = require('../lib/superAdmin');

function withEnv(value, fn) {
  const original = process.env.SUPER_ADMIN_EMAILS;
  process.env.SUPER_ADMIN_EMAILS = value;
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env.SUPER_ADMIN_EMAILS;
    else process.env.SUPER_ADMIN_EMAILS = original;
  }
}

test('isSuperAdminEmail: matches an email on the allowlist', () => {
  withEnv('vallejo+xc@gmail.com', () => {
    assert.equal(isSuperAdminEmail('vallejo+xc@gmail.com'), true);
  });
});

test('isSuperAdminEmail: case-insensitive', () => {
  withEnv('vallejo+xc@gmail.com', () => {
    assert.equal(isSuperAdminEmail('Vallejo+XC@Gmail.com'), true);
  });
});

test('isSuperAdminEmail: supports a comma-separated list', () => {
  withEnv('a@example.com, vallejo+xc@gmail.com ,b@example.com', () => {
    assert.equal(isSuperAdminEmail('vallejo+xc@gmail.com'), true);
    assert.equal(isSuperAdminEmail('a@example.com'), true);
  });
});

test('isSuperAdminEmail: denies anyone not on the list', () => {
  withEnv('vallejo+xc@gmail.com', () => {
    assert.equal(isSuperAdminEmail('someone-else@gmail.com'), false);
  });
});

test('isSuperAdminEmail: an empty/unset allowlist denies everyone, never matches by accident', () => {
  withEnv('', () => {
    assert.equal(isSuperAdminEmail('vallejo+xc@gmail.com'), false);
    assert.equal(isSuperAdminEmail(''), false);
  });
});

test('isSuperAdminEmail: non-string/null/undefined input denies rather than throwing', () => {
  withEnv('vallejo+xc@gmail.com', () => {
    assert.equal(isSuperAdminEmail(null), false);
    assert.equal(isSuperAdminEmail(undefined), false);
    assert.equal(isSuperAdminEmail(123), false);
  });
});
