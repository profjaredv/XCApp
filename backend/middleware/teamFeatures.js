const prisma = require('../lib/db');
const { isFeatureEnabled } = require('../lib/teamFeatures');

// Gate a route on a feature the team can turn off (lib/teamFeatures.js).
//
// Hiding a nav entry is a courtesy; this is the actual rule. A coach who
// turned attendance off still has the old tab open, the athlete still has
// the URL in their history, and the PWA still has the route cached — all
// three reach the API directly.
//
// Runs after authenticate/requireTeam, which is what puts teamId on the
// request. A request with no team can't have a team's features, so it is
// let through to whatever team check the route already has rather than
// being turned into a confusing "feature is off" error.
function requireFeature(key) {
  return async function featureGate(req, res, next) {
    try {
      const teamId = req.user && req.user.teamId;
      if (!teamId) return next();

      const team = await prisma.team.findUnique({ where: { id: teamId }, select: { features: true } });
      if (!isFeatureEnabled(team && team.features, key)) {
        return res.status(403).json({
          message: 'That feature is turned off for this team. A head coach can turn it back on in Settings.',
          code: 'FEATURE_DISABLED',
          feature: key,
        });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { requireFeature };
