-- E2 (LeadPack Master Build Handoff): usage logging. Three fields only —
-- route, role, timestamp — no user id, no athlete id, no team id. This is
-- an aggregate-counts table, not an audit log.

CREATE TABLE "page_views" (
    "id" UUID NOT NULL,
    "route" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "page_views_route_idx" ON "page_views"("route");
CREATE INDEX "page_views_created_at_idx" ON "page_views"("created_at");
