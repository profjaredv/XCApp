require('dotenv').config();
const supabase = require('../config/supabase');

async function checkImprovement() {
  try {
    // Get athlete season metrics for 2025
    const { data: metrics, error } = await supabase
      .from('athlete_season_metrics')
      .select(`
        *,
        athlete:athletes(id, name, gender)
      `)
      .eq('season', '2025')
      .order('best_time_5k', { ascending: true, nullsLast: true })
      .limit(10);

    if (error) {
      console.error('Error querying athlete_season_metrics:', error);
      return;
    }

    console.log('\n=== Top 10 Athletes by Improvement (2025 Season) ===');
    console.log(`Found ${metrics.length} athlete(s):\n`);
    
    metrics.forEach((metric, idx) => {
      console.log(`${idx + 1}. ${metric.athlete?.name || 'Unknown'}`);
      console.log(`   Improvement: ${metric.improvement || 0}%`);
      console.log(`   Total Races: ${metric.total_races || 0}`);
      console.log(`   Best Time 5K: ${metric.best_time_5k || 0}s`);
      console.log(`   Average Pace: ${metric.average_pace || 0}s`);
      console.log(`   Gender: ${metric.gender || 'Unknown'}`);
      console.log(`   Grade: ${metric.grade || 'Unknown'}`);
      console.log('');
    });

    // Count how many have positive improvement
    const withImprovement = metrics.filter(m => (m.improvement || 0) > 0);
    console.log(`Athletes with positive improvement: ${withImprovement.length} / ${metrics.length}`);

    // List all columns in the table
    console.log('\n=== Available columns in first record ===');
    if (metrics.length > 0) {
      console.log(Object.keys(metrics[0]).filter(k => k !== 'athlete').join(', '));
    }

    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

checkImprovement();
