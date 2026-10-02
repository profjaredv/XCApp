// Minimal EXIF capture-time reader — build spec's upload pipeline step 1:
// "the browser... reads the capture time and dimensions from EXIF." Only
// reads what Load needs (DateTimeOriginal, falling back to DateTime) from
// a JPEG's APP1/Exif segment; never throws — a photo with no or malformed
// EXIF just gets no `takenAt`, falling back server-side to the upload
// time, which is a fine default for a photo exported from RAW within the
// same day of the meet (this app's only supported source, per the build
// spec's "Decisions": "Originals are JPEGs exported from RAW").

const EXIF_DATE_TAG = 0x9003; // DateTimeOriginal
const EXIF_DATE_FALLBACK_TAG = 0x0132; // DateTime

function readUint16(view: DataView, offset: number, little: boolean): number {
  return view.getUint16(offset, little);
}
function readUint32(view: DataView, offset: number, little: boolean): number {
  return view.getUint32(offset, little);
}

/** "YYYY:MM:DD HH:MM:SS" (EXIF's own format, always local/camera time) → ISO. */
function exifDateToIso(raw: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function findExifDate(buffer: ArrayBuffer): string | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || readUint16(view, 0, false) !== 0xffd8) return null; // not a JPEG

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = readUint16(view, offset, false);
    if (marker === 0xffd9 || marker === 0xffda) break; // EOI / start of scan — no more markers
    const segmentLength = readUint16(view, offset + 2, false);
    if (marker === 0xffe1) {
      // APP1 — check for the "Exif\0\0" header
      const tiffStart = offset + 4 + 6;
      if (
        readUint32(view, offset + 4, false) === 0x45786966 && // "Exif"
        readUint16(view, offset + 8, false) === 0x0000
      ) {
        const date = parseTiff(view, tiffStart);
        if (date) return date;
      }
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function parseTiff(view: DataView, tiffStart: number): string | null {
  if (tiffStart + 8 > view.byteLength) return null;
  const byteOrder = readUint16(view, tiffStart, false);
  const little = byteOrder === 0x4949; // "II"
  if (!little && byteOrder !== 0x4d4d) return null; // not "II" or "MM"

  const ifd0Offset = tiffStart + readUint32(view, tiffStart + 4, little);
  const ifd0 = readIfd(view, tiffStart, ifd0Offset, little);

  // DateTime (0x0132) can live directly on IFD0.
  const fallback = ifd0.get(EXIF_DATE_FALLBACK_TAG);

  const exifIfdPointer = ifd0.get(0x8769); // ExifIFD tag
  if (exifIfdPointer !== undefined) {
    const exifIfd = readIfd(view, tiffStart, tiffStart + Number(exifIfdPointer), little);
    const primary = exifIfd.get(EXIF_DATE_TAG);
    if (typeof primary === 'string') {
      const iso = exifDateToIso(primary);
      if (iso) return iso;
    }
  }
  if (typeof fallback === 'string') return exifDateToIso(fallback);
  return null;
}

// Reads one IFD's entries, decoding only ASCII string values (type 2) —
// the only type DateTimeOriginal/DateTime ever use — and returning pointer
// tags (type 4, LONG) as numbers so parseTiff can follow the ExifIFD link.
function readIfd(view: DataView, tiffStart: number, ifdOffset: number, little: boolean): Map<number, string | number> {
  const out = new Map<number, string | number>();
  if (ifdOffset + 2 > view.byteLength) return out;
  const count = readUint16(view, ifdOffset, little);
  for (let i = 0; i < count; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = readUint16(view, entryOffset, little);
    const type = readUint16(view, entryOffset + 2, little);
    const numValues = readUint32(view, entryOffset + 4, little);

    if (type === 2) {
      // ASCII string. Inline if it fits in 4 bytes, else a pointer to it.
      const valueOffset = numValues <= 4 ? entryOffset + 8 : tiffStart + readUint32(view, entryOffset + 8, little);
      if (valueOffset + numValues <= view.byteLength) {
        const bytes = new Uint8Array(view.buffer, view.byteOffset + valueOffset, numValues);
        const str = new TextDecoder('ascii').decode(bytes).replace(/\0+$/, '');
        out.set(tag, str);
      }
    } else if (type === 4 && numValues === 1) {
      out.set(tag, readUint32(view, entryOffset + 8, little));
    }
  }
  return out;
}

export async function readCaptureTime(file: File): Promise<string | null> {
  try {
    // EXIF lives in the first few KB; reading the whole file just to find
    // it would be wasteful on a 5MB original.
    const head = await file.slice(0, 128 * 1024).arrayBuffer();
    return findExifDate(head);
  } catch {
    return null;
  }
}

export async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dims;
    } catch {
      // fall through to the <img> based approach below
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
