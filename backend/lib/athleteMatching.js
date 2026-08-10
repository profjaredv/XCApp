// Phase 2 step 5 (XCApp Build Spec): match a scraped row to an existing
// Athlete. Prefers athleticAthleteId (stable across name changes, and
// distinguishes two same-named athletes) over name.
//
// Known limitation, not fixed here: when a row carries no athleticAthleteId
// (an athlete scraped before this field existed, or a page where the name
// link was unparseable) and two existing athletes on the team share that
// normalized name, byName can only hold one of them — this function will
// match whichever one the caller's Map construction kept. That is the same
// ambiguity name-only matching already had before athleticAthleteId existed;
// it resolves itself once every athlete has been re-scraped and picked up a
// stable id, which is the point of this field.

function normalizeAthleteName(name) {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// byAthleticId: Map<athleticAthleteId, athlete>
// byName: Map<normalizedName, athlete>
function matchAthlete({ athleticAthleteId, name }, { byAthleticId, byName }) {
  if (athleticAthleteId && byAthleticId.has(athleticAthleteId)) {
    return byAthleticId.get(athleticAthleteId);
  }
  const normalized = normalizeAthleteName(name);
  if (normalized && byName.has(normalized)) {
    return byName.get(normalized);
  }
  return null;
}

module.exports = { normalizeAthleteName, matchAthlete };
