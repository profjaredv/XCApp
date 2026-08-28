// What is in a data export, declared in one place.
//
// "This data is yours, you can export it at any time" is a promise, and a
// promise made of thirty hand-written queries scattered through a route
// handler is one nobody can audit. So every table an export touches is
// declared here — what it is called, how it is scoped to the team, and
// whether it is source data or something we derived — and the route just
// walks this list.
//
// Two rules this file exists to enforce:
//
//   1. NOTHING leaves without being scoped to the requesting team. Models
//      that carry teamId are filtered on it directly; the rest are filtered
//      through the relation that leads to one. There is no third option and
//      no unscoped query.
//
//   2. NO LIVE CREDENTIAL is ever written into an export file. Exports get
//      emailed, dropped in shared drives and attached to support tickets. A
//      file containing a team's join code or a pending invite token is a
//      credential leak with a long tail. See SENSITIVE_FIELDS.

// Removed from every exported object, at any depth, always.
//
// joinCode and the invite/claim tokens are not "sensitive-ish" — they are
// bearer credentials. Anyone holding the join code can put themselves on
// the roster; anyone holding an invite token can accept it. The Stripe ids
// are billing-account handles that have no business in a coach's backup.
const SENSITIVE_FIELDS = ['token', 'joinCode', 'stripeCustomerId', 'stripeSubscriptionId'];

// Whole tables that never appear in an export, with the reason, because
// "why is X missing" is a question this file should answer.
const EXCLUDED_MODELS = {
  Feedback: 'The maintainer\'s private inbox, and deliberately cross-tenant — not this team\'s data.',
  PageView: 'Usage telemetry about the product, not data the team created.',
  User: 'Accounts span teams. Staff appear via teamMembers, athletes via athletes.',
  AthleteInvite: 'Exists only to carry a live token; the invitee\'s email is already on the athlete row.',
  StaffInvite: 'Exists only to carry a live token; the invitee\'s email is already on the staff row.',
  AthleteClaim: 'Exists only to carry a live token.',
  TeamClaim: 'Exists only to carry a live token.',
  Course: 'A shared lookup table, not team-owned. Course names travel on the races that reference them.',
};

/**
 * Strip every sensitive field, at any depth.
 *
 * Applied centrally to whole payloads rather than trusted to each query's
 * `select`, because a `select` that forgets one fails silently and a
 * missing select (Prisma returning everything) is the default. This runs
 * over the finished object, so a field added to the schema tomorrow is
 * caught by name without anyone remembering to update a select list.
 */
function redactDeep(value) {
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (SENSITIVE_FIELDS.includes(key)) continue;
      out[key] = redactDeep(v);
    }
    return out;
  }
  return value;
}

// Scoping shorthands. `direct` means the model has its own teamId column;
// `via` means it is reachable only through a relation that does.
const direct = (teamId) => ({ teamId });
const via = (relation) => (teamId) => ({ [relation]: { teamId } });

/**
 * Every table in a TEAM export.
 *
 * `model` is the Prisma client property. `where(teamId)` produces the
 * filter. `derived: true` marks a table this app computed rather than
 * something a coach entered — it is still exported (it is theirs), but the
 * manifest in the file says which numbers can be recomputed and which are
 * irreplaceable.
 */
const TEAM_EXPORT = [
  // --- the roster and its people ---
  { key: 'athletes', model: 'athlete', where: direct, label: 'Athletes' },
  { key: 'seasons', model: 'season', where: direct, label: 'Seasons' },
  { key: 'seasonRoster', model: 'seasonRoster', where: via('season'), label: 'Season roster' },
  { key: 'teamMembers', model: 'teamMember', where: direct, label: 'Staff and roles' },
  { key: 'guardianLinks', model: 'guardianLink', where: via('athlete'), label: 'Guardian links' },

  // --- racing ---
  { key: 'meets', model: 'meet', where: direct, label: 'Meets' },
  { key: 'meetPlans', model: 'meetPlan', where: via('meet'), label: 'Meet plans' },
  { key: 'races', model: 'race', where: direct, label: 'Races' },
  { key: 'meetEntries', model: 'meetEntry', where: via('race'), label: 'Meet entries' },
  { key: 'results', model: 'result', where: direct, label: 'Results' },
  { key: 'fieldResults', model: 'fieldResult', where: via('race'), label: 'Field event results' },
  { key: 'raceSplits', model: 'raceSplit', where: direct, label: 'Race split markers' },
  { key: 'splits', model: 'split', where: direct, label: 'Splits' },
  { key: 'raceReflections', model: 'raceReflection', where: via('athlete'), label: 'Race reflections' },
  { key: 'meetGroups', model: 'meetGroup', where: direct, label: 'Meet groups' },
  { key: 'meetGroupRaces', model: 'meetGroupRace', where: via('meetGroup'), label: 'Meet group races' },
  { key: 'timerSessions', model: 'timerSession', where: direct, label: 'Live timer sessions' },

  // --- training ---
  { key: 'groups', model: 'group', where: direct, label: 'Training groups' },
  { key: 'groupMemberships', model: 'groupMembership', where: via('group'), label: 'Group memberships' },
  { key: 'groupLeaders', model: 'groupLeader', where: via('group'), label: 'Group leaders' },
  { key: 'practiceLocations', model: 'practiceLocation', where: direct, label: 'Practice locations' },
  { key: 'practicePlans', model: 'practicePlan', where: direct, label: 'Practice plans' },
  { key: 'workoutTemplates', model: 'workoutTemplate', where: direct, label: 'Workout templates' },
  { key: 'intervalSessions', model: 'intervalSession', where: direct, label: 'Interval sessions' },
  { key: 'intervalSessionEntries', model: 'intervalSessionEntry', where: via('intervalSession'), label: 'Interval session entries' },
  { key: 'trainingLogs', model: 'trainingLog', where: via('athlete'), label: 'Training logs' },
  { key: 'attendanceSessions', model: 'attendanceSession', where: direct, label: 'Attendance sessions' },
  { key: 'attendanceRecords', model: 'attendanceRecord', where: via('session'), label: 'Attendance records' },
  { key: 'paceZones', model: 'paceZone', where: direct, label: 'Training pace zones' },
  { key: 'coachUpAcknowledgements', model: 'coachUpAcknowledgement', where: direct, label: 'Coach-up acknowledgements' },

  // --- equipment ---
  { key: 'equipment', model: 'equipment', where: direct, label: 'Equipment' },
  { key: 'equipmentAssignments', model: 'equipmentAssignment', where: via('equipment'), label: 'Equipment assignments' },

  // --- things this app computed ---
  { key: 'teamSeasonMetrics', model: 'teamSeasonMetrics', where: direct, label: 'Team season metrics', derived: true },
  { key: 'athleteSeasonMetrics', model: 'athleteSeasonMetrics', where: direct, label: 'Athlete season metrics', derived: true },
  { key: 'meetPerformanceMetrics', model: 'meetPerformanceMetrics', where: direct, label: 'Meet performance metrics', derived: true },
  { key: 'aiInsightSnapshots', model: 'aiInsightSnapshot', where: direct, label: 'AI insight snapshots', derived: true },
];

/**
 * Every table in an ATHLETE export, scoped to one athlete.
 *
 * Narrower than "their rows from the team export" on purpose. An athlete
 * export is what the app already shows that person about themselves, in a
 * file — not a subject-access dossier. Coach-private material (captain
 * notes, coach-up acknowledgements, AI insight text about the squad) is
 * deliberately absent: an export is not the place to newly disclose
 * something the UI never showed them. A coach exporting on an athlete's
 * behalf gets the same file, so there is one answer to "what is in it".
 */
const byAthlete = (athleteId) => ({ athleteId });
const byAthleteVia = (relation) => (athleteId) => ({ [relation]: { athleteId } });

const ATHLETE_EXPORT = [
  { key: 'results', model: 'result', where: byAthlete, label: 'Results' },
  // Splits hang off a Result, not off the athlete directly.
  { key: 'splits', model: 'split', where: byAthleteVia('result'), label: 'Splits' },
  // No fieldResults. FieldResult stores athleteName as free text with no
  // athlete FK at all (it comes from a meet's published field-event
  // results, which are not roster-linked), so scoping it to one athlete
  // would mean matching on a name — and a name match can hand someone
  // another school's athlete's result. An export has to be right rather
  // than complete.
  { key: 'meetEntries', model: 'meetEntry', where: byAthlete, label: 'Meet entries' },
  { key: 'raceReflections', model: 'raceReflection', where: byAthlete, label: 'Race reflections' },
  { key: 'trainingLogs', model: 'trainingLog', where: byAthlete, label: 'Training logs' },
  { key: 'attendanceRecords', model: 'attendanceRecord', where: byAthlete, label: 'Attendance' },
  { key: 'intervalSessionEntries', model: 'intervalSessionEntry', where: byAthlete, label: 'Interval session entries' },
  { key: 'groupMemberships', model: 'groupMembership', where: byAthlete, label: 'Group memberships' },
  { key: 'seasonRoster', model: 'seasonRoster', where: byAthlete, label: 'Season roster entries' },
  { key: 'equipmentAssignments', model: 'equipmentAssignment', where: byAthlete, label: 'Equipment assigned' },
  { key: 'seasonMetrics', model: 'athleteSeasonMetrics', where: byAthlete, label: 'Season metrics', derived: true },
];

module.exports = {
  SENSITIVE_FIELDS,
  EXCLUDED_MODELS,
  TEAM_EXPORT,
  ATHLETE_EXPORT,
  redactDeep,
};
