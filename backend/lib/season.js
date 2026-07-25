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
};
