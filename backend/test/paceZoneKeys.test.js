// The backend validates zone keys against DEFAULT_ZONE_KEYS, but the zones
// themselves are defined in web/src/lib/paceZones.ts (paces are computed
// client-side; the server never needs the rules). That is a duplicated list
// across a language boundary, which is exactly the shape of thing that rots
// silently: add a seventh default zone, forget this list, and every session
// created against it gets a 400 that says nothing useful.
//
// So the test reads the real frontend constant and compares. Same reasoning
// as the splitMarkerScheme near-miss: verify the two halves actually agree
// rather than trusting that they do.
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_ZONE_KEYS,
  LEGACY_ZONE_MAP,
  parseZoneKey,
  teamZoneKey,
  isUsableZoneKey,
} = require('../lib/paceZoneRules');

const PACE_ZONES_TS = path.join(__dirname, '..', '..', 'web', 'src', 'lib', 'paceZones.ts');

function frontendDefaultKeys() {
  const source = fs.readFileSync(PACE_ZONES_TS, 'utf8');
  const block = source.slice(source.indexOf('export const MCMILLAN_ZONES'));
  assert.ok(block, 'could not find MCMILLAN_ZONES in paceZones.ts');
  // Each entry is offsetZone('mcm-x', ...) or rangeZone('mcm-x', ...).
  return [...block.matchAll(/(?:offsetZone|rangeZone)\(\s*'([^']+)'/g)].map((m) => m[1]);
}

test('the frontend default zones are exactly the keys this server accepts', () => {
  const fromFrontend = frontendDefaultKeys();
  assert.ok(fromFrontend.length > 0, 'parsed no zones out of paceZones.ts');
  assert.deepEqual(
    fromFrontend,
    DEFAULT_ZONE_KEYS,
    'MCMILLAN_ZONES and DEFAULT_ZONE_KEYS have drifted — update lib/paceZoneRules.js'
  );
});

test('every legacy interval zone maps to a key that still exists', () => {
  for (const [legacy, mapped] of Object.entries(LEGACY_ZONE_MAP)) {
    assert.ok(DEFAULT_ZONE_KEYS.includes(mapped), `${legacy} maps to unknown key ${mapped}`);
  }
});

test('parseZoneKey tells a default from a team zone', () => {
  assert.deepEqual(parseZoneKey('mcm-vo2'), { kind: 'default', key: 'mcm-vo2' });
  assert.deepEqual(parseZoneKey('team:DIS'), { kind: 'team', key: 'team:DIS', abbreviation: 'DIS' });
});

test('parseZoneKey rejects malformed keys rather than guessing', () => {
  for (const bad of ['', null, undefined, 42, 'mcm-nonsense', 'team:', 'DIS', 'team:WAYTOOLONGABBREV']) {
    assert.equal(parseZoneKey(bad), null, `${JSON.stringify(bad)} should not parse`);
  }
});

test('teamZoneKey round-trips through parseZoneKey', () => {
  const parsed = parseZoneKey(teamZoneKey('VO2'));
  assert.equal(parsed.kind, 'team');
  assert.equal(parsed.abbreviation, 'VO2');
});

test('a team key is only usable when the team actually defined that zone', () => {
  assert.equal(isUsableZoneKey('team:DIS', ['DIS', 'SS']), true);
  assert.equal(isUsableZoneKey('team:T', ['DIS', 'SS']), false);
  // A default is always usable — no team defines it, it just exists.
  assert.equal(isUsableZoneKey('mcm-vo2', []), true);
  assert.equal(isUsableZoneKey('garbage', ['DIS']), false);
});

test('abbreviations are matched exactly, not case-insensitively', () => {
  // normalizePaceZoneSet already refuses to store "T" and "t" together, so
  // an exact match here can never be ambiguous — and being lenient would
  // let 'team:t' silently resolve to a zone called 'T'.
  assert.equal(isUsableZoneKey('team:dis', ['DIS']), false);
});
