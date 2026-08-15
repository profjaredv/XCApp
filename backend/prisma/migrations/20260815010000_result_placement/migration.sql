-- Adds Result.overall_place / overall_field_size. Result.place already
-- existed but was never populated (the season scraper only ever wrote
-- time/grade) — it now becomes "place within this athlete's own race",
-- matched against that race's FieldResult rows once a field-results upload
-- exists. overall_place/overall_field_size hold the combined ranking across
-- a meet's same-distance/same-gender races when a meet splits one
-- conceptual race into multiple ability-tiered heats (Boys Varsity
-- Gold/Silver/Bronze, etc.) — see lib/fieldPlacement.js.

ALTER TABLE "results" ADD COLUMN "overall_place" INTEGER;
ALTER TABLE "results" ADD COLUMN "overall_field_size" INTEGER;
