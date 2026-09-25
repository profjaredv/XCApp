const test = require('node:test');
const assert = require('node:assert/strict');
const { CalculationService } = require('../services/performance/calculationService');

// Every reader of this service's output (GET /analytics/overview,
// /analytics/program, etc.) reads straight from the DB rows it writes —
// nothing coalesces the read side. Two calculateAllMetrics runs for the
// SAME team+season firing close together (e.g. a coach uploading field
// results for two different races back to back, each upload firing one
// of these) used to be a real lost-update race: three separate async
// read/compute/write passes, not one atomic transaction, so a run that
// STARTED FIRST could still FINISH LAST and silently overwrite a more
// complete run's numbers with its own stale ones.
//
// These construct a fresh CalculationService and stub out
// _calculateAllMetrics — no Prisma, no DB — to exercise the queuing in
// this.pendingByKey directly and deterministically.

test('two calls for the SAME key never overlap — the second only starts once the first finishes', async () => {
  const svc = new CalculationService();
  const log = [];
  let releaseFirst;
  let callCount = 0;

  svc._calculateAllMetrics = async (teamId, season) => {
    callCount += 1;
    const thisCall = callCount;
    log.push(`start:${thisCall}`);
    if (thisCall === 1) {
      await new Promise((resolve) => {
        releaseFirst = resolve;
      });
    }
    log.push(`finish:${thisCall}`);
    return { teamId, season, call: thisCall };
  };

  const first = svc.calculateAllMetrics('team-1', 2026);
  // Give the first call a tick to actually start before queuing the second.
  await new Promise((resolve) => setImmediate(resolve));
  const second = svc.calculateAllMetrics('team-1', 2026);

  // The second must NOT have started yet — it's queued behind the first,
  // which is still blocked on releaseFirst.
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log, ['start:1']);

  releaseFirst();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.deepEqual(log, ['start:1', 'finish:1', 'start:2', 'finish:2']);
  assert.equal(firstResult.call, 1);
  assert.equal(secondResult.call, 2);
});

test('calls for DIFFERENT keys run concurrently — no cross-team/season serialization', async () => {
  const svc = new CalculationService();
  const log = [];
  const releases = {};

  svc._calculateAllMetrics = async (teamId, season) => {
    const key = `${teamId}:${season}`;
    log.push(`start:${key}`);
    await new Promise((resolve) => {
      releases[key] = resolve;
    });
    log.push(`finish:${key}`);
    return key;
  };

  const a = svc.calculateAllMetrics('team-1', 2026);
  const b = svc.calculateAllMetrics('team-2', 2026);

  // Both should have started already — neither is queued behind the
  // other, since they're different keys.
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log.sort(), ['start:team-1:2026', 'start:team-2:2026']);

  releases['team-1:2026']();
  releases['team-2:2026']();
  await Promise.all([a, b]);
});

test('a failed run does not wedge runs queued behind it for the same key', async () => {
  const svc = new CalculationService();
  let callCount = 0;

  svc._calculateAllMetrics = async () => {
    callCount += 1;
    if (callCount === 1) throw new Error('boom');
    return 'ok';
  };

  const first = svc.calculateAllMetrics('team-1', 2026);
  const second = svc.calculateAllMetrics('team-1', 2026);

  await assert.rejects(first, /boom/);
  assert.equal(await second, 'ok');
});

test('each caller gets back exactly its own call\'s result, not another queued call\'s', async () => {
  const svc = new CalculationService();

  svc._calculateAllMetrics = async (teamId, season) => `${teamId}-${season}`;

  const results = await Promise.all([
    svc.calculateAllMetrics('team-1', 2025),
    svc.calculateAllMetrics('team-1', 2025),
    svc.calculateAllMetrics('team-1', 2025),
  ]);

  assert.deepEqual(results, ['team-1-2025', 'team-1-2025', 'team-1-2025']);
});

test('the pending-key map does not leak — it empties out once every queued call settles', async () => {
  const svc = new CalculationService();
  svc._calculateAllMetrics = async () => 'done';

  await Promise.all([
    svc.calculateAllMetrics('team-1', 2026),
    svc.calculateAllMetrics('team-1', 2026),
    svc.calculateAllMetrics('team-2', 2026),
  ]);

  assert.equal(svc.pendingByKey.size, 0);
});

test('skipCache is passed through per call, not shared across a queued chain', async () => {
  const svc = new CalculationService();
  const seen = [];
  svc._calculateAllMetrics = async (teamId, season, skipCache) => {
    seen.push(skipCache);
  };

  await Promise.all([svc.calculateAllMetrics('team-1', 2026, true), svc.calculateAllMetrics('team-1', 2026, false)]);

  assert.deepEqual(seen, [true, false]);
});
