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

// --- the guarantee the marketing page rests on -------------------------
//
// The public site claims the model writing a team's insights never sees
// who anyone is. That is only true while every call to a third-party AI
// sits downstream of the tokenizer. The tests above prove the tokenizer
// works; these prove nothing routes around it.

const path = require('node:path');
const fs = require('node:fs');

const BACKEND = path.join(__dirname, '..');

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith('.js') && !full.includes(`${path.sep}test${path.sep}`)) out.push(full);
  }
  return out;
}

test('there is exactly one third-party AI call site in the backend', () => {
  // A second one added without anonymization would silently break the
  // claim. Finding out here is the point: if this fails because a new AI
  // feature was added, route it through anonymizeAthletesForAnalysis and
  // update the count deliberately.
  const callers = sourceFiles(BACKEND).filter((f) =>
    /generateContent\(/.test(fs.readFileSync(f, 'utf8'))
  );
  assert.deepEqual(
    callers.map((f) => path.relative(BACKEND, f)),
    ['routes/coachesTools.js'],
    'a new AI call site must anonymize before it sends anything'
  );
});

test('names are tokenized before the prompt is built, and the prompt carries no real name', () => {
  const source = fs.readFileSync(path.join(BACKEND, 'routes', 'coachesTools.js'), 'utf8');

  const anonymizeAt = source.indexOf('anonymizeAthletesForAnalysis(validAthletes)');
  const promptAt = source.indexOf('const prompt = `');
  const sendAt = source.indexOf('model.generateContent(prompt)');

  assert.ok(anonymizeAt > 0 && promptAt > 0 && sendAt > 0, 'all three steps should be findable');
  assert.ok(anonymizeAt < promptAt, 'anonymization must happen before the prompt is built');
  assert.ok(promptAt < sendAt, 'the prompt must be built before it is sent');

  // The prompt interpolates `anonymized`, never the raw athlete list. If
  // this ever reads validAthletes, real names go over the wire.
  const promptBody = source.slice(promptAt, sendAt);
  assert.match(promptBody, /\$\{anonymized\./, 'the prompt must interpolate the anonymized list');
  assert.doesNotMatch(promptBody, /\$\{validAthletes/, 'the prompt must never interpolate raw athletes');
});
