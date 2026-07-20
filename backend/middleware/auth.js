const { createRemoteJWKSet, jwtVerify } = require('jose');
const prisma = require('../lib/db');

// Neon Auth is Stack Auth under the hood. The frontend signs users in with
// the Stack React SDK and sends the resulting access token as a bearer
// token; we verify it here purely cryptographically (JWKS), the same way
// you'd verify any OIDC-issued JWT — no vendor SDK/network round trip
// needed per request beyond the (cached) JWKS fetch.
//
// See MIGRATION_STATUS.md for the exact env vars this needs and a note
// that the claim names below (`sub`, `email`, `name`) should be confirmed
// against a real token once a Stack project exists — this was written
// against Stack's documented token shape but has not been exercised
// against a live project.
const STACK_PROJECT_ID = process.env.STACK_PROJECT_ID;
const STACK_JWKS_ISSUER = process.env.STACK_JWKS_ISSUER || 'https://api.stack-auth.com';

if (!STACK_PROJECT_ID) {
  console.error('CRITICAL: STACK_PROJECT_ID is not set — cannot verify Neon Auth tokens.');
  process.exit(1);
}

const JWKS_URL = `${STACK_JWKS_ISSUER}/api/v1/projects/${STACK_PROJECT_ID}/.well-known/jwks.json`;
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

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
      include: { team: true },
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
        include: { team: true },
      });
    } else if (user.team && user.team.coachUid === user.id && user.role !== 'coach') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'coach' },
        include: { team: true },
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Error resolving user profile for', authUserId, ':', err.message);
    res.status(500).json({ message: 'An unexpected error occurred during authentication.' });
  }
};

const requireCoach = (req, res, next) => {
  if (req.user?.role !== 'coach') {
    return res.status(403).json({ message: 'Access denied. Coach role required.' });
  }
  next();
};

const requireTeam = (req, res, next) => {
  if (!req.user?.teamId) {
    return res.status(400).json({ message: 'You are not on a team yet.' });
  }
  next();
};

// Use for destructive/administrative actions that must be limited to the
// coach who actually owns the team, not just "a coach somewhere."
const requireOwnTeam = (req, res, next) => {
  if (!req.user?.teamId) {
    return res.status(400).json({ message: 'You are not on a team yet.' });
  }
  if (req.user.team?.coachUid !== req.user.id) {
    return res.status(403).json({ message: 'Only the coach who owns this team can do that.' });
  }
  next();
};

module.exports = { authenticate, requireCoach, requireTeam, requireOwnTeam };
