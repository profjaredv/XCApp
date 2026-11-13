const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSport, currentSport, runWithSport, schoolYearStart, sportMiddleware } = require('../lib/sport');
const { deriveGrade, deriveGraduationYear, isEnrolled, hasGraduated } = require('../lib/season');

test('anything but TRACK is cross country, including no header', () => {
  assert.equal(parseSport(undefined), 'XC');
  assert.equal(parseSport(''), 'XC');
  assert.equal(parseSport('soccer'), 'XC');
  assert.equal(parseSport('track'), 'TRACK');
  assert.equal(currentSport(), 'XC');
});

test('the middleware scopes the sport to its own request, across awaits', async () => {
  const seen = [];
  const run = (header) =>
    new Promise((resolve) => {
      sportMiddleware({ get: () => header }, {}, async () => {
        await new Promise((r) => setTimeout(r, header === 'TRACK' ? 5 : 1));
        seen.push([header, currentSport()]);
        resolve();
      });
    });
  await Promise.all([run('TRACK'), run(undefined)]);
  assert.deepEqual(seen.sort(), [['TRACK', 'TRACK'], [undefined, 'XC']].sort());
});

test('grade: a track season is the spring of the school year cross country started', () => {
  // Class of 2027: 11th grade in fall 2025 (XC 2025) and in spring 2026 (track 2026).
  assert.equal(deriveGrade(2027, 2025), 11);
  assert.equal(deriveGrade(2027, 2026, 'TRACK'), 11);
  assert.equal(deriveGraduationYear(11, 2025), 2027);
  assert.equal(deriveGraduationYear(11, 2026, 'TRACK'), 2027);
  assert.equal(schoolYearStart(2026, 'TRACK'), 2025);
  runWithSport('TRACK', () => {
    assert.equal(deriveGrade(2027, 2026), 11);
    // A senior (class of 2026) is still enrolled for the 2026 track season...
    assert.equal(isEnrolled(2026, 2026), true);
    assert.equal(hasGraduated(2026, 2026), false);
  });
  // ...but has graduated before the 2026 cross country season.
  assert.equal(hasGraduated(2026, 2026), true);
});

test('no season lookup by year alone is left in the backend', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const offenders = [];
  for (const dir of ['routes', 'lib', 'services', 'middleware']) {
    const full = path.join(__dirname, '..', dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full, { recursive: true }).filter((n) => String(n).endsWith('.js'))) {
      const src = fs.readFileSync(path.join(full, String(f)), 'utf8');
      const re = /season\.(findFirst|findMany|updateMany)\(\{[\s\S]{0,160}?where: \{([^}]*)\}/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        const where = m[2];
        if (/\bteamId\b/.test(where) && !/\bsport\b/.test(where) && !/\bid\b/.test(where)) offenders.push(`${dir}/${f}: { ${where.trim()} }`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
