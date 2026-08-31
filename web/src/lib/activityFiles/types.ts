// One activity, reduced to what a training log actually needs.
//
// Everything in web/src/lib/activityFiles produces this shape and nothing
// else. The point is that the enormous, format-specific, occasionally
// gigabyte-sized input never travels: the browser reads the file, throws
// away the GPS trace, the per-second heart rate stream and the device
// metadata, and posts a few dozen bytes per run. The raw health file never
// leaves the athlete's device.

/** The subset of TrainingLogType an imported file may claim. A file cannot
 *  know a workout's intent, so `tempo` and `interval` (coach vocabulary)
 *  and `race` (which drives PRs and season bests, in Result) are never
 *  inferred — see backend lib/trainingLogImport.js. */
export type ImportedRunType = 'easy' | 'long' | 'other';

export type ActivitySource =
  | 'file_gpx'
  | 'file_tcx'
  | 'file_fit'
  | 'strava_export'
  | 'apple_health'
  | 'garmin_csv';

export interface ParsedRun {
  /** Stable within its source, so re-importing the same file is a no-op
   *  rather than a duplicate season. Derivation is per-format; see each
   *  parser. */
  externalId: string;
  /** The athlete's LOCAL calendar day, as YYYY-MM-DD. Derived here, in the
   *  browser, because only this device knows the athlete's timezone —
   *  nothing in the schema stores one. A 6am run in Denver belongs to that
   *  morning, not to the previous UTC day. */
  date: string;
  /** The precise instant, ISO-8601. Kept alongside `date` for ordering two
   *  runs on the same day. */
  startedAt: string | null;
  type: ImportedRunType;
  distanceMi: number | null;
  durationSec: number | null;
  avgHrBpm: number | null;
  elevationFt: number | null;
  notes: string | null;
}

export interface ParseOutcome {
  source: ActivitySource;
  fileName: string;
  runs: ParsedRun[];
  /** Activities the file contained but this import will not carry — a
   *  bike ride, a swim, a walk. Counted rather than dropped silently so
   *  the preview can say "18 runs, 40 other activities ignored" and the
   *  athlete knows nothing went missing by accident. */
  ignoredNonRuns: number;
  /** Entries the parser could not read at all. A non-zero count here is a
   *  bug report, not a normal outcome, so it is surfaced separately. */
  unreadable: number;
}

export class ActivityFileError extends Error {}
