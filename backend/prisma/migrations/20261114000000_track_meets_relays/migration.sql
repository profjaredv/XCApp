-- Track meets a coach plans ahead (notes for the day), and relays: which
-- squad a relay result is (A, B...), since one school often runs several
-- in the same event. Both nullable and additive.
ALTER TABLE "track_meets" ADD COLUMN "notes" TEXT;
ALTER TABLE "track_results" ADD COLUMN "relay_team" TEXT;
