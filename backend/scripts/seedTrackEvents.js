// LeadPack Track & Field handoff, Section 2: seeds the Event reference
// table with a WIAA-typical outdoor event list.
//
// ** PROVISIONAL — NOT CONFIRMED. ** Per the handoff doc's own words:
// "confirm the exact contested event list against WIAA's current rules or
// Ellensburg's own meet results before treating the seed as final — event
// offerings vary by classification and some leagues don't run every
// event. Don't hardcode confidence you don't have." This list has NOT been
// checked against WIAA's current rulebook or a real Ellensburg meet
// result — it's the doc's own named event set, typed in verbatim, nothing
// added or guessed beyond it. Treat every row as a draft until a human
// confirms it against WIAA's current classification rules or this team's
// own scraped results (Section 4 onward), the same review step Course
// mapping and Meet mapping already require elsewhere in this app before
// anything built on top of this trusts it.
//
// Safe to re-run: upserts by Event.name (the catalog's natural key), so
// running this again after a confirmed correction just updates rows in
// place rather than duplicating them.
//
// Run from backend/: node scripts/seedTrackEvents.js

const prisma = require('../lib/db');

// category, unit, scoringDirection, isRelay/relayLegCount — see
// schema.prisma's Event model and the EventCategory/MarkUnit/
// ScoringDirection enums for what each value means.
//
// Hurdles: girls run 100 Meter Hurdles, boys run 110 Meter Hurdles — two
// different events, not a gender variant of one row, matching how
// Athletic.net itself names them.
//
// Throws (Shot Put/Discus/Javelin) are FEET_INCHES, not METERS — US high
// school throwing events are recorded in feet-inches on Athletic.net the
// same as jumps, per the doc's Section 2 hazard (it names "field events"
// broadly, not just jumps). Confirm this alongside the rest of the list
// above, not assumed beyond what the hazard note already states.
const WIAA_TYPICAL_OUTDOOR_EVENTS = [
  { name: '100 Meters', category: 'SPRINT', unit: 'SECONDS', scoringDirection: 'LOWER_BETTER', sortOrder: 10 },
  { name: '200 Meters', category: 'SPRINT', unit: 'SECONDS', scoringDirection: 'LOWER_BETTER', sortOrder: 20 },
  { name: '400 Meters', category: 'SPRINT', unit: 'SECONDS', scoringDirection: 'LOWER_BETTER', sortOrder: 30 },
  { name: '800 Meters', category: 'MIDDLE_DISTANCE', unit: 'SECONDS', scoringDirection: 'LOWER_BETTER', sortOrder: 40 },
  { name: '1600 Meters', category: 'MIDDLE_DISTANCE', unit: 'SECONDS', scoringDirection: 'LOWER_BETTER', sortOrder: 50 },
  { name: '3200 Meters', category: 'DISTANCE', unit: 'SECONDS', scoringDirection: 'LOWER_BETTER', sortOrder: 60 },
  { name: '100 Meter Hurdles', category: 'HURDLES', unit: 'SECONDS', scoringDirection: 'LOWER_BETTER', sortOrder: 70 },
  { name: '110 Meter Hurdles', category: 'HURDLES', unit: 'SECONDS', scoringDirection: 'LOWER_BETTER', sortOrder: 80 },
  { name: '300 Meter Hurdles', category: 'HURDLES', unit: 'SECONDS', scoringDirection: 'LOWER_BETTER', sortOrder: 90 },
  {
    name: '4x100 Relay',
    category: 'RELAY',
    unit: 'SECONDS',
    scoringDirection: 'LOWER_BETTER',
    isRelay: true,
    relayLegCount: 4,
    sortOrder: 100,
  },
  {
    name: '4x200 Relay',
    category: 'RELAY',
    unit: 'SECONDS',
    scoringDirection: 'LOWER_BETTER',
    isRelay: true,
    relayLegCount: 4,
    sortOrder: 110,
  },
  {
    name: '4x400 Relay',
    category: 'RELAY',
    unit: 'SECONDS',
    scoringDirection: 'LOWER_BETTER',
    isRelay: true,
    relayLegCount: 4,
    sortOrder: 120,
  },
  {
    name: '4x800 Relay',
    category: 'RELAY',
    unit: 'SECONDS',
    scoringDirection: 'LOWER_BETTER',
    isRelay: true,
    relayLegCount: 4,
    sortOrder: 130,
  },
  { name: 'High Jump', category: 'JUMP', unit: 'FEET_INCHES', scoringDirection: 'HIGHER_BETTER', sortOrder: 140 },
  { name: 'Long Jump', category: 'JUMP', unit: 'FEET_INCHES', scoringDirection: 'HIGHER_BETTER', sortOrder: 150 },
  { name: 'Triple Jump', category: 'JUMP', unit: 'FEET_INCHES', scoringDirection: 'HIGHER_BETTER', sortOrder: 160 },
  { name: 'Pole Vault', category: 'JUMP', unit: 'FEET_INCHES', scoringDirection: 'HIGHER_BETTER', sortOrder: 170 },
  { name: 'Shot Put', category: 'THROW', unit: 'FEET_INCHES', scoringDirection: 'HIGHER_BETTER', sortOrder: 180 },
  { name: 'Discus', category: 'THROW', unit: 'FEET_INCHES', scoringDirection: 'HIGHER_BETTER', sortOrder: 190 },
  { name: 'Javelin', category: 'THROW', unit: 'FEET_INCHES', scoringDirection: 'HIGHER_BETTER', sortOrder: 200 },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `Seeding ${WIAA_TYPICAL_OUTDOOR_EVENTS.length} provisional track events${dryRun ? ' (dry run, no writes)' : ''}...`
  );
  console.log('This list is NOT confirmed against WIAA\'s current rules — see this script\'s header comment.\n');

  for (const event of WIAA_TYPICAL_OUTDOOR_EVENTS) {
    const data = {
      category: event.category,
      unit: event.unit,
      scoringDirection: event.scoringDirection,
      isRelay: Boolean(event.isRelay),
      relayLegCount: event.relayLegCount ?? null,
      isMultiEvent: false,
      sortOrder: event.sortOrder,
    };
    console.log(`  ${dryRun ? 'would upsert' : 'upserting'}: ${event.name}`);
    if (!dryRun) {
      await prisma.event.upsert({
        where: { name: event.name },
        update: data,
        create: { name: event.name, ...data },
      });
    }
  }

  console.log('\nDone. Remember: this catalog is provisional until a human confirms it.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
