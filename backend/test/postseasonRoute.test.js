// The Post Season route: the same questions the Season screens ask, of the
// races at the end of the year — plus the bulk tagging path that feeds it.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'postseason.js'), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .join('\n');

test('reading is coach-tier and writing is head-coach', () => {
  // Athlete-by-athlete detail for the whole team, same tier the Season
  // screens sit behind; tagging rewrites what every other screen counts.
  assert.match(code, /router\.get\('\/', authenticate, requireTeam, requireRole\(ANY_COACH\)/);
  assert.match(code, /router\.patch\('\/tags', authenticate, requireTeam, requireRole\(FULL_COACH\)/);
});

test('tagging recalculates every season it touched', () => {
  // A coach who just told the app something about their races shouldn't
  // have to know which screens read cached metrics.
  assert.match(code, /seasonsTouched/);
  assert.match(code, /calculateAllMetrics\(teamId, season\)/);
  assert.match(code, /seasonsRecalculated/);
});

test('a bulk tag write is one transaction', () => {
  // Half-applied tagging would leave a season's postseason history in a
  // state nobody chose.
  assert.match(code, /prisma\.\$transaction/);
});

test('every meet in a tag request is checked against the caller team', () => {
  assert.match(code, /where: \{ id: \{ in: meetIds \}, teamId \}/);
  assert.match(code, /status\(404\)/);
});

test('an invalid level is rejected rather than stored', () => {
  assert.match(code, /isValidLevel\(level\)/);
  assert.match(code, /status\(400\)/);
});

test('the season view compares postseason against the whole season', () => {
  // "Did they run their best race when it counted" needs both numbers.
  assert.match(code, /seasonBestByAthlete/);
  assert.match(code, /peakedSec/);
});

test('pack spread needs five finishers', () => {
  assert.match(code, /times\.length >= 5 \? times\[4\] - times\[0\] : null/);
});

test('the tagging worklist offers suggestions without applying them', () => {
  assert.match(code, /suggestedLevel: suggestLevel\(meet\.name\)/);
  // The stored level and the suggestion are separate fields; nothing
  // writes one from the other.
  assert.match(code, /level: levels\.length === 1 \? levels\[0\] : null/);
});
