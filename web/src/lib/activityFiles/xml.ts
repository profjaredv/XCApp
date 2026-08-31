import { XMLParser } from 'fast-xml-parser';
import { ActivityFileError, type ParsedRun } from './types';
import { inferType, localDayOf, metersToFeet, metersToMiles } from './units';

// GPX and TCX. Both are XML, both are what a watch or a platform export
// hands you per activity, and both describe exactly one run per file.
//
// fast-xml-parser rather than the browser's own DOMParser: it runs
// unchanged in Node, which means these are plain functions with unit tests
// instead of something only reachable through a headless browser.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Element names differ only by namespace prefix across exporters
  // (`gpxtpx:hr` from Garmin, `ns3:hr` from others). Stripping the prefix
  // means one lookup handles both instead of a growing list of aliases.
  removeNSPrefix: true,
  parseAttributeValue: true,
});

type XmlNode = Record<string, unknown>;

// fast-xml-parser collapses a single child to an object and repeats to an
// array, so every child lookup has to handle both shapes.
function asNodes(value: unknown): XmlNode[] {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item): item is XmlNode => typeof item === 'object' && item !== null);
}

function numberOrNull(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseInstant(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Haversine. A GPX track carries no distance field — only points — so the
// only way to get mileage out of one is to measure it.
function haversineMeters(
  aLat: number, aLon: number, bLat: number, bLon: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface TrackPoint {
  lat: number | null;
  lon: number | null;
  time: Date | null;
  elevationM: number | null;
  hr: number | null;
}

function summarizePoints(points: TrackPoint[]) {
  let meters = 0;
  let gainM = 0;
  let hrSum = 0;
  let hrCount = 0;
  let prev: TrackPoint | null = null;

  for (const point of points) {
    if (point.hr !== null) {
      hrSum += point.hr;
      hrCount += 1;
    }
    if (prev) {
      if (
        prev.lat !== null && prev.lon !== null &&
        point.lat !== null && point.lon !== null
      ) {
        meters += haversineMeters(prev.lat, prev.lon, point.lat, point.lon);
      }
      if (prev.elevationM !== null && point.elevationM !== null) {
        const climb = point.elevationM - prev.elevationM;
        // Only positive change counts, and only above a metre — GPS
        // altitude jitters by tens of centimetres while standing still,
        // and summing that noise reports hundreds of feet of climb on a
        // flat track workout.
        if (climb > 1) gainM += climb;
      }
    }
    prev = point;
  }

  const timed = points.filter((p) => p.time !== null).map((p) => p.time as Date);
  const first = timed.length ? timed[0] : null;
  const last = timed.length ? timed[timed.length - 1] : null;

  return {
    meters,
    gainM,
    avgHr: hrCount ? Math.round(hrSum / hrCount) : null,
    first,
    last,
  };
}

function buildRun(args: {
  externalId: string;
  startedAt: Date;
  durationSec: number | null;
  distanceMeters: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  notes: string | null;
}): ParsedRun {
  const distanceMi = args.distanceMeters !== null && args.distanceMeters > 0
    ? metersToMiles(args.distanceMeters)
    : null;
  return {
    externalId: args.externalId,
    date: localDayOf(args.startedAt),
    startedAt: args.startedAt.toISOString(),
    type: inferType(distanceMi),
    distanceMi,
    durationSec: args.durationSec,
    avgHrBpm: args.avgHr,
    elevationFt: args.elevationGainM !== null ? metersToFeet(args.elevationGainM) : null,
    notes: args.notes,
  };
}

/** Parse a .gpx file. Returns one run, or null when the file has no
 *  timestamped track (a route someone drew on a map, not a run). */
export function parseGpx(xml: string, idHint: string): ParsedRun | null {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new ActivityFileError('That GPX file could not be read.');
  }

  const gpx = asNodes(doc.gpx)[0];
  if (!gpx) throw new ActivityFileError('That does not look like a GPX file.');

  const tracks = asNodes(gpx.trk);
  const points: TrackPoint[] = [];
  let name: string | null = null;

  for (const track of tracks) {
    if (!name && typeof track.name === 'string') name = track.name;
    for (const segment of asNodes(track.trkseg)) {
      for (const raw of asNodes(segment.trkpt)) {
        const ext = asNodes(raw.extensions)[0];
        const tpx = asNodes(ext?.TrackPointExtension)[0];
        points.push({
          lat: numberOrNull(raw['@_lat']),
          lon: numberOrNull(raw['@_lon']),
          time: parseInstant(raw.time),
          elevationM: numberOrNull(raw.ele),
          hr: numberOrNull(tpx?.hr ?? ext?.hr),
        });
      }
    }
  }

  if (points.length === 0) return null;

  const summary = summarizePoints(points);
  // No timestamps means this is a planned route, not a completed run.
  // Importing it would invent a training day that never happened.
  if (!summary.first) return null;

  const durationSec = summary.last
    ? Math.round((summary.last.getTime() - summary.first.getTime()) / 1000)
    : null;

  return buildRun({
    // The first trackpoint's instant is what every exporter agrees on and
    // survives a re-download, which is exactly what dedupe needs. The file
    // name is not: Strava names the same activity differently across
    // exports.
    externalId: `gpx:${summary.first.toISOString()}`,
    startedAt: summary.first,
    durationSec: durationSec && durationSec > 0 ? durationSec : null,
    distanceMeters: summary.meters,
    elevationGainM: summary.gainM,
    avgHr: summary.avgHr,
    notes: name && name !== idHint ? name : null,
  });
}

/** Parse a .tcx file. TCX carries its own distance and duration totals, so
 *  unlike GPX nothing has to be measured from the trace. */
export function parseTcx(xml: string): ParsedRun | null {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new ActivityFileError('That TCX file could not be read.');
  }

  const root = asNodes(doc.TrainingCenterDatabase)[0];
  if (!root) throw new ActivityFileError('That does not look like a TCX file.');

  const activities = asNodes(root.Activities)[0];
  const activity = asNodes(activities?.Activity)[0];
  if (!activity) return null;

  const sport = activity['@_Sport'];
  // TCX names its sport explicitly, so an obvious ride or swim can be
  // rejected here rather than imported as running mileage.
  if (typeof sport === 'string' && sport && !/running|other/i.test(sport)) return null;

  const startedAt = parseInstant(activity.Id);
  if (!startedAt) return null;

  let meters = 0;
  let seconds = 0;
  let hrSum = 0;
  let hrCount = 0;

  for (const lap of asNodes(activity.Lap)) {
    meters += numberOrNull(lap.DistanceMeters) ?? 0;
    seconds += numberOrNull(lap.TotalTimeSeconds) ?? 0;
    const hr = asNodes(lap.AverageHeartRateBpm)[0]?.Value;
    const value = numberOrNull(hr);
    if (value !== null) {
      hrSum += value;
      hrCount += 1;
    }
  }

  return buildRun({
    externalId: `tcx:${startedAt.toISOString()}`,
    startedAt,
    durationSec: seconds > 0 ? Math.round(seconds) : null,
    distanceMeters: meters > 0 ? meters : null,
    elevationGainM: null,
    avgHr: hrCount ? Math.round(hrSum / hrCount) : null,
    notes: null,
  });
}
