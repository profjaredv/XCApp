-- Collage-only branding, separate from the app-wide `colors` JSON: a
-- custom accent for the printed collage, and an R2 object key for a
-- custom logo (no Photo row — the logo has no meet, no tags). Both null
-- by default, falling back to the collage's own built-in accent/logo.
ALTER TABLE "teams" ADD COLUMN "collage_accent_color" TEXT;
ALTER TABLE "teams" ADD COLUMN "collage_logo_key" TEXT;
