// The analytics overview used to compute a grade as
//
//     currentGrade: athlete.grade || am.grade || 9
//
// which invented "Freshman" for anyone it knew nothing about. Right after a
// coach's first results import — new athletes, no roster rows yet, no
// metrics calculated — that meant a screen full of confidently wrong
// grades, on the exact screen a coach opens to CHECK their import.
//
// Two things were wrong and both mattered:
//   1. The `|| 9` fabricated an answer instead of admitting ignorance.
//   2. `athlete.grade` is a vestigial column. Nothing has written it since
//      the app moved to deriving grade from graduationYear (lib/season.js),
//      so it was reading whatever a long-ago import happened to leave.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveGrade } = require('../lib/season');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'routes', 'analytics.js'), 'utf8');
const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');

test('no grade is invented when none is known', () => {
  assert.doesNotMatch(
    SOURCE,
    /currentGrade:[^,]*\|\|\s*9/,
    'a `|| 9` fallback shows unknown-grade athletes as freshmen'
  );
  assert.match(SOURCE, /currentGrade:[\s\S]{0,300}?am\.grade \?\? *\n? *null/, 'must fall through to null');
});

test('grade comes from the season roster, then graduationYear — not the dead column', () => {
  const block = SOURCE.slice(SOURCE.indexOf('currentGrade:'), SOURCE.indexOf('currentGrade:') + 400);
  assert.match(block, /rosterGradeByAthleteId/, "this season's roster row is the first source");
  assert.match(block, /deriveGrade\(athlete\.graduationYear, season\)/, 'then derive it from graduationYear');
  assert.doesNotMatch(block, /athlete\.grade\b/, 'Athlete.grade is vestigial and must not be read');
});

test('the query loads graduationYear, since that is what the grade is derived from', () => {
  const include = SOURCE.slice(SOURCE.indexOf('athleteSeasonMetrics.findMany'), SOURCE.indexOf('orderBy: { bestTime5k'));
  assert.match(include, /graduationYear: true/);
  assert.doesNotMatch(include, /grade: true/, 'selecting the dead column invites reading it again');
});

test('Athlete.grade really is unwritten, which is why reading it was wrong', () => {
  // If someone starts maintaining it again, this fails and the decision
  // above deserves revisiting rather than silently rotting.
  assert.match(SCHEMA, /^\s*grade\s+Int\?/m, 'the column still exists');
  const routes = path.join(__dirname, '..', 'routes');
  const writes = [];
  for (const file of fs.readdirSync(routes).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(routes, file), 'utf8');
    const re = /prisma\.athlete\.(create|update|upsert)\(\{[\s\S]{0,400}?\}\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (/\bgrade:/.test(m[0])) writes.push(`${file}: ${m[0].slice(0, 60)}…`);
    }
  }
  assert.deepEqual(writes, [], `something writes Athlete.grade now: ${writes.join(' | ')}`);
});

test('deriveGrade gives the right answer for the reported case', () => {
  // A sophomore in the 2025 season graduates in spring 2028: she is grade
  // 10 that fall, and grade 9 the season before.
  assert.equal(deriveGrade(2028, 2025), 10);
  assert.equal(deriveGrade(2028, 2024), 9);
  assert.equal(deriveGrade(2028, 2026), 11);
  assert.equal(deriveGrade(2028, 2027), 12);
});

test('an unknown graduation year derives nothing rather than guessing', () => {
  assert.equal(deriveGrade(null, 2025), null);
  assert.equal(deriveGrade(undefined, 2025), null);
  assert.equal(deriveGrade(2028, null), null);
});
