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

// A generous but bounded cap on how many NEW photos one run will actually
// import — protects against one run writing an unbounded number of R2
// objects for a truly enormous album, not against how long the run takes
// (it's a background job, polled — see routes/photos.js — so there's no
// request to time out). A photo already imported in an earlier run
// doesn't count against this: see importGoogleAlbum's own comment on why
// re-running the same import keeps making progress instead of getting
// stuck re-reporting the same first MAX_PHOTOS_PER_IMPORT urls as
// duplicates forever.
const MAX_PHOTOS_PER_IMPORT = 1000;
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
 *
 * Walks the album's urls in order, but — the actual fix for the real-world
 * bug report ("all 300 duplicates", never reaching the rest of a bigger
 * album) — only a genuinely NEW import counts against MAX_PHOTOS_PER_IMPORT.
 * A url that turns out to already be imported (from an earlier run) still
 * costs a re-download to re-confirm via sha256 — there's nothing cheaper to
 * check a bare url against — but doesn't spend any of this run's budget,
 * so the walk continues past it to whatever's actually new. That's what
 * makes re-running the same import on an album bigger than one run's cap
 * pick up the next batch, instead of forever re-attempting the same first
 * MAX_PHOTOS_PER_IMPORT urls and reporting them all as duplicates again.
 *
 * `onFound` and `onItemStatus` are optional progress hooks — the route
 * (routes/photos.js) uses them to drive lib/googlePhotosImportJobs.js so
 * the frontend can poll real per-photo progress instead of waiting on one
 * request for the whole album. Both default to no-ops so every existing
 * caller (and every test that calls this directly) is unaffected.
 * `onItemStatus(index, patch)` fires at least twice per photo — once with
 * `{ status: 'downloading' }` when its turn starts, once with its outcome
 * — `index` is its position in the album's own url list, stable for the
 * whole run (not every index up to `total` is necessarily reached: the run
 * stops once the import budget is spent or the album is exhausted).
 */
async function importGoogleAlbum(
  prisma,
  { teamId, meetId, albumUrl, uploadedById, onFound = () => {}, onItemStatus = () => {} },
) {
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

  onFound({ total: urls.length });
  const summary = { imported: 0, duplicates: 0, failed: 0, failedDetails: [] };

  let cursor = 0;
  let budget = MAX_PHOTOS_PER_IMPORT;
  async function worker() {
    while (budget > 0 && cursor < urls.length) {
      const index = cursor++;
      // Reserved optimistically, before any async work — with several
      // workers running concurrently, decrementing only after a result
      // comes back would let more than DOWNLOAD_CONCURRENCY run past the
      // cap in flight at once. Refunded below for a duplicate or a
      // failure, since neither actually spent a slot.
      budget -= 1;
      const url = urls[index];
      onItemStatus(index, { status: 'downloading' });
      // Tracked so a failure's message says which phase it happened in —
      // "download failed" (Google's side, or this server's network) reads
      // very differently from "upload failed" (R2's side: a credential,
      // bucket policy, or quota problem), and a bare error message like R2's
      // own "Access Denied" doesn't say which on its own.
      let phase = 'download';
      try {
        const { buffer: originalBuffer, width, height } = await module.exports.downloadOriginal(url, albumUrl);
        const sha256 = crypto.createHash('sha256').update(originalBuffer).digest('hex');

        phase = 'resize';
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

        phase = 'upload';
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
        if (result.duplicate) {
          // Refunded — an already-imported photo costs this run a
          // re-download but not a slot, which is the whole point.
          budget += 1;
          summary.duplicates += 1;
          onItemStatus(index, { status: 'duplicate', photoId: result.photoId });
        } else {
          summary.imported += 1;
          onItemStatus(index, { status: 'done', photoId: result.photoId });
        }
      } catch (error) {
        budget += 1; // wrote nothing, so it didn't spend a slot either
        summary.failed += 1;
        const message = `${phase} failed: ${error.message}`;
        summary.failedDetails.push(message);
        onItemStatus(index, { status: 'error', error: message });
        console.error(`Google Photos import: ${message} — ${url}`);
      }
    }
  }

  console.error(`Google Photos import: found ${urls.length} photo(s) in album.`);
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, urls.length) }, worker));
  const truncated = Math.max(0, urls.length - cursor);
  console.error(
    `Google Photos import: done — ${summary.imported} imported, ${summary.duplicates} duplicate, ${summary.failed} failed, ${truncated} not yet attempted.`,
  );

  return { ...summary, total: urls.length, truncated };
}

module.exports = { importGoogleAlbum, runAlbumScraper, downloadOriginal, validateGooglePhotosUrl, MAX_PHOTOS_PER_IMPORT };
