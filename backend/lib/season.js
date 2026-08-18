const prisma = require('./db');

// ---------------------------------------------------------------------------
// Season & eligibility domain rules.
//
// This module is the single source of truth for two questions that were
// previously answered ad-hoc (and inconsistently) in ~7 different route files:
//
//   1. "Which season is this team currently looking at?"
//   2. "What grade is this athlete in, in a given season?"
//
// Before this existed, every route defaulted to `new Date().getFullYear()`,
// which silently pointed the whole app at a season the team had no data for
// (import 2025, calendar rolls to 2026, every screen goes blank).
// ---------------------------------------------------------------------------

// Cross country is a fall sport: the "2025 season" runs Aug–Nov 2025. Before
// August, the most recent competitive season is still the previous calendar
// year, so the bare calendar year is the wrong default for half the year.
const XC_SEASON_START_MONTH = 7; // August, 0-indexed

const FIRST_HS_GRADE = 9;
const FINAL_HS_GRADE = 12;

function currentCalendarSeason(now = new Date()) {
  const year = now.getFullYear();
  return now.getMonth() >= XC_SEASON_START_MONTH ? year : year - 1;
}

// Grade is DERIVED, never stored as the athlete's identity. `graduationYear`
// is the stable fact about a runner; their grade is a function of that fact
// and whichever season you're asking about. Storing grade on the athlete (as
// this app used to) means the last import silently rewrites their grade for
// every other season they ever ran in.
//
// The academic-year offset matters here: a fall XC "season" year S is the
// start of school year (S, S+1), and a senior racing in that fall doesn't
// graduate until spring of S+1 — not spring of S. A grad-year athlete is
// therefore FINAL_HS_GRADE during season = graduationYear - 1, not season =
// graduationYear. Getting this wrong makes a currently-enrolled senior
// compute as already graduated for the entire season they're racing in.
function deriveGrade(graduationYear, season) {
  if (!Number.isFinite(graduationYear) || !Number.isFinite(season)) return null;
  return FINAL_HS_GRADE - (graduationYear - season - 1);
}

function deriveGraduationYear(grade, season) {
  const gradeNum = parseInt(grade, 10);
  if (!Number.isFinite(gradeNum) || !Number.isFinite(season)) return null;
  return season + 1 + (FINAL_HS_GRADE - gradeNum);
}

// "Is this athlete on the team during this season?" — i.e. grades 9-12.
// Seniors from last season fall out of the current roster naturally, without
// deleting anything: their results (and therefore all history, trends and PRs)
// are untouched.
function isEnrolled(graduationYear, season) {
  const grade = deriveGrade(graduationYear, season);
  return grade !== null && grade >= FIRST_HS_GRADE && grade <= FINAL_HS_GRADE;
}

function hasGraduated(graduationYear, season) {
  if (!Number.isFinite(graduationYear) || !Number.isFinite(season)) return false;
  return graduationYear <= season;
}

// Seasons this team actually has race data for, newest first.
async function listSeasonsWithData(teamId) {
  const races = await prisma.race.findMany({
    where: { teamId },
    select: { season: true },
    distinct: ['season'],
  });
  return races.map((r) => r.season).sort((a, b) => b - a);
}

// Resolve the season the app should show when the caller didn't name one.
//
// Order matters: an explicit coach choice beats an inferred one, and *any*
// season with real data beats the calendar. Falling through to the calendar
// year is the last resort, not the default.
async function resolveActiveSeason(teamId, requestedSeason) {
  const explicit = parseInt(requestedSeason, 10);
  if (Number.isFinite(explicit)) return explicit;

  const [team, activeSeasonRow, seasonsWithData] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId }, select: { currentSeason: true } }),
    prisma.season.findFirst({ where: { teamId, isActive: true }, select: { year: true } }),
    listSeasonsWithData(teamId),
  ]);

  const [latestWithData] = seasonsWithData;

  // Invariant: a team cannot be "on" a season older than its newest results.
  // Importing a back season used to drag the whole app backwards — import
  // 2025, then 2024, and every screen started defaulting to 2024. Current
  // season means "the season this team is running", so it can legitimately be
  // ahead of the data (a preseason), but never behind it.
  const notBehindData = (year) =>
    Number.isFinite(latestWithData) ? Math.max(year, latestWithData) : year;

  if (Number.isFinite(team?.currentSeason)) return notBehindData(team.currentSeason);
  if (Number.isFinite(activeSeasonRow?.year)) return notBehindData(activeSeasonRow.year);
  if (Number.isFinite(latestWithData)) return latestWithData;

  return currentCalendarSeason();
}

// Pure and DB-free on purpose — the Today page's own season-resolution
// decision, testable without a database. `today` is injectable for tests;
// callers should never pass it in production code.
//
// Order matters and mirrors resolveActiveSeason's own reasoning, but this
// answers a different question ("is a coach standing in the middle of a
// season today, right now") rather than "which season should data screens
// default to":
//   1. The Season flagged isActive.
//   2. Failing that, the Season whose startDate/endDate bracket today.
//   3. Failing that, the most recent Season by year.
// A resolved season only counts as "in season" if today actually falls
// within its dates — or, if it has no dates configured at all, isActive
// alone is trusted (a team that never bothered to set dates shouldn't be
// told they're off-season for having incomplete data entry).
function isTodayBracketed(season, today) {
  if (!season.startDate || !season.endDate) return false;
  return today >= new Date(season.startDate) && today <= new Date(season.endDate);
}

function pickTodaySeasonCandidate(seasons, today) {
  return seasons.find((s) => s.isActive) ?? seasons.find((s) => isTodayBracketed(s, today)) ?? seasons[0] ?? null;
}

function isInSeason(season, today) {
  if (!season) return false;
  if (isTodayBracketed(season, today)) return true;
  return Boolean(season.isActive && !season.startDate && !season.endDate);
}

// Which season "last season's summary" should describe when off-season:
// the resolved candidate itself if its dates have already lapsed, or —
// when the candidate is a future season set up early (isActive flipped
// ahead of the season actually starting, the exact state this app is in
// two weeks before a season begins) — the most recent PAST season
// instead, so "last season" doesn't describe a season with zero races yet.
function pickPastSeasonForSummary(seasons, candidate, today) {
  if (candidate?.endDate && new Date(candidate.endDate) < today) return candidate;
  return seasons.find((s) => s.year < (candidate?.year ?? Infinity)) ?? candidate ?? null;
}

async function buildSeasonSummary(teamId, season) {
  if (!season) return null;
  const [rosterCount, raceCount] = await Promise.all([
    prisma.seasonRoster.count({ where: { seasonId: season.id, isActive: true } }),
    prisma.race.count({ where: { teamId, season: season.year } }),
  ]);
  return { year: season.year, rosterCount, raceCount };
}

function serializeSeason(season) {
  if (!season) return null;
  return { id: season.id, year: season.year, isActive: season.isActive, startDate: season.startDate, endDate: season.endDate };
}

// GET /api/today's own season gate. Returns one of three states:
//   'none'       — this team has no Season rows at all (SetupChecklist territory).
//   'in-season'  — render the full Today page.
//   'off-season' — render last season's summary instead of an empty dashboard.
async function resolveTodaySeasonState(teamId, today = new Date()) {
  const seasons = await prisma.season.findMany({ where: { teamId }, orderBy: { year: 'desc' } });
  if (seasons.length === 0) {
    return { state: 'none', season: null, lastSeasonSummary: null };
  }

  const candidate = pickTodaySeasonCandidate(seasons, today);

  if (isInSeason(candidate, today)) {
    return { state: 'in-season', season: serializeSeason(candidate), lastSeasonSummary: null };
  }

  const pastSeason = pickPastSeasonForSummary(seasons, candidate, today);
  const lastSeasonSummary = await buildSeasonSummary(teamId, pastSeason);

  return { state: 'off-season', season: serializeSeason(candidate), lastSeasonSummary };
}

module.exports = {
  FIRST_HS_GRADE,
  FINAL_HS_GRADE,
  currentCalendarSeason,
  deriveGrade,
  deriveGraduationYear,
  isEnrolled,
  hasGraduated,
  listSeasonsWithData,
  resolveActiveSeason,
  resolveTodaySeasonState,
  // Exported for direct, DB-free unit testing of the decision logic.
  isTodayBracketed,
  pickTodaySeasonCandidate,
  isInSeason,
  pickPastSeasonForSummary,
};
