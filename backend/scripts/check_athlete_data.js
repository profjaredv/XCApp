require('dotenv').config();
const supabase = require('../config/supabase');

async function checkAthleteData() {
  try {
    // Search for Mystic Hammond (or similar names)
    const { data: athletes, error } = await supabase
      .from('athletes')
      .select('id, name, gender, grade, graduation_year, team_id')
      .ilike('name', '%mystic%')
      .order('name');

    if (error) {
      console.error('Error querying athletes:', error);
      return;
    }

    console.log('\n=== Athletes matching "Mystic" ===');
    console.log(`Found ${athletes.length} athlete(s):\n`);
    
    athletes.forEach(athlete => {
      console.log(`Name: ${athlete.name}`);
      console.log(`  ID: ${athlete.id}`);
      console.log(`  Gender: ${athlete.gender}`);
      console.log(`  Grade: ${athlete.grade}`);
      console.log(`  Graduation Year: ${athlete.graduation_year}`);
      console.log(`  Team ID: ${athlete.team_id}`);
      console.log('');
    });

    // If we found athletes, check their recent results
    if (athletes.length > 0) {
      const athleteId = athletes[0].id;
      console.log(`\n=== Recent results for ${athletes[0].name} ===`);
      
      const { data: results, error: resultsError } = await supabase
        .from('results')
        .select(`
          *,
          race:races(name, date, season)
        `)
        .eq('athlete_id', athleteId)
        .order('race.date', { ascending: false })
        .limit(5);

      if (resultsError) {
        console.error('Error querying results:', resultsError);
      } else {
        results.forEach(result => {
          console.log(`Race: ${result.race?.name || 'Unknown'}`);
          console.log(`  Date: ${result.race?.date || 'Unknown'}`);
          console.log(`  Season: ${result.race?.season || 'Unknown'}`);
          console.log(`  Time: ${result.time}s`);
          console.log(`  Place: ${result.place}`);
          console.log(`  Grade: ${result.grade}`);
          console.log('');
        });
      }

      // Check athlete_season_metrics
      console.log(`\n=== Season metrics for ${athletes[0].name} ===`);
      const { data: metrics, error: metricsError } = await supabase
        .from('athlete_season_metrics')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('season', { ascending: false });

      if (metricsError) {
        console.error('Error querying metrics:', metricsError);
      } else {
        metrics.forEach(metric => {
          console.log(`Season: ${metric.season}`);
          console.log(`  Gender: ${metric.gender}`);
          console.log(`  Grade: ${metric.grade}`);
          console.log(`  Total Races: ${metric.total_races}`);
          console.log(`  Best Time 5K: ${metric.best_time_5k}s`);
          console.log('');
        });
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

checkAthleteData();
