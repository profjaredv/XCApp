const prisma = require('../lib/db');
const { authenticate } = require('./auth');

// Alternate entry to the Photos Tag module for someone with no account at
// all — a parent, sibling, or booster helping tag photos at a meet,
// verified only by the team's shared tagging password (set by a coach;
// see routes/photos.js's PUT /tag-password and POST /volunteer-login).
// This never grants anything beyond tagging: no upload, no build, no
// hide/delete, no picks/opt-out — see lib/photoTagRules.js, where
// isVolunteer only ever unlocks authorizeTag, nothing else.
//
// Drop-in replacement for `authenticate` on exactly the routes a volunteer
// should be able to reach: tries a real Bearer token first (so a signed-in
// coach, athlete, or guardian keeps working through this exact same
// middleware, unchanged), and only falls back to the volunteer token
// header when there's no Authorization header at all. req.photosTeamId is
// set directly here for the volunteer branch — resolvePhotosTeam (called
// next in the chain on every one of these routes) no-ops once it's
// already set, so both branches end up at the same req.photosTeamId.
async function authenticateUserOrVolunteer(req, res, next) {
  if (req.headers.authorization) {
    return authenticate(req, res, next);
  }

  const token = req.headers['x-photos-volunteer-token'];
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ msg: 'Sign in, or enter this team\'s tagging password, to continue.' });
  }

  try {
    const session = await prisma.photoVolunteerSession.findUnique({ where: { token } });
    if (!session) {
      return res.status(401).json({ msg: 'That tagging session is no longer valid — enter the password again.' });
    }
    req.isPhotoVolunteer = true;
    req.photosTeamId = session.teamId;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticateUserOrVolunteer };
