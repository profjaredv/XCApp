// GET /api/splits/race/:raceId — closingLabel is derived once, backend
// side, from the same markers the rest of the response already used, so
// the entry grid can't drift from what was actually computed (it used to
// re-derive its own "Mile N" label client-side, always, regardless of
// whether the closing segment was actually close to a whole mile).
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'splits.js'), 'utf8');
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .join('\n');

const buildRaceView = code.slice(code.indexOf('function buildRaceView'), code.indexOf('// C5 (LeadPack'));

test('imports closingSegmentLabel from the shared lib, not a local re-derivation', () => {
  assert.match(code, /const \{ [^}]*closingSegmentLabel[^}]* \} = require\('\.\.\/lib\/splitMath'\)/);
});

test('buildRaceView computes closingLabel from the SAME markers array the rest of the response uses', () => {
  assert.match(buildRaceView, /closingLabel: closingSegmentLabel\(race\.distanceMeters, race\.splitMarkerScheme, markers\)/);
});
