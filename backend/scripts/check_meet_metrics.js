require('dotenv').config();
const supabase = require('../config/supabase');

async function checkMeetMetrics() {
  try {
    // Get a sample of meet_performance_metrics for 2025 season
    const { data: metrics, error } = await supabase
      .from('meet_performance_metrics')
      .select('*')
      .eq('season', '2025')
      .order('meet_date', { ascending: true })
      .limit(5);

    if (error) {
      console.error('Error querying meet_performance_metrics:', error);
      return;
    }

    console.log('\n=== Meet Performance Metrics (2025 Season) ===');
    console.log(`Found ${metrics.length} meet(s):\n`);
    
    metrics.forEach(metric => {
      console.log(`Meet: ${metric.meet_name}`);
      console.log(`  Date: ${metric.meet_date}`);
      console.log(`  Distance: ${metric.distance}m`);
      console.log(`  Average Pace: ${metric.average_pace}s`);
      console.log(`  Average Time: ${metric.average_time}s`);
      console.log(`  Best Time: ${metric.best_time}s`);
      console.log(`  Participant Count: ${metric.participant_count}`);
      console.log(`  Boys Avg Pace: ${metric.boys_avg_pace || 'NULL'}`);
      console.log(`  Boys Count: ${metric.boys_count || 'NULL'}`);
      console.log(`  Girls Avg Pace: ${metric.girls_avg_pace || 'NULL'}`);
      console.log(`  Girls Count: ${metric.girls_count || 'NULL'}`);
      console.log('');
    });

    // Check the schema
    console.log('\n=== Checking table columns ===');
    const { data: columns, error: schemaError } = await supabase
      .rpc('get_table_columns', { table_name: 'meet_performance_metrics' })
      .catch(() => null);

    if (!columns) {
      console.log('Could not fetch schema via RPC, listing available fields from first record:');
      if (metrics.length > 0) {
        console.log(Object.keys(metrics[0]).join(', '));
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

checkMeetMetrics();
