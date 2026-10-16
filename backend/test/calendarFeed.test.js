const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeCalendarUrl, fetchCalendarText, matchCalendarEntryToMeet, MAX_BYTES } = require('../lib/calendarFeed');

const GOOD = 'https://www.athletic.net/CrossCountry/Print/ical.ashx?SchoolID=460&S=2026';
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'team-calendar-2026.ics'), 'utf8');

test('a pasted Athletic.net calendar link is accepted, as https or webcal, and its season is read', () => {
  assert.deepEqual(normalizeCalendarUrl(`  ${GOOD}  `), { ok: true, url: GOOD, season: 2026 });
  assert.equal(normalizeCalendarUrl(GOOD.replace('https://', 'webcal://')).url, GOOD);
  assert.equal(normalizeCalendarUrl('https://athletic.net/CrossCountry/Print/ical.ashx?SchoolID=460').season, null);
  assert.equal(normalizeCalendarUrl(`${GOOD}#section`).url, GOOD);
});

test('a link to anywhere else is refused: other hosts, lookalikes, plain http, ports, logins, non-calendar paths', () => {
  const bad = [
    '',
    'not a link',
    'https://example.com/ical.ashx',
    'https://athletic.net.evil.com/CrossCountry/Print/ical.ashx?S=2026',
    'https://evilathletic.net/CrossCountry/Print/ical.ashx?S=2026',
    'https://www.athletic.net@evil.com/ical.ashx',
    'http://www.athletic.net/CrossCountry/Print/ical.ashx?S=2026',
    'https://www.athletic.net:8443/CrossCountry/Print/ical.ashx?S=2026',
    'https://user:pw@www.athletic.net/CrossCountry/Print/ical.ashx?S=2026',
    'https://www.athletic.net/CrossCountry/Results/Season.aspx?SchoolID=460&S=2026',
    'https://169.254.169.254/latest/meta-data/',
    'file:///etc/passwd',
  ];
  for (const b of bad) assert.equal(normalizeCalendarUrl(b).ok, false, b);
});

const res = (status, body = '', headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => body });

test('fetchCalendarText requests exactly the saved link, without following redirects on its own', async () => {
  const seen = [];
  const text = await fetchCalendarText(GOOD, async (url, opts) => {
    seen.push([url, opts.redirect]);
    return res(200, fixture);
  });
  assert.equal(text, fixture);
  assert.deepEqual(seen, [[GOOD, 'manual']]);
});

test('a redirect is followed only while it stays on Athletic.net', async () => {
  const calls = [];
  const ok = await fetchCalendarText(GOOD, async (url) => {
    calls.push(url);
    return calls.length === 1 ? res(302, '', { location: '/CrossCountry/Print/ical.ashx?SchoolID=460&S=2026&x=1' }) : res(200, fixture);
  });
  assert.equal(ok, fixture);
  assert.equal(calls.length, 2);
  await assert.rejects(
    fetchCalendarText(GOOD, async () => res(302, '', { location: 'https://evil.example.com/ical.ashx' })),
    (e) => /sent that link somewhere else/.test(e.userMessage)
  );
  await assert.rejects(
    fetchCalendarText(GOOD, async () => res(302, '', { location: 'http://169.254.169.254/' })),
    (e) => /somewhere else/.test(e.userMessage)
  );
});

test('errors, non-calendar bodies and oversized responses are refused with a plain message', async () => {
  await assert.rejects(fetchCalendarText(GOOD, async () => res(403)), (e) => /error \(403\)/.test(e.userMessage));
  await assert.rejects(fetchCalendarText(GOOD, async () => res(200, '<html>Just a moment...</html>')), (e) => /did not return a calendar/.test(e.userMessage));
  await assert.rejects(fetchCalendarText(GOOD, async () => res(200, 'BEGIN:VCALENDAR', { 'content-length': String(MAX_BYTES + 1) })), (e) => /too large/.test(e.userMessage));
  await assert.rejects(fetchCalendarText(GOOD, async () => { throw new Error('ECONNRESET'); }), (e) => /Could not reach/.test(e.userMessage));
  let n = 0;
  await assert.rejects(fetchCalendarText(GOOD, async () => (++n, res(302, '', { location: GOOD }))), (e) => /Too many redirects/.test(e.userMessage));
});

test('a calendar entry matches an existing meet with no Athletic.net id by day and name, never when it is ambiguous', () => {
  const entry = { name: 'Reed Park Time Trial', date: '2026-09-08' };
  const m = (id, name, date, athleticMeetId = null) => ({ id, name, date: new Date(`${date}T00:00:00Z`), athleticMeetId });
  assert.equal(matchCalendarEntryToMeet(entry, [m('a', 'reed park  time-trial', '2026-09-08')]).id, 'a');
  assert.equal(matchCalendarEntryToMeet(entry, [m('a', 'Reed Park Time Trial', '2026-09-09')]), null);
  assert.equal(matchCalendarEntryToMeet(entry, [m('a', 'Reed Park Time Trial', '2026-09-08', '285237')]), null);
  assert.equal(matchCalendarEntryToMeet(entry, [m('a', 'Reed Park Time Trial', '2026-09-08'), m('b', 'Reed Park Time Trial', '2026-09-08')]), null);
});

test('the routes: the server no longer builds an Athletic.net address, and saving a link is checked and coach-only', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'meetOps.js'), 'utf8');
  assert.ok(!/SchoolID=\$\{/.test(src), 'no address is constructed from athleticTeamId');
  assert.match(src, /router\.put\('\/calendar-feed', authenticate, requireTeam, requireRole\(FULL_COACH\)/);
  assert.match(src, /normalizeCalendarUrl\(raw\)/);
  assert.match(src, /fetchCalendarText\(link\.url\)/);
  assert.match(src, /WRONG_SEASON_LINK/);
});
