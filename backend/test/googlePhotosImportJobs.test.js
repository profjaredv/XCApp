// lib/googlePhotosImportJobs.js: the in-memory job registry the Load
// module polls for real-time per-photo progress on a Google Photos album
// import (see routes/photos.js). No DB, no Redis — just pinning the
// contract routes/photos.js relies on: create, update as the scrape and
// each photo progress, read back the same snapshot shape every time.
const test = require('node:test');
const assert = require('node:assert/strict');
const jobs = require('../lib/googlePhotosImportJobs');

test('createJob starts in "scraping" with no items yet, and is readable by id', () => {
  const job = jobs.createJob({ teamId: 'team-1', meetId: 'meet-1' });
  assert.equal(job.status, 'scraping');
  assert.equal(job.total, 0);
  assert.deepEqual(job.items, []);
  assert.equal(jobs.getJob(job.id).id, job.id);
});

test('getJob returns null for an id that was never created', () => {
  assert.equal(jobs.getJob('not-a-real-job-id'), null);
});

test('updateJob moves a job to "running" and seeds one queued item per photo found', () => {
  const job = jobs.createJob({ teamId: 'team-1', meetId: 'meet-1' });
  jobs.updateJob(job.id, {
    status: 'running',
    total: 3,
    items: Array.from({ length: 3 }, (_, i) => ({ id: `item-${i}`, status: 'queued' })),
  });
  const read = jobs.getJob(job.id);
  assert.equal(read.status, 'running');
  assert.equal(read.total, 3);
  assert.deepEqual(
    read.items.map((i) => i.status),
    ['queued', 'queued', 'queued'],
  );
});

test('setItemStatus patches exactly one item by index, leaving the others untouched', () => {
  const job = jobs.createJob({ teamId: 'team-1', meetId: 'meet-1' });
  jobs.updateJob(job.id, { items: [{ id: 'item-0', status: 'queued' }, { id: 'item-1', status: 'queued' }] });

  jobs.setItemStatus(job.id, 1, { status: 'done', photoId: 'photo-xyz' });

  const read = jobs.getJob(job.id);
  assert.equal(read.items[0].status, 'queued');
  assert.equal(read.items[1].status, 'done');
  assert.equal(read.items[1].photoId, 'photo-xyz');
});

test('setItemStatus grows the items array on demand, for an index beyond what was pre-seeded', () => {
  // lib/googlePhotosImport.js no longer knows up front how many urls it
  // will end up attempting (a duplicate found along the way doesn't
  // count against its budget, so it can walk past far more of them than
  // it imports) — so items can no longer be fully pre-sized, and this
  // has to create slots as they're reported instead of requiring them to
  // already exist.
  const job = jobs.createJob({ teamId: 'team-1', meetId: 'meet-1' });
  jobs.updateJob(job.id, { items: [{ id: 'item-0', status: 'queued' }] });
  assert.doesNotThrow(() => jobs.setItemStatus(job.id, 5, { status: 'done' }));
  const read = jobs.getJob(job.id);
  assert.equal(read.items[5].status, 'done');
});

test('setItemStatus creates a fresh slot (no pre-seeding needed at all)', () => {
  const job = jobs.createJob({ teamId: 'team-1', meetId: 'meet-1' });
  jobs.setItemStatus(job.id, 0, { status: 'downloading' });
  const read = jobs.getJob(job.id);
  assert.equal(read.items[0].status, 'downloading');
  assert.equal(read.items[0].id, 'item-0');
});

test('updateJob/setItemStatus/finishJob on an id that does not exist are no-ops, not throws', () => {
  assert.doesNotThrow(() => jobs.updateJob('missing', { status: 'running' }));
  assert.doesNotThrow(() => jobs.setItemStatus('missing', 0, { status: 'done' }));
  assert.doesNotThrow(() => jobs.finishJob('missing', { status: 'done' }));
});

test('finishJob sets the final status, summary, and a finishedAt timestamp', () => {
  const job = jobs.createJob({ teamId: 'team-1', meetId: 'meet-1' });
  jobs.finishJob(job.id, { status: 'done', summary: { imported: 2, duplicates: 0, failed: 0 } });
  const read = jobs.getJob(job.id);
  assert.equal(read.status, 'done');
  assert.deepEqual(read.summary, { imported: 2, duplicates: 0, failed: 0 });
  assert.ok(read.finishedAt && read.finishedAt > 0);
});

test('finishJob can record an error outcome', () => {
  const job = jobs.createJob({ teamId: 'team-1', meetId: 'meet-1' });
  jobs.finishJob(job.id, { status: 'error', error: 'Timed out loading that album.' });
  const read = jobs.getJob(job.id);
  assert.equal(read.status, 'error');
  assert.equal(read.error, 'Timed out loading that album.');
});

test('a job carries the teamId it was created with, so the route can refuse a poll from another team', () => {
  const job = jobs.createJob({ teamId: 'team-owning-it', meetId: 'meet-1' });
  assert.equal(jobs.getJob(job.id).teamId, 'team-owning-it');
});
