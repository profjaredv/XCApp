// Small client-side CSV parser for the Field Results upload dialog
// (FieldResultsPage.tsx) — it needs to read a pasted/uploaded CSV's header
// row to find the "Division" column and split rows by division *before*
// anything is sent to the server, so no backend dependency here. RFC4180-
// lite: quoted fields, embedded commas/newlines inside quotes, and ""
// escaping — everything the bookmarklet's own csvCell() produces, plus
// plain unquoted fields for a coach who hand-edits or pastes from a
// spreadsheet export.

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      endField();
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Last field/row, unless the text ended cleanly on a newline (already
  // flushed by endRow above and nothing left to add).
  if (field !== '' || row.length > 0) {
    endRow();
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** Parses CSV text into a header row + array of header-keyed row objects. */
export function parseCsv(text: string): ParsedCsv {
  const rawRows = parseCsvRows(text.trim());
  if (rawRows.length === 0) return { headers: [], rows: [] };

  const headers = rawRows[0];
  const rows = rawRows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    return obj;
  });

  return { headers, rows };
}

/** Re-serializes header-keyed row objects back into CSV text for a subset of columns. */
export function toCsv(headers: string[], rows: Record<string, string>[]): string {
  const csvCell = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(csvCell).join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => csvCell(row[h] ?? '')).join(','));
  });
  return lines.join('\n');
}
