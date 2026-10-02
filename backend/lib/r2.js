const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// R2 (build spec: "Storage layout and delivery") — one private bucket, no
// public access, S3-compatible so the regular AWS SDK works against it
// with a Cloudflare endpoint. Image bytes never pass through this server:
// the browser PUTs directly to a presigned URL this module signs, and
// reads happen the same way through a presigned GET. This file is the only
// place that touches the bucket.
//
// The bucket itself, its CORS rule, and these three env vars are a one-time
// manual Cloudflare dashboard step — see docs/leadpack-photos-build-spec.md
// ("Bucket settings") — not something this codebase can provision for you.

const PUT_URL_TTL_SECONDS = 15 * 60; // enough for a single large original over a slow connection
const GET_URL_TTL_SECONDS = 60 * 60; // spec: "Delivery, version 1" — 60 minutes

let client = null;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — see backend/.env.example`);
  return value;
}

function getClient() {
  if (client) return client;
  const accountId = requireEnv('R2_ACCOUNT_ID');
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
  return client;
}

function getBucketName() {
  return requireEnv('R2_BUCKET_NAME');
}

// Key-naming convention (spec's "Storage layout" table). Pure string
// functions — thumb/web keys are never stored as their own columns,
// derived from the photo id the same way everywhere they're needed.
function photoOriginalKey(teamId, photoId) {
  return `teams/${teamId}/photos/${photoId}/orig.jpg`;
}
function photoThumbKey(teamId, photoId) {
  return `teams/${teamId}/photos/${photoId}/thumb.webp`;
}
function photoWebKey(teamId, photoId) {
  return `teams/${teamId}/photos/${photoId}/web.webp`;
}
function collageKey(teamId, athleteId, seasonId, version) {
  return `teams/${teamId}/collages/${athleteId}/${seasonId}-v${version}.png`;
}

async function presignPutUrl(key, contentType) {
  const command = new PutObjectCommand({ Bucket: getBucketName(), Key: key, ContentType: contentType });
  return getSignedUrl(getClient(), command, { expiresIn: PUT_URL_TTL_SECONDS });
}

async function presignGetUrl(key) {
  const command = new GetObjectCommand({ Bucket: getBucketName(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: GET_URL_TTL_SECONDS });
}

// Used by the finalize step (Phase 3) to confirm an upload actually landed
// before flipping a photo's status to ready — never trust the browser's
// own say-so that a PUT succeeded.
async function objectExists(key) {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: getBucketName(), Key: key }));
    return true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false;
    throw err;
  }
}

// A coach's explicit delete (spec: "A coach can hide a single photo... or
// delete it, which removes the row and all three R2 objects") — Phase 4+
// calls this for each of a photo's three keys. Also what this phase's own
// verification script uses to clean up its one test object.
async function deleteObject(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key }));
}

module.exports = {
  photoOriginalKey,
  photoThumbKey,
  photoWebKey,
  collageKey,
  presignPutUrl,
  presignGetUrl,
  objectExists,
  deleteObject,
};
