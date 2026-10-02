// In-memory registry of in-flight / recently-finished Google Photos album
// imports, so the frontend can poll real per-photo progress instead of
// blocking on one request for however long a 300-photo import takes (see
// routes/photos.js and lib/googlePhotosImport.js).
//
// Deliberately in-memory, not Redis or a DB table: this app runs as a
// single Railway instance (railway.toml sets no replica count), so there's
// only ever one process for a job to live in. If that ever changes, this
// is the module that would need to move to something shared — until then,
// a Map is the same "no premature infrastructure" call this feature has
// made throughout (see googlePhotosImport.js's own header comment on
// running synchronous-by-design). A job lost to a redeploy mid-import just
// means the frontend's poll 404s; it already falls back to refreshPhotos()
// to pick up whatever had actually landed, no worse than the previous
// all-or-nothing blocking request looked like from the outside.

const crypto = require('crypto');

// How long a finished job stays pollable after it's done — long enough for
// a frontend tab that was briefly backgrounded to still see the final
// tally, short enough that a long-running server doesn't accumulate them.
const JOB_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const jobs = new Map();

function createJob({ teamId, meetId }) {
  const job = {
    id: crypto.randomUUID(),
    teamId,
    meetId,
    status: 'scraping', // 'scraping' | 'running' | 'done' | 'error'
    total: 0,
    items: [], // { id, status: 'queued' | 'downloading' | 'done' | 'duplicate' | 'error', photoId?, error? }
    summary: null,
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
}

function setItemStatus(id, index, patch) {
  const job = jobs.get(id);
  if (!job || !job.items[index]) return;
  Object.assign(job.items[index], patch);
}

function finishJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { finishedAt: Date.now() });
}

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobs.delete(id);
  }
}, SWEEP_INTERVAL_MS);
// Never keeps the process alive on its own — matters for tests and for a
// clean shutdown, same reasoning as any other background interval in this
// codebase.
sweepTimer.unref();

module.exports = { createJob, getJob, updateJob, setItemStatus, finishJob };
