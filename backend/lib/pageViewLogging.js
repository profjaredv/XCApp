// E2 (LeadPack Master Build Handoff): "log page opens: route, role,
// timestamp. No athlete identifiers. Aggregate counts only." Pure, no
// Prisma — routes/pageViews.js does the writing.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Athletic.net team ids, bib numbers, and similar numeric ids that would
// otherwise leak into a stored route.
const LONG_DIGIT_RE = /^\d{4,}$/;

// A raw pathname like "/t/40123/athlete/3fa8...-b21c/journey" becomes
// "/t/:id/athlete/:id/journey" — the shape of the page a coach or athlete
// opened, with every identifying segment collapsed to the same
// placeholder. This is the single point every route string passes through
// before it's ever written, so "no athlete identifiers" is a guarantee
// this function makes, not a convention callers have to remember.
function normalizeRoute(pathname) {
  if (typeof pathname !== 'string' || !pathname) return '/unknown';
  const [pathOnly] = pathname.split('?');
  const segments = pathOnly.split('/').map((seg) => {
    if (!seg) return seg;
    if (UUID_RE.test(seg) || LONG_DIGIT_RE.test(seg)) return ':id';
    return seg;
  });
  const joined = segments.join('/');
  return joined || '/';
}

const COACH_TEAM_ROLES = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'];

// Coarse bucket only — never a user id, never which specific coach/athlete.
function roleForLogging({ teamRole, isSuperAdmin }) {
  if (isSuperAdmin) return 'super_admin';
  if (COACH_TEAM_ROLES.includes(teamRole)) return 'coach';
  if (teamRole === 'ATHLETE') return 'athlete';
  return 'other';
}

module.exports = { normalizeRoute, roleForLogging };
