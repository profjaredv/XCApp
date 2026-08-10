const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAthleteName, matchAthlete } = require('../lib/athleteMatching');

test('normalizeAthleteName', () => {
  assert.equal(normalizeAthleteName('Jack Smith'), 'jack smith');
  assert.equal(normalizeAthleteName('  Jack   Smith  '), 'jack smith');
  assert.equal(normalizeAthleteName(''), '');
  assert.equal(normalizeAthleteName(null), '');
});

test('matchAthlete prefers athleticAthleteId over name', () => {
  const jack = { id: 'a1', name: 'Jack Smith', athleticAthleteId: 'https://www.athletic.net/athlete/1' };
  const byAthleticId = new Map([[jack.athleticAthleteId, jack]]);
  const byName = new Map([['jack smith', jack]]);

  // Name changed on Athletic.net (e.g. corrected spelling), id did not.
  const match = matchAthlete(
    { athleticAthleteId: 'https://www.athletic.net/athlete/1', name: 'Jackson Smith' },
    { byAthleticId, byName }
  );
  assert.equal(match.id, 'a1');
});

test('matchAthlete falls back to name when athleticAthleteId is absent or unmatched', () => {
  const jack = { id: 'a1', name: 'Jack Smith', athleticAthleteId: null };
  const byAthleticId = new Map();
  const byName = new Map([['jack smith', jack]]);

  const matchNoId = matchAthlete({ athleticAthleteId: '', name: 'Jack Smith' }, { byAthleticId, byName });
  assert.equal(matchNoId.id, 'a1');

  const matchUnknownId = matchAthlete(
    { athleticAthleteId: 'https://www.athletic.net/athlete/999', name: 'Jack Smith' },
    { byAthleticId, byName: new Map() } // id map empty, this id not seen before, no name match either
  );
  assert.equal(matchUnknownId, null);
});

test('matchAthlete returns null when nothing matches — caller creates a new athlete', () => {
  const match = matchAthlete(
    { athleticAthleteId: 'https://www.athletic.net/athlete/2', name: 'New Runner' },
    { byAthleticId: new Map(), byName: new Map() }
  );
  assert.equal(match, null);
});

test('matchAthlete: two same-named athletes, one carries an id, the other is matched correctly', () => {
  const jackWithId = { id: 'a1', name: 'Jack Smith', athleticAthleteId: 'https://www.athletic.net/athlete/1' };
  const byAthleticId = new Map([[jackWithId.athleticAthleteId, jackWithId]]);
  // byName only ever holds one entry per normalized name (documented
  // limitation) — simulate the second Jack Smith having overwritten it.
  const otherJack = { id: 'a2', name: 'Jack Smith', athleticAthleteId: 'https://www.athletic.net/athlete/2' };
  const byName = new Map([['jack smith', otherJack]]);

  const matchedById = matchAthlete(
    { athleticAthleteId: 'https://www.athletic.net/athlete/1', name: 'Jack Smith' },
    { byAthleticId, byName }
  );
  assert.equal(matchedById.id, 'a1'); // id match wins even though byName points at the other Jack
});
