const { chromium } = require('playwright');

// LeadPack Photos: import from a public Google Photos shared-album link.
// There is no public API for this — Google's Photos Library API requires
// OAuth as the album's own owner and, since 2025, is restricted to content
// the calling app itself created, so it cannot read an arbitrary shared
// album at all. Scraping the public share page is the only way in, the
// same reasoning (and the same tool) this codebase already uses for
// Athletic.net — see scrape_roster_playwright.js.
//
// Unlike that script, this one HAS been run against a real, live, public
// album from this dev sandbox (reachable once Chromium is pointed at the
// sandbox's own CA and launched with --ignore-certificate-errors for that
// one-off check — neither of which belongs in this file, since production
// has no intercepting proxy in front of it). That live run is what found
// the real bug fixed here: this used to only ever see the ~30 photos the
// virtualized grid had rendered as <img> DOM nodes, confirmed against a
// 188-photo album and matching a real user report of a 197-photo import
// stopping at 30. See collectEmbeddedPhotoUrls below for the fix.
//
// A share page is a JS-rendered gallery, not static HTML with the photo
// list embedded — a plain `fetch` of the page would see an empty shell, so
// this always needs a real rendered browser, unlike (say) a server-side
// HTML scrape.
//
// The visible <img> grid is virtualized (only photos currently scrolled
// into view exist as <img> DOM nodes), but — confirmed against a real
// 188-photo album — Google still ships the *full* photo list up front in
// the page's own hydration payload, long before any of it is scrolled
// into view. So rather than relying on scrolling to coax the grid into
// rendering every photo as an <img> (which plateaued at the first ~30
// photos' worth of DOM nodes no matter how far or how long this scrolled
// the real inner scroll container — not the window, which share pages
// don't scroll at all), this reads the complete set straight out of
// page.content() via a regex for the lh3.googleusercontent.com/pw/<id>
// shape (the "pw/" prefix is specific to shared-album photo content, as
// opposed to lh3.googleusercontent.com/a/<id> contributor avatar images,
// which also appear on the page and must not be swept in). Scrolling is
// kept as a secondary pass — cheap, and a safety net for an album large
// enough that Google paginates the rest in over the network rather than
// in the initial payload — but the HTML-embedded list is what actually
// finds every photo.

const NAV_TIMEOUT = 45000;
const IMAGE_SELECTOR_TIMEOUT = 20000;
const MAX_ATTEMPTS = 3;
const MAX_SCROLL_ITERATIONS = 400; // generous ceiling for a very large album
const SCROLL_SETTLE_MS = 700;
const SCROLL_STABLE_ROUNDS = 3; // consecutive no-growth rounds before calling it done

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function captureFailureDiagnostics(page, attempt) {
  try {
    const finalUrl = page.url();
    const title = await page.title().catch(() => '(could not read title)');
    let bodySnippet = '(could not read body)';
    try {
      bodySnippet = (await page.content()).replace(/\s+/g, ' ').trim().slice(0, 1500);
    } catch (_) {
      /* page may have been closed / navigated */
    }
    console.error(`--- google photos scrape failure diagnostics (attempt ${attempt}) ---`);
    console.error('final URL :', finalUrl);
    console.error('page title:', title);
    console.error('body[0..1500]:', bodySnippet);
    console.error('-----------------------------------------------------------');
  } catch (e) {
    console.error('Could not capture failure diagnostics:', e.message);
  }
}

// Every image URL Google Photos serves looks like
// https://lh3.googleusercontent.com/<opaque-token>=w200-h150-no — this
// strips the size suffix (everything from the first '=' on) so the same
// photo found at multiple rendered sizes collapses to one entry.
function baseUrlOf(src) {
  const match = /^(https:\/\/lh3\.googleusercontent\.com\/[^=\s"]+)/.exec(src);
  return match ? match[1] : null;
}

async function collectImageUrls(page) {
  const urls = await page.$$eval('img', (imgs) =>
    imgs.map((img) => img.src).filter((src) => src && src.includes('googleusercontent.com')),
  );
  return new Set(urls.map(baseUrlOf).filter(Boolean));
}

// The actual fix: the full album is already in the page's own HTML (its
// hydration payload), not just whatever the virtualized grid currently
// has rendered as <img> nodes — see the header comment. "/pw/" is the
// path Google Photos uses for shared-album photo content specifically;
// "/a/" (contributor avatars) and others must not match here.
const EMBEDDED_PHOTO_URL_RE = /https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+/g;

function extractEmbeddedPhotoUrlsFromHtml(html) {
  return new Set(html.match(EMBEDDED_PHOTO_URL_RE) || []);
}

async function collectEmbeddedPhotoUrls(page) {
  return extractEmbeddedPhotoUrlsFromHtml(await page.content());
}

// Finds whichever element actually owns the scroll — a share page's own
// <html>/<body> never scrolls; the gallery lives in an inner container
// (a <c-wiz> in current markup, but that's not a selector worth pinning
// to) that's the tallest scrollHeight-over-clientHeight element on the
// page.
async function scrollGalleryContainer(page) {
  await page.evaluate(() => {
    let best = null;
    for (const el of document.querySelectorAll('*')) {
      if (el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 200) {
        if (!best || el.scrollHeight > best.scrollHeight) best = el;
      }
    }
    if (best) {
      best.scrollTop = best.scrollHeight;
      best.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
  });
}

async function scrapeAlbumPhotoUrls(albumUrl) {
  console.error(`Starting Playwright Google Photos album scrape: ${albumUrl}`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1366, height: 900 },
      locale: 'en-US',
    });
    const page = await context.newPage();

    let loaded = false;
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        console.error(`Navigating (attempt ${attempt}/${MAX_ATTEMPTS}): ${albumUrl}`);
        await page.goto(albumUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        await page.waitForSelector('img[src*="googleusercontent.com"]', { timeout: IMAGE_SELECTOR_TIMEOUT });
        loaded = true;
        break;
      } catch (err) {
        lastError = err;
        console.error(`Attempt ${attempt} failed: ${err.message}`);
        await captureFailureDiagnostics(page, attempt);
        if (attempt < MAX_ATTEMPTS) {
          await page.waitForTimeout(2000 * attempt);
        }
      }
    }

    if (!loaded) {
      throw new Error(
        'No Google Photos content ever appeared — this is either not a public shared album, ' +
          'the link expired, or Google served something this scraper does not recognize (see ' +
          `diagnostics above). Last error: ${lastError && lastError.message}`,
      );
    }

    // Primary source: the full photo list already sitting in the page's
    // own HTML (see header comment) — this alone finds virtually the
    // whole album with no scrolling at all.
    const seen = new Set(await collectEmbeddedPhotoUrls(page));
    for (const url of await collectImageUrls(page)) seen.add(url);

    // Secondary pass: scroll the actual gallery container (not the
    // window — share pages don't scroll there) a bit further, re-reading
    // both sources each round, in case a very large album streams in the
    // rest over the network rather than shipping it all up front.
    // Stops once a few consecutive scrolls add nothing new, or the
    // safety ceiling is hit.
    let stableRounds = 0;
    for (let i = 0; i < MAX_SCROLL_ITERATIONS && stableRounds < SCROLL_STABLE_ROUNDS; i++) {
      await scrollGalleryContainer(page);
      await page.waitForTimeout(SCROLL_SETTLE_MS);
      const before = seen.size;
      for (const url of await collectEmbeddedPhotoUrls(page)) seen.add(url);
      for (const url of await collectImageUrls(page)) seen.add(url);
      stableRounds = seen.size === before ? stableRounds + 1 : 0;
    }

    console.error(`Finished scraping. Found ${seen.size} unique photos.`);
    await browser.close();
    return [...seen];
  } catch (error) {
    console.error('Google Photos album scraping error:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let albumUrl;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) albumUrl = args[i + 1];
  }
  if (!albumUrl) {
    console.error('Usage: node scrape_google_photos_album.js --url <public-album-url>');
    process.exit(1);
  }
  scrapeAlbumPhotoUrls(albumUrl)
    .then((urls) => {
      // One URL per line on stdout — diagnostics all went to stderr above,
      // same split as scrape_roster_playwright.js's CSV/stderr convention.
      for (const url of urls) console.log(url);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err.message);
      process.exit(1);
    });
}

module.exports = { scrapeAlbumPhotoUrls, baseUrlOf, extractEmbeddedPhotoUrlsFromHtml };
