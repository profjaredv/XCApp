require('dotenv').config();
const supabase = require('../config/supabase');

const parseDistanceToMeters = (distStr) => {
  if (!distStr) return null;
  // Remove commas first (handles "5,000 Meters")
  const cleanStr = distStr.replace(/,/g, '');
  // IMPORTANT: Match longer patterns first (miles before meters before m)
  const match = cleanStr.match(/(\d+\.?\d*)\s*(miles?|meters?|mi|km|k|m)/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  if (unit === 'k' || unit === 'km') return value * 1000;
  if (unit === 'miles' || unit === 'mile' || unit === 'mi') return value * 1609.34;
  if (unit === 'meters' || unit === 'meter' || unit === 'm') return value;
  return null;
};

async function fixRaceDistances() {
  try {
    console.log('\n=== Fixing Race Distances ===\n');

    // Get all races with their distance strings
    const { data: races, error } = await supabase
      .from('races')
      .select('id, name, distance, distance_meters')
      .order('date', { ascending: true });

    if (error) {
      console.error('Error querying races:', error);
      return;
    }

    console.log(`Found ${races.length} races to check\n`);

    let fixed = 0;
    let alreadyCorrect = 0;

    for (const race of races) {
      const correctMeters = parseDistanceToMeters(race.distance);
      
      if (correctMeters === null) {
        console.log(`⚠️  Could not parse distance for: ${race.name} (${race.distance})`);
        continue;
      }

      const currentMeters = parseFloat(race.distance_meters) || 0;
      const difference = Math.abs(currentMeters - correctMeters);

      // Debug first few races
      if (fixed + alreadyCorrect < 5) {
        console.log(`DEBUG: ${race.name.substring(0, 30)}`);
        console.log(`  distance: "${race.distance}"`);
        console.log(`  current: ${currentMeters}, correct: ${correctMeters}, diff: ${difference}`);
      }

      // Check if distance_meters needs fixing (allow 1 meter tolerance for rounding)
      if (difference > 1) {
        console.log(`🔧 Fixing: ${race.name}`);
        console.log(`   Distance string: "${race.distance}"`);
        console.log(`   Current: ${currentMeters}m → Correct: ${correctMeters}m (diff: ${difference.toFixed(1)}m)`);

        const { error: updateError } = await supabase
          .from('races')
          .update({ distance_meters: correctMeters })
          .eq('id', race.id);

        if (updateError) {
          console.error(`   ❌ Failed to update: ${updateError.message}`);
        } else {
          console.log(`   ✅ Updated`);
          fixed++;
        }
      } else {
        alreadyCorrect++;
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total races: ${races.length}`);
    console.log(`Fixed: ${fixed}`);
    console.log(`Already correct: ${alreadyCorrect}`);
    console.log(`\n✅ Done! Now recalculate metrics to update pace calculations.`);

    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

fixRaceDistances();
