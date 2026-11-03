// Matches the event name text on Athletic.net's Event Progress page (an
// .event-header's <strong> text, e.g. "100m Hurdles") to the seeded Event
// catalog's canonical name (scripts/seedTrackEvents.js, e.g. "100 Meter
// Hurdles"). The two label sets genuinely differ — confirmed against a real
// scraped page, not assumed — so this is a real alias layer, not a
// normalization no-op.
//
// Per the handoff doc's Section 4 step 3: "log and report anything that
// doesn't match rather than silently dropping it." A name with no alias
// and no exact match is reported as unmatched, never guessed at or
// silently skipped — most of the real page's unmatched names are indoor
// events (60 Meter, 1 Mile, 1000/1200/1500/2000 Meters, 2000m
// Steeplechase, 600 Meters, flat 300 Meters, 200m/400m/60m Hurdles,
// Standing Long Jump), which the handoff explicitly defers past the booth
// demo (Section 6) — this file doesn't decide that policy, it just refuses
// to pretend an unmatched name imported cleanly.
const ALIASES = {
  '100m hurdles': '100 Meter Hurdles',
  '110m hurdles': '110 Meter Hurdles',
  '300m hurdles': '300 Meter Hurdles',
};

const normalize = (name) => (name || '').trim().toLowerCase();

/**
 * Builds a lookup from the live Event catalog (so a seed-list correction
 * is picked up automatically, no second copy of event names to keep in
 * sync) plus the alias map above.
 * @param {Array<{id: string, name: string}>} events
 */
function buildEventMatcher(events) {
  const byExactName = new Map(events.map((e) => [normalize(e.name), e]));

  return function matchEventName(rawName) {
    const key = normalize(rawName);
    const exact = byExactName.get(key);
    if (exact) return { event: exact, matched: true };
    const aliasTarget = ALIASES[key];
    if (aliasTarget) {
      const aliased = byExactName.get(normalize(aliasTarget));
      if (aliased) return { event: aliased, matched: true };
    }
    return { event: null, matched: false };
  };
}

module.exports = { buildEventMatcher, ALIASES };
