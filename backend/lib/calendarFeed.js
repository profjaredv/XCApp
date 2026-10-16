// The team calendar (iCal) link a coach pastes to import their meet schedule.
//
// LeadPack never builds an Athletic.net address on its own: the coach copies
// the calendar link from their team's calendar and pastes it into LeadPack,
// and the server fetches exactly that address, once, when the coach clicks
// Import calendar. No schedule, no polling. Because a coach supplies the URL,
// it is checked hard before the server will request it (no other hosts, no
// credentials, no redirects off Athletic.net, bounded size and time).

const ALLOWED_HOSTS = new Set(['www.athletic.net', 'athletic.net']);
const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;

/**
 * @returns {{ok: true, url: string, season: number|null} | {ok: false, message: string}}
 */
function normalizeCalendarUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, message: 'Paste your team calendar link.' };
  // Calendar apps hand out webcal:// links; it is https underneath.
  const asHttps = raw.replace(/^webcal:\/\//i, 'https://');
  let u;
  try {
    u = new URL(asHttps);
  } catch {
    return { ok: false, message: 'That does not look like a link. Copy the full calendar link and paste it here.' };
  }
  if (u.protocol !== 'https:') return { ok: false, message: 'The calendar link must start with https:// (or webcal://).' };
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase()) || u.port) {
    return { ok: false, message: 'That link is not from Athletic.net. Copy the calendar (iCal) link from your Athletic.net team calendar.' };
  }
  if (u.username || u.password) return { ok: false, message: 'That link contains a login. Copy the plain calendar link instead.' };
  if (!/ical/i.test(u.pathname)) {
    return { ok: false, message: 'That is not a calendar (iCal) link. Copy the calendar link from your Athletic.net team calendar.' };
  }
  u.hash = '';
  const s = parseInt(u.searchParams.get('S') ?? '', 10);
  return { ok: true, url: u.toString(), season: Number.isFinite(s) ? s : null };
}

/** Is the redirect target still an allowed Athletic.net address? */
function safeRedirectTarget(from, location) {
  try {
    const next = new URL(location, from);
    const check = normalizeCalendarUrl(next.toString());
    return check.ok ? check.url : null;
  } catch {
    return null;
  }
}

/**
 * Fetches the calendar text for a link that already passed normalizeCalendarUrl.
 * `fetchImpl` is injectable for tests. Throws an Error whose `.userMessage` is safe to show.
 */
async function fetchCalendarText(url, fetchImpl = fetch) {
  const fail = (message) => Object.assign(new Error(message), { userMessage: message });
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetchImpl(current, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'text/calendar, text/plain, */*' } });
    } catch {
      throw fail('Could not reach Athletic.net to fetch the team calendar.');
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const next = safeRedirectTarget(current, res.headers.get('location') || '');
      if (!next) throw fail('Athletic.net sent that link somewhere else, so it was not followed. Copy the calendar link again.');
      current = next;
      continue;
    }
    if (!res.ok) throw fail(`Athletic.net returned an error (${res.status}) fetching the team calendar.`);
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BYTES) throw fail('That calendar is too large to import.');
    const text = await res.text();
    if (text.length > MAX_BYTES) throw fail('That calendar is too large to import.');
    if (!/BEGIN:VCALENDAR/.test(text)) throw fail('That link did not return a calendar. Copy the calendar (iCal) link from your Athletic.net team calendar.');
    return text;
  }
  throw fail('Too many redirects fetching the team calendar.');
}

const normName = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * A calendar entry that matches a meet LeadPack already has but that has no Athletic.net id yet
 * (one made by Update results, or by hand): same day, same name. Attaching the id beats creating
 * a second meet. Returns the meet or null.
 */
function matchCalendarEntryToMeet(entry, meets) {
  const day = String(entry.date).slice(0, 10);
  const candidates = meets.filter((m) => !m.athleticMeetId && new Date(m.date).toISOString().slice(0, 10) === day && normName(m.name) === normName(entry.name));
  return candidates.length === 1 ? candidates[0] : null;
}

module.exports = { normalizeCalendarUrl, fetchCalendarText, matchCalendarEntryToMeet, ALLOWED_HOSTS, MAX_BYTES };
