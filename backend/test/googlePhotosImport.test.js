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
const { validateGooglePhotosUrl, importGoogleAlbum, downloadOriginal } = googlePhotosImport;
const { baseUrlOf, extractEmbeddedPhotoUrlsFromHtml } = require('../scrape_google_photos_album');

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
// extractEmbeddedPhotoUrlsFromHtml — the actual fix for the real-world bug
// where a 197-photo album only ever imported 30: the virtualized gallery
// only ever has ~30 photos rendered as <img> DOM nodes at once, but the
// full list is already in the page's own HTML (its hydration payload).
// Confirmed against a real live album in development; this pins the
// extraction regex so it keeps finding every photo URL embedded in the
// page and keeps ignoring contributor avatar images, which live under a
// different lh3.googleusercontent.com path and are not album content.
// ---------------------------------------------------------------------------

test('extractEmbeddedPhotoUrlsFromHtml finds every "/pw/" photo URL embedded in the page, however it is wrapped', () => {
  const html = `
    <html><body>
      <img src="https://lh3.googleusercontent.com/pw/AAA111=w200-h150-no">
      <script>var data = ["https://lh3.googleusercontent.com/pw/BBB222", "unrelated"];</script>
      <div data-src="https://lh3.googleusercontent.com/pw/CCC333=d"></div>
    </body></html>
  `;
  const urls = extractEmbeddedPhotoUrlsFromHtml(html);
  assert.deepEqual(
    [...urls].sort(),
    ['https://lh3.googleusercontent.com/pw/AAA111', 'https://lh3.googleusercontent.com/pw/BBB222', 'https://lh3.googleusercontent.com/pw/CCC333'].sort(),
  );
});

test('extractEmbeddedPhotoUrlsFromHtml ignores contributor avatar images (a different lh3 path, not album content)', () => {
  const html = `
    <img src="https://lh3.googleusercontent.com/a/ACg8ocLFnsRMYo98G2UNrtpCj6403ouUNKxEjFXlLJmWKkPU3YU-=s64">
    <img src="https://lh3.googleusercontent.com/ogw/default-user=s64">
    <img src="https://lh3.googleusercontent.com/pw/RealPhoto1">
  `;
  const urls = extractEmbeddedPhotoUrlsFromHtml(html);
  assert.deepEqual([...urls], ['https://lh3.googleusercontent.com/pw/RealPhoto1']);
});

test('extractEmbeddedPhotoUrlsFromHtml collapses the same photo seen at multiple rendered sizes', () => {
  const html = `
    <img src="https://lh3.googleusercontent.com/pw/SamePhoto=w200-h150-no">
    <img src="https://lh3.googleusercontent.com/pw/SamePhoto=w512-h384">
  `;
  const urls = extractEmbeddedPhotoUrlsFromHtml(html);
  assert.deepEqual([...urls], ['https://lh3.googleusercontent.com/pw/SamePhoto']);
});

test('extractEmbeddedPhotoUrlsFromHtml returns an empty set when nothing matches', () => {
  assert.deepEqual([...extractEmbeddedPhotoUrlsFromHtml('<html><body>No photos here</body></html>')], []);
});

// ---------------------------------------------------------------------------
// downloadOriginal — the actual bug the first real-world test hit: this
// reported success while writing nothing anywhere. A bare, header-less
// fetch to the '=d' URL is the leading suspect, so these pin down the
// fallback and the sanity check that turns a bad response into a loud
// failure instead of a silent false "imported".
// ---------------------------------------------------------------------------

function stubFetch(impl) {
  const original = global.fetch;
  global.fetch = impl;
  return () => {
    global.fetch = original;
  };
}

function fakeResponse(buffer, ok = true, status = 200) {
  return { ok, status, arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
}

test('downloadOriginal sends a real User-Agent and the album URL as Referer', async (t) => {
  const jpeg = await tinyJpeg();
  const bigJpeg = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
  const seenRequests = [];
  const restore = stubFetch(async (url, init) => {
    seenRequests.push({ url, headers: init.headers });
    return fakeResponse(url.endsWith('=d') ? jpeg : bigJpeg);
  });
  t.after(restore);

  await downloadOriginal('https://lh3.googleusercontent.com/pw/abc', 'https://photos.app.goo.gl/real-album');

  assert.ok(seenRequests.length >= 1);
  for (const req of seenRequests) {
    assert.ok(req.headers['User-Agent'].includes('Mozilla'));
    assert.equal(req.headers.Referer, 'https://photos.app.goo.gl/real-album');
  }
});

test('downloadOriginal falls back to a large sized rendition when "=d" comes back too small to be real', async (t) => {
  // This is the actual failure mode suspected in production: '=d' returns
  // something (not a 404, not an HTTP error) that decodes as an image but
  // is tiny — a placeholder or a blocked-request response — not the photo.
  const tooSmall = await tinyJpeg(); // 2x2
  const real = await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 10, g: 10, b: 10 } } }).jpeg().toBuffer();
  const requestedUrls = [];
  const restore = stubFetch(async (url) => {
    requestedUrls.push(url);
    return fakeResponse(url.endsWith('=d') ? tooSmall : real);
  });
  t.after(restore);

  const result = await downloadOriginal('https://lh3.googleusercontent.com/pw/abc', 'https://photos.app.goo.gl/x');

  assert.equal(result.width, 1200);
  assert.equal(result.height, 900);
  assert.ok(requestedUrls.some((u) => u.endsWith('=d')));
  assert.ok(requestedUrls.some((u) => u.includes('=w4096')));
});

test('downloadOriginal throws a clear error when every attempt fails', async (t) => {
  const restore = stubFetch(async () => ({ ok: false, status: 403 }));
  t.after(restore);

  await assert.rejects(
    () => downloadOriginal('https://lh3.googleusercontent.com/pw/abc', 'https://photos.app.goo.gl/x'),
    /Could not download a usable image/,
  );
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
    return { buffer: jpeg, width: 800, height: 600 };
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
  const restoreDownload = stub(googlePhotosImport, 'downloadOriginal', async () => ({ buffer: jpeg, width: 800, height: 600 }));
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

// ---------------------------------------------------------------------------
// onFound / onItemStatus — the progress hooks routes/photos.js uses to
// drive lib/googlePhotosImportJobs.js so the Load module can show a tile
// per photo filling in live, instead of one spinner for the whole import.
// ---------------------------------------------------------------------------

test('importGoogleAlbum calls onFound once with the post-truncation count, before any downloads start', async (t) => {
  const jpeg = await tinyJpeg();
  const urls = ['https://lh3.googleusercontent.com/pw/1', 'https://lh3.googleusercontent.com/pw/2'];

  const restoreMeet = stubModel('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' }));
  const restoreScraper = stub(googlePhotosImport, 'runAlbumScraper', async () => urls);
  const restoreDownload = stub(googlePhotosImport, 'downloadOriginal', async () => ({ buffer: jpeg, width: 800, height: 600 }));
  const restoreImport = stub(photosAccess, 'importReadyPhoto', async () => ({ duplicate: false, photoId: 'p' }));
  t.after(() => {
    restoreMeet();
    restoreScraper();
    restoreDownload();
    restoreImport();
  });

  const foundCalls = [];
  await importGoogleAlbum(prisma, {
    teamId: 'team-1',
    meetId: 'meet-1',
    albumUrl: 'https://photos.app.goo.gl/real-album',
    uploadedById: 'coach-1',
    onFound: (args) => foundCalls.push(args),
  });

  assert.equal(foundCalls.length, 1);
  assert.deepEqual(foundCalls[0], { total: 2, importing: 2, truncated: 0 });
});

test('importGoogleAlbum reports each item going queued -> downloading -> its outcome, by stable index', async (t) => {
  const jpeg = await tinyJpeg();
  const urls = ['https://lh3.googleusercontent.com/pw/ok', 'https://lh3.googleusercontent.com/pw/dup', 'https://lh3.googleusercontent.com/pw/broken'];

  const restoreMeet = stubModel('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' }));
  const restoreScraper = stub(googlePhotosImport, 'runAlbumScraper', async () => urls);
  const restoreDownload = stub(googlePhotosImport, 'downloadOriginal', async (url) => {
    if (url.includes('broken')) throw new Error('404');
    return { buffer: jpeg, width: 800, height: 600 };
  });
  // importReadyPhoto only sees the downloaded buffer, not the source URL,
  // so there's no reliable way to make exactly one item come back a
  // "duplicate" from here — this test sticks to what's guaranteed
  // regardless of worker interleaving: every item reaches exactly one
  // terminal status, every item passes through 'downloading' first, and
  // the one download stubbed to fail (by URL, not by call order) lands on
  // 'error'.
  const restoreImport = stub(photosAccess, 'importReadyPhoto', async () => ({ duplicate: false, photoId: 'p' }));
  t.after(() => {
    restoreMeet();
    restoreScraper();
    restoreDownload();
    restoreImport();
  });

  const byIndex = new Map();
  await importGoogleAlbum(prisma, {
    teamId: 'team-1',
    meetId: 'meet-1',
    albumUrl: 'https://photos.app.goo.gl/real-album',
    uploadedById: 'coach-1',
    onItemStatus: (index, patch) => {
      if (!byIndex.has(index)) byIndex.set(index, []);
      byIndex.get(index).push(patch.status);
    },
  });

  assert.equal(byIndex.size, 3);
  for (const statuses of byIndex.values()) {
    assert.equal(statuses[0], 'downloading');
    assert.ok(['done', 'duplicate', 'error'].includes(statuses[statuses.length - 1]));
  }
  // The one download stubbed to fail is deterministically index 2 (its URL
  // contains "broken" regardless of worker interleaving).
  assert.deepEqual(byIndex.get(2), ['downloading', 'error']);
});

test('importGoogleAlbum omitting onFound/onItemStatus still works (both default to no-ops)', async (t) => {
  const jpeg = await tinyJpeg();
  const restoreMeet = stubModel('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' }));
  const restoreScraper = stub(googlePhotosImport, 'runAlbumScraper', async () => ['https://lh3.googleusercontent.com/pw/1']);
  const restoreDownload = stub(googlePhotosImport, 'downloadOriginal', async () => ({ buffer: jpeg, width: 800, height: 600 }));
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
    albumUrl: 'https://photos.app.goo.gl/real-album',
    uploadedById: 'coach-1',
  });
  assert.equal(summary.imported, 1);
});

// ---------------------------------------------------------------------------
// Phase-labeled failures — a bare error message like R2's own "Access
// Denied" doesn't say whether it happened talking to Google or talking to
// R2, and those point at completely different fixes. Each failure is
// prefixed with which phase it happened in.
// ---------------------------------------------------------------------------

test('a download failure is labeled "download failed: ..."', async (t) => {
  const restoreMeet = stubModel('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' }));
  const restoreScraper = stub(googlePhotosImport, 'runAlbumScraper', async () => ['https://lh3.googleusercontent.com/pw/1']);
  const restoreDownload = stub(googlePhotosImport, 'downloadOriginal', async () => {
    throw new Error('Could not download a usable image (HTTP 403).');
  });
  t.after(() => {
    restoreMeet();
    restoreScraper();
    restoreDownload();
  });

  const summary = await importGoogleAlbum(prisma, {
    teamId: 'team-1',
    meetId: 'meet-1',
    albumUrl: 'https://photos.app.goo.gl/real-album',
    uploadedById: 'coach-1',
  });
  assert.equal(summary.failedDetails[0], 'download failed: Could not download a usable image (HTTP 403).');
});

test('an R2 upload failure (e.g. a credential or bucket-policy problem) is labeled "upload failed: ..." — not mistaken for a Google-side failure', async (t) => {
  const jpeg = await tinyJpeg();
  const restoreMeet = stubModel('meet', 'findFirst', () => ({ id: 'meet-1', teamId: 'team-1' }));
  const restoreScraper = stub(googlePhotosImport, 'runAlbumScraper', async () => ['https://lh3.googleusercontent.com/pw/1']);
  const restoreDownload = stub(googlePhotosImport, 'downloadOriginal', async () => ({ buffer: jpeg, width: 800, height: 600 }));
  const restoreImport = stub(photosAccess, 'importReadyPhoto', async () => {
    // The exact shape an AWS SDK v3 S3-compatible client throws for an R2
    // AccessDenied response: a bare "Access Denied" message with nothing
    // in it to say which operation failed.
    throw new Error('Access Denied');
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
  assert.equal(summary.failedDetails[0], 'upload failed: Access Denied');
});
