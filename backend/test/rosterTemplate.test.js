const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { parseRosterCsv, ROSTER_TEMPLATE_HEADERS, rosterTemplateCsv } = require('../lib/rosterCsv');

test('the template is a header row only, so nothing imports if it is uploaded blank', () => {
  const csv = rosterTemplateCsv();
  assert.equal(csv.trim(), ROSTER_TEMPLATE_HEADERS.join(','));
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  assert.equal(parseRosterCsv(rows).athletes.length, 0);
});

test('a filled-in template imports: every template column is one the importer understands', () => {
  const filled = `${rosterTemplateCsv()}Jordan,Rivera,Jo Rivera,9,F\nSam,Lee,,12,M\n`;
  const rows = parse(filled, { columns: true, skip_empty_lines: true, trim: true });
  const { athletes, errors } = parseRosterCsv(rows);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    athletes.map((a) => [a.name, a.grade, a.genderRaw, a.preferredName]),
    [['Jordan Rivera', 9, 'F', 'Jo Rivera'], ['Sam Lee', 12, 'M', null]]
  );
});

test('the template route is coach-only and registered before GET /:athleteId', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'athletes.js'), 'utf8');
  const at = src.indexOf("router.get('/roster-template', authenticate, requireTeam, requireRole(FULL_COACH)");
  assert.ok(at > 0);
  assert.ok(at < src.indexOf("router.get('/:athleteId', authenticate"));
  assert.match(src.slice(at, at + 400), /leadpack-roster-template\.csv/);
});
