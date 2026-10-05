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

/**
 * Every normalized full-name string a results page might print for this
 * athlete: the legal `name`, `preferredName` as-is (already a full name
 * when it came from a roster CSV's "Preferred Name"/"Nickname" column —
 * see lib/rosterCsv.js), and — when `preferredName` is just a bare
 * nickname with no surname of its own (the common case: a coach typing
 * "Finn" into the Athletes page's one-field "Preferred name" box, or a
 * merge carrying that over from a duplicate profile) — that nickname
 * paired with `name`'s own surname, the same pairing
 * lib/resultImport.js's nameCandidates does from the opposite direction
 * for a parsed results row. Without this, "Finn" never matches a results
 * page's "Finn Woods-Vallejo" when the roster's legal name is "Finley
 * Woods-Vallejo" — the actual reported bug this fixes.
 */
function athleteNameCandidates(name, preferredName) {
  const candidates = new Set();
  if (name) candidates.add(name);
  if (preferredName) {
    candidates.add(preferredName);
    if (!preferredName.includes(' ')) {
      const parts = (name || '').trim().split(/\s+/);
      const surname = parts.length > 1 ? parts.slice(1).join(' ') : '';
      if (surname) candidates.add(`${preferredName} ${surname}`);
    }
  }
  return [...candidates].map(normalizeAthleteName).filter(Boolean);
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

module.exports = { normalizeAthleteName, matchAthlete, athleteNameCandidates };
