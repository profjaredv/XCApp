// Which races were the postseason.
//
// "How many made it to districts, how many to state" is the question a
// program is judged on, and nothing in the app could answer it: a race is
// a name and a date, and the championship at the end of the year looks
// exactly like the invitational in September.
//
// The level lives on Race (not Meet — a scraped race often has no Meet
// row, and results hang off Race), and a coach sets it. This module only
// SUGGESTS, from the meet name, and that distinction is the whole point:
//
//   Penn State Invitational. Upstate Classic. Garden State Relays.
//   Stateline Invite.
//
// Every one of those contains "state", and none of them is a state meet.
// A keyword rule that writes the level silently would mark them, and the
// coach would never know their program's postseason history was wrong —
// they'd just see a number that looked plausible. So suggestions are
// offered, never applied; a level in the database is always something a
// person confirmed.

const LEVELS = ['LEAGUE', 'DISTRICT', 'REGIONAL', 'STATE', 'NATIONAL'];

const LEVEL_LABELS = {
  LEAGUE: 'League / conference',
  DISTRICT: 'District / sectional',
  REGIONAL: 'Regional',
  STATE: 'State',
  NATIONAL: 'National',
};

// Ordered: the first rule that matches wins, so "state regional qualifier"
// reads as REGIONAL rather than STATE. Anchored on word boundaries — the
// substring "state" inside "Upstate" is not the word "state".
const RULES = [
  { level: 'NATIONAL', pattern: /\b(nxn|nxr|nike cross|foot ?locker|eastbay|nationals?)\b/i },
  { level: 'REGIONAL', pattern: /\b(regionals?|region \w+|super ?region)\b/i },
  { level: 'DISTRICT', pattern: /\b(districts?|sectionals?|sub-?state)\b/i },
  { level: 'STATE', pattern: /\b(state (?:meet|championships?|final|finals|qualifier)|state xc|state cross country)\b/i },
  { level: 'STATE', pattern: /\b(?:ohsaa|uil|cif|mhsaa|ihsa|wiaa|nysphsaa|vhsl|ghsa|fhsaa)\b.*\bstate\b/i },
  { level: 'LEAGUE', pattern: /\b(league|conference|county) (?:meet|championships?|finals?)\b/i },
];

// Names that contain a level word but are not that level. Checked before
// the rules, because a false positive here writes history a coach never
// agreed to. Not exhaustive and never will be — which is exactly why this
// only ever suggests.
const NOT_A_CHAMPIONSHIP = [
  /\bupstate\b/i,
  /\binterstate\b/i,
  /\bstateline\b/i,
  /\bgarden state\b/i,
  /\bstate park\b/i,
  /\bstate university\b/i,
  /\b(penn|iowa|ohio|michigan|oregon|kansas|florida|arizona) state\b/i,
  // An invitational is an invitational whatever it is called.
  /\binvitational\b|\binvite\b|\bclassic\b|\bopener\b|\bscrimmage\b|\bpreview\b|\btime trial\b/i,
];

/**
 * A suggested level for a race name, or null when nothing is clear.
 *
 * Null is the common and correct answer: most races are regular season,
 * and a wrong suggestion costs more than a missing one — a coach who is
 * offered nothing sets it themselves, while a coach offered "State" for
 * the Penn State Invitational may just accept it.
 */
function suggestLevel(name) {
  const text = (name || '').trim();
  if (!text) return null;

  // A meet can be excluded by one phrase and still be a championship by
  // another — "Region 3 Championship at Stateline Park". So exclusions
  // only veto when nothing stronger than a bare "state" matched.
  const excluded = NOT_A_CHAMPIONSHIP.some((pattern) => pattern.test(text));

  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    if (excluded && rule.level === 'STATE') continue;
    return rule.level;
  }
  return null;
}

function isValidLevel(level) {
  return level === null || LEVELS.includes(level);
}

/**
 * How far a program got, and with how many athletes.
 *
 * rows: [{ athleteId, gender, season, level }] — one per FINISHED result
 * in a race that carries a postseason level.
 *
 * Counted as distinct athletes, not results: an athlete who runs the
 * district meet twice (rare, but a re-run happens) is one athlete who made
 * districts, and a team that fields two races at state is not twice as
 * deep as one that fields one.
 */
function countPostseason(rows, years) {
  const bySeason = new Map(years.map((year) => [year, new Map()]));

  for (const row of rows || []) {
    if (!row.level || !LEVELS.includes(row.level)) continue;
    if (!bySeason.has(row.season)) bySeason.set(row.season, new Map());
    const levels = bySeason.get(row.season);
    if (!levels.has(row.level)) levels.set(row.level, { all: new Set(), M: new Set(), F: new Set() });
    const bucket = levels.get(row.level);
    bucket.all.add(row.athleteId);
    if (row.gender === 'M' || row.gender === 'F') bucket[row.gender].add(row.athleteId);
  }

  return years.map((year) => {
    const levels = bySeason.get(year) ?? new Map();
    const counts = {};
    for (const level of LEVELS) {
      const bucket = levels.get(level);
      counts[level] = bucket
        ? { total: bucket.all.size, men: bucket.M.size, women: bucket.F.size }
        : { total: 0, men: 0, women: 0 };
    }
    // The furthest level anyone reached that season — what a coach means
    // by "how did we do". Null when nothing was marked, which is not the
    // same as nobody qualifying and must not be shown as a zero.
    const reached = [...LEVELS].reverse().find((level) => counts[level].total > 0) ?? null;
    const anyMarked = LEVELS.some((level) => counts[level].total > 0);
    return { season: year, counts, furthestLevel: reached, marked: anyMarked };
  });
}

module.exports = { LEVELS, LEVEL_LABELS, RULES, suggestLevel, isValidLevel, countPostseason };
