// DELETE /api/meet-ops/:meetId — a coach can remove a meet they created
// by mistake, or one that got cancelled. The point of these assertions is
// that deleting a meet must never take the racing with it: a Meet is a
// grouping plus the day's logistics, and results live on Race.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'meetOps.js'), 'utf8');
/** Comments here describe the very things the assertions forbid. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .join('\n');

const deleteMeetRoute = code.slice(code.indexOf("router.delete('/:meetId'"));

test('deleting a meet is head-coach only and team-scoped', () => {
  assert.match(code, /router\.delete\('\/:meetId', authenticate, requireTeam, requireRole\(FULL_COACH\)/);
  assert.match(deleteMeetRoute, /findFirst\(\{ where: \{ id: req\.params\.meetId, teamId: req\.user\.teamId \} \}\)/);
  assert.match(deleteMeetRoute, /status\(404\)/);
});

test('unlinks the meet\'s races instead of deleting them', () => {
  // The whole safety property. A coach deleting a meet keeps every
  // result, split, entrant and reflection — the races simply stop being
  // grouped under it, and Schedule > Meets > Import can re-group them.
  assert.match(deleteMeetRoute, /race\.updateMany\(\{ where: \{ meetId: meet\.id \}, data: \{ meetId: null \} \}\)/);
  assert.doesNotMatch(deleteMeetRoute, /race\.deleteMany/);
  assert.doesNotMatch(deleteMeetRoute, /result\.deleteMany/);
});

test('unlink and delete are one transaction', () => {
  // Half-applied, this leaves either a meet pointing at nothing or races
  // orphaned from a meet that still exists.
  assert.match(deleteMeetRoute, /prisma\.\$transaction/);
});

test('reports how many races came loose', () => {
  // The confirmation a coach sees before committing is built from this.
  assert.match(deleteMeetRoute, /unlinkedRaceCount/);
});

test('deleting a RACE stays restricted to manual races', () => {
  // Unchanged by the meet delete above, and the reason the two differ:
  // deleting a scraped race destroys results that exist nowhere else.
  const deleteRaceRoute = code.slice(code.indexOf("router.delete('/races/:raceId'"));
  assert.match(deleteRaceRoute, /if \(!race\.isManual\)/);
});

test('the race-delete route is registered before the meet-delete route', () => {
  // Express matches in registration order. '/races/:raceId' is two
  // segments and '/:meetId' is one, so they cannot collide — but if that
  // ever changes, a one-segment wildcard registered first would swallow
  // every nested DELETE under it.
  assert.ok(code.indexOf("router.delete('/races/:raceId'") < code.indexOf("router.delete('/:meetId'"));
});
