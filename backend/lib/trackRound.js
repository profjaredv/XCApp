// The Event Progress page's Round column is actually two things packed
// into one cell, confirmed against real values ("V F", "JV F", "Jv F",
// "O F", "V P", "2A F", "2A P", "FS F", "SPLIT F", "UNI F", ...): a
// meet-specific level/division prefix (varsity/JV/open/frosh-soph/a dual's
// own label — no two meets agree on these) and a trailing round letter
// (F = final, P = prelim; no third letter was ever seen, e.g. no semis).
//
// TrackResult.round only models PRELIM | SEMI | FINAL (schema.prisma) —
// there's no column for the level/division prefix, and adding one wasn't
// asked for, so it's dropped here rather than guessed into a field that
// doesn't exist. Round defaults to FINAL when the trailing letter isn't
// recognized, matching the schema's own column default.
function parseRound(raw) {
  const trimmed = (raw || '').trim();
  const last = trimmed.split(/\s+/).pop() ?? '';
  if (last.toUpperCase() === 'P') return 'PRELIM';
  return 'FINAL';
}

module.exports = { parseRound };
