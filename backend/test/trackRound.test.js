const { test } = require('node:test');
const assert = require('node:assert');
const { parseRound } = require('../lib/trackRound');

test('parseRound: real level+round values from the page', () => {
  for (const raw of ['V F', 'JV F', 'Jv F', 'O F', '2A F', 'FS F', 'SPLIT F', 'UNI F', 'VAR F', '2 F', '3 F', '8 F']) {
    assert.strictEqual(parseRound(raw), 'FINAL', raw);
  }
  for (const raw of ['V P', '2A P']) {
    assert.strictEqual(parseRound(raw), 'PRELIM', raw);
  }
});

test('parseRound: defaults to FINAL for blank or unrecognized text', () => {
  assert.strictEqual(parseRound(''), 'FINAL');
  assert.strictEqual(parseRound(null), 'FINAL');
  assert.strictEqual(parseRound('???'), 'FINAL');
});
