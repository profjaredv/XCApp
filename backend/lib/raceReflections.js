// T5 (Team Management handoff): pure locking + visibility logic for race
// reflections, kept DB-free so it's directly testable (rule 5: write the
// test before the fix for anything permission-related) rather than only
// exercised indirectly through routes/raceReflections.js.

// "Enforce server-side against race start time, falling back to earliest
// recorded finish time if no start time exists." Race has no start-time
// field anywhere in this schema (never specified for any phase), so the
// fallback IS the operative rule for every race in this dataset: once ANY
// Result has been recorded for a race, the race has demonstrably already
// happened, and pre-race goals must stop being editable. A race with zero
// results yet is treated as not having started — resultCreatedAts empty
// or omitted returns null (never locked).
function computeLockAt({ resultCreatedAts }) {
  if (!resultCreatedAts || resultCreatedAts.length === 0) return null;
  return resultCreatedAts.reduce((earliest, t) => (t.getTime() < earliest.getTime() ? t : earliest));
}

function isPreRaceLocked({ now, lockAt }) {
  if (!lockAt) return false;
  return now.getTime() >= lockAt.getTime();
}

// Explicit allowlist, never "coach minus a few things" — same posture as
// T1's captain permission set (decideCanManageGroup's sibling for this
// domain). viewerRole is a TeamRole; an ATHLETE (which is what a captain
// still is — captaincy is a SeasonRoster flag, not a TeamRole) never
// passes here for anyone else's reflection, regardless of sharedWithCoach
// or any group-leadership status. isOwner always wins regardless of role
// or the toggle — an athlete can always read (and, elsewhere, edit) their
// own reflection.
function decideCanViewReflection({ viewerRole, isOwner, sharedWithCoach, viewerLeadsAthleteGroup }) {
  if (isOwner) return true;
  if (!sharedWithCoach) return false;
  if (viewerRole === 'HEAD_COACH' || viewerRole === 'COACH') return true;
  if (viewerRole === 'VOLUNTEER_COACH') return Boolean(viewerLeadsAthleteGroup);
  return false;
}

module.exports = { computeLockAt, isPreRaceLocked, decideCanViewReflection };
