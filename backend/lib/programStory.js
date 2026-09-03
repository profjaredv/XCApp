// Story mode: the Program screen's numbers, said out loud.
//
// A coach opening this screen in November is not trying to read four
// charts against each other — they are trying to answer "did this year go
// well, and is the program going anywhere". The charts hold the evidence;
// this holds the reading of it.
//
// Three rules, and they are the whole design:
//
//   1. Deterministic. Every sentence is computed from the numbers on the
//      same screen, by rules written here. Nothing is generated, nothing
//      is inferred, and no athlete data leaves the server to produce it.
//      A coach can point at any sentence and find the number under it —
//      which is why every beat carries its own `evidence`.
//   2. It says what it does not know. A program with two seasons on file
//      cannot support a claim about a trend, and this says so rather than
//      going quiet, because silence reads as "nothing happened" when the
//      truth is "nobody has told the app yet".
//   3. No praise or blame. "Your top five finished within 1:04" is a fact
//      about a race. "Great pack running!" is a judgement the app has not
//      earned and a coach did not ask for.
//
// Beats come back ordered by what a coach looks for first — is the
// program growing, are they staying, are they getting faster, how did they
// race — with the gaps last.

/** Below this many seasons, nothing here is a trend; it is two data points. */
const MIN_SEASONS_FOR_TREND = 3;
/** A pace change smaller than this is noise on a different course in different weather. */
const MEANINGFUL_PACE_SEC = 5;
/** A roster change smaller than this is one family moving house. */
const MEANINGFUL_ROSTER_CHANGE = 2;

function formatPace(secPerMile) {
  if (!(secPerMile > 0)) return null;
  const whole = Math.round(secPerMile);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}/mi`;
}

function formatGap(seconds) {
  const whole = Math.abs(Math.round(seconds));
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function beat(id, kind, headline, detail, evidence) {
  return { id, kind, headline, detail, evidence };
}

function participationBeat(shapes, participants) {
  const latest = shapes[shapes.length - 1];
  if (!latest) return null;
  const size = participants.get(latest.season)?.total ?? 0;
  if (size === 0) return null;

  const previous = shapes.length > 1 ? shapes[shapes.length - 2] : null;
  const previousSize = previous ? participants.get(previous.season)?.total ?? 0 : null;
  const history = shapes.map((s) => participants.get(s.season)?.total ?? 0).filter((n) => n > 0);
  const biggest = history.length > 0 ? Math.max(...history) : size;

  let detail;
  if (previousSize == null || previousSize === 0) {
    detail = 'First season on file, so there is nothing yet to compare it against.';
  } else {
    const change = size - previousSize;
    if (Math.abs(change) < MEANINGFUL_ROSTER_CHANGE) {
      detail = `Level with ${previous.season} (${previousSize}).`;
    } else if (change > 0) {
      detail = `Up ${change} on ${previous.season} (${previousSize}).`;
    } else {
      detail = `Down ${Math.abs(change)} on ${previous.season} (${previousSize}).`;
    }
    if (size === biggest && history.length >= MIN_SEASONS_FOR_TREND) {
      detail += ` The largest roster in the ${history.length} seasons on file.`;
    }
  }

  return beat(
    'participation',
    'growth',
    `${size} athlete${size === 1 ? '' : 's'} on the ${latest.season} roster.`,
    detail,
    { season: latest.season, rosterSize: size, previousSize, seasonsOnFile: shapes.length }
  );
}

function turnoutBeat(shapes) {
  const latest = shapes[shapes.length - 1];
  if (!latest || latest.racedShare == null || latest.racedCount === 0) return null;
  // A roster is who signed up; racing is who the season actually happened
  // to. On a big program those are very different numbers, and only one of
  // them appears in any other chart on this screen.
  if (latest.racedShare >= 95) return null;
  return beat(
    'turnout',
    'growth',
    `${latest.racedCount} of them raced.`,
    `${latest.racedShare}% of the roster pinned on a number at least once, across ${latest.meets} meet${
      latest.meets === 1 ? '' : 's'
    } — an average of ${latest.racesPerAthlete} race${latest.racesPerAthlete === 1 ? '' : 's'} each.`,
    { racedCount: latest.racedCount, racedShare: latest.racedShare, meets: latest.meets }
  );
}

function returningBeat(shapes) {
  const latest = shapes[shapes.length - 1];
  if (!latest || latest.churn.returning == null) return null;
  const { returning, newcomers, previousSize, returnRate } = latest.churn;
  return beat(
    'returning',
    'retention',
    `${returning} of last season's ${previousSize} came back.`,
    `${returnRate}% returned, and ${newcomers} athlete${newcomers === 1 ? '' : 's'} ${
      newcomers === 1 ? 'was' : 'were'
    } new to the program. Seniors who graduated are counted in that ${previousSize} — this is churn, not attrition.`,
    { returning, newcomers, previousSize, returnRate }
  );
}

function retentionBeat(attrition) {
  // The longest window that actually has a cohort behind it. A one-year
  // number is available early and says the least; four years says the most
  // and takes four years to earn.
  const windows = [...(attrition.windows || [])].sort((a, b) => b - a);
  for (const w of windows) {
    const rate = attrition.retention?.[w];
    const n = attrition.cohortSizes?.[w] ?? 0;
    if (rate == null || n === 0) continue;
    let detail = `Across the ${n} athlete${n === 1 ? '' : 's'} whose ${w}-year mark the loaded seasons can actually observe. Athletes who would have graduated by then are left out, so this is athletes leaving, not athletes finishing.`;
    // The honest caveat on this number: for anyone already on the team
    // when the earliest loaded season starts, "joined" and "first appears
    // in the data" are the same event, and only one of them is true.
    if (attrition.leftCensored > 0 && attrition.earliestSeason != null) {
      detail += ` ${attrition.leftCensored} of them first appear in ${attrition.earliestSeason}, the earliest season loaded — if they had already been running before that, this reads lower than the truth. Importing earlier seasons fixes it.`;
    }
    return beat(
      'retention',
      'retention',
      `${rate}% are still on the team ${w} year${w === 1 ? '' : 's'} after they join.`,
      detail,
      { window: w, retentionPercent: rate, cohortSize: n, leftCensored: attrition.leftCensored ?? 0 }
    );
  }
  return null;
}

function paceBeat(shapes, gender, label) {
  const withPace = shapes.filter((s) => s.medianPace[gender].paceSecPerMile != null);
  if (withPace.length === 0) return null;
  const latest = withPace[withPace.length - 1];
  const current = latest.medianPace[gender];

  if (withPace.length === 1) {
    return beat(
      `pace-${gender}`,
      'speed',
      `${label}' median pace was ${formatPace(current.paceSecPerMile)} in ${latest.season}.`,
      `Across ${current.athleteCount} athlete${current.athleteCount === 1 ? '' : 's'}, each counted at their best race of the season. One season on file, so there is no trend to read yet.`,
      { season: latest.season, paceSecPerMile: current.paceSecPerMile, athleteCount: current.athleteCount }
    );
  }

  const previous = withPace[withPace.length - 2];
  const before = previous.medianPace[gender];
  const change = before.paceSecPerMile - current.paceSecPerMile;

  let detail;
  if (Math.abs(change) < MEANINGFUL_PACE_SEC) {
    detail = `Effectively unchanged from ${previous.season} (${formatPace(before.paceSecPerMile)}).`;
  } else if (change > 0) {
    detail = `${formatGap(change)}/mi faster than ${previous.season} (${formatPace(before.paceSecPerMile)}).`;
  } else {
    detail = `${formatGap(change)}/mi slower than ${previous.season} (${formatPace(before.paceSecPerMile)}).`;
  }
  detail += ` Median of ${current.athleteCount} athletes at their season best — a median so one fast transfer doesn't move it, and season bests so a longer schedule doesn't either.`;
  // Courses differ, and so does weather. This is the honest caveat, and it
  // belongs on the sentence rather than in a footnote nobody reads.
  detail += ' Different courses year to year, so read a small change as noise.';

  return beat(
    `pace-${gender}`,
    'speed',
    `${label}' median pace was ${formatPace(current.paceSecPerMile)} in ${latest.season}.`,
    detail,
    {
      season: latest.season,
      paceSecPerMile: current.paceSecPerMile,
      previousSeason: previous.season,
      previousPaceSecPerMile: before.paceSecPerMile,
      changeSec: parseFloat(change.toFixed(1)),
      athleteCount: current.athleteCount,
    }
  );
}

function packBeat(shapes, gender, label) {
  const withPack = shapes.filter((s) => s.packSpread[gender]);
  if (withPack.length === 0) return null;
  const latest = withPack[withPack.length - 1];
  const current = latest.packSpread[gender];

  let detail = `Their tightest five of the season, at ${current.raceName ?? 'one of their races'}.`;
  if (withPack.length > 1) {
    const previous = withPack[withPack.length - 2];
    const change = previous.packSpread[gender].spreadSec - current.spreadSec;
    if (Math.abs(change) < MEANINGFUL_PACE_SEC) {
      detail += ` About the same as ${previous.season} (${formatGap(previous.packSpread[gender].spreadSec)}).`;
    } else if (change > 0) {
      detail += ` Tighter than ${previous.season}, when the same five spanned ${formatGap(previous.packSpread[gender].spreadSec)}.`;
    } else {
      detail += ` Wider than ${previous.season} (${formatGap(previous.packSpread[gender].spreadSec)}).`;
    }
  }

  return beat(
    `pack-${gender}`,
    'depth',
    `${label}' top five finished within ${formatGap(current.spreadSec)} of each other.`,
    detail,
    { season: latest.season, spreadSec: current.spreadSec, raceName: current.raceName }
  );
}

// What the app cannot tell them, and why. This exists because the
// alternative — a chart that is simply empty — reads as "your program has
// no field standing" rather than "nobody has uploaded a full field yet".
function gapBeats(shapes, seasonsMeta) {
  const beats = [];

  if (shapes.length < MIN_SEASONS_FOR_TREND) {
    beats.push(
      beat(
        'gap-seasons',
        'gap',
        `${shapes.length} season${shapes.length === 1 ? '' : 's'} on file.`,
        'Everything above compares what is here. Importing past seasons from Athletic.net turns these into trends — three seasons is where retention and pace start meaning something.',
        { seasonsOnFile: shapes.length }
      )
    );
  }

  const noFieldData = seasonsMeta.every((s) => s.topField.men == null && s.topField.women == null);
  if (noFieldData) {
    beats.push(
      beat(
        'gap-field',
        'gap',
        'No field results uploaded yet.',
        'Where your athletes finished against everyone else in the race — not just against each other — needs a full field. Upload one on the Field Results screen and this screen gains a standing to track.',
        {}
      )
    );
  }

  const uncalculated = seasonsMeta.filter((s) => !s.metricsCalculated).map((s) => s.season);
  if (uncalculated.length > 0) {
    beats.push(
      beat(
        'gap-metrics',
        'gap',
        `${uncalculated.length} season${uncalculated.length === 1 ? '' : 's'} without calculated metrics.`,
        `${uncalculated.join(', ')} ${uncalculated.length === 1 ? 'has' : 'have'} race results but no analytics run. Nothing above depends on it — participation, pace, pack and retention are all computed from the results themselves — but the season and athlete dashboards will be thin until it is run.`,
        { seasons: uncalculated }
      )
    );
  }

  return beats;
}

/**
 * @param shapes    from lib/programSeasons.js buildSeasonShapes, oldest first
 * @param attrition from lib/programAnalytics.js computeAttritionCurve
 * @param seasonsMeta the route's per-season payload (topField, metricsCalculated)
 * @param participants Map<year, { total, men, women }>
 */
function buildProgramStory(shapes, attrition, seasonsMeta, participants) {
  if (!shapes || shapes.length === 0) {
    return [
      beat(
        'gap-empty',
        'gap',
        'No seasons loaded yet.',
        'Import a season from Athletic.net, or add a roster, and this screen starts telling you what the program is doing.',
        {}
      ),
    ];
  }

  return [
    participationBeat(shapes, participants),
    turnoutBeat(shapes),
    returningBeat(shapes),
    retentionBeat(attrition || {}),
    paceBeat(shapes, 'men', 'Boys'),
    paceBeat(shapes, 'women', 'Girls'),
    packBeat(shapes, 'men', 'Boys'),
    packBeat(shapes, 'women', 'Girls'),
    ...gapBeats(shapes, seasonsMeta || []),
  ].filter(Boolean);
}

module.exports = {
  MIN_SEASONS_FOR_TREND,
  MEANINGFUL_PACE_SEC,
  MEANINGFUL_ROSTER_CHANGE,
  formatPace,
  formatGap,
  buildProgramStory,
};
