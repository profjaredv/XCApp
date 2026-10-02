// lib/googlePhotosImport.js: importing from a public Google Photos
// shared-album link. No official API covers this (see that file's header
// comment), so the scraper (scrape_google_photos_album.js) is a real
// headless browser — these tests mock it rather than hitting a real album,
// and focus on the two things most likely to actually break something: the
// SSRF guard on the URL, and per-photo failures never aborting the batch.
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const prisma = require('../lib/db');
const photosAccess = require('../lib/photosAccess');
const googlePhotosImport = require('../lib/googlePhotosImport');
const { validateGooglePhotosUrl, importGoogleAlbum } = googlePhotosImport;
const { baseUrlOf } = require('../scrape_google_photos_album');

function stub(obj, method, impl) {
  const original = obj[method];
  obj[method] = impl;
  return () => {
    obj[method] = original;
  };
}

function stubModel(model, method, impl) {
  const original = prisma[model][method];
  prisma[model][method] = async (...args) => impl(...args);
  return () => {
    prisma[model][method] = original;
  };
}

async function tinyJpeg() {
  // A real, valid 2x2 JPEG — sharp needs genuine image bytes, not just any
  // buffer, to produce metadata() and resized output.
  return sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
}

// ---------------------------------------------------------------------------
// validateGooglePhotosUrl — the SSRF guard
// ---------------------------------------------------------------------------

test('validateGooglePhotosUrl accepts the two real share-link hosts', () => {
  assert.ok(validateGooglePhotosUrl('https://photos.google.com/share/AF1Qip123?key=abc'));
  assert.ok(validateGooglePhotosUrl('https://photos.app.goo.gl/AbCdEf'));
});

test('validateGooglePhotosUrl refuses a host that merely contains "photos.google.com"', () => {
  // The exact bug class this exists to stop: a lookalike host, or a path
  // trick, resolving somewhere this server's browser was never meant to go.
  assert.equal(validateGooglePhotosUrl('https://photos.google.com.evil.example/share/x'), null);
  assert.equal(validateGooglePhotosUrl('https://evil.example/?u=photos.google.com'), null);
});

test('validateGooglePhotosUrl refuses non-https and internal-looking targets', () => {
  assert.equal(validateGooglePhotosUrl('http://photos.google.com/share/x'), null);
  assert.equal(validateGooglePhotosUrl('http://169.254.169.254/latest/meta-data/'), null);
  assert.equal(validateGooglePhotosUrl('file:///etc/passwd'), null);
  assert.equal(validateGooglePhotosUrl('not a url at all'), null);
});

// ---------------------------------------------------------------------------
// baseUrlOf — collapsing every rendered size of one photo to one entry
// ---------------------------------------------------------------------------

test('baseUrlOf strips the size suffix', () => {
  assert.equal(baseUrlOf('https://lh3.googleusercontent.com/pw/ABC123=w200-h150-no'), 'https://lh3.googleusercontent.com/pw/ABC123');
});

test('baseUrlOf rejects a non-lh3 URL', () => {
  assert.equal(baseUrlOf('https://example.com/photo.jpg'), null);
});

// ---------------------------------------------------------------------------
// importGoogleAlbum — orchestration: scraper -> download -> resize -> row
// ---------------------------------------------------------------------------

test('importGoogleAlbum 404s a meet that does not belong to this team', async () => {
  const restore = stubModel('meet', 'findFirst', () => null);
  try {
    await assert.rejects(
      () => importGoogleAlbum(prisma, { teamId: 'team-1', meetId: 'meet-of-team-2', albumUrl: 'https://photos.app.goo.gl/x', uploadedById: 'coach-1' }),
      /Meet not found/,
    );
  } finally {
    restore();
  }
});

test('importGoogleAlbum refuses a link that is not a real Google Photos host', async () => {
  const restore = stubModel('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' }));
  try {
    await assert.rejects(
      () => importGoogleAlbum(prisma, { teamId: 'team-1', meetId: 'meet-1', albumUrl: 'https://evil.example/x', uploadedById: 'coach-1' }),
      /Not a public Google Photos share link/,
    );
  } finally {
    restore();
  }
});

test('importGoogleAlbum imports each photo, skips duplicates, and keeps going after one failure', async (t) => {
  const jpeg = await tinyJpeg();
  const urls = ['https://lh3.googleusercontent.com/pw/ok-1', 'https://lh3.googleusercontent.com/pw/dup-2', 'https://lh3.googleusercontent.com/pw/broken-3'];

  const restoreMeet = stubModel('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' }));
  const restoreScraper = stub(googlePhotosImport, 'runAlbumScraper', async () => urls);
  const restoreDownload = stub(googlePhotosImport, 'downloadOriginal', async (url) => {
    if (url.includes('broken')) throw new Error('404');
    return jpeg;
  });

  let importCalls = 0;
  const restoreImport = stub(photosAccess, 'importReadyPhoto', async (_prisma, args) => {
    importCalls += 1;
    if (args.sha256 && importCalls === 2) return { duplicate: true, photoId: 'existing-photo' };
    return { duplicate: false, photoId: `photo-${importCalls}` };
  });

  t.after(() => {
    restoreMeet();
    restoreScraper();
    restoreDownload();
    restoreImport();
  });

  const summary = await importGoogleAlbum(prisma, {
    teamId: 'team-1',
    meetId: 'meet-1',
    albumUrl: 'https://photos.app.goo.gl/real-album',
    uploadedById: 'coach-1',
  });

  assert.equal(summary.total, 3);
  assert.equal(summary.failed, 1);
  assert.ok(summary.failedDetails[0].includes('404'));
  // One duplicate, one imported, one failed — in whatever order the
  // worker pool happened to process them (download/resize is concurrent).
  assert.equal(summary.imported + summary.duplicates, 2);
});

test('importGoogleAlbum caps a very large album and reports how many were skipped', async (t) => {
  const jpeg = await tinyJpeg();
  const urls = Array.from({ length: googlePhotosImport.MAX_PHOTOS_PER_IMPORT + 7 }, (_, i) => `https://lh3.googleusercontent.com/pw/${i}`);

  const restoreMeet = stubModel('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' }));
  const restoreScraper = stub(googlePhotosImport, 'runAlbumScraper', async () => urls);
  const restoreDownload = stub(googlePhotosImport, 'downloadOriginal', async () => jpeg);
  const restoreImport = stub(photosAccess, 'importReadyPhoto', async () => ({ duplicate: false, photoId: 'p' }));

  t.after(() => {
    restoreMeet();
    restoreScraper();
    restoreDownload();
    restoreImport();
  });

  const summary = await importGoogleAlbum(prisma, {
    teamId: 'team-1',
    meetId: 'meet-1',
    albumUrl: 'https://photos.app.goo.gl/huge-album',
    uploadedById: 'coach-1',
  });

  assert.equal(summary.total, urls.length);
  assert.equal(summary.truncated, 7);
  assert.equal(summary.imported, googlePhotosImport.MAX_PHOTOS_PER_IMPORT);
});

test('importGoogleAlbum reports a clear error when the scraper finds nothing', async (t) => {
  const restoreMeet = stubModel('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' }));
  const restoreScraper = stub(googlePhotosImport, 'runAlbumScraper', async () => []);
  t.after(() => {
    restoreMeet();
    restoreScraper();
  });

  await assert.rejects(
    () => importGoogleAlbum(prisma, { teamId: 'team-1', meetId: 'meet-1', albumUrl: 'https://photos.app.goo.gl/empty', uploadedById: 'coach-1' }),
    /No photos were found/,
  );
});
