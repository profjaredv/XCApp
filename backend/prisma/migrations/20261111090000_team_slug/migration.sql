-- A LeadPack-owned address for every team (/t/<slug>), so the app no
-- longer addresses a team by its Athletic.net id. athletic_team_id stays
-- exactly as it is; this only adds a second, independent key.

ALTER TABLE "teams" ADD COLUMN "slug" TEXT;

-- From the name: lower-case, punctuation to dashes, "high school" dropped.
UPDATE "teams"
SET "slug" = NULLIF(
  left(
    regexp_replace(
      trim(both '-' from regexp_replace(regexp_replace(lower("name"), '[''’.]', '', 'g'), '[^a-z0-9]+', '-', 'g')),
      '-(senior-)?high-school$|-hs$', ''
    ),
    48
  ),
  ''
);

-- Nothing usable, digits only, or a reserved word: fall back to "team-...".
UPDATE "teams" SET "slug" = 'team-' || COALESCE("slug", left("id"::text, 8))
WHERE "slug" IS NULL OR "slug" ~ '^[0-9]+$'
   OR "slug" IN ('new', 'admin', 'api', 'join', 'login', 'start', 'team', 'teams', 'demo');

-- Two teams with the same name: the older keeps it, later ones get -2, -3.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "slug" ORDER BY "created_at", "id") AS rn FROM "teams"
)
UPDATE "teams" t SET "slug" = t."slug" || '-' || ranked.rn
FROM ranked WHERE ranked."id" = t."id" AND ranked.rn > 1;

ALTER TABLE "teams" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");
