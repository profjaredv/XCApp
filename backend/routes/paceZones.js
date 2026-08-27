const express = require('express');
const router = express.Router();
const prisma = require('../lib/db');
const { authenticate, requireTeam, requireRole } = require('../middleware/auth');
const { normalizePaceZoneSet } = require('../lib/paceZoneRules');

// A team's own training-pace vocabulary. See the PaceZone model comment in
// schema.prisma for the rule shapes, and web/src/lib/paceZones.ts for the
// arithmetic that turns a rule plus an athlete's race into actual paces.
//
// Nothing here computes a pace. These routes store and return DEFINITIONS
// only: the calculation depends on which athlete and which race a coach is
// looking at, changes live as they flip between races, and would be a
// round trip per athlete if it lived on the server. The default
// McMillan-style set is a code constant on the frontend and is never
// stored, so a team with no rows here is not misconfigured — it is the
// normal, out-of-the-box state.

const SELECT = {
  id: true,
  abbreviation: true,
  name: true,
  notes: true,
  sortOrder: true,
  ruleType: true,
  refDistanceMeters: true,
  offsetFastSec: true,
  offsetSlowSec: true,
  rangeDistanceAMeters: true,
  rangeDistanceBMeters: true,
};

function listZones(teamId) {
  return prisma.paceZone.findMany({
    where: { teamId },
    select: SELECT,
    orderBy: { sortOrder: 'asc' },
  });
}

// GET /api/pace-zones
// Readable by anyone on the team, athletes included: an athlete looking at
// their own training paces needs to know what their coach means by "T",
// and these are definitions, not anyone's personal data.
router.get('/', authenticate, requireTeam, async (req, res) => {
  try {
    res.status(200).json({ zones: await listZones(req.user.teamId) });
  } catch (error) {
    console.error('Error listing pace zones:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/pace-zones
//
// Replaces the whole set in one call, rather than offering per-zone
// create/update/delete. The editor is a single form a coach saves once,
// display order is list position, and abbreviations must be unique across
// the set — all three are properties of the SET, not of one row, and
// checking them against a half-applied state is how you get a save that
// fails partway and leaves two zones both called "T".
//
// HEAD_COACH only. This is not one athlete's data: changing what "T" means
// changes every pace every athlete on the team is given.
router.put('/', authenticate, requireTeam, requireRole(['HEAD_COACH']), async (req, res) => {
  const normalized = normalizePaceZoneSet(req.body?.zones);
  if (!normalized.ok) return res.status(400).json({ msg: normalized.error });

  const teamId = req.user.teamId;
  try {
    // Delete-then-insert inside one transaction. Diffing by abbreviation
    // would be more surgical, but a coach RENAMING a zone's abbreviation
    // makes the diff ambiguous (is "T" -> "Th" a rename or a delete plus
    // an add?), and nothing references a PaceZone by id — no session, no
    // result, nothing that would be orphaned by new ids. The unique index
    // also makes the naive order matter: deleting first is what lets a
    // coach swap two zones' abbreviations in a single save.
    const zones = await prisma.$transaction(async (tx) => {
      await tx.paceZone.deleteMany({ where: { teamId } });
      if (normalized.value.length > 0) {
        await tx.paceZone.createMany({
          data: normalized.value.map((z) => ({ ...z, teamId })),
        });
      }
      return tx.paceZone.findMany({ where: { teamId }, select: SELECT, orderBy: { sortOrder: 'asc' } });
    });
    res.status(200).json({ zones });
  } catch (error) {
    console.error('Error saving pace zones:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
