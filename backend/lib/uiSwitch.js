// The optional "What made you switch back?" answer stored on a
// UiSwitchEvent (docs/leadpack-new-ui-trial.md §1.2). Pure, so it can be
// tested without a database.

const MAX_REASON_LENGTH = 500;

// Blank or non-string answers are stored as null — skipping the question
// is fine and shouldn't read as an empty-string "reason" in the admin
// list. Anything longer than the cap is cut, not rejected: a coach who
// wrote a paragraph shouldn't lose the switch over it.
function switchReason(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_REASON_LENGTH);
}

module.exports = { switchReason, MAX_REASON_LENGTH };
