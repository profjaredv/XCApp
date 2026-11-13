-- Track & Field groups by event group (Sprints, Jumps, Throws...). Unlike a
-- TRAINING group an athlete can be in several at once: a sprinter who also
-- long jumps is in both. event_group says which one a group is
-- (lib/trackEventGroups.js); null for every other type of group.
ALTER TYPE "GroupType" ADD VALUE 'EVENT';
ALTER TABLE "groups" ADD COLUMN "event_group" TEXT;
