-- Seeds the track Event catalog (same list as scripts/seedTrackEvents.js) so
-- the import works on deploy with no manual step. Idempotent: an event
-- already present by name is left as it is.
INSERT INTO "events" ("id", "name", "category", "unit", "scoring_direction", "is_relay", "relay_leg_count", "is_multi_event", "sort_order") VALUES
  (gen_random_uuid(), '100 Meters', 'SPRINT', 'SECONDS', 'LOWER_BETTER', false, NULL, false, 10),
  (gen_random_uuid(), '200 Meters', 'SPRINT', 'SECONDS', 'LOWER_BETTER', false, NULL, false, 20),
  (gen_random_uuid(), '400 Meters', 'SPRINT', 'SECONDS', 'LOWER_BETTER', false, NULL, false, 30),
  (gen_random_uuid(), '800 Meters', 'MIDDLE_DISTANCE', 'SECONDS', 'LOWER_BETTER', false, NULL, false, 40),
  (gen_random_uuid(), '1600 Meters', 'MIDDLE_DISTANCE', 'SECONDS', 'LOWER_BETTER', false, NULL, false, 50),
  (gen_random_uuid(), '3200 Meters', 'DISTANCE', 'SECONDS', 'LOWER_BETTER', false, NULL, false, 60),
  (gen_random_uuid(), '100 Meter Hurdles', 'HURDLES', 'SECONDS', 'LOWER_BETTER', false, NULL, false, 70),
  (gen_random_uuid(), '110 Meter Hurdles', 'HURDLES', 'SECONDS', 'LOWER_BETTER', false, NULL, false, 80),
  (gen_random_uuid(), '300 Meter Hurdles', 'HURDLES', 'SECONDS', 'LOWER_BETTER', false, NULL, false, 90),
  (gen_random_uuid(), '4x100 Relay', 'RELAY', 'SECONDS', 'LOWER_BETTER', true, 4, false, 100),
  (gen_random_uuid(), '4x200 Relay', 'RELAY', 'SECONDS', 'LOWER_BETTER', true, 4, false, 110),
  (gen_random_uuid(), '4x400 Relay', 'RELAY', 'SECONDS', 'LOWER_BETTER', true, 4, false, 120),
  (gen_random_uuid(), '4x800 Relay', 'RELAY', 'SECONDS', 'LOWER_BETTER', true, 4, false, 130),
  (gen_random_uuid(), 'High Jump', 'JUMP', 'FEET_INCHES', 'HIGHER_BETTER', false, NULL, false, 140),
  (gen_random_uuid(), 'Long Jump', 'JUMP', 'FEET_INCHES', 'HIGHER_BETTER', false, NULL, false, 150),
  (gen_random_uuid(), 'Triple Jump', 'JUMP', 'FEET_INCHES', 'HIGHER_BETTER', false, NULL, false, 160),
  (gen_random_uuid(), 'Pole Vault', 'JUMP', 'FEET_INCHES', 'HIGHER_BETTER', false, NULL, false, 170),
  (gen_random_uuid(), 'Shot Put', 'THROW', 'FEET_INCHES', 'HIGHER_BETTER', false, NULL, false, 180),
  (gen_random_uuid(), 'Discus', 'THROW', 'FEET_INCHES', 'HIGHER_BETTER', false, NULL, false, 190),
  (gen_random_uuid(), 'Javelin', 'THROW', 'FEET_INCHES', 'HIGHER_BETTER', false, NULL, false, 200)
ON CONFLICT ("name") DO NOTHING;
