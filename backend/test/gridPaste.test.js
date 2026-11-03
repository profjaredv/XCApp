const test = require('node:test');
const assert = require('node:assert/strict');
const { planGridPaste, validatePasteBody, pasteDate, isNearName, namesAreClose } = require('../lib/gridPaste');

// grid-boys-payload.json is the Boys fixture (web/src/lib/fixtures/grid-boys.txt:
// Jared's real Boys paste, every name replaced) as the browser's parser
// hands it to the server. 71 athletes, 7 meets, 417 cells (414 finishes after
// the one repeated attempt is resolved, plus 3 DNS).
const boys = require('./fixtures/grid-boys-payload.json');
const SEASON = 2026;

const clone = (x) => JSON.parse(JSON.stringify(x));
const emptyState = () => ({ meets: [], races: [], athletes: [], aliasIds: [], nameAliases: [], results: [], roster: [] });

/** What the database would hold after a plan was committed (mirrors lib/gridPasteDb.js, minus Prisma). */
function applied(plan, state = emptyState()) {
  const next = clone(state);
  next.meets = next.meets.map((m) => ({ ...m, date: new Date(m.date) }));
  next.races = next.races.map((r) => ({ ...r, date: new Date(r.date) }));
  let n = 1000 + next.athletes.length + next.meets.length;
  const meetId = new Map(plan.meets.filter((m) => m.status === 'existing').map((m) => [m.key, m.meetId]));
  for (const key of plan.writes.meets) {
    const m = plan.meets.find((x) => x.key === key);
    const id = `meet-${n++}`;
    meetId.set(key, id);
    next.meets.push({ id, name: m.name, date: new Date(`${m.date}T00:00:00Z`), athleticMeetId: m.athleticMeetId });
  }
  const athleteId = new Map(plan.athletes.filter((a) => a.status === 'existing').map((a) => [a.key, a.athleteId]));
  for (const a of plan.athletes.filter((x) => x.status === 'new')) {
    const id = `ath-${n++}`;
    athleteId.set(a.key, id);
    next.athletes.push({ id, name: a.name, preferredName: null, gender: a.gender === 'Women' ? 'F' : 'M', graduationYear: SEASON + 1 + (12 - a.grade), athleticAthleteId: a.athleticAthleteId });
  }
  const raceId = new Map();
  for (const r of plan.writes.races) {
    if (r.existingId) {
      raceId.set(r.key, r.existingId);
      continue;
    }
    const id = `race-${n++}`;
    raceId.set(r.key, id);
    next.races.push({ id, name: r.name, date: new Date(`${r.dateIso}T00:00:00Z`), distance: r.distance, meetId: r.meetId || meetId.get(r.meetKey) });
  }
  for (const w of plan.writes.results) {
    const aId = w.athleteId || athleteId.get(w.athleteKey);
    const rId = w.raceId || raceId.get(w.raceKey);
    if (w.op === 'create') next.results.push({ id: `res-${n++}`, athleteId: aId, raceId: rId, time: w.time, status: w.status });
    else Object.assign(next.results.find((r) => r.id === w.id), { time: w.time, status: w.status });
  }
  for (const a of plan.writes.aliases) next.nameAliases.push(a);
  for (const r of plan.writes.roster) next.roster.push({ athleteId: r.athleteId || athleteId.get(r.athleteKey), grade: r.grade, isActive: true });
  return next;
}

const plan = (grids, existing = emptyState(), decisions = {}, extra = {}) =>
  planGridPaste({ season: SEASON, grids, existing, decisions, seasonRange: {}, ...extra });

test('the first paste for a team: every meet, race, athlete and result is new, nothing needs review', () => {
  const p = plan([boys]);
  assert.deepEqual(p.errors, []);
  assert.equal(p.summary.newMeets, 7);
  assert.equal(p.summary.newAthletes, 71);
  assert.equal(p.summary.newResults, 417);
  assert.equal(p.summary.needsReview, 0);
  // One race per meet and distance: Bellevue (4200 + 5000) and Sunfair (2 + 3 miles) have two.
  const racesByMeet = {};
  for (const r of p.writes.races) (racesByMeet[r.name] ||= []).push(r.distance);
  assert.deepEqual(racesByMeet['Bellevue Cross Country Invitational'].sort(), ['4200 Meters', '5000 Meters']);
  assert.deepEqual(racesByMeet['Sunfair Invitational'].sort(), ['2 Miles', '3 Miles']);
  assert.deepEqual(racesByMeet['Reed Park Time Trial'], ['1 Miles']);
  assert.equal(p.writes.races.length, 7 + 2);
  assert.equal(p.writes.results.filter((r) => r.status === 'DNS').length, 3);
  assert.equal(p.writes.results.filter((r) => r.status === 'DNS' && r.time === null).length, 3);
});

test('re-pasting the same grid writes nothing', () => {
  const state = applied(plan([boys]));
  const again = plan([boys], state);
  assert.equal(again.hasChanges, false);
  assert.deepEqual(again.summary, { newMeets: 0, newRaces: 0, newAthletes: 0, newResults: 0, changedResults: 0, unchanged: 417, needsReview: 0, notInPaste: 0 });
  assert.equal(again.writes.results.length, 0);
  assert.equal(again.writes.roster.length, 0);
});

test('pasting after one more meet adds only that meet', () => {
  const before = clone(boys);
  before.meets = before.meets.slice(0, 6);
  for (const a of before.athletes) a.cells = a.cells.filter((c) => c.meet < 6);
  const state = applied(plan([before]));
  const p = plan([boys], state);
  assert.equal(p.summary.newMeets, 1);
  assert.equal(p.summary.newAthletes, 0);
  assert.equal(p.summary.changedResults, 0);
  const lastMeetCells = boys.athletes.flatMap((a) => a.cells).filter((c) => c.meet === 6).length;
  assert.equal(p.summary.newResults, lastMeetCells);
  assert.equal(p.writes.races.filter((r) => !r.existingId).length, 1);
});

test('a changed time is an update, not a duplicate', () => {
  const state = applied(plan([boys]));
  state.results[0].time += 1;
  const p = plan([boys], state);
  assert.equal(p.summary.changedResults, 1);
  assert.equal(p.summary.newResults, 0);
  assert.equal(p.writes.results.filter((r) => r.op === 'update').length, 1);
});

test('the coach\'s earlier pick between two times is kept on a re-paste, not flipped back to the faster', () => {
  const first = plan([boys]);
  const state = applied(first);
  const kai = boys.athletes.find((a) => a.cells.some((c) => c.alternatives));
  const cell = kai.cells.find((c) => c.alternatives);
  const slower = cell.alternatives.find((t) => t !== cell.time);
  // The coach had chosen the slower time last time.
  const kaiRow = first.athletes.find((a) => a.key === kai.key);
  const savedId = state.athletes.find((a) => a.name === kai.name).id;
  const raceId = state.races.find((r) => r.distance === cell.distance && r.name === boys.meets[cell.meet].name).id;
  const saved = state.results.find((r) => r.athleteId === savedId && r.raceId === raceId);
  saved.time = Number(slower.split(':')[0]) * 60 + Number(slower.split(':')[1]);
  const again = plan([boys], state);
  assert.equal(kaiRow.status, 'new');
  assert.equal(again.summary.changedResults, 0);
  assert.equal(again.preselect[`${kai.key}|${cell.meet}|${cell.distance}`], slower);
});

test('a result missing from the paste is reported, never deleted', () => {
  const state = applied(plan([boys]));
  const fewer = clone(boys);
  fewer.athletes[0].cells = [];
  const p = plan([fewer], state);
  assert.equal(p.summary.notInPaste, boys.athletes[0].cells.length);
  assert.equal(p.hasChanges, false);
});

test('a near name goes to review, and nothing is auto-created for it', () => {
  const state = applied(plan([boys]));
  const typo = clone(boys);
  const target = typo.athletes[0];
  const original = target.name;
  target.name = original.replace(/.$/, '') + 'x'; // one letter off
  const p = plan([typo], state);
  const row = p.athletes.find((a) => a.key === target.key);
  assert.equal(row.status, 'review');
  assert.equal(row.candidates[0].name, original);
  assert.equal(p.summary.needsReview, 1);
  assert.equal(p.summary.newAthletes, 0);
});

test('a confirmed spelling is remembered, and the next paste matches it without asking', () => {
  const state = applied(plan([boys]));
  const typo = clone(boys);
  const target = typo.athletes[0];
  const real = state.athletes.find((a) => a.name === boys.athletes[0].name);
  target.name = target.name.replace(/.$/, '') + 'x';
  const decided = plan([typo], state, { athletes: { [target.key]: { action: 'existing', athleteId: real.id } } });
  const row = decided.athletes.find((a) => a.key === target.key);
  assert.equal(row.status, 'existing');
  assert.equal(decided.writes.aliases.length, 1);
  assert.equal(decided.writes.aliases[0].athleteId, real.id);

  const afterAlias = applied(decided, state);
  const next = plan([typo], afterAlias);
  assert.equal(next.athletes.find((a) => a.key === target.key).matchedBy, 'alias');
  assert.equal(next.summary.needsReview, 0);
  assert.equal(next.hasChanges, false);
});

test('"add as new" is honoured even with a near match', () => {
  const state = applied(plan([boys]));
  const typo = clone(boys);
  const target = typo.athletes[0];
  target.name = target.name.replace(/.$/, '') + 'x';
  const p = plan([typo], state, { athletes: { [target.key]: { action: 'new' } } });
  assert.equal(p.athletes.find((a) => a.key === target.key).status, 'new');
  assert.equal(p.summary.newAthletes, 1);
});

test('same name, different class year: review. Same name twice: the grade breaks the tie', () => {
  const grid = { gender: 'Men', meets: [{ date: 'Sep 8', name: 'Test Meet' }], athletes: [{ key: 'Men:0', name: 'Sam Test', grade: 10, cells: [{ meet: 0, distance: '5000 Meters', time: '18:00.0', status: 'FINISHED' }] }] };
  const roster = (ids) => ({ ...emptyState(), athletes: ids.map(([id, gy]) => ({ id, name: 'Sam Test', preferredName: null, gender: 'M', graduationYear: gy, athleticAthleteId: null })) });
  // grade 10 in 2026 -> class of 2029
  assert.equal(plan([grid], roster([['a', 2027]])).athletes[0].status, 'review');
  const tie = plan([grid], roster([['a', 2027], ['b', 2029]]));
  assert.equal(tie.athletes[0].athleteId, 'b');
  assert.equal(tie.athletes[0].matchedBy, 'name+grade');
  assert.equal(plan([grid], roster([['a', 2027], ['b', 2028]])).athletes[0].status, 'review');
  assert.equal(plan([grid], roster([['a', 2029]])).athletes[0].status, 'existing');
});

test('a Boys paste that matches a girl on the roster goes to review', () => {
  const grid = { gender: 'Men', meets: [{ date: 'Sep 8', name: 'Test Meet' }], athletes: [{ key: 'Men:0', name: 'Pat Test', grade: 10, cells: [] }] };
  const state = { ...emptyState(), athletes: [{ id: 'g', name: 'Pat Test', preferredName: null, gender: 'F', graduationYear: 2029, athleticAthleteId: null }] };
  const row = plan([grid], state).athletes[0];
  assert.equal(row.status, 'review');
  assert.match(row.reviewReason, /Boys paste/);
});

test('an Athletic.net id from an HTML paste matches before the name, and backfills the athlete', () => {
  const grid = { gender: 'Men', meets: [{ date: 'Sep 8', name: 'Test Meet' }], athletes: [{ key: 'Men:0', name: 'Totally Different', grade: 10, athleticAthleteId: 'https://www.athletic.net/athlete/777/cross-country', cells: [] }] };
  const state = { ...emptyState(), athletes: [{ id: 'a', name: 'Sam Test', preferredName: null, gender: 'M', graduationYear: 2029, athleticAthleteId: 'https://www.athletic.net/CrossCountry/Athlete.aspx?AID=777' }] };
  const row = plan([grid], state).athletes[0];
  assert.equal(row.athleteId, 'a');
  assert.equal(row.matchedBy, 'id');
});

test('an athlete pasted for the first time gets their Athletic.net id from an HTML paste', () => {
  const grid = { gender: 'Men', meets: [{ date: 'Sep 8', name: 'Test Meet' }], athletes: [{ key: 'Men:0', name: 'Sam Test', grade: 10, athleticAthleteId: 'https://www.athletic.net/athlete/5/cross-country', cells: [] }] };
  const state = { ...emptyState(), athletes: [{ id: 'a', name: 'Sam Test', preferredName: null, gender: 'M', graduationYear: 2029, athleticAthleteId: null }] };
  const p = plan([grid], state);
  assert.deepEqual(p.writes.athleteUpdates, [{ athleteId: 'a', data: { athleticAthleteId: 'https://www.athletic.net/athlete/5/cross-country' } }]);
});

// ---- meets from the calendar import

const calendarMeet = (over = {}) => ({ id: 'cal-1', name: 'Reed Park Time Trial', date: new Date('2026-09-08T00:00:00Z'), athleticMeetId: '285237', ...over });
const oneMeetGrid = (name = 'Reed Park Time Trial', extra = {}) => ({
  gender: 'Men',
  meets: [{ date: 'Sep 8', name, ...extra }],
  athletes: [{ key: 'Men:0', name: 'Sam Test', grade: 10, cells: [{ meet: 0, distance: '1 Miles', time: '6:00.0', status: 'FINISHED' }] }],
});

test('a pasted meet matches a calendar meet by date and name, and its races inherit the Athletic.net id', () => {
  const p = plan([oneMeetGrid()], { ...emptyState(), meets: [calendarMeet()] });
  assert.equal(p.meets[0].status, 'existing');
  assert.equal(p.meets[0].meetId, 'cal-1');
  assert.equal(p.writes.races[0].meetId, 'cal-1');
  assert.equal(p.writes.races[0].athleticMeetId, '285237');
  assert.equal(p.summary.newMeets, 0);
});

test('punctuation and case do not stop a meet matching', () => {
  const p = plan([oneMeetGrid('reed park  time-trial')], { ...emptyState(), meets: [calendarMeet()] });
  assert.equal(p.meets[0].status, 'existing');
});

test('an HTML meet id matches even when the names differ', () => {
  const p = plan([oneMeetGrid('Something Else Entirely', { athleticMeetId: '285237' })], { ...emptyState(), meets: [calendarMeet({ date: new Date('2026-09-09T00:00:00Z') })] });
  assert.equal(p.meets[0].status, 'existing');
  assert.equal(p.meets[0].matchedBy, 'id');
});

test('a close name on the same date, or two meets on one date, goes to review; the coach decides', () => {
  const close = plan([oneMeetGrid('Reed Park Time Trial 2026')], { ...emptyState(), meets: [calendarMeet({ athleticMeetId: null })] });
  assert.equal(close.meets[0].status, 'review');
  const two = plan([oneMeetGrid('Reed Park XC')], { ...emptyState(), meets: [calendarMeet({ name: 'A' }), calendarMeet({ id: 'cal-2', name: 'B' })] });
  assert.equal(two.meets[0].status, 'review');
  const decided = plan([oneMeetGrid('Reed Park Time Trial 2026')], { ...emptyState(), meets: [calendarMeet({ athleticMeetId: null })] }, { meets: { [close.meets[0].key]: { action: 'existing', meetId: 'cal-1' } } });
  assert.equal(decided.meets[0].status, 'existing');
  const asNew = plan([oneMeetGrid('Reed Park Time Trial 2026')], { ...emptyState(), meets: [calendarMeet({ athleticMeetId: null })] }, { meets: { [close.meets[0].key]: { action: 'new' } } });
  assert.equal(asNew.meets[0].status, 'new');
});

test('a meet choice the coach made once holds on the next paste, because the races remember their meet', () => {
  const cal = calendarMeet({ athleticMeetId: null, name: 'Reed Park Time Trial 2026' });
  const first = plan([oneMeetGrid()], { ...emptyState(), meets: [cal] }, { meets: { '2026-09-08|reed park time trial': { action: 'existing', meetId: 'cal-1' } } });
  assert.equal(first.meets[0].status, 'existing');
  const state = applied(first, { ...emptyState(), meets: [cal] });
  assert.equal(state.races[0].meetId, 'cal-1');
  const second = plan([oneMeetGrid()], state);
  assert.equal(second.meets[0].status, 'existing');
  assert.equal(second.meets[0].matchedBy, 'race');
  assert.equal(second.summary.needsReview, 0);
});

test('a different meet on the same date is simply new', () => {
  const p = plan([oneMeetGrid('Harvest Classic')], { ...emptyState(), meets: [calendarMeet({ name: 'Zzz Dual' })] });
  assert.equal(p.meets[0].status, 'new');
});

test('races a scraper made earlier are reused and linked to the matched meet', () => {
  const oldRace = { id: 'r-old', name: 'Reed Park Time Trial', date: new Date('2026-09-08T00:00:00Z'), distance: '1 Miles', meetId: null };
  const p = plan([oneMeetGrid()], { ...emptyState(), meets: [calendarMeet()], races: [oldRace] });
  assert.equal(p.summary.newRaces, 0);
  assert.deepEqual(p.writes.linkRaces, [oldRace && p.writes.races[0].key]);
});

test('a meet id learned from the HTML is added to a calendar meet that had none', () => {
  const p = plan([oneMeetGrid('Reed Park Time Trial', { athleticMeetId: '285237' })], { ...emptyState(), meets: [calendarMeet({ athleticMeetId: null })] });
  assert.deepEqual(p.writes.meetIdBackfills, [{ meetId: 'cal-1', athleticMeetId: '285237' }]);
});

test('meets outside the season dates are refused', () => {
  const p = plan([oneMeetGrid()], emptyState(), {}, { seasonRange: { start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-12-01T00:00:00Z') } });
  assert.deepEqual(p.errors, ["These meets don't look like the 2026 season."]);
});

test('Boys and Girls pasted together share meets, and a one-gender paste works alone', () => {
  const girls = clone(oneMeetGrid());
  girls.gender = 'Women';
  girls.athletes = [{ key: 'Women:0', name: 'Ada Test', grade: 9, cells: [{ meet: 0, distance: '1 Miles', time: '7:00.0', status: 'FINISHED' }] }];
  const both = plan([oneMeetGrid(), girls]);
  assert.equal(both.summary.newMeets, 1);
  assert.equal(both.writes.races.length, 1);
  assert.equal(both.summary.newResults, 2);
  assert.equal(both.summary.newAthletes, 2);
  // Girls the next day: boys already there.
  const next = plan([girls], applied(plan([oneMeetGrid()])));
  assert.equal(next.summary.newMeets, 0);
  assert.equal(next.summary.newAthletes, 1);
  assert.equal(next.writes.races.filter((r) => !r.existingId).length, 0);
});

test('two pasted rows for the same athlete are flagged', () => {
  const grid = oneMeetGrid();
  grid.athletes.push({ ...clone(grid.athletes[0]), key: 'Men:1' });
  const state = { ...emptyState(), athletes: [{ id: 'a', name: 'Sam Test', preferredName: null, gender: 'M', graduationYear: 2029, athleticAthleteId: null }] };
  assert.match(plan([grid], state).errors[0], /same athlete/);
});

test('validatePasteBody and the small helpers', () => {
  assert.equal(validatePasteBody({ season: 2026, grids: [boys] }), null);
  assert.match(validatePasteBody({ season: 'x', grids: [boys] }), /season/i);
  assert.match(validatePasteBody({ season: 2026, grids: [] }), /Boys/);
  assert.match(validatePasteBody({ season: 2026, grids: [boys, boys] }), /once/);
  const badTime = clone(boys);
  badTime.athletes[0].cells[0].time = 'fast';
  assert.match(validatePasteBody({ season: 2026, grids: [badTime] }), /time/);
  assert.equal(pasteDate('Sep 8', 2026).toISOString(), '2026-09-08T00:00:00.000Z');
  assert.equal(pasteDate('Sept 8', 2026).toISOString(), '2026-09-08T00:00:00.000Z');
  assert.equal(pasteDate('Feb 30', 2026), null);
  assert.equal(isNearName('Sam Griffith', 'Samuel Griffith'), true);
  assert.equal(isNearName('Sam Griffith', 'Pat Hale'), false);
  assert.equal(namesAreClose('Sunfair Invitational', 'Sunfair Invitational 2026'), true);
});
