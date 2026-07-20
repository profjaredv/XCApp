const calculationService = require('./services/performance/calculationServiceSupabase');

const teamId = '63ae8915-0e3e-4a3a-8bf2-b01865fb16e1';
const season = '2025';

console.log(`🔄 Recalculating analytics for team ${teamId}, season ${season}...\n`);

calculationService.calculateAllMetrics(teamId, season, true)
  .then(result => {
    console.log('\n✅ Analytics recalculation complete!');
    console.log('Result:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error recalculating analytics:', error);
    process.exit(1);
  });
