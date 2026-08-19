const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate } = require('../middleware/auth');

// c***@ellensburgschools.org — enough to confirm to the coach they're on
// the right link without exposing the full address to whoever else might
// see the claim page (it's public, no auth, before sign-in).
function maskEmail(email) {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

// GET /api/team-claims/:token
// Public — no auth. Lets the claim page show "Claiming for X High School"
// with a masked email before the coach signs in. 404/410 without revealing
// which, matching routes/team.js's accept-staff-invite behavior for an
// invalid/expired token.
router.get('/:token', async (req, res) => {
  try {
    const claim = await prisma.teamClaim.findUnique({
      where: { token: req.params.token },
      include: { team: { select: { name: true } } },
    });

    if (!claim || claim.status !== 'pending') {
      return res.status(404).json({ message: 'This claim link is no longer valid.' });
    }
    if (claim.expiresAt < new Date()) {
      return res.status(410).json({ message: 'This claim link has expired. Contact LeadPack to have a new one sent.' });
    }

    res.json({ teamName: claim.team.name, maskedEmail: maskEmail(claim.email) });
  } catch (error) {
    console.error('Error fetching team claim:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/team-claims/:token/claim
// Authenticated only — deliberately no requireTeam/requireRole, same
// reasoning as team.js's POST /join and POST /accept-staff-invite: this IS
// what grants team membership, so requiring it first would be circular.
// The signed-in account's email is never compared against claim.email (F3)
// — the token itself is the credential. The owner already verified the
// coach manually before sending the link; whoever holds it and signs in is
// treated as verified. Claiming does not unlock join codes/invites by
// itself — that's gated by checkout (lib/entitlements.js), separately.
router.post('/:token/claim', authenticate, async (req, res) => {
  try {
    const claim = await prisma.teamClaim.findUnique({
      where: { token: req.params.token },
      include: { team: true },
    });

    if (!claim || claim.status !== 'pending') {
      return res.status(404).json({ message: 'This claim link is no longer valid.' });
    }
    if (claim.expiresAt < new Date()) {
      return res.status(410).json({ message: 'This claim link has expired. Contact LeadPack to have a new one sent.' });
    }

    await prisma.$transaction([
      prisma.teamClaim.update({ where: { id: claim.id }, data: { status: 'claimed', claimedAt: new Date() } }),
      prisma.user.update({ where: { id: req.user.id }, data: { teamId: claim.teamId, role: 'coach' } }),
      prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: claim.teamId, userId: req.user.id } },
        update: { role: 'HEAD_COACH', active: true },
        create: { teamId: claim.teamId, userId: req.user.id, role: 'HEAD_COACH' },
      }),
      // The claiming coach becomes the team's recognized owner, same shape
      // as every self-serve-created team before this workstream — keeps
      // the existing `team.coachUid === user.id` owner-fast-path (checked
      // across routes/users.js, groups.js, practicePlans.js, etc.) correct.
      prisma.team.update({ where: { id: claim.teamId }, data: { coachUid: req.user.id } }),
    ]);

    res.json({
      teamId: claim.teamId,
      athleticTeamId: claim.team.athleticTeamId,
      teamName: claim.team.name,
      checkoutRequired: claim.team.plan !== 'active',
    });
  } catch (error) {
    console.error('Error claiming team:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
