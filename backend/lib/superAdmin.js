// Platform-level super admin: a small, server-side email allowlist, not a
// database flag. "There will only be one for now" (per the request that
// added this) — an env var is auditable in one place, requires no
// migration, and adding/removing an admin is a Railway env change + restart,
// not a code deploy. Read fresh on every call rather than cached at module
// load so tests can set process.env.SUPER_ADMIN_EMAILS per-case without
// require-cache gymnastics; the cost is a tiny string split, not worth
// memoizing.
function getSuperAdminEmails() {
  return new Set(
    (process.env.SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isSuperAdminEmail(email) {
  if (typeof email !== 'string' || !email.trim()) return false;
  return getSuperAdminEmails().has(email.trim().toLowerCase());
}

module.exports = { isSuperAdminEmail };
