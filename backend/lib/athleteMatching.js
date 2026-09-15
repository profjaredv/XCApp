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

// byAthleticId: Map<athleticAthleteId, athlete>  (Athlete.athleticAthleteId)
// byAliasId:    Map<athleticAthleteId, athlete>  (AthleteAliasId — ids retired
//               by a merge; optional, so existing callers keep working)
// byName:       Map<normalizedName, athlete>
//
// Aliases are checked BEFORE name and AFTER live ids. Before name, because
// an id is the whole reason this function prefers ids — a merged duplicate
// usually had a DIFFERENT name (that's why it was a duplicate), so falling
// through to name is exactly what recreated it every import. After live
// ids, because a live id is a current fact and an alias is a historical
// one; if some profile were somehow both, the athlete who owns it now wins.
function matchAthlete({ athleticAthleteId, name }, { byAthleticId, byAliasId, byName }) {
  if (athleticAthleteId && byAthleticId.has(athleticAthleteId)) {
    return byAthleticId.get(athleticAthleteId);
  }
  if (athleticAthleteId && byAliasId && byAliasId.has(athleticAthleteId)) {
    return byAliasId.get(athleticAthleteId);
  }
  const normalized = normalizeAthleteName(name);
  if (normalized && byName.has(normalized)) {
    return byName.get(normalized);
  }
  return null;
}

module.exports = { normalizeAthleteName, matchAthlete };
