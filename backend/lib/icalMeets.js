// Parses Athletic.net's public team-calendar iCal feed
// (https://www.athletic.net/CrossCountry/Print/ical.ashx?SchoolID=&S=) —
// a plain, unauthenticated .ics endpoint meant for calendar-app
// subscriptions, confirmed reachable with a plain HTTPS GET (no Playwright,
// no session/bot-detection issues the Angular team pages have).
//
// The feed mixes real meets with calendar-only entries (first day of
// practice, a "District Meet Placeholder" with no actual meet behind it
// yet). Only VEVENTs whose DESCRIPTION carries a real
// /CrossCountry/meet/{id} link are real meets — that link is also the
// stable Athletic.net meet ID, the same one Race.athleticMeetId already
// stores from results scraping, so it's the dedup key for both re-imports
// of this feed and for reconciling with races scraped from a different
// source.

// RFC 5545 line folding: a long line is split across a CRLF (or LF) plus
// exactly one leading space/tab on the continuation. Unfolding removes
// that pair, not just the newline, so continued content reattaches with no
// intervening space of its own.
function unfold(icsText) {
  return icsText.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeIcsValue(value) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseEvents(icsText) {
  const lines = unfold(icsText)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).split(';')[0];
    current[key] = line.slice(colonIdx + 1);
  }
  return events;
}

const MEET_LINK = /\/CrossCountry\/meet\/(\d+)/;

// Returns only the real meets (DESCRIPTION carrying a meet link) — practice
// days and placeholder calendar entries are silently excluded, they were
// never meets to import.
function parseTeamCalendar(icsText) {
  const meets = [];
  for (const ev of parseEvents(icsText)) {
    const description = ev.DESCRIPTION || '';
    const match = description.match(MEET_LINK);
    if (!match) continue;

    const dtstart = ev.DTSTART || '';
    const dateMatch = dtstart.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!dateMatch) continue;

    meets.push({
      uid: ev.UID || null,
      athleticMeetId: match[1],
      name: ev.SUMMARY ? unescapeIcsValue(ev.SUMMARY) : '',
      date: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
      location: ev.LOCATION ? unescapeIcsValue(ev.LOCATION) : null,
    });
  }
  return meets;
}

module.exports = { parseTeamCalendar };
