const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, neutralizeFormula } = require('../lib/exportCsv');

test('quotes every cell and escapes embedded quotes', () => {
  const csv = toCsv([{ name: 'Woods-Vallejo, Callum', note: 'said "go"' }]);
  assert.equal(csv, '"name","note"\r\n"Woods-Vallejo, Callum","said ""go"""\r\n');
});

test('a comma or newline in a value cannot break the row', () => {
  const csv = toCsv([{ note: 'line one\nline two, with comma' }]);
  assert.ok(csv.includes('"line one\nline two, with comma"'));
  // Header row, then one record — the embedded newline stays inside quotes.
  assert.equal(csv.split('\r\n').filter(Boolean).length, 2);
});

test('formula-leading cells are neutralized (CSV injection)', () => {
  // Excel and Sheets execute a leading =, +, - or @. An athlete nicknamed
  // "=Speedy" should not become a formula in a coach's spreadsheet.
  for (const dangerous of ['=1+1', '+1', '-1', '@SUM(A1)', '=HYPERLINK("http://x","c")']) {
    assert.equal(neutralizeFormula(dangerous), `'${dangerous}`);
    // Compare against the escaped form: a payload containing its own
    // quotes (the HYPERLINK case, which is the one that actually exfils
    // data) has them doubled on the way into the cell.
    const escaped = `'${dangerous}`.replace(/"/g, '""');
    assert.ok(toCsv([{ v: dangerous }]).includes(`"${escaped}"`), dangerous);
  }
});

test('ordinary values are left alone', () => {
  for (const safe of ['Callum', '18:00', '5000', 'a-b', 'x=y']) {
    assert.equal(neutralizeFormula(safe), safe);
  }
});

test('null and undefined become empty cells, not "null"', () => {
  assert.equal(toCsv([{ a: null, b: undefined }]), '"a","b"\r\n"",""\r\n');
});

test('dates are written as ISO, not as a locale string', () => {
  const csv = toCsv([{ date: new Date('2025-10-15T00:00:00.000Z') }]);
  assert.ok(csv.includes('"2025-10-15T00:00:00.000Z"'));
});

test('nested objects and arrays are JSON, not [object Object]', () => {
  const csv = toCsv([{ meta: { a: 1 }, tags: ['x', 'y'] }]);
  assert.ok(csv.includes('{""a"":1}'));
  assert.ok(csv.includes('[""x"",""y""]'));
});

test('headers are the union of every row, not just the first', () => {
  // A row with an extra field must not be silently truncated — a quietly
  // incomplete export is exactly what this feature exists to prevent.
  const csv = toCsv([{ a: 1 }, { a: 2, b: 3 }]);
  assert.ok(csv.startsWith('"a","b"'));
  assert.ok(csv.includes('"2","3"'));
  assert.ok(csv.includes('"1",""'));
});

test('an empty table produces an empty string, not a bare header', () => {
  assert.equal(toCsv([]), '');
  assert.equal(toCsv(null), '');
});

test('numbers and booleans survive as text', () => {
  const csv = toCsv([{ n: 0, f: false, neg: -5 }]);
  // -5 leads with a minus, so it is neutralized like any other
  // formula-leading cell; a spreadsheet still reads '-5 as -5.
  assert.ok(csv.includes('"0"'));
  assert.ok(csv.includes('"false"'));
  assert.ok(csv.includes(`"'-5"`));
});
