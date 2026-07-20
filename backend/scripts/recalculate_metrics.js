require('dotenv').config();
const calculationService = require('../services/performance/calculationServiceSupabase');

async function recalculateMetrics() {
  try {
    const teamId = '63ae8915-0e3e-4a3a-8bf2-b01865fb16e1'; // Ellensburg High School XC
    const season = 2025;

    console.log(`\n=== Recalculating Metrics ===`);
    console.log(`Team ID: ${teamId}`);
    console.log(`Season: ${season}\n`);

    console.log('Starting calculation...');
    const result = await calculationService.calculateAllMetrics(teamId, season);

    console.log('\n✅ Metrics recalculated successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));

    process.exit(0);
  } catch (err) {
    console.error('❌ Error recalculating metrics:', err);
    process.exit(1);
  }
}

recalculateMetrics();
