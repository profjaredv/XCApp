require('dotenv').config();
const supabase = require('../config/supabase');

async function addGenderColumns() {
  try {
    console.log('\n=== Adding Gender Columns to meet_performance_metrics ===\n');

    // Note: Supabase doesn't support ALTER TABLE via the JS client
    // You need to run this SQL in the Supabase SQL Editor:
    
    const sql = `
-- Add gender-specific columns to meet_performance_metrics
ALTER TABLE meet_performance_metrics 
ADD COLUMN IF NOT EXISTS boys_avg_pace FLOAT,
ADD COLUMN IF NOT EXISTS boys_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS girls_avg_pace FLOAT,
ADD COLUMN IF NOT EXISTS girls_count INTEGER DEFAULT 0;

-- Add helpful comment
COMMENT ON COLUMN meet_performance_metrics.boys_avg_pace IS 'Average pace for male athletes in seconds per mile';
COMMENT ON COLUMN meet_performance_metrics.girls_avg_pace IS 'Average pace for female athletes in seconds per mile';
`;

    console.log('SQL to run in Supabase SQL Editor:');
    console.log('=====================================');
    console.log(sql);
    console.log('=====================================\n');

    console.log('After running the SQL, re-run the recalculate_metrics script.');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

addGenderColumns();
