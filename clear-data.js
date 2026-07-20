#!/usr/bin/env node

// Simple script to clear season data for a team
// This script uses the MongoDB shell directly

const { exec } = require('child_process');
const readline = require('readline');
const fs = require('fs');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to get MongoDB URI from command line or .env file
const getMongoUri = (cmdLineUri) => {
  // If provided as command line argument, use that
  if (cmdLineUri) {
    return cmdLineUri;
  }
  
  // Otherwise try to read from .env file
  try {
    const envPaths = ['./.env', '../.env', '../../.env'];
    
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/MONGODB_URI=(.+)/i);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }
    
    throw new Error('MongoDB URI not found in .env file');
  } catch (err) {
    console.error('Error reading MongoDB URI:', err.message);
    console.error('Please provide MongoDB URI as the first argument:');
    console.error('node clear-data.js <mongoUri> <teamId> [season]');
    process.exit(1);
  }
};

// Function to execute MongoDB commands
const executeMongoCommand = (mongoUri, command) => {
  return new Promise((resolve, reject) => {
    // Execute the command
    console.log(`Executing MongoDB command...`);
    exec(`mongosh "${mongoUri}" --quiet --eval "${command}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      resolve(stdout);
    });
  });
};

// Function to clear season data
const clearSeason = async (mongoUri, teamId, season) => {
  try {
    console.log(`\nClearing data for team ${teamId}, season ${season}...`);
    
    // MongoDB script to clear season data
    const script = `
      // Find races for this team and season
      const races = db.races.find({ team: ObjectId('${teamId}'), season: '${season}' }).toArray();
      const raceIds = races.map(race => race._id);
      print('Found ' + races.length + ' races to remove');
      
      // Delete results associated with these races
      const resultsDeleted = db.results.deleteMany({ race: { $in: raceIds } });
      print('Deleted ' + resultsDeleted.deletedCount + ' results');
      
      // Delete the races themselves
      const racesDeleted = db.races.deleteMany({ _id: { $in: raceIds } });
      print('Deleted ' + racesDeleted.deletedCount + ' races');
      
      // Delete performance metrics
      const teamMetricsDeleted = db.teamseasonmetrics.deleteMany({ teamId: ObjectId('${teamId}'), season: NumberInt(${season}) });
      print('Deleted ' + teamMetricsDeleted.deletedCount + ' team season metrics');
      
      const athleteMetricsDeleted = db.athleteseasonmetrics.deleteMany({ teamId: ObjectId('${teamId}'), season: NumberInt(${season}) });
      print('Deleted ' + athleteMetricsDeleted.deletedCount + ' athlete season metrics');
      
      const meetMetricsDeleted = db.meetperformancemetrics.deleteMany({ teamId: ObjectId('${teamId}'), season: NumberInt(${season}) });
      print('Deleted ' + meetMetricsDeleted.deletedCount + ' meet performance metrics');
    `;
    
    const result = await executeMongoCommand(mongoUri, script);
    console.log(result);
    console.log(`Season ${season} data cleared successfully!`);
    
  } catch (error) {
    console.error(`Error clearing season ${season} data:`, error.message);
  }
};

// Function to find and clear all seasons
const clearAllSeasons = async (mongoUri, teamId) => {
  try {
    console.log(`Finding all seasons for team ${teamId}...`);
    
    // Find all seasons for this team
    const findSeasonsScript = `db.races.distinct('season', { team: ObjectId('${teamId}') })`;
    const seasonsOutput = await executeMongoCommand(mongoUri, findSeasonsScript);
    
    // Parse the seasons from the output
    const seasons = JSON.parse(seasonsOutput.trim());
    console.log(`Found ${seasons.length} seasons: ${seasons.join(', ')}`);
    
    if (seasons.length === 0) {
      console.log('No seasons found for this team.');
      rl.close();
      return;
    }
    
    // Ask for confirmation
    rl.question(`WARNING: This will delete ALL data for ${seasons.length} seasons! Continue? (y/n) `, async (answer) => {
      if (answer.toLowerCase() !== 'y') {
        console.log('Operation cancelled.');
        rl.close();
        return;
      }
      
      // Clear each season
      console.log('\n=== STARTING DATA CLEARING ===');
      for (const season of seasons) {
        await clearSeason(mongoUri, teamId, season);
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
const main = async () => {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node clear-data.js <mongoUri> <teamId> [season]');
    console.error('  - Provide MongoDB URI and teamId to clear ALL seasons');
    console.error('  - Provide MongoDB URI, teamId and season to clear a specific season');
    console.error('Example: node clear-data.js "mongodb+srv://username:password@cluster.mongodb.net/dbname" 68a7a8f047e0148d2735e4ef 2025');
    rl.close();
    process.exit(1);
  }
  
  const mongoUri = args[0];
  const teamId = args[1];
  const season = args[2]; // Optional
  
  if (season) {
    // Clear specific season
    await clearSeason(mongoUri, teamId, season);
    rl.close();
  } else {
    // Clear all seasons
    await clearAllSeasons(mongoUri, teamId);
  }
};

// Run the script
main();
