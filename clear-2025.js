// Simple script to clear 2025 season data
const { execSync } = require('child_process');

// MongoDB URI
const mongoUri = "mongodb+srv://jared:Hanson2990@cluster0.clbzpkb.mongodb.net/xctf?retryWrites=true&w=majority";
const teamId = "68a7a8f047e0148d2735e4ef";
const season = 2025;

console.log(`Clearing data for team ${teamId}, season ${season}...`);

// Create separate scripts for each operation to avoid syntax issues
const scripts = [
  // Delete team season metrics
  `db.teamseasonmetrics.deleteMany({ teamId: ObjectId('${teamId}'), season: ${season} })`,
  
  // Delete athlete season metrics
  `db.athleteseasonmetrics.deleteMany({ teamId: ObjectId('${teamId}'), season: ${season} })`,
  
  // Delete meet performance metrics
  `db.meetperformancemetrics.deleteMany({ teamId: ObjectId('${teamId}'), season: ${season} })`,
  
  // Find races for this team and season
  `db.races.find({ team: ObjectId('${teamId}'), season: '${season}' }).toArray().map(r => r._id)`,
];

try {
  // Execute each script separately
  console.log('Finding races...');
  const raceIdsOutput = execSync(`mongosh "${mongoUri}" --quiet --eval "${scripts[3]}"`, { encoding: 'utf8' });
  const raceIds = JSON.parse(raceIdsOutput.trim());
  console.log(`Found ${raceIds.length} races to remove`);
  
  if (raceIds.length > 0) {
    // Delete results associated with these races
    console.log('Deleting results...');
    const raceIdsString = JSON.stringify(raceIds);
    const deleteResultsScript = `db.results.deleteMany({ race: { $in: ${raceIdsString} } })`;
    const resultsOutput = execSync(`mongosh "${mongoUri}" --quiet --eval "${deleteResultsScript}"`, { encoding: 'utf8' });
    console.log(`Results deleted: ${resultsOutput}`);
    
    // Delete the races themselves
    console.log('Deleting races...');
    const deleteRacesScript = `db.races.deleteMany({ _id: { $in: ${raceIdsString} } })`;
    const racesOutput = execSync(`mongosh "${mongoUri}" --quiet --eval "${deleteRacesScript}"`, { encoding: 'utf8' });
    console.log(`Races deleted: ${racesOutput}`);
  }
  
  // Delete metrics
  console.log('Deleting team metrics...');
  const teamMetricsOutput = execSync(`mongosh "${mongoUri}" --quiet --eval "${scripts[0]}"`, { encoding: 'utf8' });
  console.log(`Team metrics deleted: ${teamMetricsOutput}`);
  
  console.log('Deleting athlete metrics...');
  const athleteMetricsOutput = execSync(`mongosh "${mongoUri}" --quiet --eval "${scripts[1]}"`, { encoding: 'utf8' });
  console.log(`Athlete metrics deleted: ${athleteMetricsOutput}`);
  
  console.log('Deleting meet metrics...');
  const meetMetricsOutput = execSync(`mongosh "${mongoUri}" --quiet --eval "${scripts[2]}"`, { encoding: 'utf8' });
  console.log(`Meet metrics deleted: ${meetMetricsOutput}`);
  
  console.log(`\nSeason ${season} data cleared successfully!`);
} catch (error) {
  console.error(`Error clearing season data:`, error.message);
}
