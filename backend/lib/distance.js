// The one distance-string parser. There were four independent
// implementations before this (backend/utils/distanceParser.js,
// routes/multiSeasonTrends.js's parseDistanceMiles, calculationService
// Supabase.js's parseDistanceToMiles/normalizeDistanceMiles, plus this
// logic living inline in routes/teams.js) and they disagreed with each
// other: "5,000 Meters" parsed to 5 meters in one, 5 miles in another. This
// file replaces all of them — see test/distance.test.js for the fixture
// table proving it, built from this team's actual `SELECT distance, COUNT(*)
// FROM races GROUP BY distance` output plus every failure case documented
// in the red-team audit.
//
// Two bugs the old parsers had, avoided here on purpose:
//   1. Stopping at a comma in the number ("5,000" -> 5, not 5000). Fixed by
//      stripping commas before matching.
//   2. Detecting the unit with `.includes('k')` anywhere in the whole
//      string, which fires on a venue name or the word "track". Fixed by
//      requiring the unit to immediately follow the matched number, not by
//      scanning the string for a stray letter.

const MILE_IN_METERS = 1609.34;
const KILOMETER_IN_METERS = 1000;

/**
 * Parses a free-text distance string (as scraped from Athletic.net) into
 * meters. Returns null when it cannot parse with confidence — this never
 * guesses, and callers must treat null as "needs manual review", not as 0.
 */
function parseDistanceToMeters(distanceStr) {
  if (!distanceStr || typeof distanceStr !== 'string') return null;

  const cleaned = distanceStr.replace(/,/g, '');
  const match = cleaned.match(/(\d+\.?\d*)\s*(miles?|meters?|mi|km|k|m)\b/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2].toLowerCase();
  if (unit === 'k' || unit === 'km') return value * KILOMETER_IN_METERS;
  if (unit === 'mile' || unit === 'miles' || unit === 'mi') return value * MILE_IN_METERS;
  if (unit === 'meter' || unit === 'meters' || unit === 'm') return value;

  return null;
}

/** Convenience wrapper — meters to miles, for callers that work in miles. */
function metersToMiles(meters) {
  return typeof meters === 'number' && meters > 0 ? meters / MILE_IN_METERS : null;
}

/**
 * Parses a distance string directly to miles. Prefer parseDistanceToMeters
 * + metersToMiles when a distanceMeters value might already be on hand
 * (e.g. Race.distanceMeters) — this exists only for callers that never
 * have a numeric value to fall back on.
 */
function parseDistanceToMiles(distanceStr) {
  return metersToMiles(parseDistanceToMeters(distanceStr));
}

module.exports = { parseDistanceToMeters, parseDistanceToMiles, metersToMiles, MILE_IN_METERS };
