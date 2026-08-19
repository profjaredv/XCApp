// Today-page activity feed follow-up: training logs are private by
// default ("yours alone" — see schema.prisma's TrainingLog comment). An
// athlete can opt a given log into being visible to coaches and/or
// teammates via two independent flags. This mirrors
// lib/raceReflections.js's decideCanViewReflection in shape and posture
// (explicit allowlist, isOwner always wins, VOLUNTEER_COACH is
// group-scoped) so the two permission stories read the same way, but
// keeps its own function since the two source flags (coach vs. team) are
// genuinely different from reflections' single sharedWithCoach toggle.

function decideCanViewTrainingLog({
  viewerRole,
  isOwner,
  sharedWithCoach,
  sharedWithTeam,
  viewerLeadsAthleteGroup,
  viewerIsTeammate,
}) {
  if (isOwner) return true;
  if (viewerRole === 'HEAD_COACH' || viewerRole === 'COACH') return Boolean(sharedWithCoach);
  if (viewerRole === 'VOLUNTEER_COACH') return Boolean(sharedWithCoach) && Boolean(viewerLeadsAthleteGroup);
  if (viewerRole === 'ATHLETE') return Boolean(sharedWithTeam) && Boolean(viewerIsTeammate);
  return false;
}

module.exports = { decideCanViewTrainingLog };
