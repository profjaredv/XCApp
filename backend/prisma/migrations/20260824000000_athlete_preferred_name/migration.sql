-- Optional nickname/preferred name, shown throughout the app instead of the
-- legal `name` wherever set. `name` itself is untouched and still drives
-- Athletic.net matching.
ALTER TABLE "athletes" ADD COLUMN "preferred_name" TEXT;
