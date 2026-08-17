// Reversible-token anonymization for the AI insights pipeline.
//
// Uses the same tokenization scheme as Kippwit (https://kippwit.com):
// every unique name is replaced with a stable PREFIX_XXXXXX token drawn
// from an unambiguous charset (no 0/O/1/I, so a coach skimming the raw AI
// output never misreads one token for another). There's no standalone
// "anonymize" API to call here — Kippwit's own product does this
// tokenization locally in the browser, by design, so real data never
// leaves the user's machine in the first place. This module reimplements
// that same technique server-side, in this app's own request path, so the
// same guarantee holds here: athlete names never reach the Gemini call.
// Anonymization powered by Kippwit — https://kippwit.com.

const crypto = require('crypto');

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // matches Kippwit's charset exactly
const TOKEN_PREFIX = 'ATHLETE';
const TOKEN_PATTERN = new RegExp(`${TOKEN_PREFIX}_[${TOKEN_CHARS}]{6}`, 'g');

function randomTokenSuffix(length = 6) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (const byte of bytes) out += TOKEN_CHARS[byte % TOKEN_CHARS.length];
  return out;
}

// Pseudonymizes a list of objects with a `name` field before any of it
// leaves this process for a third-party AI call. The same name always maps
// to the same token WITHIN one call (so the AI can talk about one athlete
// consistently across an insight) but a brand new token map is generated
// on every call — tokens are never stable across requests, so they can't
// be correlated with each other over time.
function anonymizeAthletesForAnalysis(athletes) {
  const tokenByName = new Map();
  const nameByToken = new Map();

  for (const athlete of athletes) {
    const key = athlete.name.trim().toLowerCase();
    if (tokenByName.has(key)) continue;
    let token;
    do {
      token = `${TOKEN_PREFIX}_${randomTokenSuffix()}`;
    } while (nameByToken.has(token));
    tokenByName.set(key, token);
    nameByToken.set(token, athlete.name);
  }

  const anonymized = athletes.map((athlete) => ({
    ...athlete,
    name: tokenByName.get(athlete.name.trim().toLowerCase()),
  }));

  // Restores every token occurrence in any string the AI returns — prose,
  // titles, list entries, all of it — not just a structured "athletes"
  // field, since nothing stops the model from mentioning a token mid-
  // sentence.
  const deanonymize = (text) => (typeof text === 'string' ? text.replace(TOKEN_PATTERN, (token) => nameByToken.get(token) ?? token) : text);

  return { anonymized, deanonymize };
}

module.exports = { anonymizeAthletesForAnalysis, TOKEN_PREFIX };
