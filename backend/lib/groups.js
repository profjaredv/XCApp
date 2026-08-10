// T2 (Team Management handoff): "Write one helper, getGroupOn(athleteId,
// date), and use it everywhere. Do not scatter date-range queries through
// routes." This is that helper, plus moveAthleteToGroup, the one place a
// GroupMembership row should ever be closed/opened.
//
// Date-range convention: startDate is inclusive, endDate is EXCLUSIVE
// (null means "still current"). Moving an athlete sets the old
// membership's endDate to the new membership's startDate — the move date
// itself belongs to the NEW group, not the old one.
//
// "At most one active TRAINING membership per athlete at a time. CAPTAIN
// and CUSTOM memberships may run concurrently with a training group."
// (the doc's own rule) — so "active" here is scoped per GroupType:
// moving an athlete between TRAINING groups never touches a concurrent
// CAPTAIN/CUSTOM membership, and vice versa.
const prisma = require('./db');

function normalizeDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Pure and DB-free on purpose — the actual date-range decision, testable
// without a database.
function isMembershipActiveOn(membership, date) {
  const target = normalizeDate(date);
  const start = normalizeDate(membership.startDate);
  if (target < start) return false;
  if (membership.endDate == null) return true;
  return target < normalizeDate(membership.endDate);
}

// Returns the GroupMembership (with its Group included) active for this
// athlete, of the given type, on the given date — or null if they were in
// no such group that day. Loads every membership for the athlete rather
// than pushing the date comparison into SQL: an athlete accumulates at
// most a handful of these over four years, and doing the range check in
// JS means isMembershipActiveOn is the single source of truth for what
// "active on this date" means, provably the same logic this file's own
// tests exercise.
async function getGroupOn(athleteId, date, type = 'TRAINING') {
  const memberships = await prisma.groupMembership.findMany({
    where: { athleteId, group: { type } },
    include: { group: true },
  });
  const active = memberships.filter((m) => isMembershipActiveOn(m, date));
  if (active.length === 0) return null;
  // Should never be more than one for a single type by construction
  // (moveAthleteToGroup below enforces it) — if data drift ever produces
  // an overlap anyway, prefer the most recently started rather than error,
  // since this is a read path.
  active.sort((a, b) => normalizeDate(b.startDate) - normalizeDate(a.startDate));
  return active[0];
}

// The only place a GroupMembership should be created when an athlete is
// moving from wherever they currently are (if anywhere) — closes any
// currently-active membership of the SAME group's type, then opens the
// new one. Never updates groupId on an existing row.
async function moveAthleteToGroup({ athleteId, groupId, effectiveDate, movedById = null, reason = null }) {
  const targetGroup = await prisma.group.findUniqueOrThrow({ where: { id: groupId } });
  const normalizedDate = normalizeDate(effectiveDate);

  return prisma.$transaction(async (tx) => {
    const currentlyActive = await tx.groupMembership.findMany({
      where: { athleteId, endDate: null, group: { type: targetGroup.type } },
    });

    for (const membership of currentlyActive) {
      if (membership.groupId === groupId) continue; // already here — no-op, caller's problem to avoid calling this at all
      await tx.groupMembership.update({
        where: { id: membership.id },
        data: { endDate: normalizedDate },
      });
    }

    return tx.groupMembership.create({
      data: { groupId, athleteId, startDate: normalizedDate, movedById, reason },
    });
  });
}

module.exports = { getGroupOn, moveAthleteToGroup, isMembershipActiveOn, normalizeDate };
