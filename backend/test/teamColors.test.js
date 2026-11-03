const test = require('node:test');
const assert = require('node:assert/strict');
const { applyColorUpdate, normalizeColors } = require('../lib/teamColors');

test('accepts hex colors and lowercases them', () => {
  const r = applyColorUpdate(null, { primary: '#B22222', accent: '#FFD700' });
  assert.deepEqual(r.colors, { primary: '#b22222', accent: '#ffd700' });
});

test('null clears one color and leaves the rest', () => {
  const r = applyColorUpdate({ primary: '#112233', accent: '#445566' }, { accent: null });
  assert.deepEqual(r.colors, { primary: '#112233' });
});

test('rejects anything that is not a plain #rrggbb', () => {
  for (const bad of ['red', '#fff', 'rgb(0,0,0)', 'url(x)', '#12345g', 12]) {
    assert.ok(applyColorUpdate(null, { primary: bad }).error, String(bad));
  }
});

test('rejects unknown keys and non-objects', () => {
  assert.ok(applyColorUpdate(null, { background: '#000000' }).error);
  assert.ok(applyColorUpdate(null, []).error);
  assert.ok(applyColorUpdate(null, null).error);
});

test('normalizeColors drops anything stored that is not valid', () => {
  assert.deepEqual(normalizeColors({ primary: '#abcdef', accent: 'javascript:1', other: '#000000' }), { primary: '#abcdef' });
  assert.deepEqual(normalizeColors(undefined), {});
});
