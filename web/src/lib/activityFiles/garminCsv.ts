import { ActivityFileError, type ParsedRun } from './types';
import { inferType, localDayOf, looksLikeRun } from './units';

// Garmin Connect's "Export CSV" from the Activities list. Not a rich
// format — no GPS, no per-sample data — but it is the one export a Garmin
// user can produce in two clicks without waiting on an email, and it
// covers years of history in a single small file.
//
// Its quirks are the whole difficulty: numbers carry thousands separators
// ("1,234"), durations are "h:mm:ss" or "mm:ss", empty cells are the
// literal string "--", and the column set differs by locale and by which
// sport the list was filtered to.

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      // A doubled quote inside a quoted cell is a literal quote.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

// "--" is Garmin's empty cell. Treating it as 0 would report a run with no
// distance as a zero-mile run, which is worse than reporting nothing.
function cleanNumber(value: string | undefined): number | null {
  if (!value || value === '--') return null;
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseDuration(value: string | undefined): number | null {
  if (!value || value === '--') return null;
  const parts = value.split(':').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
  return null;
}

function headerIndex(header: string[], candidates: string[]): number {
  const lower = header.map((h) => h.toLowerCase());
  for (const candidate of candidates) {
    const index = lower.indexOf(candidate);
    if (index !== -1) return index;
  }
  return -1;
}

export function parseGarminCsv(text: string): {
  runs: ParsedRun[];
  ignoredNonRuns: number;
  unreadable: number;
} {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new ActivityFileError('That CSV has no activity rows.');

  const header = splitCsvLine(lines[0]);
  const iType = headerIndex(header, ['activity type']);
  const iDate = headerIndex(header, ['date']);
  const iTitle = headerIndex(header, ['title']);
  const iDistance = headerIndex(header, ['distance']);
  const iTime = headerIndex(header, ['time', 'moving time', 'elapsed time']);
  const iHr = headerIndex(header, ['avg hr', 'average hr']);
  const iElev = headerIndex(header, ['total ascent', 'elev gain']);

  if (iDate === -1 || iType === -1) {
    throw new ActivityFileError(
      'That CSV is missing a Date or Activity Type column — export it from Garmin Connect’s Activities list.'
    );
  }

  const runs: ParsedRun[] = [];
  let ignoredNonRuns = 0;
  let unreadable = 0;

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);

    if (!looksLikeRun(cells[iType])) {
      ignoredNonRuns += 1;
      continue;
    }

    // Garmin writes the activity's local time with no offset, which is
    // exactly what we want: the athlete's own clock, read back in their
    // own timezone.
    const startedAt = new Date(cells[iDate]?.replace(' ', 'T') ?? '');
    if (Number.isNaN(startedAt.getTime())) {
      unreadable += 1;
      continue;
    }

    const distanceMi = cleanNumber(cells[iDistance]);
    const durationSec = parseDuration(cells[iTime]);
    if (distanceMi === null && durationSec === null) {
      unreadable += 1;
      continue;
    }

    const title = cells[iTitle];
    const hr = cleanNumber(cells[iHr]);
    const elev = cleanNumber(cells[iElev]);

    runs.push({
      // The CSV carries no activity id, so the local start instant is the
      // only stable handle. It is unique per athlete in practice — two
      // runs cannot start in the same second on one watch.
      externalId: `garmincsv:${startedAt.toISOString()}`,
      date: localDayOf(startedAt),
      startedAt: startedAt.toISOString(),
      type: inferType(distanceMi),
      distanceMi,
      durationSec,
      avgHrBpm: hr !== null ? Math.round(hr) : null,
      elevationFt: elev !== null ? Math.round(elev) : null,
      notes: title && title !== '--' ? title.slice(0, 200) : null,
    });
  }

  return { runs, ignoredNonRuns, unreadable };
}
