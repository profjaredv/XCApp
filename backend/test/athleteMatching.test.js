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

// --- Merged-away profile links (AthleteAliasId) -----------------------
// The bug these cover: a coach merges two duplicate athletes, and the very
// next import re-creates the one they merged away. Athletic.net goes on
// reporting the retired profile link; with the loser's row gone, that id
// matched nothing and matching fell through to name — and the duplicates
// had different names, which is usually why they were duplicates.

test('matchAthlete resolves a merged-away profile link to the surviving athlete', () => {
  const keeper = { id: 'a1', name: 'Jonathan Smith', athleticAthleteId: 'https://www.athletic.net/athlete/1' };
  const byAthleticId = new Map([[keeper.athleticAthleteId, keeper]]);
  const byAliasId = new Map([['https://www.athletic.net/athlete/2', keeper]]);
  const byName = new Map([['jonathan smith', keeper]]);

  const match = matchAthlete(
    { athleticAthleteId: 'https://www.athletic.net/athlete/2', name: 'Jon Smith' },
    { byAthleticId, byAliasId, byName }
  );
  assert.equal(match.id, 'a1');
});

test('matchAthlete checks aliases BEFORE falling back to name', () => {
  // The scraped row's name matches a DIFFERENT athlete. Name-matching it
  // would attach a result to the wrong person; the alias is the stronger
  // signal and has to win.
  const keeper = { id: 'a1', name: 'Jonathan Smith', athleticAthleteId: 'https://www.athletic.net/athlete/1' };
  const someoneElse = { id: 'a9', name: 'Jon Smith', athleticAthleteId: 'https://www.athletic.net/athlete/9' };
  const byAthleticId = new Map([
    [keeper.athleticAthleteId, keeper],
    [someoneElse.athleticAthleteId, someoneElse],
  ]);
  const byAliasId = new Map([['https://www.athletic.net/athlete/2', keeper]]);
  const byName = new Map([['jon smith', someoneElse]]);

  const match = matchAthlete(
    { athleticAthleteId: 'https://www.athletic.net/athlete/2', name: 'Jon Smith' },
    { byAthleticId, byAliasId, byName }
  );
  assert.equal(match.id, 'a1');
});

test('matchAthlete prefers a live id over an alias claiming the same link', () => {
  // A live id is a current fact; an alias is a historical one.
  const current = { id: 'a1', name: 'Current', athleticAthleteId: 'https://www.athletic.net/athlete/5' };
  const stale = { id: 'a2', name: 'Stale', athleticAthleteId: 'https://www.athletic.net/athlete/6' };
  const byAthleticId = new Map([[current.athleticAthleteId, current]]);
  const byAliasId = new Map([['https://www.athletic.net/athlete/5', stale]]);

  const match = matchAthlete(
    { athleticAthleteId: 'https://www.athletic.net/athlete/5', name: 'Whoever' },
    { byAthleticId, byAliasId, byName: new Map() }
  );
  assert.equal(match.id, 'a1');
});

test('matchAthlete still works for callers that pass no alias map at all', () => {
  const jack = { id: 'a1', name: 'Jack Smith', athleticAthleteId: null };
  const match = matchAthlete(
    { athleticAthleteId: 'https://www.athletic.net/athlete/1', name: 'Jack Smith' },
    { byAthleticId: new Map(), byName: new Map([['jack smith', jack]]) }
  );
  assert.equal(match.id, 'a1');
});

test('an unknown profile link with no alias and no name match is still a new athlete', () => {
  const match = matchAthlete(
    { athleticAthleteId: 'https://www.athletic.net/athlete/77', name: 'Brand New' },
    { byAthleticId: new Map(), byAliasId: new Map(), byName: new Map() }
  );
  assert.equal(match, null);
});
