// LeadPack Photos, Phase 2 "Foundation" — the spec's own done-when check:
// "one test photo goes up through a presigned URL, gets a `photos` row,
// and displays from a presigned GET."
//
// Run once, by hand, against a real Neon database and a real R2 bucket,
// after both are configured:
//
//   TEAM_ID=<a real team's id> node scripts/verifyPhotosFoundation.js
//
// TEAM_ID is optional — omit it and the script uses the first team it
// finds, logging which one. Requires DATABASE_URL/DIRECT_URL and the R2_*
// vars (see .env.example) to already be set. Cleans up the row and the R2
// object it creates; leaves everything else untouched.

require('dotenv').config();
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const r2 = require('../lib/r2');
const { createPendingPhoto, finalizeTeamPhoto, getTeamPhoto } = require('../lib/photosAccess');

const prisma = new PrismaClient();

async function main() {
  const teamId = process.env.TEAM_ID || (await prisma.team.findFirst({ select: { id: true, name: true } }))?.id;
  if (!teamId) throw new Error('No team found — set TEAM_ID or create a team first.');
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true } });
  if (!team) throw new Error(`No team with id ${teamId}.`);
  console.log(`Using team: ${team.name} (${team.id})`);

  const meet = await prisma.meet.findFirst({ where: { teamId }, select: { id: true, name: true } });
  if (!meet) throw new Error(`Team ${team.name} has no meets — create one first (a Meet row, not a Race).`);
  console.log(`Using meet: ${meet.name} (${meet.id})`);

  // Stand-in bytes — Phase 2 is proving the plumbing, not the resize
  // pipeline (that's Phase 3), so a small deterministic buffer is enough.
  const testBytes = Buffer.from(`leadpack-photos-foundation-check ${Date.now()}`);
  const sha256 = crypto.createHash('sha256').update(testBytes).digest('hex');

  console.log('Creating pending photo row...');
  const photo = await createPendingPhoto(prisma, { teamId, meetId: meet.id, sha256, uploadedById: null });
  const objectKey = photo.objectKey;
  console.log(`  photos row: ${photo.id}`);
  console.log(`  object key: ${objectKey}`);

  console.log('Requesting a presigned PUT URL and uploading the test bytes...');
  const putUrl = await r2.presignPutUrl(objectKey, 'application/octet-stream');
  const putRes = await fetch(putUrl, { method: 'PUT', body: testBytes });
  if (!putRes.ok) throw new Error(`Presigned PUT failed: ${putRes.status} ${await putRes.text()}`);

  console.log('Confirming the object landed in R2...');
  const exists = await r2.objectExists(objectKey);
  if (!exists) throw new Error('Object not found in R2 after upload.');

  console.log('Finalizing the photo row...');
  const finalized = await finalizeTeamPhoto(prisma, teamId, photo.id);
  if (!finalized.ok) throw new Error(`finalizeTeamPhoto did not succeed: ${JSON.stringify(finalized)}`);
  const readyRow = await getTeamPhoto(prisma, teamId, photo.id);
  if (readyRow?.status !== 'READY') throw new Error(`Expected status READY, got ${readyRow?.status}`);

  console.log('Requesting a presigned GET URL and reading it back...');
  const getUrl = await r2.presignGetUrl(objectKey);
  const getRes = await fetch(getUrl);
  if (!getRes.ok) throw new Error(`Presigned GET failed: ${getRes.status}`);
  const roundTripped = Buffer.from(await getRes.arrayBuffer());
  if (!roundTripped.equals(testBytes)) throw new Error('Downloaded bytes did not match what was uploaded.');

  console.log('\n✅ Round trip confirmed: presigned PUT -> photos row -> presigned GET, bytes match.');

  console.log('\nCleaning up...');
  await r2.deleteObject(objectKey);
  await prisma.photo.delete({ where: { id: photo.id } });
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('\n❌ Foundation check failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
