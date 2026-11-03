-- Team colors: one optional JSON object of #rrggbb values. Nothing is changed for existing teams (null = default).
ALTER TABLE "teams" ADD COLUMN "colors" JSONB;
