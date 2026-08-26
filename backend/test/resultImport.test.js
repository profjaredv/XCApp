const test = require('node:test');
const assert = require('node:assert/strict');

const { parseResultsText, resolveRows, unswapLastFirst, parseFreeformLine } = require('../lib/resultImport');
const { normalizeAthleteName } = require('../lib/athleteMatching');

function rosterIndex(entries) {
  const map = new Map();
  for (const [name, athleteId] of entries) map.set(normalizeAthleteName(name), { athleteId, name });
  return map;
}

// ---------------------------------------------------------------------------
// Delimited input with a header — the reliable path.
// ---------------------------------------------------------------------------

test('CSV with headers: name, time and place are read from their columns', () => {
  const { rows, format } = parseResultsText('Place,Athlete,Time\n1,Callum Woods-Vallejo,18:42.3\n2,Gigi Anderson,19:05');
  assert.equal(format, 'delimited');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].nameCandidates, ['Callum Woods-Vallejo']);
  assert.equal(rows[0].place, 1);
  assert.equal(Math.round(rows[0].timeSec * 10) / 10, 1122.3);
  assert.equal(rows[1].timeSec, 1145);
});

test('CSV headers are matched case-insensitively and by alias (Runner/Result)', () => {
  const { rows } = parseResultsText('RUNNER,RESULT\nTess Vaughn,17:58');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].nameCandidates, ['Tess Vaughn']);
  assert.equal(rows[0].timeSec, 1078);
});

test('tab-separated wins over comma, so "Last, First" cells survive', () => {
  const { rows } = parseResultsText('Athlete\tTime\nWoods-Vallejo, Callum\t18:42');
  assert.equal(rows.length, 1);
  // Comma form is un-swapped into natural order for matching.
  assert.deepEqual(rows[0].nameCandidates, ['Callum Woods-Vallejo']);
});

test('a header row alone is not enough — a data row mentioning "time" is not treated as a header', () => {
  // Only a time-ish header, no name-ish header: must fall through to freeform
  // rather than eating the first row as column names.
  const { format } = parseResultsText('Time\n18:42');
  assert.equal(format, 'freeform');
});

test('delimited rows with an unparseable time are skipped, not zeroed', () => {
  const { rows, skipped } = parseResultsText('Athlete,Time\nGigi Anderson,DNF\nTess Vaughn,17:58');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nameCandidates[0], 'Tess Vaughn');
  assert.deepEqual(skipped, ['Gigi Anderson,DNF']);
});

// ---------------------------------------------------------------------------
// Free-form paste — the actual "Athletic.net blocked us" path.
// ---------------------------------------------------------------------------

test('pasted results line: place, time and a name candidate are extracted', () => {
  const row = parseFreeformLine('1 Callum Woods-Vallejo 12 18:42.3 Kenwood');
  assert.equal(row.place, 1);
  assert.equal(Math.round(row.timeSec * 10) / 10, 1122.3);
  // Both the athlete and the school survive as candidates — the roster is
  // what decides between them, not this parser.
  assert.ok(row.nameCandidates.includes('Callum Woods-Vallejo'));
  assert.ok(row.nameCandidates.includes('Kenwood'));
});

test('grade markers and points are dropped from name candidates', () => {
  const row = parseFreeformLine('5 Marcus Bell Yr: 10 19:20 +12pts');
  assert.ok(row.nameCandidates.includes('Marcus Bell'));
  assert.ok(!row.nameCandidates.some((c) => /pts|Yr|10/.test(c)));
});

test('longer name candidates come before shorter ones', () => {
  const row = parseFreeformLine('3 Priya Chandrasekaran 18:10');
  const full = row.nameCandidates.indexOf('Priya Chandrasekaran');
  const partial = row.nameCandidates.indexOf('Priya');
  assert.ok(full !== -1 && partial !== -1);
  assert.ok(full < partial, 'the full name must be tried before a single token');
});

test('a line with no time returns null rather than a zero-time row', () => {
  assert.equal(parseFreeformLine('Boys Varsity 5K'), null);
  assert.equal(parseFreeformLine('12 Someone Absent DNS'), null);
});

test('an hour-long time parses as h:mm:ss, not mm:ss', () => {
  const row = parseFreeformLine('1 Ultra Runner 1:02:15');
  assert.equal(row.timeSec, 3735);
});

test('non-result lines are reported as skipped so nothing vanishes silently', () => {
  const { rows, skipped } = parseResultsText('Boys Varsity 5K\n1 Tess Vaughn 17:58\nteam scores follow');
  assert.equal(rows.length, 1);
  assert.deepEqual(skipped, ['Boys Varsity 5K', 'team scores follow']);
});

test('a "Last, First" pair mid-line is offered swapped, so it can match the roster', () => {
  // unswapLastFirst alone can't help here: the line has trailing tokens, so
  // it isn't entirely one name. This was a real miss found by running a
  // realistic multi-school paste through the parser.
  const row = parseFreeformLine('5 Woods, Tess 9 17:03.7 Kenwood');
  assert.ok(row.nameCandidates.includes('Tess Woods'), `expected "Tess Woods" in ${JSON.stringify(row.nameCandidates)}`);
  assert.equal(row.place, 5);
});

test('the swapped reading is preferred over raw token order', () => {
  const row = parseFreeformLine('5 Woods, Tess 9 17:03.7 Kenwood');
  assert.equal(row.nameCandidates[0], 'Tess Woods');
});

test('commas are stripped from ordinary name candidates', () => {
  const row = parseFreeformLine('5 Woods, Tess 9 17:03.7 Kenwood');
  assert.ok(!row.nameCandidates.some((c) => c.includes(',')));
});

test('"Last, First" survives the full parseResultsText path, not just parseFreeformLine', () => {
  // Regression: the freeform branch used to strip ALL commas before calling
  // parseFreeformLine, so the swap handling was dead on the real path while
  // its own unit test (which called parseFreeformLine directly) still passed.
  const { rows } = parseResultsText('5  Woods, Tess  9  17:03.7  Kenwood');
  const resolved = resolveRows(rows, rosterIndex([['Tess Woods', 'a9']]), normalizeAthleteName);
  assert.equal(resolved[0].athleteId, 'a9');
});

test('headerless CSV still parses, since a comma with no space is a delimiter', () => {
  const { rows } = parseResultsText('1,Callum Woods-Vallejo,18:42.3');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].place, 1);
  assert.ok(rows[0].nameCandidates.includes('Callum Woods-Vallejo'));
});

// ---------------------------------------------------------------------------
// unswapLastFirst
// ---------------------------------------------------------------------------

test('unswapLastFirst only fires on a clean two-part comma name', () => {
  assert.equal(unswapLastFirst('Woods-Vallejo, Callum'), 'Callum Woods-Vallejo');
  assert.equal(unswapLastFirst('Callum Woods-Vallejo'), 'Callum Woods-Vallejo');
  // Three parts, or a number on either side: left alone rather than mangled.
  assert.equal(unswapLastFirst('a, b, c'), 'a, b, c');
  assert.equal(unswapLastFirst('Smith, 12'), 'Smith, 12');
});

// ---------------------------------------------------------------------------
// resolveRows — the roster is what disambiguates name from school.
// ---------------------------------------------------------------------------

test('resolveRows picks the roster athlete over a school name on the same line', () => {
  const { rows } = parseResultsText('1 Callum Woods-Vallejo 12 18:42.3 Kenwood');
  const resolved = resolveRows(rows, rosterIndex([['Callum Woods-Vallejo', 'a1']]), normalizeAthleteName);
  assert.equal(resolved[0].athleteId, 'a1');
  assert.equal(resolved[0].matchedOn, 'Callum Woods-Vallejo');
});

test('resolveRows leaves an unknown runner unmatched instead of guessing', () => {
  const { rows } = parseResultsText('1 Someone Fromanotherschool 18:42');
  const resolved = resolveRows(rows, rosterIndex([['Callum Woods-Vallejo', 'a1']]), normalizeAthleteName);
  assert.equal(resolved[0].athleteId, null);
  assert.equal(resolved[0].matchedName, null);
});

test('resolveRows matches a preferred name when that is what was indexed', () => {
  const { rows } = parseResultsText('Athlete,Time\nGigi Anderson,19:05');
  const index = rosterIndex([
    ['Georgina Anderson', 'a2'],
    ['Gigi Anderson', 'a2'],
  ]);
  const resolved = resolveRows(rows, index, normalizeAthleteName);
  assert.equal(resolved[0].athleteId, 'a2');
});

test('resolveRows preserves place and time untouched', () => {
  const { rows } = parseResultsText('Place,Athlete,Time\n4,Tess Vaughn,17:58');
  const resolved = resolveRows(rows, rosterIndex([['Tess Vaughn', 'a3']]), normalizeAthleteName);
  assert.equal(resolved[0].place, 4);
  assert.equal(resolved[0].timeSec, 1078);
});

test('empty input is empty, not an error', () => {
  const { rows, format } = parseResultsText('   \n\n  ');
  assert.equal(rows.length, 0);
  assert.equal(format, 'empty');
});
