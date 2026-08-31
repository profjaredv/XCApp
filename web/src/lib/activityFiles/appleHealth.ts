import { ActivityFileError, type ParsedRun } from './types';
import { inferType, localDayOf, metersToMiles } from './units';

// Apple Health's "Export All Health Data" — a zip whose export.xml holds
// every heart-rate sample, step count and sleep record the phone has ever
// stored. Commonly 50MB, routinely far more.
//
// Which is why this is a scan, not a parse. Feeding the whole document to
// an XML parser would build a DOM of tens of millions of nodes and hang
// the tab. Workouts are a vanishingly small fraction of that file and
// every one is a self-closing-ish <Workout> element, so a regex walk over
// the text pulls them out in one pass with bounded memory and never
// materialises the samples at all.
//
// The corollary worth stating: nothing but the workout summaries is ever
// read, and none of the file leaves the device.

const WORKOUT_RE = /<Workout\b([^>]*)>/g;
const ATTR_RE = /(\w+)="([^"]*)"/g;

// The unit string is part of the attribute in newer exports
// (durationUnit="min"), and older ones omitted it. Both appear in the
// wild, so neither can be assumed.
function attrs(fragment: string): Record<string, string> {
  const out: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(fragment)) !== null) {
    out[match[1]] = match[2];
  }
  return out;
}

function toSeconds(value: string, unit: string | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  switch ((unit ?? 'min').toLowerCase()) {
    case 'sec':
    case 's':
      return Math.round(n);
    case 'hr':
    case 'h':
      return Math.round(n * 3600);
    case 'min':
    default:
      return Math.round(n * 60);
  }
}

function toMiles(value: string, unit: string | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  switch ((unit ?? 'mi').toLowerCase()) {
    case 'km':
      return metersToMiles(n * 1000);
    case 'm':
      return metersToMiles(n);
    case 'mi':
    default:
      return Math.round(n * 100) / 100;
  }
}

// Apple writes local time with an explicit offset ("2026-08-30 06:02:11
// -0600"), which Safari parses and other engines do not. Normalising to
// ISO makes it unambiguous everywhere — and the offset is exactly what
// tells us the athlete's local day.
function parseAppleDate(value: string | undefined): Date | null {
  if (!value) return null;
  const normalized = value.replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseAppleHealthExport(xml: string): {
  runs: ParsedRun[];
  ignoredNonRuns: number;
  unreadable: number;
} {
  if (!xml.includes('<HealthData')) {
    throw new ActivityFileError(
      'That does not look like an Apple Health export. Look for export.xml inside the zip.'
    );
  }

  const runs: ParsedRun[] = [];
  let ignoredNonRuns = 0;
  let unreadable = 0;

  let match: RegExpExecArray | null;
  WORKOUT_RE.lastIndex = 0;
  while ((match = WORKOUT_RE.exec(xml)) !== null) {
    const a = attrs(match[1]);
    const activityType = a.workoutActivityType ?? '';

    if (activityType !== 'HKWorkoutActivityTypeRunning') {
      ignoredNonRuns += 1;
      continue;
    }

    const startedAt = parseAppleDate(a.startDate);
    if (!startedAt) {
      unreadable += 1;
      continue;
    }

    const durationSec = a.duration ? toSeconds(a.duration, a.durationUnit) : null;
    const distanceMi = a.totalDistance ? toMiles(a.totalDistance, a.totalDistanceUnit) : null;

    if (durationSec === null && distanceMi === null) {
      unreadable += 1;
      continue;
    }

    runs.push({
      // sourceName distinguishes the same run recorded by two apps on one
      // phone (the watch and Strava both writing it), which would
      // otherwise collide on start time and lose one of them.
      externalId: `hk:${a.sourceName ?? 'unknown'}:${startedAt.toISOString()}`,
      date: localDayOf(startedAt),
      startedAt: startedAt.toISOString(),
      type: inferType(distanceMi),
      distanceMi,
      durationSec,
      avgHrBpm: null, // lives in a separate sample series, not on the element
      elevationFt: null,
      notes: null,
    });
  }

  return { runs, ignoredNonRuns, unreadable };
}
