// The R2 key-naming convention is load-bearing for privacy (spec: "Object
// keys and filenames use UUIDs only — no athlete name ever appears in a
// key, a URL, or a download filename") and for the "derived, never stored"
// rule (thumb/web keys are computed from the same photoId every time, not
// their own columns). Pure functions, no network or credentials needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { photoOriginalKey, photoThumbKey, photoWebKey, collageKey } = require('../lib/r2');

const TEAM_ID = '11111111-1111-1111-1111-111111111111';
const PHOTO_ID = '22222222-2222-2222-2222-222222222222';
const ATHLETE_ID = '33333333-3333-3333-3333-333333333333';
const SEASON_ID = '44444444-4444-4444-4444-444444444444';

test('photo keys share one prefix per photo, one file per size', () => {
  assert.strictEqual(photoOriginalKey(TEAM_ID, PHOTO_ID), `teams/${TEAM_ID}/photos/${PHOTO_ID}/orig.jpg`);
  assert.strictEqual(photoThumbKey(TEAM_ID, PHOTO_ID), `teams/${TEAM_ID}/photos/${PHOTO_ID}/thumb.webp`);
  assert.strictEqual(photoWebKey(TEAM_ID, PHOTO_ID), `teams/${TEAM_ID}/photos/${PHOTO_ID}/web.webp`);
});

test('collage key encodes athlete, season and version, never a name', () => {
  assert.strictEqual(
    collageKey(TEAM_ID, ATHLETE_ID, SEASON_ID, 2),
    `teams/${TEAM_ID}/collages/${ATHLETE_ID}/${SEASON_ID}-v2.png`,
  );
});

test('every key is scoped under teams/{team_id} first', () => {
  for (const key of [
    photoOriginalKey(TEAM_ID, PHOTO_ID),
    photoThumbKey(TEAM_ID, PHOTO_ID),
    photoWebKey(TEAM_ID, PHOTO_ID),
    collageKey(TEAM_ID, ATHLETE_ID, SEASON_ID, 1),
  ]) {
    assert.ok(key.startsWith(`teams/${TEAM_ID}/`), key);
  }
});
