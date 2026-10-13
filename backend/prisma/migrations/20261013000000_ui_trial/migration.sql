-- "Try the new LeadPack" UI trial (docs/leadpack-new-ui-trial.md §1).
-- Additive only: every existing user stays on "classic", every existing
-- page view is attributed to "classic" (the only UI that existed).

-- AlterTable
ALTER TABLE "users" ADD COLUMN "ui_version" TEXT NOT NULL DEFAULT 'classic';

-- AlterTable
ALTER TABLE "page_views" ADD COLUMN "ui" TEXT NOT NULL DEFAULT 'classic';

-- CreateTable
CREATE TABLE "ui_switch_events" (
    "id" UUID NOT NULL,
    "from_ui" TEXT NOT NULL,
    "to_ui" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ui_switch_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ui_switch_events_created_at_idx" ON "ui_switch_events"("created_at");
