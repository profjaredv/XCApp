import { ActivityFileError, type ParsedRun } from './types';
import { inferType, localDayOf, metersToFeet, metersToMiles } from './units';

// Garmin's FIT format — the native output of Garmin, Wahoo and COROS
// watches, and what a Strava bulk export contains for anything recorded on
// one. Binary, which is the whole reason parsing happens in the browser:
// there is no way to post this through express.json().
//
// The decoder is imported dynamically. It is ~200KB and most athletes will
// never drop a .fit file, so it must not sit in the main bundle.

interface FitSession {
  startTime?: Date;
  totalTimerTime?: number;
  totalElapsedTime?: number;
  totalDistance?: number;
  totalAscent?: number;
  avgHeartRate?: number;
  sport?: string;
  subSport?: string;
}

interface FitFileId {
  timeCreated?: Date;
  serialNumber?: number;
}

export async function parseFit(buffer: ArrayBuffer): Promise<ParsedRun | null> {
  const { Decoder, Stream } = await import('@garmin/fitsdk');

  const stream = Stream.fromArrayBuffer(buffer);
  if (!Decoder.isFIT(stream)) {
    throw new ActivityFileError('That does not look like a FIT file.');
  }

  const decoder = new Decoder(stream);
  if (!decoder.checkIntegrity()) {
    throw new ActivityFileError('That FIT file appears to be damaged.');
  }

  const { messages, errors } = decoder.read();
  if (errors.length > 0 && !messages?.sessionMesgs?.length) {
    throw new ActivityFileError('That FIT file could not be read.');
  }

  const session = (messages.sessionMesgs?.[0] ?? {}) as FitSession;
  const fileId = (messages.fileIdMesgs?.[0] ?? {}) as FitFileId;

  // FIT names its sport, so a ride or a swim is rejected here rather than
  // counted as running mileage.
  if (session.sport && !/running|generic/i.test(session.sport)) return null;

  const startTime = session.startTime ?? fileId.timeCreated;
  if (!(startTime instanceof Date) || Number.isNaN(startTime.getTime())) return null;

  // totalTimerTime excludes auto-pause; totalElapsedTime does not. Timer
  // time is what a runner means by "how long was the run" and what every
  // watch shows on the wrist, so prefer it.
  const durationRaw = session.totalTimerTime ?? session.totalElapsedTime ?? null;
  const durationSec = durationRaw !== null && durationRaw > 0 ? Math.round(durationRaw) : null;

  const meters = typeof session.totalDistance === 'number' && session.totalDistance > 0
    ? session.totalDistance
    : null;
  const distanceMi = meters !== null ? metersToMiles(meters) : null;

  // The serial number distinguishes two watches that happened to start a
  // run in the same second; time_created alone would collide. Both come
  // from the file header, so they survive a re-download unchanged.
  const serial = fileId.serialNumber ?? 'x';
  const created = fileId.timeCreated instanceof Date ? fileId.timeCreated : startTime;

  return {
    externalId: `fit:${serial}:${created.toISOString()}`,
    date: localDayOf(startTime),
    startedAt: startTime.toISOString(),
    type: inferType(distanceMi),
    distanceMi,
    durationSec,
    avgHrBpm:
      typeof session.avgHeartRate === 'number' && session.avgHeartRate > 0
        ? Math.round(session.avgHeartRate)
        : null,
    elevationFt:
      typeof session.totalAscent === 'number' && session.totalAscent >= 0
        ? metersToFeet(session.totalAscent)
        : null,
    notes: null,
  };
}
