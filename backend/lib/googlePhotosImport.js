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

// '=d' is Google Photos' long-standing URL convention for the original,
// unmodified file rather than a resized rendition — see
// scrape_google_photos_album.js's header comment for why there's no more
// official way to ask for it.
async function downloadOriginal(baseUrl) {
  const response = await fetch(`${baseUrl}=d`);
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
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
        const originalBuffer = await module.exports.downloadOriginal(url);
        const sha256 = crypto.createHash('sha256').update(originalBuffer).digest('hex');
        const metadata = await sharp(originalBuffer).metadata();
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
          width: metadata.width,
          height: metadata.height,
        });
        if (result.duplicate) summary.duplicates += 1;
        else summary.imported += 1;
      } catch (error) {
        summary.failed += 1;
        summary.failedDetails.push(error.message);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, toImport.length) }, worker));

  return { ...summary, total: urls.length, truncated };
}

module.exports = { importGoogleAlbum, runAlbumScraper, downloadOriginal, validateGooglePhotosUrl, MAX_PHOTOS_PER_IMPORT };
