// The no-account path into Photos tagging: a team sets one shared "meet
// day" password (Team.photosTagPassword), and anyone who knows it gets a
// long-lived volunteer session — no sign-in, no account, tagging only
// (see middleware/photosVolunteer.js and lib/photoTagRules.js, where
// isVolunteer unlocks exactly one thing: authorizeTag).
//
// Kept separate from lib/photosAccess.js the same way
// lib/googlePhotosImport.js is: a genuinely different concern (team
// configuration and session issuance, not reading/writing Photo rows)
// that happens to live in the same feature.

const crypto = require('crypto');

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch rather than returning
  // false, and the length itself isn't secret for a shared meet-day code
  // — comparing lengths first just avoids the throw.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Checks a submitted password against the team's tagging password and, if
 * it matches, issues a new volunteer session token. A team that doesn't
 * exist and a team with no (or the wrong) tagging password come back
 * identically — `{ ok: false }` — which of those is true must never be
 * distinguishable from outside.
 */
async function verifyVolunteerLogin(prisma, { athleticTeamId, password }) {
  const team = await prisma.team.findUnique({
    where: { athleticTeamId },
    select: { id: true, photosTagPassword: true },
  });
  if (!team || !team.photosTagPassword || !safeEqual(password, team.photosTagPassword)) {
    return { ok: false };
  }
  const session = await prisma.photoVolunteerSession.create({
    data: { teamId: team.id, token: crypto.randomBytes(32).toString('hex') },
  });
  return { ok: true, token: session.token };
}

async function getTagPasswordStatus(prisma, teamId) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { photosTagPassword: true } });
  return { enabled: Boolean(team && team.photosTagPassword) };
}

/** `password: null` turns tagging-by-password back off for this team. */
async function setTagPassword(prisma, teamId, password) {
  await prisma.team.update({
    where: { id: teamId },
    data: { photosTagPassword: password === null ? null : password.trim() },
  });
  return { enabled: password !== null };
}

module.exports = { safeEqual, verifyVolunteerLogin, getTagPasswordStatus, setTagPassword };
