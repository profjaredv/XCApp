-- A tag made by an invited Photos Admin is attributed honestly rather than
-- lumped in under 'COACH' — same reasoning as the 'VOLUNTEER' value this
-- enum already carries for the tagging-passcode flow.
-- AlterEnum
ALTER TYPE "PhotoTagSource" ADD VALUE 'PHOTOS_ADMIN';

-- Grants a real (non-coach) account full Load/Tag/Build authority within
-- the Photos module only — see PhotosAdmin's own schema comment. Settings
-- actions (hide/delete, branding, the tag-password itself) stay coach-only
-- regardless; this table is never consulted for those.
-- CreateTable
CREATE TABLE "photos_admins" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photos_admins_team_id_user_id_key" ON "photos_admins"("team_id", "user_id");

-- CreateIndex
CREATE INDEX "photos_admins_user_id_idx" ON "photos_admins"("user_id");

-- AddForeignKey
ALTER TABLE "photos_admins" ADD CONSTRAINT "photos_admins_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos_admins" ADD CONSTRAINT "photos_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Structurally parallel to staff_invites — see PhotosAdminInvite's own
-- schema comment.
-- CreateTable
CREATE TABLE "photos_admin_invites" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invited_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photos_admin_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photos_admin_invites_token_key" ON "photos_admin_invites"("token");

-- CreateIndex
CREATE UNIQUE INDEX "photos_admin_invites_team_id_email_key" ON "photos_admin_invites"("team_id", "email");

-- CreateIndex
CREATE INDEX "photos_admin_invites_team_id_idx" ON "photos_admin_invites"("team_id");

-- AddForeignKey
ALTER TABLE "photos_admin_invites" ADD CONSTRAINT "photos_admin_invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos_admin_invites" ADD CONSTRAINT "photos_admin_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
