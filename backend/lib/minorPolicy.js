// Who is old enough to have their own LeadPack account.
//
// COPPA regulates collecting personal information online FROM a child
// under 13. LeadPack's answer is not to comply with it but to stay outside
// it: a student below 9th grade never gets an account, so nothing is
// collected from them online. A coach can still keep a 7th grader on a
// roster and record their times — the coach is the one entering it, and
// that is a school record like any other — but the child does not sign in,
// does not write a training log, and is never asked for anything.
//
// The line is drawn at 9th grade rather than at an age because grade is
// what this app actually knows. Nothing here stores a birthday, and asking
// for one would collect more about a minor than the decision needs. A 9th
// grader is 14 or turning 14; the handful who start high school at 13 are
// covered by the margin, and a middle-school program — the real reason
// this exists, since a middle-school coach can sign up like anyone else —
// falls entirely below the line.
//
// This is a floor, not the whole story: it decides who may hold an
// account, not what a coach may see. Visibility is decided separately in
// lib/trainingLogSharing.js and lib/raceReflections.js.

const { deriveGrade } = require('./season');

/** Below this grade, no account. */
const MIN_ACCOUNT_GRADE = 9;

/**
 * Decide whether a roster entry may be linked to a sign-in account.
 *
 * Returns { allowed, reason, grade }. `reason` is written to be shown to
 * whoever hit the wall — usually a coach trying to send an invite — so it
 * says what to do instead, not just "no".
 *
 * An unknown class year ALLOWS the account. That is deliberate and worth
 * defending: most rosters are imported without a class year (that is the
 * exact gap the "Set class year" button exists to fill), and refusing
 * every athlete whose year nobody has typed yet would break the normal
 * high-school case to guard against a rare one. The check bites when a
 * class year says the athlete is below 9th grade — which is precisely the
 * middle-school case, where a coach entering real class years is how the
 * situation shows up at all.
 */
function decideCanHaveAccount({ graduationYear, season }) {
  const grade = deriveGrade(graduationYear, season);

  if (grade === null || grade === undefined) {
    return {
      allowed: true,
      grade: null,
      reason: null,
    };
  }

  if (grade < MIN_ACCOUNT_GRADE) {
    return {
      allowed: false,
      grade,
      reason:
        'LeadPack accounts are for high school athletes in 9th grade and above. ' +
        'You can keep this athlete on the roster and record their results — ' +
        'they just cannot sign in yet.',
    };
  }

  return { allowed: true, grade, reason: null };
}

/** True when this athlete is a minor for sharing-default purposes.
 *
 *  Everyone on a high school roster is assumed to be one. Rather than
 *  guess from a class year that is usually missing, the app treats every
 *  athlete as a minor and applies the protective default to all of them —
 *  which costs an 18-year-old senior one extra tap and costs a 14-year-old
 *  nothing. See routes/athletes.js's import and log endpoints. */
function isMinorByDefault() {
  return true;
}

module.exports = { MIN_ACCOUNT_GRADE, decideCanHaveAccount, isMinorByDefault };
