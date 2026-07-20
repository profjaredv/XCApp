const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://nxlatotemxoryjsuouak.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54bGF0b3RlbXhvcnlqc3VvdWFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTI2NzkwMCwiZXhwIjoyMDc0ODQzOTAwfQ.GlvdssDuUQbnTIswHpz17Yr8CSqrsAPGrZHt3ZHrsFU'
);

async function runMigration() {
  console.log('🔧 Running distance_meters fix migration...\n');

  // BEFORE: Show current bad data
  console.log('📊 BEFORE FIX:');
  const { data: before, error: beforeError } = await supabase
    .from('races')
    .select('name, distance, distance_meters')
    .eq('season', '2025')
    .order('date');

  if (beforeError) {
    console.error('Error fetching before data:', beforeError);
    return;
  }

  before.forEach(race => {
    const milesCalc = (race.distance_meters / 1609.34).toFixed(2);
    console.log(`  ${race.name}: ${race.distance} -> ${race.distance_meters}m (${milesCalc} miles)`);
  });

  // FIX: Update races with distance_meters < 1000 (stored as miles)
  console.log('\n🔨 Applying fixes...');
  
  const racesToFix = before.filter(r => r.distance_meters < 1000);
  
  for (const race of racesToFix) {
    let newDistance;
    
    if (race.distance.includes('1 Mile') && !race.distance.includes('1.5')) {
      newDistance = 1609;
    } else if (race.distance.includes('1.5 Mile')) {
      newDistance = 2414;
    } else if (race.distance.includes('3 Mile')) {
      newDistance = 4828;
    } else if (race.distance.includes('Mile')) {
      // Extract number and convert
      const miles = parseFloat(race.distance_meters);
      newDistance = Math.round(miles * 1609.34);
    } else {
      newDistance = race.distance_meters;
    }

    console.log(`  Updating "${race.name}": ${race.distance_meters}m -> ${newDistance}m`);

    const { error: updateError } = await supabase
      .from('races')
      .update({ distance_meters: newDistance })
      .eq('name', race.name)
      .eq('season', '2025');

    if (updateError) {
      console.error(`  ❌ Error updating ${race.name}:`, updateError);
    }
  }

  // AFTER: Show fixed data
  console.log('\n📊 AFTER FIX:');
  const { data: after, error: afterError } = await supabase
    .from('races')
    .select('name, distance, distance_meters')
    .eq('season', '2025')
    .order('date');

  if (afterError) {
    console.error('Error fetching after data:', afterError);
    return;
  }

  after.forEach(race => {
    const milesCalc = (race.distance_meters / 1609.34).toFixed(2);
    console.log(`  ${race.name}: ${race.distance} -> ${race.distance_meters}m (${milesCalc} miles)`);
  });

  console.log('\n✅ Migration complete!');
}

runMigration().catch(console.error);
