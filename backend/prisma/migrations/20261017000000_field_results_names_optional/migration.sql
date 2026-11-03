-- Other schools' athletes are no longer stored by name (lib/fieldAnonymize.js),
-- so the name has to be allowed to be empty. Schema-only: nothing is changed or
-- deleted here. Clearing names already stored is a separate, deliberate step
-- (scripts/anonymizeFieldResults.js), run only after a database backup.
ALTER TABLE "field_results" ALTER COLUMN "athlete_name" DROP NOT NULL;
