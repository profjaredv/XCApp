-- The team's one auto-provisioned cross-training roster per season — see
-- GroupType's own schema comment. Not used by this migration itself (safe
-- to add in a transaction), only by application code afterward.
ALTER TYPE "GroupType" ADD VALUE 'X_TRAINING';
