const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseTeamCalendar } = require('../lib/icalMeets');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'team-calendar-2026.ics'), 'utf8');

test('parseTeamCalendar: extracts only real meets, skipping calendar placeholders', () => {
  const meets = parseTeamCalendar(fixture);
  // Fixture has 12 VEVENTs total; "First Day of Practice" and "District
  // Meet Placeholder" carry no /CrossCountry/meet/ link and must be excluded.
  assert.equal(meets.length, 10);
  assert.ok(!meets.some((m) => m.name === 'First Day of Practice'));
  assert.ok(!meets.some((m) => m.name === 'District Meet Placeholder'));
});

test('parseTeamCalendar: pulls the Athletic.net meet ID out of DESCRIPTION', () => {
  const meets = parseTeamCalendar(fixture);
  const relays = meets.find((m) => m.name === 'Ellensburg Invitational Relays');
  assert.ok(relays);
  assert.equal(relays.athleticMeetId, '271958');
});

test('parseTeamCalendar: converts DTSTART;VALUE=DATE into an ISO date string', () => {
  const meets = parseTeamCalendar(fixture);
  const relays = meets.find((m) => m.name === 'Ellensburg Invitational Relays');
  assert.equal(relays.date, '2026-09-11');
});

test('parseTeamCalendar: captures location for real meets', () => {
  const meets = parseTeamCalendar(fixture);
  const relays = meets.find((m) => m.name === 'Ellensburg Invitational Relays');
  assert.equal(relays.location, 'Irene Rinehart Riverfront Park, Ellensburg, WA 98926');
});

test('parseTeamCalendar: every real meet keeps its UID', () => {
  const meets = parseTeamCalendar(fixture);
  assert.ok(meets.every((m) => typeof m.uid === 'string' && m.uid.startsWith('vcal_xc_')));
});

test('parseTeamCalendar: handles a completely empty feed', () => {
  assert.deepEqual(parseTeamCalendar('BEGIN:VCALENDAR\nEND:VCALENDAR'), []);
});

test('parseTeamCalendar: line-folded SUMMARY unfolds correctly (real feed uses CRLF + one-space continuation)', () => {
  const meets = parseTeamCalendar(fixture);
  const nike = meets.find((m) => m.athleticMeetId === '269885');
  assert.equal(nike.name, 'NIKE -- HOLE IN THE WALL XC INVITATIONAL');
});
