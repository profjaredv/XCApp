const prisma = require('../lib/db');
const { isFeatureEnabled } = require('../lib/teamFeatures');

// LeadPack Photos' own team-resolution and feature gate — split out of
// routes/photos.js so both are independently testable, the same way
// middleware/auth.js's requireRole and middleware/teamFeatures.js's
// requireFeature are.
//
// A parent is never a TeamMember (see routes/guardian.js), so req.user.teamId
// is null for every guardian account. Routes everyone (coach, athlete, AND
// guardian) can reach use resolvePhotosTeam instead of requireTeam, which
// falls back to an approved GuardianLink's athlete's team.

// Grants no access by itself — it only establishes which team's photos
// this account may touch, the same "boundary, not authorization" shape as
// requireApprovedGuardianLink.
async function resolvePhotosTeam(req, res, next) {
  try {
    if (req.user.teamId) {
      req.photosTeamId = req.user.teamId;
      return next();
    }
    const link = await prisma.guardianLink.findFirst({
      where: { userId: req.user.id, status: 'approved' },
      select: { athlete: { select: { teamId: true } } },
    });
    if (!link) {
      return res.status(403).json({ msg: 'No team membership or approved guardian link found for this account.' });
    }
    req.photosTeamId = link.athlete.teamId;
    next();
  } catch (error) {
    next(error);
  }
}

// The shared requireFeature (middleware/teamFeatures.js) reads
// req.user.teamId directly and no-ops when it's null — exactly the case
// for every guardian. Routes behind resolvePhotosTeam need this
// guardian-aware equivalent instead, checked against req.photosTeamId
// once that's resolved (must run after resolvePhotosTeam).
async function requirePhotosFeatureEnabled(req, res, next) {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.photosTeamId }, select: { features: true } });
    if (!isFeatureEnabled(team && team.features, 'photos')) {
      return res.status(403).json({
        message: 'That feature is turned off for this team. A head coach can turn it back on in Settings.',
        code: 'FEATURE_DISABLED',
        feature: 'photos',
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { resolvePhotosTeam, requirePhotosFeatureEnabled };
