const test = require('node:test');
const assert = require('node:assert/strict');
const { checkSeasonCsv } = require('../lib/seasonCsv');
const { athleticIdKey, matchAthlete } = require('../lib/athleteMatching');

const HEADER = '"Race Name","Athlete Name","Grade","Gender","Time","Race Date","Distance","Source URL","Athletic Meet ID","Athletic Athlete ID"';
const row = (gender, date = 'Sep 8, 2026') => `"Meet","Pat Lee","10","${gender}","17:00.0","${date}","5000 Meters","","1",""`;

test('checkSeasonCsv', async (t) => {
  await t.test('accepts a season copy and reports which genders it covers', () => {
    const r = checkSeasonCsv([HEADER, row('Men'), row('Women')].join('\n'), 2026);
    assert.equal(r.ok, true);
    assert.deepEqual([...r.genders].sort(), ['F', 'M']);
  });
  await t.test('a one-gender copy says so (the import then removes nothing)', () => {
    assert.equal(checkSeasonCsv([HEADER, row('Men')].join('\n'), 2026).genders.size, 1);
  });
  await t.test('turns away an empty paste, the wrong season, and a Field Results copy', () => {
    assert.match(checkSeasonCsv('  ', 2026).message, /Paste the results/);
    assert.match(checkSeasonCsv([HEADER, row('Men', 'Sep 8, 2025')].join('\n'), 2026).message, /from 2025, not 2026/);
    assert.match(checkSeasonCsv('"Athlete Name","Division","Time"\n"x","y","1:00"', 2026).message, /Field Results/);
    assert.match(checkSeasonCsv([HEADER, row('Men')].join('\n'), NaN).message, /season/);
  });
});

test('athleticIdKey matches old and new Athletic.net athlete links', () => {
  assert.equal(athleticIdKey('https://www.athletic.net/athlete/20715760/cross-country'), '20715760');
  assert.equal(athleticIdKey('https://www.athletic.net/CrossCountry/Athlete.aspx?AID=20715760'), '20715760');
  assert.equal(athleticIdKey('/athlete/1'), '1');
  assert.equal(athleticIdKey('something-else'), 'something-else');
  assert.equal(athleticIdKey(null), null);
  const dawson = { id: 'a1' };
  const byAthleticId = new Map([[athleticIdKey('https://www.athletic.net/CrossCountry/Athlete.aspx?AID=20715760'), dawson]]);
  assert.equal(
    matchAthlete({ athleticAthleteId: athleticIdKey('https://www.athletic.net/athlete/20715760/cross-country'), name: 'X' }, { byAthleticId, byName: new Map() }),
    dawson
  );
});

test('the pasted import route checks the CSV and never removes races that are missing from the paste', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'routes', 'teams.js'), 'utf8');
  assert.match(src, /router\.post\('\/import-season-csv', authenticate, requireRole\(FULL_COACH\)/);
  assert.match(src, /importSeasonCsv\(req\.user\.team, yearNum, csv, \{ removeStale: false \}\)/);
  assert.match(src, /if \(removeStale && existingRaceIdByKey\.size > 0\)/);
});
