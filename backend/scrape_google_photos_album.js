const { chromium } = require('playwright');

// LeadPack Photos: import from a public Google Photos shared-album link.
// There is no public API for this — Google's Photos Library API requires
// OAuth as the album's own owner and, since 2025, is restricted to content
// the calling app itself created, so it cannot read an arbitrary shared
// album at all. Scraping the public share page is the only way in, the
// same reasoning (and the same tool) this codebase already uses for
// Athletic.net — see scrape_roster_playwright.js, whose own header comment
// notes "Cloudflare blocks probing it live from this dev environment": this
// script has the identical constraint against photos.google.com, so its
// selectors are the best evidence available (the lh3.googleusercontent.com
// URL shape Google Photos content has used for years, not a page-specific
// CSS class that could be renamed at any time) rather than something
// verified against a real live album from this sandbox. Diagnostics on
// failure matter here more than almost anywhere else in this codebase.
//
// A share page is a JS-rendered gallery, not static HTML with the photo
// list embedded — a plain `fetch` of the page would see an empty shell, so
// this always needs a real rendered browser, unlike (say) a server-side
// HTML scrape. The gallery is also virtualized: only photos currently
// scrolled into view exist in the DOM, so this scrolls to the bottom
// repeatedly until no new images appear.

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

    // Scroll to the bottom repeatedly to force the virtualized grid to
    // render every photo, stopping once a few consecutive scrolls add
    // nothing new (rather than a fixed count, since album size varies
    // wildly) or the safety ceiling is hit.
    const seen = new Set(await collectImageUrls(page));
    let stableRounds = 0;
    for (let i = 0; i < MAX_SCROLL_ITERATIONS && stableRounds < SCROLL_STABLE_ROUNDS; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(SCROLL_SETTLE_MS);
      const current = await collectImageUrls(page);
      const before = seen.size;
      for (const url of current) seen.add(url);
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

module.exports = { scrapeAlbumPhotoUrls, baseUrlOf };
