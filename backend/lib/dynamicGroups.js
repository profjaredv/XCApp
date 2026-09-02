const { paceSecPerMile } = require('./groupAnalytics');

// Groups the data draws for you: the fastest 20, whoever gained the most
// last week, who is a few seconds off the varsity line.
//
// The one design decision worth stating plainly: a dynamic group is NEVER
// a Group row and never writes GroupMembership. Those rows are
// effective-dated history — they are how analytics later answers "what
// training group was this athlete actually in when they ran that race"
// (see lib/groups.js) — and a list that reshuffles itself every meet would
// fill that history with churn nobody chose and destroy its meaning. So
// these are computed on read, from race results, every time. Nothing here
// persists; there is nothing to clean up, and a rule can be changed or
// dropped without migrating anyone's team.
//
// Two consequences, both deliberate:
//
//   - Boys and girls are ranked separately, always. "Fastest 20" across a
//     mixed roster mostly ranks by sex, which is not a fact about running
//     anyone needed a query to learn.
//   - Everything is computed from finished races only, and an athlete with
//     no usable race simply isn't in the list. An athlete is never ranked
//     against a zero.

const MAX_LIMIT = 100;

/**
 * Normalize raw result rows into per-athlete race histories.
 *
 * rows: [{ athleteId, name, preferredName, gender, grade, timeSec, distanceMeters, date }]
 * Returns a Map athleteId -> { athlete, races: [{ date, pace }] } sorted oldest first.
 */
function buildAthleteRaces(rows) {
  const byAthlete = new Map();
  for (const row of rows || []) {
    const pace = paceSecPerMile(row.timeSec, row.distanceMeters);
    if (pace == null) continue;
    if (!byAthlete.has(row.athleteId)) {
      byAthlete.set(row.athleteId, {
        athlete: {
          id: row.athleteId,
          name: row.preferredName || row.name,
          gender: row.gender || null,
          grade: row.grade ?? null,
        },
        races: [],
      });
    }
    byAthlete.get(row.athleteId).races.push({ date: row.date, pace });
  }
  for (const entry of byAthlete.values()) {
    entry.races.sort((a, b) => new Date(a.date) - new Date(b.date));
  }
  return byAthlete;
}

function bestPace(entry) {
  return Math.min(...entry.races.map((r) => r.pace));
}

// Ranked ascending by pace — the fastest race each athlete has run this
// season, which is how a cross-country team is actually ordered.
function ruleFastest(entries, { limit }) {
  return entries
    .map((entry) => ({ entry, value: bestPace(entry) }))
    .sort((a, b) => a.value - b.value)
    .slice(0, limit)
    .map(({ entry, value }, index) => member(entry, { rank: index + 1, value, unit: 'pace' }));
}

// A gain is always one race against the very next one.
//
// The first version of this measured an athlete's opener against their best
// race since, which quietly rewards a slow start: an athlete who opened
// badly and then ran three ordinary races "gained" more than one who
// improved at every meet. Race-to-race is the comparison a coach is
// actually making on the drive home, and it's the same shape as the
// last-meet list below — the only difference is which pair of races.
//
// This one takes the biggest jump between any two back-to-back races in
// the season, and says which meet it happened at.
function biggestConsecutiveGain(entry) {
  let best = null;
  for (let i = 1; i < entry.races.length; i++) {
    const gain = entry.races[i - 1].pace - entry.races[i].pace;
    if (best === null || gain > best.value) best = { value: gain, date: entry.races[i].date };
  }
  return best;
}

// Positive seconds only — an athlete who has never beaten a previous race
// isn't "improved by a negative amount", they're just not on this list.
function ruleBiggestJump(entries, { limit }) {
  return entries
    .filter((entry) => entry.races.length >= 2)
    .map((entry) => ({ entry, gain: biggestConsecutiveGain(entry) }))
    .filter(({ gain }) => gain && gain.value > 0)
    .sort((a, b) => b.gain.value - a.gain.value)
    .slice(0, limit)
    .map(({ entry, gain }, index) =>
      member(entry, { rank: index + 1, value: gain.value, unit: 'gain', date: gain.date })
    );
}

// The week's gains: the most recent race against the one before it. This
// is the "who is on the way up right now" list, which season-long
// improvement can't answer — an athlete can be up 40 seconds since
// September and still have had a bad Saturday.
function ruleRecentGains(entries, { limit }) {
  return entries
    .filter((entry) => entry.races.length >= 2)
    .map((entry) => {
      const latest = entry.races[entry.races.length - 1];
      const previous = entry.races[entry.races.length - 2];
      return { entry, value: previous.pace - latest.pace, date: latest.date };
    })
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map(({ entry, value, date }, index) => member(entry, { rank: index + 1, value, unit: 'gain', date }));
}

// Whoever is just outside the scoring seven. A coach knows their top seven
// without a query; who is 8th through 14th, and how far back, is the
// actual question at this point in a season.
const VARSITY_SIZE = 7;
function ruleNextUp(entries, { limit }) {
  const ranked = entries
    .map((entry) => ({ entry, value: bestPace(entry) }))
    .sort((a, b) => a.value - b.value);
  if (ranked.length <= VARSITY_SIZE) return [];
  const cutoff = ranked[VARSITY_SIZE - 1].value;
  return ranked
    .slice(VARSITY_SIZE, VARSITY_SIZE + limit)
    .map(({ entry, value }, index) => member(entry, { rank: VARSITY_SIZE + index + 1, value: value - cutoff, unit: 'gap', pace: value }));
}

function member(entry, extra) {
  return {
    athleteId: entry.athlete.id,
    name: entry.athlete.name,
    grade: entry.athlete.grade,
    gender: entry.athlete.gender,
    raceCount: entry.races.length,
    ...extra,
  };
}

const RULES = [
  {
    key: 'fastest',
    label: 'Fastest',
    description: "Ranked by each athlete's best pace so far this season.",
    metric: 'Best pace this season',
    defaultLimit: 20,
    evaluate: ruleFastest,
  },
  {
    key: 'biggest-jump',
    label: 'Biggest jump',
    description: 'Largest gain from one race to the very next one, anywhere this season.',
    metric: 'Gained race to race',
    defaultLimit: 10,
    evaluate: ruleBiggestJump,
  },
  {
    key: 'recent-gains',
    label: 'Biggest gains last meet',
    description: 'Who ran their most recent race faster than the one before it, and by how much.',
    metric: 'Gained since the previous race',
    defaultLimit: 10,
    evaluate: ruleRecentGains,
  },
  {
    key: 'next-up',
    label: 'Next seven',
    description: 'Eighth place and back — who is closest to the scoring seven, and by how much.',
    metric: 'Seconds per mile behind 7th',
    defaultLimit: 7,
    evaluate: ruleNextUp,
  },
];

function findRule(key) {
  return RULES.find((r) => r.key === key) || null;
}

function clampLimit(requested, fallback) {
  const parsed = Number.parseInt(requested, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Evaluate one rule, split by gender.
 *
 * Athletes with no gender on file get their own list rather than being
 * dropped (a missing field is a data-entry gap, not a reason to disappear
 * from your coach's screen) or silently folded in with one of the others.
 */
function evaluateRule(rule, rows, { limit } = {}) {
  const byAthlete = buildAthleteRaces(rows);
  const entries = [...byAthlete.values()];
  const effectiveLimit = clampLimit(limit, rule.defaultLimit);

  const buckets = [
    { gender: 'M', label: 'Boys' },
    { gender: 'F', label: 'Girls' },
    { gender: null, label: 'No gender on file' },
  ];

  return {
    key: rule.key,
    label: rule.label,
    description: rule.description,
    metric: rule.metric,
    limit: effectiveLimit,
    lists: buckets
      .map((bucket) => ({
        ...bucket,
        members: rule.evaluate(
          entries.filter((e) => (e.athlete.gender || null) === bucket.gender),
          { limit: effectiveLimit }
        ),
      }))
      .filter((bucket) => bucket.members.length > 0),
  };
}

function evaluateAll(rows, { limit } = {}) {
  return RULES.map((rule) => evaluateRule(rule, rows, { limit }));
}

module.exports = {
  RULES,
  MAX_LIMIT,
  VARSITY_SIZE,
  buildAthleteRaces,
  findRule,
  clampLimit,
  evaluateRule,
  evaluateAll,
};
