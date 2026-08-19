// One-off fix for a real bug in POST /api/athletes/accept-invite (now fixed
// going forward — see lib/athleteInvites.js): the route had no identity
// guard, so a user who was already signed in when they opened an athlete
// invite link got silently linked as that athlete — Athlete.userId pointed
// at them, a TeamMember(ATHLETE) row created, and their own User.teamId
// overwritten with the invite's team. Reported case: a super admin account
// ended up seeing "My Progress" for someone else's athlete profile.
//
// This reverses that for one account: clears Athlete.userId, deletes the
// TeamMember(ATHLETE) row for that (team, user) pair, and marks the invite
// back to 'pending' so the real athlete can accept it. It does NOT touch
// User.teamId by default, because there's no record of what it was before
// the bug overwrote it — pass --reset-team-id=<uuid> if you know the
// correct value to restore.
//
// Dry run (reports current state, writes nothing):
//   node scripts/unlinkAthleteAccount.js --user-email=you@example.com
//
// Apply:
//   node scripts/unlinkAthleteAccount.js --user-email=you@example.com --confirm
//
// Optionally also restore the user's original team:
//   node scripts/unlinkAthleteAccount.js --user-email=you@example.com --confirm --reset-team-id=<uuid>

const prisma = require('../lib/db');

function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function main() {
  const email = getArg('user-email');
  const confirm = process.argv.includes('--confirm');
  const resetTeamId = getArg('reset-team-id');

  if (!email) {
    console.error('Usage: node scripts/unlinkAthleteAccount.js --user-email=<email> [--confirm] [--reset-team-id=<uuid>]');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { linkedAthlete: true, teamMemberships: true },
  });

  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exitCode = 1;
    return;
  }

  console.log(`User: ${user.email} (id=${user.id})`);
  console.log(`  isSuperAdmin note: this script doesn't check that field — verify by hand before confirming.`);
  console.log(`  User.teamId: ${user.teamId ?? 'null'}`);

  if (!user.linkedAthlete) {
    console.log('  No linked athlete on this account — nothing to unlink.');
    return;
  }

  console.log(`  Linked athlete: ${user.linkedAthlete.name} (id=${user.linkedAthlete.id}, teamId=${user.linkedAthlete.teamId})`);

  const athleteTeamMembership = user.teamMemberships.find(
    (m) => m.teamId === user.linkedAthlete.teamId && m.role === 'ATHLETE'
  );
  if (athleteTeamMembership) {
    console.log(`  TeamMember(ATHLETE) row to remove: id=${athleteTeamMembership.id}`);
  } else {
    console.log('  No matching TeamMember(ATHLETE) row found for that team.');
  }

  const invite = await prisma.athleteInvite.findFirst({
    where: { athleteId: user.linkedAthlete.id, status: 'accepted' },
  });
  if (invite) {
    console.log(`  Accepted invite to reset back to pending: id=${invite.id}`);
  }

  if (!confirm) {
    console.log('\nDry run — no changes made. Re-run with --confirm to apply.');
    return;
  }

  await prisma.$transaction([
    prisma.athlete.update({ where: { id: user.linkedAthlete.id }, data: { userId: null } }),
    ...(athleteTeamMembership ? [prisma.teamMember.delete({ where: { id: athleteTeamMembership.id } })] : []),
    ...(invite ? [prisma.athleteInvite.update({ where: { id: invite.id }, data: { status: 'pending', acceptedAt: null } })] : []),
    ...(resetTeamId ? [prisma.user.update({ where: { id: user.id }, data: { teamId: resetTeamId } })] : []),
  ]);

  console.log('\nDone. Unlinked athlete, removed the ATHLETE team membership, and reset the invite to pending.');
  if (!resetTeamId) {
    console.log(`User.teamId is still "${user.teamId}" — pass --reset-team-id=<uuid> in a follow-up run if that needs fixing too.`);
  }
}

main()
  .catch((err) => {
    console.error('Unlink failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
