#!/usr/bin/env node

// Simple script to clear season data for a team
const { execSync } = require('child_process');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to clear season data
const clearSeason = (mongoUri, teamId, season) => {
  console.log(`\nClearing data for team ${teamId}, season ${season}...`);
  
  try {
    // MongoDB script to clear season data - using simpler syntax
    const script = `
      // Find races for this team and season
      var races = db.races.find({ team: ObjectId('${teamId}'), season: '${season}' }).toArray();
      print('Found ' + races.length + ' races to remove');
      
      // Create array of race IDs
      var raceIds = [];
      races.forEach(function(race) {
        raceIds.push(race._id);
      });
      
      // Delete results associated with these races
      var resultsDeleted = db.results.deleteMany({ race: { $in: raceIds } });
      print('Deleted ' + resultsDeleted.deletedCount + ' results');
      
      // Delete the races themselves
      var racesDeleted = db.races.deleteMany({ _id: { $in: raceIds } });
      print('Deleted ' + racesDeleted.deletedCount + ' races');
      
      // Delete performance metrics
      var teamMetricsDeleted = db.teamseasonmetrics.deleteMany({ teamId: ObjectId('${teamId}'), season: ${season} });
      print('Deleted ' + teamMetricsDeleted.deletedCount + ' team season metrics');
      
      var athleteMetricsDeleted = db.athleteseasonmetrics.deleteMany({ teamId: ObjectId('${teamId}'), season: ${season} });
      print('Deleted ' + athleteMetricsDeleted.deletedCount + ' athlete season metrics');
      
      var meetMetricsDeleted = db.meetperformancemetrics.deleteMany({ teamId: ObjectId('${teamId}'), season: ${season} });
      print('Deleted ' + meetMetricsDeleted.deletedCount + ' meet performance metrics');
    `;
    
    // Execute the script
    console.log('Executing MongoDB command...');
    const result = execSync(`mongosh "${mongoUri}" --quiet --eval "${script}"`, { encoding: 'utf8' });
    console.log(result);
    console.log(`Season ${season} data cleared successfully!`);
    
    return true;
  } catch (error) {
    console.error(`Error clearing season ${season} data:`, error.message);
    return false;
  }
};

// Function to find and clear all seasons
const clearAllSeasons = (mongoUri, teamId) => {
  console.log(`Finding all seasons for team ${teamId}...`);
  
  try {
    // Find all seasons for this team
    const findSeasonsScript = `db.races.distinct('season', { team: ObjectId('${teamId}') })`;
    const seasonsOutput = execSync(`mongosh "${mongoUri}" --quiet --eval "${findSeasonsScript}"`, { encoding: 'utf8' });
    
    // Parse the seasons from the output
    const seasons = JSON.parse(seasonsOutput.trim());
    console.log(`Found ${seasons.length} seasons: ${seasons.join(', ')}`);
    
    if (seasons.length === 0) {
      console.log('No seasons found for this team.');
      rl.close();
      return;
    }
    
    // Ask for confirmation
    rl.question(`WARNING: This will delete ALL data for ${seasons.length} seasons! Continue? (y/n) `, (answer) => {
      if (answer.toLowerCase() !== 'y') {
        console.log('Operation cancelled.');
        rl.close();
        return;
      }
      
      // Clear each season
      console.log('\n=== STARTING DATA CLEARING ===');
      for (const season of seasons) {
        clearSeason(mongoUri, teamId, season);
      }
      
      console.log('\n=== ALL SEASONS DATA CLEARED SUCCESSFULLY ===');
      rl.close();
    });
    
  } catch (error) {
    console.error('Error clearing all seasons data:', error.message);
    rl.close();
  }
};

// Main function
const main = () => {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node clear-season.js <mongoUri> <teamId> [season]');
    console.error('  - Provide MongoDB URI and teamId to clear ALL seasons');
    console.error('  - Provide MongoDB URI, teamId and season to clear a specific season');
    console.error('Example: node clear-season.js "mongodb+srv://user:pass@cluster.mongodb.net/dbname" 68a7a8f047e0148d2735e4ef 2025');
    process.exit(1);
  }
  
  const mongoUri = args[0];
  const teamId = args[1];
  const season = args[2]; // Optional
  
  if (season) {
    // Clear specific season
    const success = clearSeason(mongoUri, teamId, season);
    if (success) {
      console.log(`Successfully cleared data for season ${season}`);
    }
    rl.close();
  } else {
    // Clear all seasons
    clearAllSeasons(mongoUri, teamId);
  }
};

// Run the script
main();
