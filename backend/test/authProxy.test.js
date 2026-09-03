// Pure-function tests for the Neon Auth reverse proxy (lib/authProxy.js).
// The point of this proxy is entirely in these details — get the cookie
// rewrite wrong and it either leaks a cross-site cookie again (the Safari
// bug is back) or drops it entirely (nobody can log in, in any browser).
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUpstreamUrl, filterRequestHeaders, rewriteSetCookie } = require('../lib/authProxy');

test('buildUpstreamUrl forwards to the configured upstream, path and query intact', () => {
  assert.equal(
    buildUpstreamUrl('https://ep-xxxx.neonauth.us-east-1.aws.neon.tech/xcapp/auth', '/get-session'),
    'https://ep-xxxx.neonauth.us-east-1.aws.neon.tech/xcapp/auth/get-session'
  );
  assert.equal(
    buildUpstreamUrl('https://ep-xxxx.neonauth.us-east-1.aws.neon.tech/xcapp/auth', '/sign-in/email?x=1'),
    'https://ep-xxxx.neonauth.us-east-1.aws.neon.tech/xcapp/auth/sign-in/email?x=1'
  );
});

test('buildUpstreamUrl tolerates a trailing slash on the configured upstream', () => {
  assert.equal(
    buildUpstreamUrl('https://ep-xxxx.neonauth.us-east-1.aws.neon.tech/xcapp/auth/', '/get-session'),
    'https://ep-xxxx.neonauth.us-east-1.aws.neon.tech/xcapp/auth/get-session'
  );
});

test('buildUpstreamUrl returns null with no upstream configured, rather than building a broken URL', () => {
  assert.equal(buildUpstreamUrl(undefined, '/get-session'), null);
});

test('filterRequestHeaders drops the headers that describe this one hop', () => {
  const headers = filterRequestHeaders({
    host: 'leadpack.cc',
    'content-length': '42',
    connection: 'keep-alive',
    cookie: 'session=abc',
    'user-agent': 'Safari',
  });
  assert.equal(headers.has('host'), false);
  assert.equal(headers.has('content-length'), false);
  assert.equal(headers.has('connection'), false);
  // Everything else — including the cookie the session check depends on —
  // must reach Neon Auth untouched.
  assert.equal(headers.get('cookie'), 'session=abc');
  assert.equal(headers.get('user-agent'), 'Safari');
});

test('filterRequestHeaders strips the x-forwarded-*/forwarded/via family', () => {
  // Railway's own edge stamps the incoming request with these, describing
  // how the browser reached OUR server. Neon Auth's server is itself
  // proxy-aware and reads X-Forwarded-Host to determine its own hostname —
  // forwarding these through made it see this app's domain and reject the
  // request as INVALID_HOSTNAME.
  const headers = filterRequestHeaders({
    'x-forwarded-host': 'www.leadpack.cc',
    'x-forwarded-proto': 'https',
    'x-forwarded-for': '1.2.3.4',
    'x-forwarded-port': '443',
    forwarded: 'for=1.2.3.4;host=www.leadpack.cc;proto=https',
    via: '1.1 railway',
    'x-real-ip': '1.2.3.4',
    cookie: 'session=abc',
  });
  assert.equal(headers.has('x-forwarded-host'), false);
  assert.equal(headers.has('x-forwarded-proto'), false);
  assert.equal(headers.has('x-forwarded-for'), false);
  assert.equal(headers.has('x-forwarded-port'), false);
  assert.equal(headers.has('forwarded'), false);
  assert.equal(headers.has('via'), false);
  assert.equal(headers.has('x-real-ip'), false);
  assert.equal(headers.get('cookie'), 'session=abc');
});

test('filterRequestHeaders skips null/undefined values without throwing', () => {
  const headers = filterRequestHeaders({ 'x-forwarded-for': undefined, accept: 'application/json' });
  assert.equal(headers.has('x-forwarded-for'), false);
  assert.equal(headers.get('accept'), 'application/json');
});

test('rewriteSetCookie drops Domain so the cookie defaults to this app’s own host', () => {
  const cookie = 'better-auth.session_token=abc123; Domain=ep-xxxx.neonauth.us-east-1.aws.neon.tech; Path=/; HttpOnly; Secure; SameSite=None';
  const rewritten = rewriteSetCookie(cookie);
  assert.doesNotMatch(rewritten, /Domain=/i);
  // Everything that isn't about which site the cookie belongs to survives.
  assert.match(rewritten, /HttpOnly/);
  assert.match(rewritten, /Secure/);
  assert.match(rewritten, /Path=\//);
});

test('rewriteSetCookie downgrades SameSite=None to Lax now that the request is same-origin', () => {
  const cookie = 'better-auth.session_token=abc123; Path=/; HttpOnly; Secure; SameSite=None';
  assert.match(rewriteSetCookie(cookie), /SameSite=Lax/);
  assert.doesNotMatch(rewriteSetCookie(cookie), /SameSite=None/);
});

test('rewriteSetCookie leaves a cookie with no Domain/SameSite=None untouched', () => {
  const cookie = 'better-auth.csrf_token=xyz; Path=/; SameSite=Lax';
  assert.equal(rewriteSetCookie(cookie), cookie);
});
