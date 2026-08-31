import { ActivityFileError, type ActivitySource, type ParseOutcome, type ParsedRun } from './types';
import { parseGpx, parseTcx } from './xml';
import { parseFit } from './fit';
import { parseAppleHealthExport } from './appleHealth';
import { parseGarminCsv } from './garminCsv';

export * from './types';
export { parseGpx, parseTcx } from './xml';
export { parseFit } from './fit';
export { parseAppleHealthExport } from './appleHealth';
export { parseGarminCsv } from './garminCsv';

// One entry point: hand it whatever the athlete dropped, get back runs.
//
// Everything here runs in the browser and nothing but the resulting
// summaries is ever posted. That is a size decision (a .fit is binary, an
// Apple Health export dwarfs the 1mb body limit) and a privacy one: the
// GPS trace, the heart-rate stream and every unrelated health record in
// the file stay on the athlete's device.

/** Files this large are a mistake, not a workout — a video renamed, or the
 *  wrong export entirely. Reading one into memory would take the tab down
 *  before any parser saw it. */
const MAX_FILE_BYTES = 600 * 1024 * 1024;

/** How many runs one import may carry. Four years of daily running is
 *  ~1,500; this leaves room without letting a pathological file allocate
 *  without bound. */
const MAX_RUNS = 5000;

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : '';
}

function emptyOutcome(source: ActivitySource, fileName: string): ParseOutcome {
  return { source, fileName, runs: [], ignoredNonRuns: 0, unreadable: 0 };
}

// A Strava bulk export is a zip of per-activity files plus an
// activities.csv index. Apple Health's export is a zip around one enormous
// export.xml. Both arrive as .zip, so the contents decide which it is.
async function parseZip(file: File): Promise<ParseOutcome> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const bytes = new Uint8Array(await file.arrayBuffer());

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new ActivityFileError('That zip could not be opened.');
  }

  const names = Object.keys(entries);

  // Apple Health: one export.xml, everything else is irrelevant.
  const appleXml = names.find((n) => /(^|\/)export\.xml$/i.test(n));
  if (appleXml) {
    const result = parseAppleHealthExport(strFromU8(entries[appleXml]));
    return { source: 'apple_health', fileName: file.name, ...result };
  }

  // Strava: activity files under activities/, in a mix of formats and
  // frequently gzipped individually inside the zip.
  const activityFiles = names.filter((n) => /\.(fit|gpx|tcx)(\.gz)?$/i.test(n));
  if (activityFiles.length === 0) {
    throw new ActivityFileError(
      'No activity files found in that zip. A Strava export has an activities folder; an Apple Health export has export.xml.'
    );
  }

  const runs: ParsedRun[] = [];
  let unreadable = 0;

  for (const name of activityFiles.slice(0, MAX_RUNS)) {
    try {
      let data = entries[name];
      let inner = name;

      if (/\.gz$/i.test(name)) {
        const { gunzipSync } = await import('fflate');
        data = gunzipSync(data);
        inner = name.replace(/\.gz$/i, '');
      }

      const ext = extensionOf(inner);
      let run: ParsedRun | null = null;

      if (ext === 'fit') {
        // The slice matters: fflate may hand back a view into a larger
        // shared buffer, and the FIT decoder reads the whole buffer.
        run = await parseFit(data.slice().buffer as ArrayBuffer);
      } else if (ext === 'gpx') {
        run = parseGpx(strFromU8(data), inner);
      } else if (ext === 'tcx') {
        run = parseTcx(strFromU8(data));
      }

      if (run) runs.push(run);
    } catch {
      // One corrupt activity out of a thousand must not fail the import.
      // It is counted so the preview can say so rather than quietly
      // shrinking the total.
      unreadable += 1;
    }
  }

  return {
    source: 'strava_export',
    fileName: file.name,
    runs,
    // Anything skipped inside a Strava export was a non-run activity file
    // or one the parser rejected by sport; both are already reflected in
    // runs.length, so only genuine read failures are reported here.
    ignoredNonRuns: Math.max(0, activityFiles.length - runs.length - unreadable),
    unreadable,
  };
}

export async function parseActivityFile(file: File): Promise<ParseOutcome> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ActivityFileError('That file is too large to read in the browser.');
  }

  const ext = extensionOf(file.name);

  if (ext === 'zip') return parseZip(file);

  if (ext === 'fit') {
    const run = await parseFit(await file.arrayBuffer());
    const outcome = emptyOutcome('file_fit', file.name);
    if (run) outcome.runs.push(run);
    else outcome.ignoredNonRuns = 1;
    return outcome;
  }

  if (ext === 'gpx') {
    const run = parseGpx(await file.text(), file.name);
    const outcome = emptyOutcome('file_gpx', file.name);
    if (run) outcome.runs.push(run);
    else outcome.unreadable = 1;
    return outcome;
  }

  if (ext === 'tcx') {
    const run = parseTcx(await file.text());
    const outcome = emptyOutcome('file_tcx', file.name);
    if (run) outcome.runs.push(run);
    else outcome.ignoredNonRuns = 1;
    return outcome;
  }

  if (ext === 'csv') {
    const result = parseGarminCsv(await file.text());
    return { source: 'garmin_csv', fileName: file.name, ...result };
  }

  if (ext === 'xml') {
    // An Apple Health export.xml the athlete unzipped themselves.
    const result = parseAppleHealthExport(await file.text());
    return { source: 'apple_health', fileName: file.name, ...result };
  }

  throw new ActivityFileError(
    `“.${ext || '?'}” is not a file type this can read. Try .fit, .gpx, .tcx, .csv, or a .zip export.`
  );
}

/** Runs sorted newest-first and capped, ready for the preview table. */
export function sortRuns(runs: ParsedRun[]): ParsedRun[] {
  return [...runs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export { MAX_RUNS };
