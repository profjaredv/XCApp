// Builds a complete, believable demo program as plain data: eight seasons of
// a made-up cross country team (rosters, groups, practices, attendance,
// workouts, meets with real names and distances, results, splits, field
// results from invented opponents, equipment, goals and reflections).
//
// Pure and deterministic: no database, no clock except the `now` you pass in.
// backend/lib/demo/write.js turns the plan into rows.
//
// The one idea behind every number: each athlete has a talent and a growth
// rate. Their pace in a given race is their pace at the start of that
// season, improved through the season, plus the course, the weather that
// day, and some luck. Everything else (places, scores, field means, splits,
// interval reps) is derived from those paces, so the data tells one
// consistent story: freshmen improve, seniors plateau, the team gets better
// year over year, and championship day is faster than September.

const { makeRng } = require('./rng');
const { STAFF, BOYS_FIRST, GIRLS_FIRST, LAST, FUNNY_BOYS, FUNNY_GIRLS } = require('./names');
const C = require('./catalog');
const { computeRacePlacements } = require('../fieldPlacement');
const { computeFieldStats } = require('../fieldNormalization');

const MILE = 1609.34;
const DAY = 86400000;
const SEASONS = 8;

// ---- dates -----------------------------------------------------------------

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const utc = (y, m, d) => Date.UTC(y, m - 1, d);
const dayOfWeek = (ms) => new Date(ms).getUTCDay();

function nextWeekday(ms, weekday) {
  let t = ms;
  while (dayOfWeek(t) !== weekday) t += DAY;
  return t;
}

function calendar(year, shiftDays) {
  return C.MEETS.map((m) => ({ ...m, ms: nextWeekday(utc(year, m.month, m.day), m.weekday ?? 6) + shiftDays * DAY }));
}

/** Which season is "now", and how far to slide its calendar so a championship is still ahead. */
function anchorSeason(now) {
  const today = utc(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  const cur = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const cal = calendar(cur, 0);
  const state = cal.find((m) => m.key === 'state').ms;
  const first = cal[0].ms;
  if (today >= first - 7 * DAY && today < state) return { year: cur, shift: 0, today };
  const shift = Math.round((today + 21 * DAY - state) / DAY);
  const shiftedState = state + shift * DAY;
  return { year: new Date(shiftedState).getUTCFullYear(), shift, today };
}

// ---- athletes ----------------------------------------------------------------

function buildAthletes(rng, firstYear, curYear) {
  const used = new Set();
  const funnyB = rng.shuffle(FUNNY_BOYS);
  const funnyG = rng.shuffle(FUNNY_GIRLS);
  const athletes = [];
  let n = 0;

  const freshName = (gender) => {
    const pool = gender === 'M' ? funnyB : funnyG;
    if (pool.length && rng.chance(0.14)) return pool.pop();
    for (let i = 0; i < 40; i += 1) {
      const name = `${rng.pick(gender === 'M' ? BOYS_FIRST : GIRLS_FIRST)} ${rng.pick(LAST)}`;
      if (!used.has(name)) { used.add(name); return name; }
    }
    return `${rng.pick(gender === 'M' ? BOYS_FIRST : GIRLS_FIRST)} ${rng.pick(LAST)}-${rng.int(2, 9)}`;
  };

  // Class G is seniors in season G-1, freshmen in G-4.
  for (let G = firstYear + 1; G <= curYear + 4; G += 1) {
    const classLift = rng.normal(0, 5) - (G - firstYear) * 0.7; // later classes are a bit stronger
    for (const gender of ['M', 'F']) {
      const size = gender === 'M' ? rng.int(8, 12) : rng.int(8, 12);
      const late = rng.int(1, 2);
      const members = [];
      for (let i = 0; i < size + late; i += 1) {
        const startGrade = i < size ? 9 : rng.pick([10, 10, 11]);
        let endGrade = startGrade;
        const survive = { 9: 0.8, 10: 0.88, 11: 0.92 };
        while (endGrade < 12 && rng.chance(survive[endGrade])) endGrade += 1;
        let z = rng.normal(0, 1);
        const talent = z;
        const base = gender === 'M' ? 426 : 518;
        const spread = gender === 'M' ? 30 : 34;
        const g = Math.min(0.085, Math.max(0.012, rng.normal(0.045, 0.02)));
        members.push({
          key: `a${(n += 1)}`,
          name: freshName(gender),
          gender,
          gradYear: G,
          startGrade,
          endGrade,
          p9: base + classLift - spread * z * 0.9,
          growth: g,
          sd: 3 + rng.rand() * 4,
          tendency: rng.normal(0, 0.014),
          talent,
          injuryProne: rng.chance(0.18),
        });
      }
      // every class gets one real standout per gender
      const star = members.reduce((a, b) => (a.talent < b.talent ? a : b));
      star.p9 -= gender === 'M' ? 16 : 18;
      athletes.push(...members);
    }
  }
  return athletes.filter((a) => {
    const first = G2season(a.gradYear, a.startGrade);
    const last = G2season(a.gradYear, a.endGrade);
    return last >= firstYear && first <= curYear;
  });
}

const G2season = (gradYear, grade) => gradYear - 13 + grade;
const gradeIn = (a, season) => 13 - a.gradYear + season;
const onRoster = (a, season) => {
  const g = gradeIn(a, season);
  return g >= a.startGrade && g <= a.endGrade;
};

/** Pace (sec/mile) at the start of a season, then improved by `t` (0..1) through it. */
function paceAt(a, season, t) {
  const g = gradeIn(a, season);
  const start = a.p9 * (1 - a.growth) ** (g - 9);
  const gain = Math.max(0.01, 0.032 - 0.004 * (g - 9));
  const floor = a.gender === 'M' ? 308 : 336; // nobody here runs a 15:30 5K
  return Math.max(floor, start * (1 - gain * t ** 0.85));
}

// ---- the plan ----------------------------------------------------------------

function generateDemoPlan({ now = new Date(), seed = 'huckleberry-ridge' } = {}) {
  const rng = makeRng(seed);
  const anchor = anchorSeason(now);
  const curYear = anchor.year;
  const firstYear = curYear - (SEASONS - 1);
  const athletes = buildAthletes(rng, firstYear, curYear);
  const byKey = new Map(athletes.map((a) => [a.key, a]));

  const plan = {
    generatedFor: ymd(anchor.today),
    team: { ...C.TEAM, currentSeason: curYear },
    staff: STAFF.map((s) => ({ ...s, email: `${s.name.toLowerCase().replace(/[^a-z]+/g, '.')}@${C.DEMO_EMAIL_DOMAIN}` })),
    courses: Object.entries(C.COURSES).map(([key, c]) => ({ key, name: c.name, city: c.city ?? null, state: c.state ?? null, notes: c.notes })),
    athletes: athletes.map((a) => ({ key: a.key, name: a.name, gender: a.gender, graduationYear: a.gradYear, hasAccount: false })),
    locations: C.PRACTICE_LOCATIONS,
    workouts: C.WORKOUTS,
    paceZones: C.PACE_ZONES,
    meetSeries: {},
    equipment: [],
    seasons: [],
  };

  const seriesRaces = {};
  const accountAthletes = new Set();

  for (let year = firstYear; year <= curYear; year += 1) {
    const isCurrent = year === curYear;
    const cal = calendar(year, isCurrent ? anchor.shift : 0);
    const startMs = cal[0].ms - 7 * DAY;
    const stateMs = cal.find((m) => m.key === 'state').ms;
    const endMs = stateMs + 7 * DAY;
    const todayMs = anchor.today;
    const roster = athletes.filter((a) => onRoster(a, year));
    const rosterSet = new Set(roster.map((a) => a.key));

    // --- injuries and availability
    const injuries = [];
    for (const a of roster) {
      if (rng.chance(a.injuryProne ? 0.4 : 0.1)) {
        const len = rng.int(9, 28);
        const from = startMs + rng.int(14, 60) * DAY;
        injuries.push({ athleteKey: a.key, from, to: from + len * DAY, reason: rng.pick(C.INJURIES) });
      }
    }
    const injuredOn = (key, ms) => injuries.find((i) => i.athleteKey === key && ms >= i.from && ms <= i.to);

    // --- weather and luck per meet
    const meetWeather = new Map(cal.map((m) => [m.key, rng.normal(0, 4.5)]));
    const progress = (ms) => Math.min(1, Math.max(0, (ms - cal[0].ms) / (stateMs - cal[0].ms)));

    // --- season-start groups
    const startRank = (g) => roster.filter((a) => a.gender === g).sort((x, y) => paceAt(x, year, 0) - paceAt(y, year, 0));
    const groupDefs = [];
    const mkGroup = (key, name, gender, type, color, sortOrder, leaders) => groupDefs.push({ key, name, gender, type, color, sortOrder, leaders });
    mkGroup('vb', 'Varsity Boys', 'M', 'TRAINING', '#2563eb', 1, [{ staffKey: 'ron', primary: true }, { staffKey: 'barb', primary: false }]);
    mkGroup('vg', 'Varsity Girls', 'F', 'TRAINING', '#db2777', 2, [{ staffKey: 'patty', primary: true }, { staffKey: 'ron', primary: false }]);
    mkGroup('jb', 'JV Boys', 'M', 'TRAINING', '#0891b2', 3, [{ staffKey: 'barb', primary: true }]);
    mkGroup('jg', 'JV Girls', 'F', 'TRAINING', '#9333ea', 4, [{ staffKey: 'patty', primary: true }]);
    mkGroup('nb', 'Novice Boys', 'M', 'TRAINING', '#16a34a', 5, [{ staffKey: 'al', primary: true }]);
    mkGroup('ng', 'Novice Girls', 'F', 'TRAINING', '#ea580c', 6, [{ staffKey: 'kay', primary: true }]);
    mkGroup('cap', 'Captains', null, 'CAPTAIN', '#ca8a04', 7, [{ staffKey: 'ron', primary: true }]);
    mkGroup('hill', 'Hill Crew', null, 'CUSTOM', '#65a30d', 8, [{ staffKey: 'patty', primary: true }, { staffKey: 'barb', primary: false }]);
    mkGroup('xt', 'Cross training', null, 'X_TRAINING', '#64748b', 9, []);

    const memberships = [];
    const groupOf = new Map(); // athleteKey -> {key, since}
    const assign = (a, gkey, startMsX, reason) => {
      memberships.push({ groupKey: gkey, athleteKey: a.key, startDate: ymd(startMsX), endDate: null, reason: reason ?? null });
      groupOf.set(a.key, gkey);
    };
    for (const g of ['M', 'F']) {
      const ranked = startRank(g);
      ranked.forEach((a, i) => {
        const novice = gradeIn(a, year) === 9 && i > 10;
        const key = i < 7 ? (g === 'M' ? 'vb' : 'vg') : novice || i >= 7 + 11 ? (g === 'M' ? 'nb' : 'ng') : g === 'M' ? 'jb' : 'jg';
        assign(a, key, startMs);
      });
    }

    // --- captains: top seniors
    const captains = new Set();
    const seniors = roster.filter((a) => gradeIn(a, year) === 12);
    for (const g of ['M', 'F']) {
      seniors.filter((a) => a.gender === g).sort((x, y) => paceAt(x, year, 0) - paceAt(y, year, 0)).slice(0, 2).forEach((a) => captains.add(a.key));
    }
    for (const k of captains) memberships.push({ groupKey: 'cap', athleteKey: k, startDate: ymd(startMs), endDate: null, reason: null });
    for (const a of rng.sample(roster, Math.round(roster.length * 0.22))) memberships.push({ groupKey: 'hill', athleteKey: a.key, startDate: ymd(startMs + 10 * DAY), endDate: null, reason: null });
    for (const inj of injuries) {
      memberships.push({ groupKey: 'xt', athleteKey: inj.athleteKey, startDate: ymd(inj.from), endDate: inj.to < todayMs || !isCurrent ? ymd(inj.to) : null, reason: inj.reason });
    }

    // --- meets and races
    const meets = [];
    const raceLog = []; // for splits, reflections, field stats
    const results = new Map(); // athleteKey -> [{ms, pace}] for later derived data
    const completeThrough = isCurrent ? todayMs : Infinity;

    for (const m of cal) {
      const upcoming = m.ms > completeThrough;
      const course = C.COURSES[m.course];
      const t = progress(m.ms);
      const meetKey = `${year}:${m.key}`;
      const weather = meetWeather.get(m.key);
      const location = m.location ?? (course.city ? `${course.name}, ${course.city}, ${course.state}` : course.name);
      const meet = {
        key: meetKey,
        name: m.name,
        date: ymd(m.ms),
        location,
        isHome: !!m.home,
        distance: m.trial ? C.DISTANCES.mile.label : C.DISTANCES.varsity.label,
        distanceMeters: m.trial ? C.DISTANCES.mile.meters : C.DISTANCES.varsity.meters,
        courseKey: m.course,
        upcoming,
        races: [],
        plan: upcoming || m.ms > todayMs - 21 * DAY ? meetPlan(rng, m, location) : null,
      };

      const available = roster.filter((a) => !injuredOn(a.key, m.ms));
      const pick = (g) => available.filter((a) => a.gender === g).sort((x, y) => paceAt(x, year, t) - paceAt(y, year, t));

      const mkRace = (suffix, distanceKey, divisionsPlan) => {
        const d = C.DISTANCES[distanceKey];
        return {
          key: `${meetKey}:${suffix}`,
          name: m.name,
          date: meet.date,
          distance: d.label,
          distanceMeters: d.meters,
          courseKey: m.course,
          location,
          postseasonLevel: m.level ?? null,
          splitMarkerScheme: null,
          results: [],
          field: [],
          entries: [],
          divisionsPlan,
        };
      };

      const entrantsFor = (race, runners) => {
        // Entries: who is running, the next two as alternates, and the injured.
        for (const g of ['M', 'F']) {
          const list = pick(g);
          const top = list.slice(0, 7);
          const alts = list.slice(7, 9);
          top.forEach((a) => race.entries.push({ athleteKey: a.key, status: 'ENTERED', seedTimeSec: round1(paceAt(a, year, t) * (race.distanceMeters / MILE)) }));
          alts.forEach((a) => race.entries.push({ athleteKey: a.key, status: 'ALTERNATE', seedTimeSec: null }));
        }
        for (const inj of injuries) if (injuredOn(inj.athleteKey, m.ms)) race.entries.push({ athleteKey: inj.athleteKey, status: 'INJURED', seedTimeSec: null, notes: inj.reason });
        return runners;
      };

      if (m.trial) {
        const race = mkRace('tt', 'mile', null);
        if (!upcoming) {
          for (const a of roster) {
            if (injuredOn(a.key, m.ms) || rng.chance(0.07)) continue;
            const pace = paceAt(a, year, 0) - (a.gender === 'M' ? 38 : 42) + rng.normal(0, 7);
            race.results.push({ athleteKey: a.key, time: round1(pace * (race.distanceMeters / MILE)), status: 'FINISHED', division: a.gender === 'M' ? 'Boys' : 'Girls', grade: gradeIn(a, year) });
          }
          placeSimple(race);
        }
        meet.races.push(race);
        meets.push(meet);
        continue;
      }

      // Varsity race (5K) and, at invitationals and league meets, a JV race.
      const varsity = mkRace('var', 'varsity', m.tiers ? ['Gold', 'Silver'] : null);
      const jvRace = m.jv ? mkRace('jv', m.jv, null) : null;
      const schools = pickSchools(rng, m);
      entrantsFor(varsity);

      if (!upcoming) {
        const raceDay = (a, kind) => {
          const noise = a.sd * rng.normal(0, 1) + (rng.chance(0.05) ? rng.int(10, 24) : 0);
          return Math.max(a.gender === 'M' ? 302 : 332, paceAt(a, year, t) + course.difficulty + weather + noise + (kind === 'jv' ? 2 : 0));
        };
        const buildDivision = (race, gender, runners, kind) => {
          const tiers = race.divisionsPlan;
          const baseName = `${gender === 'M' ? 'Boys' : 'Girls'} ${kind === 'jv' ? 'JV' : 'Varsity'}`;
          const rows = [];
          runners.forEach((a, idx) => {
            const pace = raceDay(a, kind);
            const tier = tiers ? (kind === 'var' && idx < 5 ? 'Gold' : 'Silver') : null;
            const division = tier ? `${baseName} ${tier}` : baseName;
            const status = rng.chance(0.006) ? 'DNF' : 'FINISHED';
            const time = status === 'FINISHED' ? round1(pace * (race.distanceMeters / MILE)) : null;
            rows.push({ athlete: a, pace, division, tier, status, time });
          });
          return rows;
        };

        for (const [race, kind] of [[varsity, 'var'], [jvRace, 'jv']]) {
          if (!race) continue;
          const ours = [];
          for (const g of ['M', 'F']) {
            const list = pick(g);
            const runners = kind === 'var' ? list.slice(0, 7) : list.slice(7, 7 + rng.int(10, 15)).filter(() => rng.chance(0.9));
            ours.push(...buildDivision(race, g, runners, kind));
          }
          for (const r of ours) {
            race.results.push({ athleteKey: r.athlete.key, time: r.time, status: r.status, division: r.division, grade: gradeIn(r.athlete, year), _pace: r.pace });
            race.field.push({ schoolName: C.TEAM.short, athleteName: r.athlete.name, grade: gradeIn(r.athlete, year), gender: r.athlete.gender, division: r.division, timeSec: r.time, status: r.status, _ours: true });
          }
          // Opponents.
          addRivals(rng, race, schools, kind, course.difficulty + weather, m, year, curYear);
          finalizePlaces(race);
        }
        // Did anyone skip entirely (DNS)? A few athletes enter and don't start.
        if (rng.chance(0.25)) {
          const a = rng.pick(available.filter((x) => !varsity.results.some((r) => r.athleteKey === x.key)));
          if (a) varsity.results.push({ athleteKey: a.key, time: null, status: 'DNS', division: `${a.gender === 'M' ? 'Boys' : 'Girls'} Varsity`, grade: gradeIn(a, year) });
        }
      }

      for (const race of [varsity, jvRace]) {
        if (!race) continue;
        meet.races.push(race);
        raceLog.push({ race, m, upcoming });
      }
      meets.push(meet);
      if (m.series) (seriesRaces[m.name] ||= []).push(varsity.key);
    }

    // --- splits for varsity runners in the last three seasons
    if (year >= curYear - 2) {
      for (const meet of meets) {
        const race = meet.races.find((r) => r.key.endsWith(':var'));
        if (!race || meet.upcoming) continue;
        race.splitMarkerScheme = 'MILE';
        for (const res of race.results) {
          if (res.status !== 'FINISHED' || !res.time) continue;
          const a = byKey.get(res.athleteKey);
          const p = res.time / (race.distanceMeters / MILE);
          const p1 = p * (1 - a.tendency + rng.normal(0, 0.008));
          const p2 = p * (1 - a.tendency * 0.2 + rng.normal(0, 0.008));
          const e1 = round1(p1);
          const e2 = round1(p1 + p2);
          if (e2 < res.time - 20) res.splits = [{ sequence: 1, markerMeters: MILE, elapsedSec: e1 }, { sequence: 2, markerMeters: MILE * 2, elapsedSec: e2 }];
        }
      }
    }

    // --- field means for every race with field data
    for (const meet of meets) {
      for (const race of meet.races) {
        const times = race.field.filter((f) => f.status === 'FINISHED' && f.timeSec != null).map((f) => f.timeSec);
        if (times.length) Object.assign(race, fieldStats(times));
      }
    }

    // --- placements through the same function the app uses
    for (const meet of meets) {
      for (const race of meet.races) {
        if (!race.field.length) continue;
        applyPlacements(race, byKey);
      }
    }

    // --- practices, attendance, intervals, logs
    const practice = buildPractice({ rng, year, isCurrent, startMs, stateMs, endMs, todayMs, cal, roster, byKey, injuries, groupOf, groupDefs, memberships, captains });

    // --- roster rows
    const rosterRows = roster.map((a) => ({
      athleteKey: a.key,
      grade: gradeIn(a, year),
      isActive: isCurrent ? true : true,
      isCaptain: captains.has(a.key),
      captainNotes: captains.has(a.key) ? rng.pick(['Runs the warmup.', 'Leads team stretches.', 'Organizes the pasta dinner.', 'Welcomes the freshmen.']) : null,
    }));
    if (isCurrent) roster.filter((a) => rng.chance(0.4)).forEach((a) => accountAthletes.add(a.key));

    plan.seasons.push({
      year,
      startDate: ymd(startMs),
      endDate: ymd(endMs),
      isActive: isCurrent,
      groups: groupDefs,
      roster: rosterRows,
      memberships,
      meets,
      ...practice,
      reflections: buildReflections(rng, year, curYear, meets, byKey, rosterSet),
    });
    void results;
  }

  plan.athletes.forEach((a) => { a.hasAccount = accountAthletes.has(a.key); });
  plan.pending = buildPending(rng, plan, athletes, curYear);
  plan.meetSeries = seriesRaces;
  plan.equipment = buildEquipment(rng, plan, byKey);
  plan.aiSnapshot = aiSnapshot(plan);
  return plan;
}

// ---- helpers -------------------------------------------------------------------

const round1 = (x) => Math.round(x * 10) / 10;

function meetPlan(rng, m, location) {
  const travel = !m.home;
  return {
    departureLoc: 'School parking lot',
    departureMinutes: travel ? 6 * 60 + 45 : null,
    returnMinutes: travel ? 17 * 60 : null,
    transportNotes: travel ? 'Two buses. Seniors sit in the back. Ron sits in the front.' : 'Home meet. Be at the course by 8:00 to help set up.',
    uniformNotes: 'Team top and shorts. Spikes. Warm layers for after.',
    bringList: 'Water bottle, spikes, extra socks, a snack, your good attitude.',
    published: true,
    location,
  };
}

function pickSchools(rng, m) {
  if (m.field === 0) return [];
  const pool = m.league ? C.SCHOOLS.filter((s) => s.league) : C.SCHOOLS;
  const n = Math.min(m.field, pool.length);
  const league = C.SCHOOLS.filter((s) => s.league);
  const chosen = m.league ? rng.sample(pool, n) : [...rng.sample(league, Math.min(3, n)), ...rng.sample(C.SCHOOLS.filter((s) => !s.league), Math.max(0, n - 3))];
  return chosen;
}

function addRivals(rng, race, schools, kind, courseWeather, m, year, curYear) {
  const strong = [...schools].sort((a, b) => a.strength - b.strength);
  const goldSchools = new Set(strong.slice(0, Math.ceil(strong.length / 2)).map((s) => s.name));
  for (const g of ['M', 'F']) {
    const mean = (g === 'M' ? 352 : 428) + (kind === 'jv' ? 38 : 0);
    for (const school of schools) {
      const count = kind === 'jv' ? rng.int(5, 8) : 7;
      for (let j = 0; j < count; j += 1) {
        const pace = Math.max(g === 'M' ? 298 : 330, mean + school.strength + (j - 3) * (kind === 'jv' ? 8 : 9) + rng.normal(0, 14) + courseWeather);
        const baseName = `${g === 'M' ? 'Boys' : 'Girls'} ${kind === 'jv' ? 'JV' : 'Varsity'}`;
        const tier = race.divisionsPlan && kind === 'var' ? (goldSchools.has(school.name) ? 'Gold' : 'Silver') : null;
        const dnf = rng.chance(0.008);
        race.field.push({
          schoolName: school.name,
          athleteName: null,
          grade: null,
          gender: g,
          division: tier ? `${baseName} ${tier}` : baseName,
          timeSec: dnf ? null : round1(pace * (race.distanceMeters / MILE)),
          status: dnf ? 'DNF' : 'FINISHED',
        });
      }
    }
  }
  void m; void year; void curYear;
}

/** Rank each division's finishers, then place our team's gold/silver rows to match. */
function finalizePlaces(race) {
  const divisions = [...new Set(race.field.map((f) => f.division))];
  for (const d of divisions) {
    const rows = race.field.filter((f) => f.division === d && f.status === 'FINISHED' && f.timeSec != null).sort((a, b) => a.timeSec - b.timeSec);
    rows.forEach((r, i) => { r.place = i + 1; });
  }
}

function placeSimple(race) {
  const divisions = [...new Set(race.results.map((r) => r.division))];
  for (const d of divisions) {
    race.results.filter((r) => r.division === d && r.status === 'FINISHED').sort((a, b) => a.time - b.time).forEach((r, i) => { r.place = i + 1; });
  }
}

function fieldStats(times) {
  const s = computeFieldStats(times);
  return { fieldMeanSec: s?.fieldMeanSec ?? null, fieldMedianSec: s?.fieldMedianSec ?? null, fieldFinisherCount: s?.fieldFinisherCount ?? null };
}

/** Our results get division/place/overall exactly as the field-results upload would compute them. */
function applyPlacements(race, byKey) {
  const fieldResults = race.field.map((f, i) => ({ id: `f${i}`, ...f }));
  const results = race.results.map((r, i) => {
    const a = byKey.get(r.athleteKey);
    return { id: `r${i}`, athleteId: r.athleteKey, athlete: { id: a.key, name: a.name, preferredName: null, gender: a.gender } };
  });
  const placements = computeRacePlacements({ results, fieldResults });
  race.results.forEach((r, i) => {
    const p = placements.get(`r${i}`);
    if (p) {
      r.division = p.division ?? r.division;
      r.place = p.place ?? r.place ?? null;
      r.overallPlace = p.overallPlace ?? null;
      r.overallFieldSize = p.overallFieldSize ?? null;
    }
  });
}

// ---- practices, attendance, intervals, training logs ---------------------------------------

const ZONES = { R: -22, V: -10, TH: 8, T: 25, E: 95 };
const INTERVALS = [
  { title: '8 x 400 at repetition pace', rep: 400, n: 6, zone: 'R', label: 'Repetition' },
  { title: '6 x 800 at VO2', rep: 800, n: 6, zone: 'V', label: 'VO2' },
  { title: '5 x 1000 at threshold', rep: 1000, n: 5, zone: 'TH', label: 'Threshold' },
  { title: '4 x 1200 at threshold', rep: 1200, n: 4, zone: 'TH', label: 'Threshold' },
  { title: '3 x 1 mile at tempo', rep: 1609, n: 3, zone: 'T', label: 'Tempo' },
];

function buildPractice({ rng, year, isCurrent, startMs, stateMs, todayMs, cal, roster, byKey, injuries, groupOf, memberships }) {
  const meetDays = new Set(cal.map((m) => m.ms));
  const injuredOn = (key, ms) => injuries.find((i) => i.athleteKey === key && ms >= i.from && ms <= i.to);
  const plans = [];
  const attendance = [];
  const intervalSessions = [];
  const trainingLogs = [];
  const horizon = isCurrent ? todayMs + 8 * DAY : stateMs;
  let tuesdayIdx = 0;

  for (let ms = startMs; ms <= Math.min(stateMs, horizon); ms += DAY) {
    const dow = dayOfWeek(ms);
    if (dow === 0 || dow === 6) continue;
    const isMeet = meetDays.has(ms);
    const location = rng.pick(C.PRACTICE_LOCATIONS);
    const choices = C.PRACTICE_RUNS[dow];
    const base = rng.pick(choices);
    const nextMeet = cal.find((m) => m.ms > ms);
    const raceWeek = nextMeet && nextMeet.ms - ms <= 3 * DAY;
    const future = ms > todayMs;
    const draft = future && ms > todayMs + 3 * DAY;
    const plan = {
      key: `${year}:p:${ymd(ms)}`,
      date: ymd(ms),
      locationName: location,
      startTime: '15:30',
      announcements: rng.chance(0.35) ? rng.pick(C.ANNOUNCEMENTS) : null,
      preRun: base.pre,
      run: isMeet ? 'Time trial day: 1 mile, all out, after a long warmup.' : raceWeek && dow === 4 ? 'Race-week sharpener: 4 x 400 at race pace, full recovery.' : base.run,
      postRun: base.post,
      workoutName: dow === 2 ? rng.pick(['Tuesday Ladder', '6 x 1000 Threshold', '800 Repeats', 'Mile Repeats']) : dow === 4 ? rng.pick(['Tempo 25', 'Hill Repeats (8 x 90s)', 'Fartlek Friday-ish']) : dow === 5 ? 'Easy + Strides' : null,
      intervalSessionKey: null,
      published: !draft,
    };
    plans.push(plan);

    // Attendance for every practice up to and including today.
    if (ms <= todayMs) {
      const isToday = isCurrent && ms === todayMs;
      const records = [];
      for (const a of roster) {
        if (isToday && rng.chance(0.35)) continue; // not marked yet
        const inj = injuredOn(a.key, ms);
        let status = 'PRESENT';
        const r = rng.rand();
        if (inj) status = r < 0.5 ? 'EXCUSED' : 'PRESENT';
        else if (r < 0.04) status = 'ABSENT';
        else if (r < 0.075) status = 'EXCUSED';
        else if (r < 0.105) status = 'LATE';
        records.push({ athleteKey: a.key, status, notes: inj && status === 'EXCUSED' ? inj.reason : status === 'EXCUSED' && rng.chance(0.4) ? rng.pick(['Dentist', 'Family trip', 'Doctor', 'Orchestra']) : null });
      }
      attendance.push({ date: ymd(ms), time: '15:30', locationName: location, records });
    }

    // Tuesday intervals, per training group.
    if (dow === 2 && ms <= todayMs && !isMeet) {
      const iv = INTERVALS[tuesdayIdx % INTERVALS.length];
      tuesdayIdx += 1;
      let first = null;
      for (const gkey of ['vb', 'vg', 'jb', 'jg', 'nb', 'ng']) {
        const members = memberships.filter((x) => x.groupKey === gkey).map((x) => byKey.get(x.athleteKey)).filter((a) => a && !injuredOn(a.key, ms));
        if (!members.length) continue;
        const novice = gkey === 'nb' || gkey === 'ng';
        const skey = `${year}:iv:${ymd(ms)}:${gkey}`;
        const n = Math.min(6, novice ? Math.max(3, iv.n - 2) : iv.n);
        const session = {
          key: skey, date: ymd(ms), title: iv.title, repDistanceM: iv.rep, zone: iv.zone, zoneLabel: iv.label, groupKey: gkey,
          entries: [],
        };
        const t = Math.min(1, Math.max(0, (ms - startMs) / (stateMs - startMs)));
        for (const a of members) {
          if (rng.chance(0.07)) continue;
          const pace = paceAt(a, year, t) + ZONES[iv.zone] + (novice ? 8 : 0);
          const reps = [];
          for (let i = 0; i < n; i += 1) reps.push(round1((pace + rng.normal(0, 3) + i * 0.6) * (iv.rep / MILE)));
          session.entries.push({ athleteKey: a.key, reps, notes: rng.chance(0.06) ? rng.pick(['Felt strong.', 'Tight calf, backed off.', 'Held pace to the end.', 'Went out too fast.']) : null });
          trainingLogs.push({
            athleteKey: a.key, date: ymd(ms), type: 'interval',
            distanceMi: round1(3 + (n * iv.rep) / MILE), durationSec: Math.round(2400 + reps.reduce((s, v) => s + v, 0)),
            notes: iv.title, sharedWithCoach: true, sharedWithTeam: false, source: 'manual', repSplits: reps, fromInterval: skey,
          });
        }
        intervalSessions.push(session);
        first ||= skey;
      }
      plan.intervalSessionKey = first;
    }

    // Daily logs for the last two seasons (athletes log what they ran).
    if (year >= (isCurrent ? year : year) && ms <= todayMs && year >= todayYear(todayMs) - 1 && !isMeet) {
      for (const a of roster) {
        if (rng.chance(0.2)) continue;
        if (dow === 2 && !injuredOn(a.key, ms)) continue; // interval day is logged from the session
        const inj = injuredOn(a.key, ms);
        const mi = inj ? 0 : round1(base.mi * (a.gender === 'F' ? 0.92 : 1) * (0.85 + rng.rand() * 0.3));
        const pace = paceAt(a, year, 0.5) + 95;
        const source = rng.chance(0.18) ? 'strava' : 'manual';
        trainingLogs.push({
          athleteKey: a.key, date: ymd(ms), type: inj ? 'other' : base.tier,
          distanceMi: inj ? null : mi, durationSec: inj ? 40 * 60 : Math.round(mi * pace),
          notes: inj ? `Cross-training: ${rng.pick(['pool running', 'bike', 'elliptical'])} (${inj.reason}).` : rng.chance(0.12) ? rng.pick(['Felt great.', 'Legs were tired.', 'Hot out there.', 'Great run with the group.', 'Hills!']) : null,
          sharedWithCoach: rng.chance(0.6), sharedWithTeam: rng.chance(0.15), source,
          externalId: source === 'strava' ? `demo-${a.key}-${ymd(ms)}` : null,
          startedAt: source === 'strava' ? `${ymd(ms)}T22:30:00.000Z` : null,
          avgHrBpm: source === 'strava' && !inj ? rng.int(142, 168) : null,
          elevationFt: source === 'strava' && !inj ? rng.int(40, 420) : null,
        });
      }
    }
  }
  return { practicePlans: plans, attendance, intervalSessions, trainingLogs };
}

const todayYear = (ms) => new Date(ms).getUTCFullYear();

// ---- goals and reflections ---------------------------------------------------------------

function buildReflections(rng, year, curYear, meets, byKey, rosterSet) {
  if (year < curYear - 1) return [];
  const out = [];
  const races = meets.flatMap((m) => m.races).filter((r) => r.key.endsWith(':var') && r.results.length);
  for (const race of races.filter((_, i) => i % 3 === 0)) {
    for (const res of race.results) {
      if (res.status !== 'FINISHED' || !rosterSet.has(res.athleteKey) || !rng.chance(0.32)) continue;
      const a = byKey.get(res.athleteKey);
      void a;
      out.push({
        athleteKey: res.athleteKey, raceKey: race.key,
        processGoal: rng.pick(C.REFLECTIONS.process), outcomeGoal: rng.pick(C.REFLECTIONS.outcome),
        targetTimeSec: res.time ? round1(res.time - rng.int(3, 20)) : null, keyFocus: rng.pick(C.REFLECTIONS.process),
        feelingRating: rng.int(2, 5), effortRating: rng.int(3, 5),
        whatWorked: rng.pick(C.REFLECTIONS.worked), whatDidnt: rng.chance(0.6) ? rng.pick(C.REFLECTIONS.didnt) : null, postNotes: rng.pick(C.REFLECTIONS.notes),
        sharedWithCoach: rng.chance(0.85),
      });
    }
  }
  return out;
}

// ---- equipment ---------------------------------------------------------------------------

function buildEquipment(rng, plan, byKey) {
  const items = [];
  const sizes = ['XS', 'S', 'M', 'L', 'XL'];
  const make = (type, prefix, count, sizeList) => {
    for (let i = 1; i <= count; i += 1) {
      items.push({ key: `${prefix}-${i}`, type, identifier: `${prefix}-${String(i).padStart(2, '0')}`, size: rng.pick(sizeList), condition: rng.pick(['NEW', 'GOOD', 'GOOD', 'GOOD', 'FAIR', 'POOR']), retired: i > count - 3, notes: i % 9 === 0 ? 'Missing a drawstring.' : null });
    }
  };
  make('TOP', 'TOP', 70, sizes);
  make('BOTTOM', 'SHORTS', 70, sizes);
  make('SPIKES', 'SPK', 28, ['6', '7', '8', '9', '10', '11']);
  make('OTHER', 'JKT', 24, sizes);
  const cur = plan.seasons[plan.seasons.length - 1];
  const prev = plan.seasons[plan.seasons.length - 2];
  const assignments = [];
  const free = { TOP: items.filter((e) => e.type === 'TOP' && !e.retired), BOTTOM: items.filter((e) => e.type === 'BOTTOM' && !e.retired), SPIKES: items.filter((e) => e.type === 'SPIKES' && !e.retired), OTHER: items.filter((e) => e.type === 'OTHER' && !e.retired) };
  const start = cur.startDate;
  cur.roster.forEach((r, idx) => {
    for (const type of ['TOP', 'BOTTOM']) {
      const item = free[type].shift();
      if (!item) continue;
      assignments.push({ equipmentKey: item.key, athleteKey: r.athleteKey, seasonYear: cur.year, checkedOutAt: `${start}T15:00:00.000Z`, dueDate: cur.endDate, returnedAt: null, conditionOut: 'GOOD', conditionIn: null, notes: null });
    }
    if (idx % 2 === 0 && free.SPIKES.length) {
      const item = free.SPIKES.shift();
      const overdue = idx % 6 === 0;
      assignments.push({ equipmentKey: item.key, athleteKey: r.athleteKey, seasonYear: cur.year, checkedOutAt: `${start}T15:00:00.000Z`, dueDate: overdue ? ymdDaysBefore(plan.generatedFor, 9) : cur.endDate, returnedAt: null, conditionOut: 'GOOD', conditionIn: null, notes: overdue ? 'Reminder sent.' : null });
    }
  });
  // Last season's gear, all returned.
  if (prev) {
    prev.roster.slice(0, 30).forEach((r, i) => {
      const item = items[(i * 3) % 60];
      assignments.push({ equipmentKey: item.key, athleteKey: r.athleteKey, seasonYear: prev.year, checkedOutAt: `${prev.startDate}T15:00:00.000Z`, dueDate: prev.endDate, returnedAt: `${prev.endDate}T15:00:00.000Z`, conditionOut: 'GOOD', conditionIn: rng.pick(['GOOD', 'GOOD', 'FAIR']), notes: null });
    });
  }
  void byKey;
  return { items, assignments };
}

const ymdDaysBefore = (iso, days) => ymd(Date.parse(`${iso}T00:00:00Z`) - days * DAY);

// ---- people waiting on a coach: claims, parents, invites ---------------------------------

function buildPending(rng, plan, athletes, curYear) {
  const current = athletes.filter((a) => onRoster(a, curYear) && !plan.athletes.find((p) => p.key === a.key).hasAccount);
  const pick = rng.shuffle(current);
  const parentNames = ['Pat Ernal', 'Matt Ernal', 'Dee Fault', 'Ann Teak'];
  const claimNames = ['Reese Pecked', 'Jess Kidding'];
  return {
    claims: pick.slice(0, 2).map((a, i) => ({ athleteKey: a.key, name: claimNames[i], email: `claim.${a.key}@${C.DEMO_EMAIL_DOMAIN}`, matchScore: rng.int(72, 96) })),
    guardians: pick.slice(2, 4).map((a, i) => ({ athleteKey: a.key, name: parentNames[i], email: `guardian.${a.key}@${C.DEMO_EMAIL_DOMAIN}` })),
    parentRequests: pick.slice(4, 6).map((a, i) => ({ athleteKey: a.key, name: parentNames[i + 2], email: `parent.${a.key}@${C.DEMO_EMAIL_DOMAIN}`, message: `Hi coach, I'm ${a.name.split(' ')[0]}'s parent. Can I get access to the schedule?` })),
    athleteInvites: pick.slice(6, 9).map((a) => ({ athleteKey: a.key, email: `invite.${a.key}@${C.DEMO_EMAIL_DOMAIN}` })),
    staffInvites: [{ email: `new.assistant@${C.DEMO_EMAIL_DOMAIN}`, role: 'VOLUNTEER_COACH' }],
  };
}

// ---- a canned insights snapshot so Coaches Tools has something to show ----------------------

function aiSnapshot(plan) {
  const cur = plan.seasons[plan.seasons.length - 1];
  // The insights route fingerprints a season by its race count (every race row,
  // upcoming ones included) and its finished results, so match that exactly.
  const races = cur.meets.flatMap((m) => m.races);
  const results = races.flatMap((r) => r.results).filter((r) => r.status === 'FINISHED' && r.time > 0).length;
  return {
    season: cur.year,
    raceCount: races.length,
    resultCount: results,
    data: {
      insights: [
        { title: 'The top five are tightening up', description: 'The gap between the first and fifth runner has shrunk every meet since September. Pack running is working: the front group is going out together and closing together.', athletes: [], priority: 'high', category: 'starters' },
        { title: 'Two sophomores are ready to move up', description: 'Both have beaten their previous season best in each of the last three races and sit within a few seconds per mile of the varsity cut. Worth a look before the next invitational.', athletes: [], priority: 'medium', category: 'breakout' },
        { title: 'Consistency is the difference at the back of the lineup', description: 'Runners 6 and 7 vary by more than twenty seconds per mile from race to race. Course and weather explain some of it; pacing the first mile explains the rest.', athletes: [], priority: 'medium', category: 'consistency' },
        { title: 'A few athletes have gone quiet', description: 'Several runners missed more than a week of practice and have not raced in a month. A check-in now is cheaper than a conversation in October.', athletes: [], priority: 'low', category: 'attention' },
      ],
      summary: 'A deeper team than last year, with a tight front pack and real depth behind it. The remaining work is consistency from runners six through ten and keeping the injured group healthy through the championship stretch.',
    },
  };
}

module.exports = { generateDemoPlan, anchorSeason, calendar, paceAt, gradeIn, MILE };
