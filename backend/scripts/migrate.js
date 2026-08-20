#!/usr/bin/env node
/**
 * Apply pending Prisma migrations at deploy time, tolerating a production
 * database that predates migration history.
 *
 * This database was originally created with `prisma db push` (schema pushed
 * directly, no `_prisma_migrations` table), so a plain `migrate deploy` fails
 * with P3005 — "the database schema is not empty". Chaining that directly in
 * front of the start command took the whole app down on deploy.
 *
 * Two rules here:
 *
 *   1. On P3005, baseline the initial migration and retry. `migrate resolve
 *      --applied` only records that a migration is already present; it does
 *      not touch the schema, and the init migration describes exactly the
 *      tables this database already has.
 *
 *   2. Never block startup on a migration failure. A migration that doesn't
 *      apply leaves the app running against the previous schema — the feature
 *      needing the new table breaks, which is bad but visible. Refusing to
 *      boot takes down an app that was otherwise fine, which is worse. The
 *      failure is logged loudly rather than swallowed.
 */

const path = require('path');
const { execFileSync } = require('child_process');

const BASELINE_MIGRATION = '20260720175808_init';
// One-time recovery (2026-08-20): this migration's two ALTER TABLE
// statements actually committed in production — confirmed by hand via
// Neon's SQL editor, both training_logs columns exist — but the connection
// dropped before Prisma recorded it as finished, leaving it "failed" and
// blocking every migration after it with P3009 (including the splits and
// team-claims/billing migrations that came later). Safe to remove this
// block once a deploy log shows a clean "Migrations applied." with no
// CRITICAL line — it only exists to unblock this one already-known-good case.
const KNOWN_APPLIED_STUCK_MIGRATION = '20260819030000_training_log_sharing';
// Prisma resolves schema/migrations relative to cwd, and this is invoked from
// the repo root by the start script.
const BACKEND_DIR = path.resolve(__dirname, '..');

function runPrisma(args) {
  return execFileSync('npx', ['prisma', ...args], {
    cwd: BACKEND_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function attemptDeploy() {
  const output = runPrisma(['migrate', 'deploy']);
  process.stdout.write(output);
}

try {
  attemptDeploy();
  console.log('Migrations applied.');
} catch (error) {
  const combined = `${error.stdout || ''}${error.stderr || ''}`;
  process.stderr.write(combined);

  if (combined.includes('P3005')) {
    console.warn(
      `Database predates migration history. Baselining "${BASELINE_MIGRATION}" ` +
        '(records it as applied; does not alter the schema) and retrying.'
    );
    try {
      runPrisma(['migrate', 'resolve', '--applied', BASELINE_MIGRATION]);
      attemptDeploy();
      console.log('Migrations applied after baselining.');
    } catch (retryError) {
      process.stderr.write(`${retryError.stdout || ''}${retryError.stderr || ''}`);
      console.error(
        'CRITICAL: migrations still failed after baselining. Starting anyway on the ' +
          'existing schema — features needing new tables will fail until this is resolved.'
      );
    }
  } else if (combined.includes('P3009') && combined.includes(KNOWN_APPLIED_STUCK_MIGRATION)) {
    console.warn(
      `"${KNOWN_APPLIED_STUCK_MIGRATION}" is recorded as failed but its DDL already committed ` +
        '(confirmed by hand — see the comment above). Resolving it as applied and retrying.'
    );
    try {
      runPrisma(['migrate', 'resolve', '--applied', KNOWN_APPLIED_STUCK_MIGRATION]);
      attemptDeploy();
      console.log('Migrations applied after resolving the stuck migration.');
    } catch (retryError) {
      process.stderr.write(`${retryError.stdout || ''}${retryError.stderr || ''}`);
      console.error(
        'CRITICAL: migrations still failed after resolving the stuck migration. Starting anyway on ' +
          'the existing schema — features needing new tables will fail until this is resolved.'
      );
    }
  } else {
    console.error(
      'CRITICAL: migrations failed to apply. Starting anyway on the existing schema — ' +
        'features needing new tables will fail until this is resolved.'
    );
  }
}
