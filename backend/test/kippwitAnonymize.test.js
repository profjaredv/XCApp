const test = require('node:test');
const assert = require('node:assert/strict');
const { anonymizeAthletesForAnalysis, TOKEN_PREFIX } = require('../lib/kippwitAnonymize');

test('anonymizeAthletesForAnalysis: replaces names with tokens, never the original name', () => {
  const athletes = [
    { name: 'Alex Rivera', avgTime: 1000 },
    { name: 'Jordan Kim', avgTime: 1100 },
  ];
  const { anonymized } = anonymizeAthletesForAnalysis(athletes);

  assert.equal(anonymized.length, 2);
  for (const a of anonymized) {
    assert.match(a.name, new RegExp(`^${TOKEN_PREFIX}_[A-Z0-9]{6}$`));
    assert.notEqual(a.name, 'Alex Rivera');
    assert.notEqual(a.name, 'Jordan Kim');
  }
  // Never leaks a real name into an unrelated field either.
  assert.ok(!JSON.stringify(anonymized).includes('Alex Rivera'));
  assert.ok(!JSON.stringify(anonymized).includes('Jordan Kim'));
});

test('anonymizeAthletesForAnalysis: same name gets the same token within one call', () => {
  const athletes = [
    { name: 'Alex Rivera', race: 'A' },
    { name: 'Alex Rivera', race: 'B' },
  ];
  const { anonymized } = anonymizeAthletesForAnalysis(athletes);
  assert.equal(anonymized[0].name, anonymized[1].name);
});

test('anonymizeAthletesForAnalysis: names differing only by case/whitespace share one token', () => {
  const athletes = [{ name: 'Alex Rivera' }, { name: '  alex rivera  ' }];
  const { anonymized } = anonymizeAthletesForAnalysis(athletes);
  assert.equal(anonymized[0].name, anonymized[1].name);
});

test('anonymizeAthletesForAnalysis: deanonymize restores every token occurrence in free text', () => {
  const athletes = [
    { name: 'Alex Rivera' },
    { name: 'Jordan Kim' },
  ];
  const { anonymized, deanonymize } = anonymizeAthletesForAnalysis(athletes);
  const [tokenA, tokenB] = anonymized.map((a) => a.name);

  const aiText = `${tokenA}'s pace improved while ${tokenB} was inconsistent. Watch ${tokenA} closely.`;
  const restored = deanonymize(aiText);

  assert.ok(restored.includes('Alex Rivera'));
  assert.ok(restored.includes('Jordan Kim'));
  assert.ok(!restored.includes(tokenA));
  assert.ok(!restored.includes(tokenB));
});

test('anonymizeAthletesForAnalysis: deanonymize is a no-op on text with no tokens', () => {
  const { deanonymize } = anonymizeAthletesForAnalysis([{ name: 'Alex Rivera' }]);
  assert.equal(deanonymize('No tokens here.'), 'No tokens here.');
});

test('anonymizeAthletesForAnalysis: deanonymize passes through non-string input unchanged', () => {
  const { deanonymize } = anonymizeAthletesForAnalysis([{ name: 'Alex Rivera' }]);
  assert.equal(deanonymize(undefined), undefined);
  assert.equal(deanonymize(null), null);
});

test('anonymizeAthletesForAnalysis: fresh token map every call — tokens are not stable across calls', () => {
  const athletes = [{ name: 'Alex Rivera' }];
  const first = anonymizeAthletesForAnalysis(athletes).anonymized[0].name;
  // Overwhelmingly likely to differ (32^6 possibilities); if this ever
  // flakes it's a sign the RNG got seeded predictably, worth investigating.
  let allSame = true;
  for (let i = 0; i < 5; i++) {
    if (anonymizeAthletesForAnalysis(athletes).anonymized[0].name !== first) allSame = false;
  }
  assert.equal(allSame, false);
});
