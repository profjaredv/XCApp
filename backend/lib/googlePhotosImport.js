// LeadPack Photos: import from a public Google Photos shared-album link
// (build spec doesn't cover this — added per direct request, after the
// feature went live, to cover photos a family or booster club already
// collected into a shared album rather than handing a coach the originals).
//
// There's no official API path for this: Google's Photos Library API needs
// OAuth as the album owner, and since 2025 only reads content the calling
// app itself created — it cannot read an arbitrary public album at all.
// scrape_google_photos_album.js (a real headless browser, since the share
// page is JS-rendered) is the only way in, same reasoning as this app's
// existing Athletic.net scrapers.
//
// Unlike a normal upload, the server has the original bytes in hand itself
// (it downloaded them), so it resizes with `sharp` (no browser canvas on
// the server) and uploads directly via lib/r2.js's putObject rather than
// handing out presigned URLs.

const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const sharp = require('sharp');
const photosAccess = require('./photosAccess');

// A generous but bounded cap — an album import is one synchronous HTTP
// request (see routes/photos.js), and there is no resumable job queue here
// yet. Re-running the same import is safe and cheap for whatever this
// skips: the hash dedupe check means every already-imported photo is
// skipped instantly on a second run.
const MAX_PHOTOS_PER_IMPORT = 300;
const DOWNLOAD_CONCURRENCY = 4;
// A big album can take several minutes just to finish scrolling into view
// in scrape_google_photos_album.js before any downloading even starts.
const SCRAPER_TIMEOUT_MS = 10 * 60 * 1000;

// Google Photos share links only ever come from these two hosts — checked
// before anything is handed to the scraper's headless browser so an
// authenticated coach can't point this server's browser at an arbitrary
// internal URL (an SSRF vector, not just a correctness check). Returns the
// normalized URL string, or null if it doesn't pass.
const ALLOWED_GOOGLE_PHOTOS_HOSTS = new Set(['photos.google.com', 'photos.app.goo.gl']);

function validateGooglePhotosUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_GOOGLE_PHOTOS_HOSTS.has(parsed.hostname)) return null;
  return parsed.toString();
}

function runAlbumScraper(albumUrl) {
  // Enforced here too, not just at the route — this is what actually
  // spawns the browser, so this is the real boundary against pointing it
  // at an arbitrary internal URL.
  const validated = validateGooglePhotosUrl(albumUrl);
  if (!validated) return Promise.reject(new Error('Not a public Google Photos share link.'));

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scrape_google_photos_album.js');
    const child = spawn('node', [scriptPath, '--url', validated]);
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Timed out loading that album — it may be unusually large, or the page never finished loading.'));
    }, SCRAPER_TIMEOUT_MS);

    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const lastLine = err.trim().split('\n').filter(Boolean).pop();
        return reject(new Error(lastLine || 'Could not read that album.'));
      }
      resolve(
        out
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      );
    });
  });
}

// A bare `fetch` with no headers reads as an obvious script to a CDN, and
// the first real-world test of this feature came back reporting success
// while writing nothing anywhere — the strong suspicion is that Google's
// '=d' (original-file) tier checks something an anonymous headless-browser
// page load satisfies by just being a browser (a Referer, a real
// User-Agent) that Node's bare fetch sends none of, even though the exact
// same account-less, cookie-less browser context successfully rendered
// thumbnails from the exact same page a moment earlier in
// scrape_google_photos_album.js. Sent here too, not proof the theory is
// right — but cheap, and the kind of thing that silently breaks scraping
// either way.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// A real meet photo is never this small; a blocked or placeholder response
// that still happens to decode as an image usually is. This is what turns
// "reported success, wrote nothing" into a loud, debuggable failure instead
// of silently importing garbage — which is exactly what shipped the first
// time, since nothing checked that the bytes downloaded were actually a
// real photo.
const MIN_VALID_DIMENSION_PX = 64;

async function fetchImageBytes(url, refererUrl) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Referer: refererUrl, Accept: 'image/*,*/*;q=0.8' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error('empty response body');
  return buffer;
}

/**
 * Downloads one photo at the best quality this scraping approach can
 * reliably get, returning both the bytes and their decoded dimensions (so
 * the caller never has to decode twice). Tries '=d' — Google Photos' own
 * long-standing convention for the original, unmodified file — first, and
 * falls back to a large sized rendition (`=w4096-h4096`, the same kind of
 * request the share page's own lightbox view uses, well above anything
 * this app needs for its own thumb/web derivatives) if '=d' comes back
 * empty, non-image, or suspiciously tiny.
 */
async function downloadOriginal(baseUrl, refererUrl) {
  const attempts = [`${baseUrl}=d`, `${baseUrl}=w4096-h4096`];
  let lastError = new Error('no attempt ran');
  for (const url of attempts) {
    try {
      const buffer = await fetchImageBytes(url, refererUrl);
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height || metadata.width < MIN_VALID_DIMENSION_PX || metadata.height < MIN_VALID_DIMENSION_PX) {
        throw new Error(`decoded as ${metadata.width ?? '?'}x${metadata.height ?? '?'}px — too small to be a real photo`);
      }
      return { buffer, width: metadata.width, height: metadata.height };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not download a usable image (${lastError.message}).`);
}

/**
 * Imports every photo in a public album into one meet. Per-photo failures
 * (a download that 404s, a file that isn't actually an image) don't abort
 * the batch — the same "one bad file doesn't sink 400 good ones" principle
 * as the regular upload pipeline's per-file retry.
 */
async function importGoogleAlbum(prisma, { teamId, meetId, albumUrl, uploadedById }) {
  const meet = await prisma.meet.findFirst({ where: { id: meetId, teamId } });
  if (!meet) {
    const err = new Error('Meet not found.');
    err.statusCode = 404;
    throw err;
  }

  // Routed through module.exports (not the bare function names) so tests
  // can stub either one by reassigning the exported property — the same
  // reason lib/r2.js's functions are always called as `r2.fn(...)` from
  // photosAccess.js, never destructured.
  const urls = await module.exports.runAlbumScraper(albumUrl);
  if (urls.length === 0) {
    throw new Error('No photos were found at that link — check that it is a public "Share" album link, not a private one.');
  }

  const toImport = urls.slice(0, MAX_PHOTOS_PER_IMPORT);
  const truncated = urls.length - toImport.length;
  const summary = { imported: 0, duplicates: 0, failed: 0, failedDetails: [] };

  let next = 0;
  async function worker() {
    while (next < toImport.length) {
      const url = toImport[next++];
      try {
        const { buffer: originalBuffer, width, height } = await module.exports.downloadOriginal(url, albumUrl);
        const sha256 = crypto.createHash('sha256').update(originalBuffer).digest('hex');
        const [thumbBuffer, webBuffer] = await Promise.all([
          sharp(originalBuffer)
            .rotate() // auto-orient from EXIF before resizing, same as a phone photo shot in portrait
            .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 70 })
            .toBuffer(),
          sharp(originalBuffer)
            .rotate()
            .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer(),
        ]);

        const result = await photosAccess.importReadyPhoto(prisma, {
          teamId,
          meetId,
          uploadedById,
          originalBuffer,
          thumbBuffer,
          webBuffer,
          sha256,
          width,
          height,
        });
        if (result.duplicate) summary.duplicates += 1;
        else summary.imported += 1;
      } catch (error) {
        summary.failed += 1;
        summary.failedDetails.push(error.message);
        console.error(`Google Photos import: failed on ${url}: ${error.message}`);
      }
    }
  }

  console.error(`Google Photos import: found ${urls.length} photo(s) in album, importing up to ${toImport.length}.`);
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, toImport.length) }, worker));
  console.error(
    `Google Photos import: done — ${summary.imported} imported, ${summary.duplicates} duplicate, ${summary.failed} failed.`,
  );

  return { ...summary, total: urls.length, truncated };
}

module.exports = { importGoogleAlbum, runAlbumScraper, downloadOriginal, validateGooglePhotosUrl, MAX_PHOTOS_PER_IMPORT };
