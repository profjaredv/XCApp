const prisma = require('../lib/db');

// Gates guardian-scoped reads on an APPROVED GuardianLink for
// (req.user.id, req.params.athleteId) — a stranger requesting a link isn't
// enough, a coach has to have confirmed it first (see routes/team.js
// POST /approve-guardian-link). Deliberately not folded into requireRole:
// a guardian isn't a TeamMember at all, this is a per-athlete grant, not a
// per-team role.
const requireApprovedGuardianLink = async function requireApprovedGuardianLink(req, res, next) {
  const athleteId = req.params.athleteId;
  if (!athleteId) {
    return res.status(400).json({ message: 'athleteId is required.' });
  }

  try {
    const link = await prisma.guardianLink.findUnique({
      where: { userId_athleteId: { userId: req.user.id, athleteId } },
    });
    if (!link || link.status !== 'approved') {
      return res.status(403).json({ message: 'Access denied.' });
    }
    req.guardianLink = link;
    next();
  } catch (err) {
    console.error('Error checking guardian link:', err.message);
    res.status(500).json({ message: 'An unexpected error occurred.' });
  }
};

module.exports = { requireApprovedGuardianLink };
