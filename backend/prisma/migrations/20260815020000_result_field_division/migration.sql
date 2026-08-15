-- Adds division tracking to both sides of the ORIGIN/FIELD split:
--
--   - field_results.division: the division/heat text a field-results row's
--     own results page reported it under (e.g. "5,000 Meters Boys Gold
--     Varsity"). Race deliberately stays scoped to (team, meet, distance)
--     only — one race can and does hold every gender and every ability-
--     tiered heat of that distance — so this is what a re-upload's
--     delete-before-recreate now scopes itself to, instead of wiping a
--     whole race's field on every division uploaded.
--
--   - results.division: the same division text, copied onto our own
--     athlete's Result row by name-matching against field_results (see
--     lib/fieldPlacement.js) — lets views group/filter our own results by
--     division without joining back through field_results.

ALTER TABLE "field_results" ADD COLUMN "division" TEXT;
ALTER TABLE "results" ADD COLUMN "division" TEXT;
