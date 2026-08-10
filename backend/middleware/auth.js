const { createRemoteJWKSet, jwtVerify } = require('jose');
const prisma = require('../lib/db');

// Neon Auth is Better Auth under the hood. The frontend signs users in with
// Neon Auth's React client and sends the resulting JWT as a bearer token;
// we verify it here purely cryptographically (JWKS), the same way you'd
// verify any OIDC-issued JWT — no vendor SDK/network round trip needed per
// request beyond the (cached) JWKS fetch.
//
// NEON_AUTH_JWKS_URL is the full JWKS URL from the Neon project's Auth tab:
// https://<endpoint>.neonauth.<region>.aws.neon.tech/<database>/auth/.well-known/jwks.json
const NEON_AUTH_JWKS_URL = process.env.NEON_AUTH_JWKS_URL;

if (!NEON_AUTH_JWKS_URL) {
  console.error('CRITICAL: NEON_AUTH_JWKS_URL is not set — cannot verify Neon Auth tokens.');
  process.exit(1);
}

const jwks = createRemoteJWKSet(new URL(NEON_AUTH_JWKS_URL));

async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, jwks);
  return payload;
}

// Authenticates the request and attaches the app-level user profile to
// req.user. req.user.teamId is the ONLY source of truth for "what team is
// this request allowed to touch" — route handlers must scope every query
// by req.user.teamId and must never accept a teamId from params/body/query
// for authorization purposes. (The previous version of this app had that
// exact bug — see XCAPP_ASSESSMENT.md — this rewrite removes the footgun
// by never plumbing a client-supplied teamId into a query in the first
// place.)
const authenticate = async (req, res, next) => {
  const { authorization } = req.headers;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided.' });
  }

  const token = authorization.slice('Bearer '.length);

  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }

  const authUserId = payload.sub;
  if (!authUserId) {
    return res.status(403).json({ message: 'Token missing subject claim.' });
  }
  const authEmail = payload.email || payload.primary_email || null;

  try {
    let user = await prisma.user.findUnique({
      where: { id: authUserId },
      include: { team: true, linkedAthlete: true },
    });

    if (!user) {
      // First time we've seen this Neon Auth identity: create the app
      // profile row. If they already own a team (coach_uid matches),
      // promote them to coach automatically, same behavior as before.
      const ownedTeam = await prisma.team.findFirst({ where: { coachUid: authUserId } });

      user = await prisma.user.create({
        data: {
          id: authUserId,
          email: authEmail || `${authUserId}@unknown.local`,
          name: payload.name || (authEmail ? authEmail.split('@')[0] : 'Athlete'),
          role: ownedTeam ? 'coach' : 'athlete',
          teamId: ownedTeam?.id ?? null,
        },
        include: { team: true, linkedAthlete: true },
      });
    } else if (user.team && user.team.coachUid === user.id && user.role !== 'coach') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'coach' },
        include: { team: true, linkedAthlete: true },
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Error resolving user profile for', authUserId, ':', err.message);
    res.status(500).json({ message: 'An unexpected error occurred during authentication.' });
  }
};

// req.user.role (the User-level string) is a sticky, team-agnostic
// onboarding-UX hint only — never trust it for authorization. A coach who
// joins a DIFFERENT team via
// that team's join code (routes/team.js POST /join, routes/profile.js
// POST /join-team) keeps that hint set while req.user.teamId now points at
// a team they don't own — checking it alone would let them act as that
// team's coach just by learning its join code. Authority must be scoped to
// the team actually being acted on: either they created it (Team.coachUid,
// checked as a fast path below), or they hold a TeamMember row for it
// specifically with a role in the caller's allow-list.
//
// requireRole(['HEAD_COACH', 'COACH']) — the two are listed explicitly
// wherever "any real coach" is intended; there is no implicit hierarchy
// where a broader role automatically satisfies a narrower-looking check,
// so every call site says exactly which roles it accepts. VOLUNTEER_COACH
// is deliberately never included in a blanket route-level list — their
// access is scoped to the specific groups they lead (see T2's
// Group/GroupLeader), which is a data-layer filter inside the handler, not
// something a route-level role gate can express.
// A named function expression, not an arrow function, on purpose: every
// call site invokes this factory inline (`requireRole([...])`), so the
// returned middleware is never bound to a named variable — without an
// explicit name here its function.name would be '', and
// test/routeAuth.test.js's guard detection (which reads Express's
// layer.name, derived from the middleware function's own .name) would
// silently stop recognizing every route this protects.
const requireRole = (allowedRoles) =>
  async function requireRole(req, res, next) {
    if (!req.user?.teamId) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    if (req.user.team?.coachUid === req.user.id && allowedRoles.includes('HEAD_COACH')) {
      return next();
    }

    try {
      const membership = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: req.user.teamId, userId: req.user.id } },
      });
      if (membership?.active && allowedRoles.includes(membership.role)) {
        return next();
      }
    } catch (err) {
      console.error('Error checking team role in requireRole:', err.message);
      return res.status(500).json({ message: 'An unexpected error occurred.' });
    }

    return res.status(403).json({ message: 'Access denied.' });
  };

const requireTeam = (req, res, next) => {
  if (!req.user?.teamId) {
    return res.status(400).json({ message: 'You are not on a team yet.' });
  }
  next();
};

// For the athlete self-service routes (own profile, log a run): this account
// must actually be linked to a specific Athlete row (via an accepted invite
// or an approved claim — see routes/athletes.js and routes/team.js). Being
// on a team is not enough; a coach who has never raced has no Athlete row to
// scope these to.
const requireLinkedAthlete = (req, res, next) => {
  if (!req.user?.linkedAthlete) {
    return res.status(403).json({ message: 'Your account is not linked to an athlete profile yet.' });
  }
  next();
};

module.exports = { authenticate, requireRole, requireTeam, requireLinkedAthlete };
