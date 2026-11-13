// Which sport a request is about.
//
// One team runs two sports (docs/leadpack-track-field-handoff.md, Section
// 1): cross country and track & field share the roster of athletes and the
// staff, but each has its own seasons, and everything season-scoped
// (roster for the year, groups, practice plans, attendance, photos) hangs
// off one of those seasons. The client says which sport it is showing with
// an X-Sport header; anything else, including no header, is cross country,
// so every existing caller keeps behaving exactly as it did.
//
// The sport lives in AsyncLocalStorage rather than being threaded through
// every function: the question "which season is 2026?" is asked in dozens
// of places, several layers below the route, and each of them has to give
// the same answer for the same request.
const { AsyncLocalStorage } = require('node:async_hooks');

const SPORTS = ['XC', 'TRACK'];
const store = new AsyncLocalStorage();

function parseSport(value) {
  const upper = String(value || '').trim().toUpperCase();
  return SPORTS.includes(upper) ? upper : 'XC';
}

function sportMiddleware(req, res, next) {
  store.run({ sport: parseSport(req.get('x-sport')) }, next);
}

/** The sport of the request being handled; 'XC' outside a request. */
function currentSport() {
  const s = store.getStore();
  return s ? s.sport : 'XC';
}

/** Run fn as if the request were for this sport (tests, scripts, imports). */
function runWithSport(sport, fn) {
  return store.run({ sport: parseSport(sport) }, fn);
}

/**
 * The fall a season's school year started in. Cross country IS the fall.
 * Outdoor track is the spring after, so the 2026 track season belongs to the
 * school year that started in fall 2025. Grade and graduation year are
 * always worked out from the fall.
 */
function schoolYearStart(season, sport = currentSport()) {
  return sport === 'TRACK' ? season - 1 : season;
}

const SPORT_NAME = { XC: 'Cross Country', TRACK: 'Track & Field' };

module.exports = { SPORTS, SPORT_NAME, parseSport, sportMiddleware, currentSport, runWithSport, schoolYearStart };
