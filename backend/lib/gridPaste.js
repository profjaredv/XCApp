// Results Grid paste import: decide what a coach's paste would change, then
// change exactly that.
//
// The browser reads the pasted page into a payload (web/src/lib/
// gridTextParse.ts): meets (date + name), and per athlete the cells
// {meet, distance, time, status}. Everything that needs the database lives
// here, in two halves so each is testable:
//
//   planGridPaste(input)         PURE. Given the payload, what the team
//                                already has, and the coach's review
//                                decisions, returns what is new, what
//                                changed, what is unchanged, what still
//                                needs a human, and the exact writes.
//   loadPasteState / commit...   the Prisma half. commit recomputes the plan
//                                from fresh data (never trusts a client-sent
//                                plan), refuses while review items are open,
//                                and applies the plan's writes in one
//                                transaction.
//
// Rules this keeps (LeadPack-results-grid-paste.md): idempotent (same
// athlete + meet + race is an update only if the time changed, so re-pasting
// writes nothing); nothing is deleted because it is missing from a paste
// ("in LeadPack but not in this paste" is information only); an athlete is
// never auto-created while a near match exists.

const { normalizeAthleteName, athleteNameCandidates, athleticIdKey } = require('./athleteMatching');
const { parseTimeToSeconds } = require('./time');
const { parseDistanceToMeters } = require('./distance');
const { normalizeGender } = require('./gender');
const { deriveGraduationYear } = require('./season');

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const STATUSES = new Set(['FINISHED', 'DNS', 'DNF', 'DQ']);
const TIME_EPSILON = 0.05;

// ---------------------------------------------------------------- helpers

/** "Sep 8" + 2026 -> Date at UTC midnight (what a @db.Date column holds). null if unreadable. */
function pasteDate(label, season) {
  const m = String(label || '').trim().match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})$/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  const day = Number(m[2]);
  if (month === undefined || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(season, month, day));
  return d.getUTCMonth() === month ? d : null;
}

const isoDay = (d) => d.toISOString().slice(0, 10);

/** Meet-name comparison: case, punctuation and "&" vs "and" do not matter. */
function normalizeMeetName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function namesAreClose(a, b) {
  const x = normalizeMeetName(a);
  const y = normalizeMeetName(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const tx = new Set(x.split(' '));
  const ty = new Set(y.split(' '));
  let shared = 0;
  for (const t of tx) if (ty.has(t)) shared++;
  return shared / Math.min(tx.size, ty.size) >= 0.5;
}

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Is `candidate` a plausible spelling of the same person as `name`? ("Sam"/"Samuel", a typo, a hyphen.) */
function isNearName(name, candidate) {
  const a = normalizeAthleteName(name).replace(/-/g, ' ').split(' ');
  const b = normalizeAthleteName(candidate).replace(/-/g, ' ').split(' ');
  if (!a[0] || !b[0]) return false;
  const surnameA = a.slice(1).join(' ');
  const surnameB = b.slice(1).join(' ');
  const firstA = a[0];
  const firstB = b[0];
  const firstClose = firstA === firstB || firstA.startsWith(firstB) || firstB.startsWith(firstA) || editDistance(firstA, firstB) <= 1;
  if (surnameA && surnameB && editDistance(surnameA, surnameB) <= 1 && firstClose) return true;
  if (surnameA && surnameA === surnameB && firstA[0] === firstB[0]) return true;
  const whole = (arr) => arr.join(' ');
  return whole(a).length >= 6 && editDistance(whole(a), whole(b)) <= 2;
}

function raceKey(name, dateIso, distance) {
  return `${name}|${dateIso}|${distance}`;
}

// ------------------------------------------------------------- validation

/** Shape-checks the request body. Returns an error string or null. */
function validatePasteBody(body) {
  if (!body || typeof body !== 'object') return 'Nothing to import.';
  const season = Number(body.season);
  if (!Number.isInteger(season) || season < 1980 || season > 2100) return 'Choose a season.';
  if (!Array.isArray(body.grids) || body.grids.length < 1 || body.grids.length > 2) return 'Paste the Boys grid, the Girls grid, or both.';
  const genders = new Set();
  for (const g of body.grids) {
    if (!g || (g.gender !== 'Men' && g.gender !== 'Women')) return 'Each grid must be Boys or Girls.';
    if (genders.has(g.gender)) return 'Boys and Girls can each be pasted once.';
    genders.add(g.gender);
    if (!Array.isArray(g.meets) || g.meets.length === 0 || g.meets.length > 40) return 'The grid has no meets.';
    if (!Array.isArray(g.athletes) || g.athletes.length === 0 || g.athletes.length > 600) return 'The grid has no athletes, or too many.';
    for (const m of g.meets) {
      if (!m || typeof m.name !== 'string' || !m.name.trim() || m.name.length > 200) return 'A meet is missing its name.';
      if (!pasteDate(m.date, season)) return `Could not read the date "${m.date}".`;
    }
    for (const a of g.athletes) {
      if (!a || typeof a.key !== 'string' || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 200) return 'An athlete is missing a name.';
      if (!Array.isArray(a.cells) || a.cells.length > 200) return `Row for ${a.name} doesn't line up.`;
      for (const c of a.cells) {
        if (!c || !Number.isInteger(c.meet) || c.meet < 0 || c.meet >= g.meets.length) return `Row for ${a.name} doesn't line up.`;
        if (typeof c.distance !== 'string' || !c.distance.trim() || c.distance.length > 60) return `A result for ${a.name} has no distance.`;
        if (!STATUSES.has(c.status)) return `A result for ${a.name} has an unknown status.`;
        if (c.status === 'FINISHED' && parseTimeToSeconds(c.time) === null) return `A time for ${a.name} could not be read.`;
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------- plan

/**
 * @param input.season    number
 * @param input.grids     validated payload grids
 * @param input.seasonRange {start: Date|null, end: Date|null}
 * @param input.existing  {meets, races, athletes, aliasIds, nameAliases, results, roster}
 * @param input.decisions {athletes: {[key]: {action:'existing',athleteId}|{action:'new'}},
 *                         meets: {[meetKey]: {action:'existing',meetId}|{action:'new'}}}
 */
function planGridPaste({ season, grids, seasonRange = {}, existing, decisions = {} }) {
  const errors = [];
  const athleteDecisions = decisions.athletes || {};
  const meetDecisions = decisions.meets || {};

  // ---- meets: one per (date, name) across both pastes
  const pastedMeets = []; // {key, dateIso, date, name, athleticMeetId, distances:Set, grids:[{gi,mi}]}
  const meetIndex = new Map();
  grids.forEach((g, gi) => {
    g.meets.forEach((m, mi) => {
      const date = pasteDate(m.date, season);
      const key = `${isoDay(date)}|${normalizeMeetName(m.name)}`;
      let pm = meetIndex.get(key);
      if (!pm) {
        pm = { key, date, dateIso: isoDay(date), name: m.name.trim(), athleticMeetId: m.athleticMeetId ? String(m.athleticMeetId) : null, distances: new Set(), refs: [] };
        meetIndex.set(key, pm);
        pastedMeets.push(pm);
      } else if (!pm.athleticMeetId && m.athleticMeetId) {
        pm.athleticMeetId = String(m.athleticMeetId);
      }
      pm.refs.push({ gi, mi });
    });
  });
  for (const g of grids) {
    for (const a of g.athletes) {
      for (const c of a.cells) {
        const m = g.meets[c.meet];
        meetIndex.get(`${isoDay(pasteDate(m.date, season))}|${normalizeMeetName(m.name)}`).distances.add(c.distance.trim());
      }
    }
  }
  // Meets nobody has a result in are still in the list, but only meets with results matter for races.

  if (seasonRange.start && seasonRange.end) {
    const outside = pastedMeets.some((m) => m.date < seasonRange.start || m.date > seasonRange.end);
    if (outside) errors.push(`These meets don't look like the ${season} season.`);
  }

  const existingMeets = existing.meets.map((m) => ({ ...m, dateIso: isoDay(m.date) }));
  const meetPlan = pastedMeets.map((pm) => {
    const base = { key: pm.key, name: pm.name, date: pm.dateIso, distances: [...pm.distances].sort(), athleticMeetId: pm.athleticMeetId };
    const decision = meetDecisions[pm.key];
    const byId = pm.athleticMeetId ? existingMeets.find((m) => m.athleticMeetId === pm.athleticMeetId) : null;
    if (byId) return { ...base, status: 'existing', meetId: byId.id, matchedBy: 'id', existingName: byId.name, existingAthleticMeetId: byId.athleticMeetId };
    // A race this paste's meet already produced remembers which meet it was filed under, so a
    // choice the coach made once (or a name that never matched exactly) holds on every later paste.
    const viaRace = existing.races.find((r) => r.meetId && r.name === pm.name && isoDay(r.date) === pm.dateIso);
    const linkedMeet = viaRace ? existingMeets.find((m) => m.id === viaRace.meetId) : null;
    if (linkedMeet) {
      return { ...base, status: 'existing', meetId: linkedMeet.id, matchedBy: 'race', existingName: linkedMeet.name, existingAthleticMeetId: linkedMeet.athleticMeetId };
    }
    const sameDay = existingMeets.filter((m) => m.dateIso === pm.dateIso);
    const exact = sameDay.filter((m) => normalizeMeetName(m.name) === normalizeMeetName(pm.name));
    if (exact.length === 1) return { ...base, status: 'existing', meetId: exact[0].id, matchedBy: 'name', existingName: exact[0].name, existingAthleticMeetId: exact[0].athleticMeetId };
    if (decision) {
      if (decision.action === 'existing' && existingMeets.some((m) => m.id === decision.meetId)) {
        const m = existingMeets.find((x) => x.id === decision.meetId);
        return { ...base, status: 'existing', meetId: m.id, matchedBy: 'decision', existingName: m.name, existingAthleticMeetId: m.athleticMeetId };
      }
      if (decision.action === 'new') return { ...base, status: 'new' };
    }
    const candidates = sameDay.map((m) => ({ id: m.id, name: m.name, date: m.dateIso }));
    if (exact.length > 1) return { ...base, status: 'review', candidates, reviewReason: 'Two meets on this date have this name.' };
    if (sameDay.length >= 2) return { ...base, status: 'review', candidates, reviewReason: 'More than one meet is on this date.' };
    if (sameDay.length === 1 && namesAreClose(sameDay[0].name, pm.name)) {
      return { ...base, status: 'review', candidates, reviewReason: 'A meet on this date has a similar name.' };
    }
    return { ...base, status: 'new' };
  });
  const meetPlanByKey = new Map(meetPlan.map((m) => [m.key, m]));

  // ---- athletes
  const teamAthletes = existing.athletes;
  const athleteById = new Map(teamAthletes.map((a) => [a.id, a]));
  const byAthleticId = new Map(teamAthletes.filter((a) => a.athleticAthleteId).map((a) => [athleticIdKey(a.athleticAthleteId), a]));
  const byAliasId = new Map(existing.aliasIds.filter((r) => athleteById.has(r.athleteId)).map((r) => [athleticIdKey(r.athleticAthleteId), athleteById.get(r.athleteId)]));
  const byNameAlias = new Map(existing.nameAliases.filter((r) => athleteById.has(r.athleteId)).map((r) => [r.alias, athleteById.get(r.athleteId)]));
  const byName = new Map(); // candidate full name -> athletes[]
  for (const a of teamAthletes) {
    for (const n of athleteNameCandidates(a.name, a.preferredName)) {
      if (!byName.has(n)) byName.set(n, []);
      if (!byName.get(n).includes(a)) byName.get(n).push(a);
    }
  }

  const summarize = (a) => ({ id: a.id, name: a.name, graduationYear: a.graduationYear ?? null, gender: a.gender ?? null });

  const athletePlan = []; // {key, gender, name, grade, status, athleteId?, matchedBy, candidates?, reviewReason?, alias?}
  grids.forEach((g, gi) => {
    const pasteGender = normalizeGender(g.gender);
    for (const pa of g.athletes) {
      const entry = { key: pa.key, gi, gender: g.gender, name: pa.name.trim(), grade: pa.grade ?? null, athleticAthleteId: pa.athleticAthleteId || null };
      const gradYear = pa.grade != null ? deriveGraduationYear(pa.grade, season) : null;
      const normalized = normalizeAthleteName(pa.name);
      const decision = athleteDecisions[pa.key];

      const finish = (athlete, matchedBy) => {
        if (athlete.gender && pasteGender && athlete.gender !== pasteGender) {
          return { ...entry, status: 'review', candidates: [summarize(athlete)], reviewReason: `${athlete.name} is on the roster as ${athlete.gender === 'F' ? 'a girl' : 'a boy'}, but this is the ${g.gender === 'Men' ? 'Boys' : 'Girls'} paste.` };
        }
        return { ...entry, status: 'existing', athleteId: athlete.id, matchedBy };
      };

      if (decision && decision.action === 'existing' && athleteById.has(decision.athleteId)) {
        // The coach said who this is: that settles it, including a gender flag.
        const athlete = athleteById.get(decision.athleteId);
        athletePlan.push({ ...entry, status: 'existing', athleteId: athlete.id, matchedBy: 'decision' });
        continue;
      }
      if (decision && decision.action === 'new') {
        athletePlan.push({ ...entry, status: 'new', matchedBy: 'decision' });
        continue;
      }

      const idKey = pa.athleticAthleteId ? athleticIdKey(pa.athleticAthleteId) : null;
      let hit = (idKey && (byAthleticId.get(idKey) || byAliasId.get(idKey))) || null;
      if (hit) {
        athletePlan.push(finish(hit, 'id'));
        continue;
      }
      hit = byNameAlias.get(normalized);
      if (hit) {
        athletePlan.push(finish(hit, 'alias'));
        continue;
      }
      const sameName = byName.get(normalized) || [];
      if (sameName.length === 1) {
        const a = sameName[0];
        if (gradYear != null && a.graduationYear != null && a.graduationYear !== gradYear) {
          athletePlan.push({ ...entry, status: 'review', candidates: [summarize(a)], reviewReason: `${a.name} is on the roster with a different class year.` });
        } else {
          athletePlan.push(finish(a, 'name'));
        }
        continue;
      }
      if (sameName.length > 1) {
        const byYear = gradYear != null ? sameName.filter((a) => a.graduationYear === gradYear) : [];
        if (byYear.length === 1) athletePlan.push(finish(byYear[0], 'name+grade'));
        else athletePlan.push({ ...entry, status: 'review', candidates: sameName.map(summarize), reviewReason: 'More than one athlete has this name.' });
        continue;
      }
      const near = teamAthletes.filter((a) => athleteNameCandidates(a.name, a.preferredName).some((n) => isNearName(pa.name, n)));
      if (near.length) {
        athletePlan.push({ ...entry, status: 'review', candidates: near.slice(0, 4).map(summarize), reviewReason: 'This name is close to someone already on the roster.' });
      } else {
        athletePlan.push({ ...entry, status: 'new', matchedBy: 'none' });
      }
    }
  });

  // ---- races (one per meet + distance) and results
  const raceByKey = new Map(existing.races.map((r) => [raceKey(r.name, isoDay(r.date), r.distance), r]));
  const racePlan = new Map(); // key -> {key, name, dateIso, distance, meetKey, existingId?, meetId?, needsMeetLink}
  const results = []; // {athleteKey, raceKey, time, status, grade, existing?}
  const pasted = new Set(); // `${athleteId}|${raceId}` of results in the paste, for "not in paste"
  grids.forEach((g, gi) => {
    const athletesInGrid = athletePlan.filter((p) => p.gi === gi);
    g.athletes.forEach((pa, idx) => {
      const ap = athletesInGrid[idx];
      for (const c of pa.cells) {
        const m = g.meets[c.meet];
        const pm = meetIndex.get(`${isoDay(pasteDate(m.date, season))}|${normalizeMeetName(m.name)}`);
        const distance = c.distance.trim();
        const rk = raceKey(pm.name, pm.dateIso, distance);
        if (!racePlan.has(rk)) {
          const ex = raceByKey.get(rk);
          const mp = meetPlanByKey.get(pm.key);
          racePlan.set(rk, {
            key: rk,
            name: pm.name,
            dateIso: pm.dateIso,
            date: pm.date,
            distance,
            distanceMeters: parseDistanceToMeters(distance),
            meetKey: pm.key,
            meetId: mp.status === 'existing' ? mp.meetId : null,
            existingId: ex ? ex.id : null,
            existingMeetId: ex ? ex.meetId : null,
            athleticMeetId: (mp.status === 'existing' && mp.existingAthleticMeetId) || pm.athleticMeetId || null,
          });
        }
        results.push({
          athleteKey: ap.key,
          raceKey: rk,
          time: c.status === 'FINISHED' ? parseTimeToSeconds(c.time) : null,
          status: c.status,
          grade: pa.grade ?? null,
          pickKey: Array.isArray(c.alternatives) ? `${pa.key}|${c.meet}|${distance}` : null,
          alternatives: Array.isArray(c.alternatives) ? c.alternatives : null,
        });
      }
    });
  });

  // Existing result lookup + classification.
  const resultByPair = new Map(existing.results.map((r) => [`${r.athleteId}|${r.raceId}`, r]));
  const planByKey = new Map(athletePlan.map((p) => [p.key, p]));
  let newResults = 0;
  let changedResults = 0;
  let unchanged = 0;
  const resultWrites = [];
  // Cells that held two times: if LeadPack already has one of them, that is the coach's earlier
  // choice. Keep it (and tell the screen to preselect it) rather than flipping back to the faster.
  const preselect = {};
  for (const r of results) {
    const ap = planByKey.get(r.athleteKey);
    const race = racePlan.get(r.raceKey);
    if (ap.status !== 'existing' || !race.existingId) {
      // New athlete or new race: the result cannot exist yet. An athlete under review is counted once resolved.
      if (ap.status !== 'review') {
        newResults++;
        resultWrites.push({ ...r, op: 'create' });
      }
      continue;
    }
    pasted.add(`${ap.athleteId}|${race.existingId}`);
    const ex = resultByPair.get(`${ap.athleteId}|${race.existingId}`);
    if (ex && r.alternatives && ex.status === 'FINISHED' && ex.time != null) {
      const kept = r.alternatives.find((t) => Math.abs(parseTimeToSeconds(t) - ex.time) < TIME_EPSILON);
      if (kept) {
        preselect[r.pickKey] = kept;
        r.time = ex.time;
      }
    }
    if (!ex) {
      newResults++;
      resultWrites.push({ ...r, op: 'create', athleteId: ap.athleteId, raceId: race.existingId });
    } else if (ex.status === r.status && ((ex.time == null && r.time == null) || (ex.time != null && r.time != null && Math.abs(ex.time - r.time) < TIME_EPSILON))) {
      unchanged++;
    } else {
      changedResults++;
      resultWrites.push({ ...r, op: 'update', id: ex.id, athleteId: ap.athleteId, raceId: race.existingId, previousTime: ex.time });
    }
  }

  // In LeadPack but not in this paste (information only; nothing is deleted).
  const pastedGenders = new Set(grids.map((g) => normalizeGender(g.gender)));
  const touchedRaceIds = new Set(
    [...racePlan.values()].map((r) => r.existingId).filter(Boolean)
  );
  for (const r of existing.races) {
    if (r.meetId && meetPlan.some((m) => m.status === 'existing' && m.meetId === r.meetId)) touchedRaceIds.add(r.id);
  }
  let notInPaste = 0;
  for (const r of existing.results) {
    if (!touchedRaceIds.has(r.raceId)) continue;
    const a = athleteById.get(r.athleteId);
    if (a && a.gender && pastedGenders.has(a.gender) && !pasted.has(`${r.athleteId}|${r.raceId}`)) notInPaste++;
  }

  // Name aliases to remember: a confirmed "this is X" whose pasted spelling is not already one of X's names.
  const aliasWrites = [];
  for (const ap of athletePlan) {
    if (ap.status !== 'existing' || ap.matchedBy !== 'decision') continue;
    const a = athleteById.get(ap.athleteId);
    const normalized = normalizeAthleteName(ap.name);
    if (!a || athleteNameCandidates(a.name, a.preferredName).includes(normalized)) continue;
    if (byNameAlias.has(normalized)) continue;
    if (!aliasWrites.some((w) => w.alias === normalized)) aliasWrites.push({ athleteId: a.id, alias: normalized });
  }

  // Meet ids learned from an HTML paste, for existing meets that did not have one yet.
  const takenMeetIds = new Set(existingMeets.map((m) => m.athleticMeetId).filter(Boolean));
  const meetIdBackfills = [];
  for (const m of meetPlan) {
    if (m.status === 'existing' && !m.existingAthleticMeetId && m.athleticMeetId && !takenMeetIds.has(m.athleticMeetId)) {
      meetIdBackfills.push({ meetId: m.meetId, athleticMeetId: m.athleticMeetId });
      takenMeetIds.add(m.athleticMeetId);
    }
  }

  // Facts the paste adds to athletes who already exist (never overwriting what is there).
  const athleteUpdates = [];
  const claimedAthleticIds = new Set(byAthleticId.keys());
  for (const ap of athletePlan) {
    if (ap.status !== 'existing') continue;
    const a = athleteById.get(ap.athleteId);
    const data = {};
    const pasteGender = normalizeGender(ap.gender);
    if (!a.gender && pasteGender) data.gender = pasteGender;
    if (a.graduationYear == null && ap.grade != null) data.graduationYear = deriveGraduationYear(ap.grade, season);
    const idKey = ap.athleticAthleteId ? athleticIdKey(ap.athleticAthleteId) : null;
    if (!a.athleticAthleteId && idKey && !claimedAthleticIds.has(idKey)) {
      data.athleticAthleteId = ap.athleticAthleteId;
      claimedAthleticIds.add(idKey);
    }
    if (Object.keys(data).length) athleteUpdates.push({ athleteId: a.id, data });
  }

  // Season roster rows: everyone in the paste is on this season's roster at the grade the page shows.
  const rosterByAthlete = new Map((existing.roster || []).map((r) => [r.athleteId, r]));
  const rosterWrites = [];
  for (const ap of athletePlan) {
    if (ap.status === 'review') continue;
    if (ap.status === 'existing') {
      const row = rosterByAthlete.get(ap.athleteId);
      if (!row || !row.isActive || (ap.grade != null && row.grade !== ap.grade)) rosterWrites.push({ athleteId: ap.athleteId, grade: ap.grade });
    } else {
      rosterWrites.push({ athleteKey: ap.key, grade: ap.grade });
    }
  }

  const newRaces = [...racePlan.values()].filter((r) => !r.existingId);
  const linkRaces = [...racePlan.values()].filter((r) => r.existingId && !r.existingMeetId && r.meetId);
  const newMeets = meetPlan.filter((m) => m.status === 'new');
  const newAthletes = athletePlan.filter((a) => a.status === 'new');
  const needsReview = meetPlan.filter((m) => m.status === 'review').length + athletePlan.filter((a) => a.status === 'review').length;

  // Two pasted rows that resolve to the same existing athlete would write the same result twice.
  const seenPair = new Set();
  for (const w of resultWrites) {
    const ap = planByKey.get(w.athleteKey);
    if (ap.athleteId) {
      const pair = `${ap.athleteId}|${w.raceKey}`;
      if (seenPair.has(pair)) errors.push(`Two rows in the paste are the same athlete (${ap.name}). Choose "Add as new athlete" for one of them.`);
      seenPair.add(pair);
    }
  }

  return {
    errors: [...new Set(errors)],
    meets: meetPlan,
    athletes: athletePlan,
    preselect,
    summary: {
      newMeets: newMeets.length,
      newRaces: newRaces.length,
      newAthletes: newAthletes.length,
      newResults,
      changedResults,
      unchanged,
      needsReview,
      notInPaste,
    },
    writes: {
      meets: newMeets.map((m) => m.key),
      races: [...racePlan.values()],
      linkRaces: linkRaces.map((r) => r.key),
      results: resultWrites,
      aliases: aliasWrites,
      meetIdBackfills,
      athleteUpdates,
      roster: rosterWrites,
      season,
    },
    hasChanges:
      newMeets.length + newRaces.length + newAthletes.length + resultWrites.length + aliasWrites.length + linkRaces.length + meetIdBackfills.length + athleteUpdates.length + rosterWrites.length > 0,
  };
}

module.exports = {
  pasteDate,
  normalizeMeetName,
  namesAreClose,
  isNearName,
  validatePasteBody,
  planGridPaste,
  TIME_EPSILON,
};
