require('dotenv').config();
const supabase = require('../config/supabase');

async function checkRaceDistances() {
  try {
    const { data: races, error } = await supabase
      .from('races')
      .select('id, name, date, distance, distance_meters, season')
      .eq('season', '2025')
      .order('date', { ascending: true })
      .limit(10);

    if (error) {
      console.error('Error querying races:', error);
      return;
    }

    console.log('\n=== Race Distances (2025 Season) ===');
    console.log(`Found ${races.length} race(s):\n`);
    
    races.forEach(race => {
      console.log(`Race: ${race.name}`);
      console.log(`  Date: ${race.date}`);
      console.log(`  distance: ${race.distance} (type: ${typeof race.distance})`);
      console.log(`  distance_meters: ${race.distance_meters} (type: ${typeof race.distance_meters})`);
      console.log('');
    });

    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

checkRaceDistances();
