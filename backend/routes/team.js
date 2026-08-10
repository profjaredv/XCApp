const express = require('express');
const router = express.Router();
const { customAlphabet } = require('nanoid');
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { resolveActiveSeason } = require('../lib/season');
const { parseDistanceToMeters, metersToMiles } = require('../lib/distance');

const generateJoinCode = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

// GET /api/team/performance
router.get('/performance', authenticate, requireTeam, async (req, res) => {
  const { season } = req.query;
  const teamId = req.user.teamId;

  try {
    const seasonYear = await resolveActiveSeason(teamId, season);

    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
    if (!team) {
      return res.status(404).json({ msg: 'Team not found.' });
    }

    const races = await prisma.race.findMany({
      where: { teamId, season: seasonYear },
      orderBy: { date: 'asc' },
    });

    const raceIds = races.map((r) => r.id);
    const results = await prisma.result.findMany({
      where: { raceId: { in: raceIds }, time: { gt: 0 } },
    });

    const parseDistanceToMiles = (distStr, distMeters) => {
      const meters = distMeters > 0 ? distMeters : parseDistanceToMeters(distStr);
      return metersToMiles(meters) ?? 0;
    };

    const meetCount = races.length;
    const totalRaces = results.length;

    let totalMiles = 0;
    let totalTime = 0;
    const athleteSet = new Set();

    results.forEach((result) => {
      const race = races.find((r) => r.id === result.raceId);
      if (race) {
        const distMiles = parseDistanceToMiles(race.distance, race.distanceMeters);
        totalMiles += distMiles;
        totalTime += result.time;
        athleteSet.add(result.athleteId);
      }
    });

    const avgPace = totalMiles > 0 ? totalTime / totalMiles : 0;
    const totalRunners = athleteSet.size;

    let improvementPercent = 0;
    if (races.length >= 2) {
      const firstRace = races[0];
      const lastRace = races[races.length - 1];

      const firstRaceResults = results.filter((r) => r.raceId === firstRace.id && r.time > 0);
      const lastRaceResults = results.filter((r) => r.raceId === lastRace.id && r.time > 0);

      if (firstRaceResults.length > 0 && lastRaceResults.length > 0) {
        const firstDist = parseDistanceToMiles(firstRace.distance, firstRace.distanceMeters);
        const lastDist = parseDistanceToMiles(lastRace.distance, lastRace.distanceMeters);

        if (firstDist > 0 && lastDist > 0) {
          const firstAvgPace =
            firstRaceResults.reduce((sum, r) => sum + r.time, 0) / (firstRaceResults.length * firstDist);
          const lastAvgPace =
            lastRaceResults.reduce((sum, r) => sum + r.time, 0) / (lastRaceResults.length * lastDist);

          if (firstAvgPace > 0 && lastAvgPace > 0) {
            improvementPercent = ((firstAvgPace - lastAvgPace) / firstAvgPace) * 100;
          }
        }
      }
    }

    const firstMeet = races.length > 0 ? { name: races[0].name, date: races[0].date, avgPace: 0 } : null;
    const lastMeet =
      races.length > 0
        ? { name: races[races.length - 1].name, date: races[races.length - 1].date, avgPace: 0 }
        : null;

    res.json({
      id: teamId,
      name: team.name,
      totalRaces,
      totalMiles: parseFloat(totalMiles.toFixed(2)),
      avgMilePace: avgPace,
      meetCount,
      totalRunners,
      improvementPercent: parseFloat(improvementPercent.toFixed(1)),
      firstMeet,
      lastMeet,
    });
  } catch (err) {
    console.error('Error in /team/performance:', err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// ---------------------------------------------------------------------------
// Join by code, and claim/approve — the self-serve half of linking a signed-in
// account to a specific Athlete row (see prisma/schema.prisma for the other
// half, AthleteInvite, which is the coach-initiated half in routes/athletes.js).
//
// Every one of these endpoints already had a frontend call site before this
// existed on the backend — including this file's own /pending-claims, whose
// previous body was a stub whose comment admitted the backing table did not
// exist. None of it worked; none of it 404'd loudly, either, since the
// frontend was written against an imagined API that was never built.
// ---------------------------------------------------------------------------

// Mirrors the matching heuristic already in JoinTeamPage.tsx client-side —
// duplicated here because the score must be trustworthy for a coach's
// approve/reject decision, so it can't be something the client computed and
// simply asserted in the request body.
function nameMatchScore(athleteName, userName) {
  const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
  const a = normalize(athleteName);
  const b = normalize(userName);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;
  const maxLength = Math.max(a.length, b.length);
  let matches = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) matches++;
  }
  return Math.round((matches / maxLength) * 100);
}

// POST /api/team/generate-join-code
// The frontend's join-code panel (RosterPage) has called this since it was
// built; the backend route never existed, so it 404'd every time.
router.post('/generate-join-code', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    let joinCode;
    // joinCode is globally unique across all teams — retry on the rare
    // collision rather than trusting a single random draw never clashes.
    for (let attempt = 0; attempt < 5 && !joinCode; attempt++) {
      const candidate = generateJoinCode();
      const clash = await prisma.team.findUnique({ where: { joinCode: candidate }, select: { id: true } });
      if (!clash) joinCode = candidate;
    }
    if (!joinCode) {
      return res.status(500).json({ msg: 'Could not generate a unique join code — try again.' });
    }

    await prisma.team.update({ where: { id: req.user.teamId }, data: { joinCode } });

    res.json({ msg: 'New join code generated.', joinCode });
  } catch (error) {
    console.error('Error generating join code:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Staff invites (T1: "Retire POST /api/profile/upgrade-to-coach in favor of
// head-coach-issued invites"). A shared secret code let anyone who learned
// it become a coach on whatever team they happened to be on; this replaces
// it with a head-coach naming exactly who gets exactly which role.
// ---------------------------------------------------------------------------

const STAFF_INVITE_TTL_DAYS = 30;
const INVITABLE_STAFF_ROLES = new Set(['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH']);

// GET /api/team/staff
// Current staff roster (active TeamMembers who aren't plain athletes) plus
// pending invites, so the settings screen can show one list of "who has
// access" instead of two.
router.get('/staff', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const [members, invites] = await Promise.all([
      prisma.teamMember.findMany({
        where: { teamId: req.user.teamId, role: { not: 'ATHLETE' } },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      prisma.staffInvite.findMany({
        where: { teamId: req.user.teamId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      staff: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        active: m.active,
        joinedAt: m.joinedAt,
      })),
      pendingInvites: invites.map((i) => ({
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching staff:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/team/staff-invite
// Head-coach-only: granting HEAD_COACH/COACH/VOLUNTEER_COACH authority is
// exactly the "staff management" the Build Spec keeps head-coach-scoped.
router.post('/staff-invite', authenticate, requireTeam, requireRole(['HEAD_COACH']), async (req, res) => {
  const { email, role } = req.body;
  const teamId = req.user.teamId;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ msg: 'A valid email is required.' });
  }
  if (!INVITABLE_STAFF_ROLES.has(role)) {
    return res.status(400).json({ msg: `Role must be one of: ${[...INVITABLE_STAFF_ROLES].join(', ')}.` });
  }

  try {
    const expiresAt = new Date(Date.now() + STAFF_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    // One invite per (team, email) — resending overwrites the token and
    // role rather than accumulating history, same pattern as AthleteInvite.
    const invite = await prisma.staffInvite.upsert({
      where: { teamId_email: { teamId, email } },
      update: { role, status: 'pending', expiresAt, acceptedAt: null, invitedById: req.user.id },
      create: { teamId, email, role, expiresAt, invitedById: req.user.id },
    });

    // No email service is wired up (see MIGRATION_STATUS.md) — the head
    // coach copies/sends this link themselves, same as the join code and
    // athlete invites already work.
    res.status(201).json({
      msg: `Invite ready for ${email}.`,
      token: invite.token,
      invite: { token: invite.token, email: invite.email, role: invite.role, expiresAt: invite.expiresAt },
    });
  } catch (error) {
    console.error('Error creating staff invite:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/team/accept-staff-invite
// Authenticated: the token identifies the invite (team + role); the
// session identifies who is accepting it. Unlike claim-profile, the head
// coach already named this exact person — accepting IS the approval, no
// separate review step, matching AthleteInvite's model.
router.post('/accept-staff-invite', authenticate, async (req, res) => {
  const { token } = req.body;
  const userId = req.user.id;

  if (!token) {
    return res.status(400).json({ msg: 'Invite token is required.' });
  }

  try {
    const invite = await prisma.staffInvite.findUnique({
      where: { token },
      include: { team: true },
    });

    if (!invite || invite.status !== 'pending') {
      return res.status(404).json({ msg: 'This invite is no longer valid.' });
    }
    if (invite.expiresAt < new Date()) {
      return res.status(410).json({ msg: 'This invite has expired. Ask the head coach to resend it.' });
    }

    await prisma.$transaction([
      prisma.staffInvite.update({
        where: { id: invite.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      }),
      prisma.user.update({ where: { id: userId }, data: { teamId: invite.teamId } }),
      prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: invite.teamId, userId } },
        update: { role: invite.role, active: true },
        create: { teamId: invite.teamId, userId, role: invite.role },
      }),
    ]);

    res.json({
      msg: `Welcome to ${invite.team.name} as ${invite.role.replace('_', ' ').toLowerCase()}.`,
      teamId: invite.teamId,
      role: invite.role,
    });
  } catch (error) {
    console.error('Error accepting staff invite:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PATCH /api/team/staff/:userId
// Head-coach-only: change an existing staff member's role, or deactivate
// them (active: false) rather than deleting the row, so past group-leader/
// plan-author references stay intact.
router.patch('/staff/:userId', authenticate, requireTeam, requireRole(['HEAD_COACH']), async (req, res) => {
  const { role, active } = req.body;
  const teamId = req.user.teamId;

  if (role !== undefined && !INVITABLE_STAFF_ROLES.has(role)) {
    return res.status(400).json({ msg: `Role must be one of: ${[...INVITABLE_STAFF_ROLES].join(', ')}.` });
  }

  try {
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: req.params.userId } },
    });
    if (!membership || membership.role === 'ATHLETE') {
      return res.status(404).json({ msg: 'Staff member not found.' });
    }

    const updates = {};
    if (role !== undefined) updates.role = role;
    if (active !== undefined) updates.active = Boolean(active);

    const updated = await prisma.teamMember.update({ where: { id: membership.id }, data: updates });
    res.json({ userId: updated.userId, role: updated.role, active: updated.active });
  } catch (error) {
    console.error('Error updating staff member:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/team/join
router.post('/join', authenticate, async (req, res) => {
  const { joinCode } = req.body;
  const userId = req.user.id;

  if (!joinCode) {
    return res.status(400).json({ msg: 'Join code is required.' });
  }

  try {
    const team = await prisma.team.findUnique({ where: { joinCode } });
    if (!team) {
      return res.status(404).json({ msg: 'Team not found for this join code.' });
    }

    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId } },
      update: {},
      create: { teamId: team.id, userId, role: 'ATHLETE' },
    });

    await prisma.user.update({ where: { id: userId }, data: { teamId: team.id } });

    // Roster rows nobody has claimed yet — what the "pick your profile" step
    // on JoinTeamPage lets the new member choose from.
    const availableProfiles = await prisma.athlete.findMany({
      where: { teamId: team.id, userId: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({
      success: true,
      msg: `Successfully joined team: ${team.name}`,
      teamId: team.id,
      teamName: team.name,
      availableProfiles: availableProfiles.map((a) => ({ _id: a.id, name: a.name })),
    });
  } catch (error) {
    console.error('Error joining team:', error.message);
    res.status(500).json({ msg: 'Internal Server Error' });
  }
});

// POST /api/team/claim-profile
// Files a pending claim; does NOT grant access by itself. Unlike an
// AthleteInvite (where the coach already named this exact athlete), a claim
// is a stranger asserting "this roster row is me" — that needs a human,
// the coach, to confirm before it does anything.
router.post('/claim-profile', authenticate, requireTeam, async (req, res) => {
  const { athleteId } = req.body;
  const userId = req.user.id;
  const teamId = req.user.teamId;

  if (!athleteId) {
    return res.status(400).json({ msg: 'athleteId is required.' });
  }

  try {
    const athlete = await prisma.athlete.findFirst({ where: { id: athleteId, teamId } });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found on your team.' });
    }
    if (athlete.userId) {
      return res.status(409).json({ msg: 'This profile has already been claimed.' });
    }

    const matchScore = nameMatchScore(athlete.name, req.user.name);

    await prisma.athleteClaim.upsert({
      where: { athleteId_userId: { athleteId, userId } },
      update: { status: 'pending', matchScore, requestedAt: new Date(), resolvedAt: null },
      create: { athleteId, userId, teamId, matchScore },
    });

    res.json({ msg: 'Claim submitted for coach approval.', athleteName: athlete.name, matchScore });
  } catch (error) {
    console.error('Error claiming profile:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/team/pending-claims
router.get('/pending-claims', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  try {
    const claims = await prisma.athleteClaim.findMany({
      where: { teamId: req.user.teamId, status: 'pending' },
      include: { athlete: { select: { name: true } } },
      orderBy: { requestedAt: 'asc' },
    });

    res.json({
      pendingClaims: claims.map((c) => ({
        _id: c.id,
        userId: c.userId,
        athleteId: c.athleteId,
        athleteName: c.athlete.name,
        matchScore: c.matchScore || 0,
        requestedAt: c.requestedAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching pending claims:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/team/approve-claim
router.post('/approve-claim', authenticate, requireTeam, requireRole(['HEAD_COACH', 'COACH']), async (req, res) => {
  const { claimId, action } = req.body;

  if (!claimId || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ msg: 'claimId and a valid action are required.' });
  }

  try {
    const claim = await prisma.athleteClaim.findFirst({
      where: { id: claimId, teamId: req.user.teamId },
    });
    if (!claim) {
      return res.status(404).json({ msg: 'Claim not found.' });
    }
    if (claim.status !== 'pending') {
      return res.status(409).json({ msg: `Claim was already ${claim.status}.` });
    }

    if (action === 'approve') {
      const athlete = await prisma.athlete.findUnique({ where: { id: claim.athleteId } });
      if (athlete?.userId && athlete.userId !== claim.userId) {
        return res.status(409).json({ msg: 'This profile was claimed by someone else in the meantime.' });
      }
      await prisma.$transaction([
        prisma.athlete.update({ where: { id: claim.athleteId }, data: { userId: claim.userId } }),
        prisma.athleteClaim.update({
          where: { id: claim.id },
          data: { status: 'approved', resolvedAt: new Date() },
        }),
        // Any other pending claims on the same athlete are now moot.
        prisma.athleteClaim.updateMany({
          where: { athleteId: claim.athleteId, status: 'pending', id: { not: claim.id } },
          data: { status: 'rejected', resolvedAt: new Date() },
        }),
      ]);
    } else {
      await prisma.athleteClaim.update({
        where: { id: claim.id },
        data: { status: 'rejected', resolvedAt: new Date() },
      });
    }

    res.json({ msg: `Claim ${action === 'approve' ? 'approved' : 'rejected'}.` });
  } catch (error) {
    console.error('Error resolving claim:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
