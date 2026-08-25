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
// membership of the SAME group's type that's active as of effectiveDate,
// then opens the new one. Never updates groupId on an existing row.
//
// "Active as of effectiveDate" (isMembershipActiveOn), not just "endDate
// IS NULL": most memberships are open-ended so the two coincide, but
// X_TRAINING stints (see GroupType's schema comment) are commonly created
// with endDate already set — a bounded "today, or the next N days" — and
// still need to be found and closed here if, say, a coach re-sends the
// same athlete to cross-training mid-stint with an updated reason.
//
// endDate, if passed, bounds the new row up front (a scheduled stint that
// expires on its own, per isMembershipActiveOn, with no further action
// needed); omitted, it's the usual open-ended assignment.
async function moveAthleteToGroup({ athleteId, groupId, effectiveDate, movedById = null, reason = null, endDate = null }) {
  const targetGroup = await prisma.group.findUniqueOrThrow({ where: { id: groupId } });
  const normalizedDate = normalizeDate(effectiveDate);

  return prisma.$transaction(async (tx) => {
    const sameType = await tx.groupMembership.findMany({
      where: { athleteId, group: { type: targetGroup.type } },
    });
    const currentlyActive = sameType.filter((m) => isMembershipActiveOn(m, normalizedDate));

    for (const membership of currentlyActive) {
      if (membership.groupId === groupId) continue; // already here — no-op, caller's problem to avoid calling this at all
      await tx.groupMembership.update({
        where: { id: membership.id },
        data: { endDate: normalizedDate },
      });
    }

    return tx.groupMembership.create({
      data: {
        groupId,
        athleteId,
        startDate: normalizedDate,
        movedById,
        reason,
        endDate: endDate != null ? normalizeDate(endDate) : null,
      },
    });
  });
}

// "Never hard-delete a membership. Removal sets endDate." — the doc's own
// rule, but T2's first pass only ever built the "move into a new group"
// half (moveAthleteToGroup, which always opens a replacement row). This is
// the other half: take an athlete OUT of a group with nothing opening in
// its place — closes their membership in exactly this group that's active
// as of effectiveDate (see moveAthleteToGroup's comment on why this isn't
// just "endDate IS NULL" — ending a bounded X_TRAINING stint early is
// exactly the case that needs the date-aware check). A no-op (returns
// null) if they aren't currently in it, rather than throwing, since
// "remove someone who's already not there" is a reasonable double-click/
// race to just ignore.
async function removeAthleteFromGroup({ athleteId, groupId, effectiveDate = new Date(), movedById = null, reason = null }) {
  const normalizedDate = normalizeDate(effectiveDate);

  const candidates = await prisma.groupMembership.findMany({
    where: { athleteId, groupId },
  });
  const active = candidates.find((m) => isMembershipActiveOn(m, normalizedDate));
  if (!active) return null;

  return prisma.groupMembership.update({
    where: { id: active.id },
    data: { endDate: normalizedDate, movedById, reason },
  });
}

// Everyone currently active in one group, as of date — the counterpart to
// getGroupOn (which is "this athlete's group"; this is "this group's
// athletes"). Needed because a plain `endDate: null` list query, used
// everywhere else in routes/groups.js for "current members," would miss
// anyone whose X_TRAINING stint has a real endDate already set but hasn't
// arrived yet. Same "load them all, filter in JS" approach as getGroupOn,
// for the same reason (small N, one shared source of truth for "active").
async function getActiveMembersOf(groupId, date = new Date()) {
  const memberships = await prisma.groupMembership.findMany({ where: { groupId } });
  return memberships.filter((m) => isMembershipActiveOn(m, date));
}

module.exports = { getGroupOn, getActiveMembersOf, moveAthleteToGroup, removeAthleteFromGroup, isMembershipActiveOn, normalizeDate };
