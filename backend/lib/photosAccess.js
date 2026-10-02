// The one place every LeadPack Photos query is scoped by team_id — build
// spec, "Privacy and guardrails": "Every query and every URL-issuing route
// is scoped by team_id. Put this check in one shared data-access helper,
// not in each route, because LeadPack is planned for licensing to other
// teams and a cross-team leak is the worst failure here."
//
// A route handler must never call prisma.photo.* / prisma.pick.* /
// prisma.collage.* directly — it calls into this module, and teamId always
// comes from req.user.teamId (set by middleware/auth.js from the verified
// session), never from a request param or body.

// Returns null both when the id doesn't exist and when it belongs to
// another team — those two cases must look identical to the caller, so a
// cross-team id can never be distinguished from a typo.
async function getTeamPhoto(prisma, teamId, photoId) {
  return prisma.photo.findFirst({ where: { id: photoId, teamId } });
}

// Authorize step (Phase 3): the server, not the browser, decides a
// photo_id and inserts the row before any bytes move — see the build
// spec's upload pipeline. teamId is the caller's own, never trusted from
// the client.
async function createPendingPhoto(prisma, { teamId, meetId, objectKey, sha256, uploadedById }) {
  return prisma.photo.create({
    data: { teamId, meetId, objectKey, sha256, uploadedBy: uploadedById, status: 'PENDING' },
  });
}

// Finalize step: flips a photo to ready only if it both exists AND belongs
// to this team — the `where` clause is the enforcement, not a check
// beforehand that something else could race past.
async function finalizeTeamPhoto(prisma, teamId, photoId) {
  const result = await prisma.photo.updateMany({
    where: { id: photoId, teamId, status: 'PENDING' },
    data: { status: 'READY' },
  });
  return result.count > 0;
}

module.exports = {
  getTeamPhoto,
  createPendingPhoto,
  finalizeTeamPhoto,
};
