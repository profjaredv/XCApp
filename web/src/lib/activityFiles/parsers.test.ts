import { describe, it, expect } from 'vitest';
import { parseGpx, parseTcx } from './xml';
import { parseAppleHealthExport } from './appleHealth';
import { parseGarminCsv } from './garminCsv';
import { inferType, localDayOf, looksLikeRun, metersToMiles } from './units';

// These parsers decide what mileage a coach eventually sees, from files
// nobody in this codebase controls. The cases below are the ones that
// silently produce wrong numbers rather than obvious errors: timezone
// edges, unit mix-ups, a bike ride labelled as a workout, GPS altitude
// jitter reported as climb.

describe('units', () => {
  it('converts metres to miles at display resolution', () => {
    expect(metersToMiles(1609.344)).toBe(1);
    expect(metersToMiles(5000)).toBe(3.11);
  });

  it('only calls a run long on distance, never guesses intent', () => {
    expect(inferType(3)).toBe('easy');
    expect(inferType(8)).toBe('long');
    expect(inferType(null)).toBe('other');
    // Nothing may infer these — see backend lib/trainingLogImport.js.
    expect(['easy', 'long', 'other']).toContain(inferType(26.2));
  });

  it('treats an unrecognised activity label as not-a-run', () => {
    // A ride imported as a run puts phantom miles in a team total; a run
    // skipped costs one line the athlete re-adds. So the doubt resolves
    // toward skipping.
    expect(looksLikeRun('Running')).toBe(true);
    expect(looksLikeRun('Trail Running')).toBe(true);
    expect(looksLikeRun('Treadmill Running')).toBe(true);
    expect(looksLikeRun('Cycling')).toBe(false);
    expect(looksLikeRun('Open Water Swim')).toBe(false);
    expect(looksLikeRun('Pickleball')).toBe(false);
    expect(looksLikeRun('')).toBe(false);
    expect(looksLikeRun(null)).toBe(false);
  });

  it('reads the local calendar day, not the UTC one', () => {
    // The bug this prevents: a 6am run west of UTC landing on the
    // previous day for the whole of North America.
    const morning = new Date(2026, 7, 30, 6, 2, 0);
    expect(localDayOf(morning)).toBe('2026-08-30');
    const lateEvening = new Date(2026, 7, 30, 23, 45, 0);
    expect(localDayOf(lateEvening)).toBe('2026-08-30');
  });
});

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Morning Run</name><trkseg>
    <trkpt lat="39.7392" lon="-104.9903"><ele>1600.0</ele><time>2026-08-30T12:02:00Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
    </trkpt>
    <trkpt lat="39.7492" lon="-104.9903"><ele>1604.0</ele><time>2026-08-30T12:08:00Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
    </trkpt>
    <trkpt lat="39.7592" lon="-104.9903"><ele>1604.2</ele><time>2026-08-30T12:14:00Z</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>160</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
    </trkpt>
  </trkseg></trk>
</gpx>`;

describe('parseGpx', () => {
  it('measures distance from the trace and averages heart rate', () => {
    const run = parseGpx(GPX, 'run.gpx');
    expect(run).not.toBeNull();
    // ~2.22km of north-south travel.
    expect(run!.distanceMi).toBeGreaterThan(1.3);
    expect(run!.distanceMi).toBeLessThan(1.45);
    expect(run!.durationSec).toBe(720);
    expect(run!.avgHrBpm).toBe(150);
    expect(run!.notes).toBe('Morning Run');
  });

  it('keys the external id on the first trackpoint, not the file name', () => {
    // The same activity re-downloaded gets a different file name from
    // Strava but the identical first timestamp — which is what makes
    // re-import a no-op.
    const a = parseGpx(GPX, 'run.gpx');
    const b = parseGpx(GPX, 'activities_9912345.gpx');
    expect(a!.externalId).toBe(b!.externalId);
    expect(a!.externalId).toBe('gpx:2026-08-30T12:02:00.000Z');
  });

  it('ignores sub-metre elevation jitter instead of reporting it as climb', () => {
    // The trace above gains 4m then 0.2m. Only the real climb counts, or
    // a flat track workout reports hundreds of feet of gain.
    const run = parseGpx(GPX, 'run.gpx');
    expect(run!.elevationFt).toBe(13);
  });

  it('returns null for a drawn route with no timestamps', () => {
    const route = `<?xml version="1.0"?><gpx><trk><trkseg>
      <trkpt lat="39.7" lon="-104.9"></trkpt>
      <trkpt lat="39.8" lon="-104.9"></trkpt>
    </trkseg></trk></gpx>`;
    // A planned route is not a completed run; importing it would invent a
    // training day.
    expect(parseGpx(route, 'route.gpx')).toBeNull();
  });

  it('rejects a file that is not GPX at all', () => {
    expect(() => parseGpx('<html><body>404</body></html>', 'x.gpx')).toThrow();
  });
});

const TCX = `<?xml version="1.0"?>
<TrainingCenterDatabase><Activities><Activity Sport="Running">
  <Id>2026-08-30T12:02:00Z</Id>
  <Lap><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters>
    <AverageHeartRateBpm><Value>155</Value></AverageHeartRateBpm></Lap>
  <Lap><TotalTimeSeconds>900</TotalTimeSeconds><DistanceMeters>2500</DistanceMeters>
    <AverageHeartRateBpm><Value>165</Value></AverageHeartRateBpm></Lap>
</Activity></Activities></TrainingCenterDatabase>`;

describe('parseTcx', () => {
  it('sums laps rather than reading only the first', () => {
    const run = parseTcx(TCX);
    expect(run!.distanceMi).toBe(metersToMiles(7500));
    expect(run!.durationSec).toBe(2700);
    expect(run!.avgHrBpm).toBe(160);
  });

  it('skips a ride', () => {
    expect(parseTcx(TCX.replace('Sport="Running"', 'Sport="Biking"'))).toBeNull();
  });
});

const APPLE = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_US">
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="42.5" durationUnit="min"
    totalDistance="5.6" totalDistanceUnit="mi" sourceName="Apple Watch"
    startDate="2026-08-30 06:02:11 -0600" endDate="2026-08-30 06:44:41 -0600"/>
  <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60" durationUnit="min"
    totalDistance="18" totalDistanceUnit="mi" sourceName="Apple Watch"
    startDate="2026-08-29 07:00:00 -0600" endDate="2026-08-29 08:00:00 -0600"/>
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min"
    totalDistance="6.5" totalDistanceUnit="km" sourceName="Strava"
    startDate="2026-08-28 17:30:00 -0600" endDate="2026-08-28 18:00:00 -0600"/>
  <Record type="HKQuantityTypeIdentifierHeartRate" value="72"/>
</HealthData>`;

describe('parseAppleHealthExport', () => {
  it('takes runs and counts the rest instead of dropping them silently', () => {
    const { runs, ignoredNonRuns } = parseAppleHealthExport(APPLE);
    expect(runs).toHaveLength(2);
    expect(ignoredNonRuns).toBe(1);
  });

  it('honours the offset in the timestamp for the local day', () => {
    // 06:02 -0600 is 12:02Z. The athlete's day is the 30th; reading it as
    // UTC would still say the 30th here, but the offset is what makes an
    // evening run not roll to tomorrow.
    const { runs } = parseAppleHealthExport(APPLE);
    expect(runs[0].date).toBe('2026-08-30');
    expect(runs[0].startedAt).toBe('2026-08-30T12:02:11.000Z');
  });

  it('converts kilometres and minutes rather than trusting the number', () => {
    const { runs } = parseAppleHealthExport(APPLE);
    expect(runs[0].distanceMi).toBe(5.6);
    expect(runs[0].durationSec).toBe(2550);
    expect(runs[1].distanceMi).toBe(4.04);
    expect(runs[1].durationSec).toBe(1800);
  });

  it('keys on source as well as time so two apps recording one run both survive', () => {
    const { runs } = parseAppleHealthExport(APPLE);
    expect(runs[0].externalId).toContain('Apple Watch');
    expect(runs[1].externalId).toContain('Strava');
  });

  it('rejects a file that is not a Health export', () => {
    expect(() => parseAppleHealthExport('<gpx></gpx>')).toThrow(/Apple Health/);
  });
});

const GARMIN_CSV = [
  'Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Total Ascent',
  '"Running","2026-08-30 06:02:11",false,"Morning Run","6.21","640","48:12","152","210"',
  '"Cycling","2026-08-29 07:00:00",false,"Ride","18.00","500","1:02:00","130","900"',
  '"Running","2026-08-28 17:30:00",false,"Easy, with strides","1,004.00","90","10:00","--","--"',
  '"Treadmill Running","2026-08-27 06:00:00",false,"Shakeout","3.10","300","25:00","140","0"',
].join('\n');

describe('parseGarminCsv', () => {
  it('reads runs and skips other sports', () => {
    const { runs, ignoredNonRuns } = parseGarminCsv(GARMIN_CSV);
    expect(runs).toHaveLength(3);
    expect(ignoredNonRuns).toBe(1);
  });

  it('handles quoted commas, thousands separators and Garmin’s empty cell', () => {
    const { runs } = parseGarminCsv(GARMIN_CSV);
    const withComma = runs.find((r) => r.notes === 'Easy, with strides');
    expect(withComma).toBeDefined();
    expect(withComma!.distanceMi).toBe(1004);
    // "--" must not become 0 — a zero heart rate reads as real data.
    expect(withComma!.avgHrBpm).toBeNull();
    expect(withComma!.elevationFt).toBeNull();
  });

  it('parses h:mm:ss and mm:ss durations', () => {
    const { runs } = parseGarminCsv(GARMIN_CSV);
    expect(runs[0].durationSec).toBe(2892);
    expect(runs[2].durationSec).toBe(1500);
  });

  it('refuses a CSV that is not an activity export', () => {
    expect(() => parseGarminCsv('Name,Time\nJack,18:02')).toThrow(/Activity Type/);
  });
});
