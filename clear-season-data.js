#!/usr/bin/env node

// Script to clear season-specific data while preserving user and team profiles
const { execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');

// Get MongoDB URI from .env file
const loadMongoUri = () => {
  try {
    require('dotenv').config();
    if (process.env.MONGODB_URI) {
      return process.env.MONGODB_URI;
    }
    
    // Try to read directly from .env file as fallback
    const envPath = './.env';
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/MONGODB_URI=(.+)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    throw new Error('MongoDB URI not found in .env file');
  } catch (err) {
    console.error('Error loading MongoDB URI:', err.message);
    process.exit(1);
  }
};

// Function to clear data for a specific team and season
const clearSeasonData = async (teamId, season) => {
  const mongoUri = loadMongoUri();
  console.log(`Clearing data for team ${teamId}, season ${season}...`);
  
  try {
    // Create MongoDB script
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
    
    // Execute the script
    console.log('Executing MongoDB commands...');
    const result = execSync(`mongosh "${mongoUri}" --quiet --eval "${script}"`, { encoding: 'utf8' });
    console.log(result);
    console.log(`Season ${season} data cleared successfully!`);
    
  } catch (error) {
    console.error(`Error clearing season ${season} data:`, error.message);
  }
};

// Function to clear data for all seasons for a specific team
const clearAllSeasonsData = async (teamId) => {
  const mongoUri = loadMongoUri();
  console.log(`Finding all seasons for team ${teamId}...`);
  
  try {
    // Create MongoDB script to find all seasons
    const findSeasonsScript = `db.races.distinct('season', { team: ObjectId('${teamId}') })`;
    
    // Execute the script
    const seasonsOutput = execSync(`mongosh "${mongoUri}" --quiet --eval "${findSeasonsScript}"`, { encoding: 'utf8' });
    const seasons = JSON.parse(seasonsOutput.trim());
    
    console.log(`Found ${seasons.length} seasons: ${seasons.join(', ')}`);
    
    if (seasons.length === 0) {
      console.log('No seasons found for this team.');
      return;
    }
    
    // Ask for confirmation
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(`WARNING: This will delete ALL data for ${seasons.length} seasons! Continue? (y/n) `, async (answer) => {
      if (answer.toLowerCase() !== 'y') {
        console.log('Operation cancelled.');
        rl.close();
        return;
      }
      
      rl.close();
      
      // Clear each season
      console.log('\n=== STARTING DATA CLEARING ===');
      for (const season of seasons) {
        console.log(`\n--- Processing season ${season} ---`);
        await clearSeasonData(teamId, season);
      }
      
      console.log('\n=== ALL SEASONS DATA CLEARED SUCCESSFULLY ===');
    });
    
  } catch (error) {
    console.error('Error clearing all seasons data:', error.message);
  }
};

// Main function
const main = async () => {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node clear-season-data.js <teamId> [season]');
    console.error('  - Provide just teamId to clear ALL seasons');
    console.error('  - Provide teamId and season to clear a specific season');
    process.exit(1);
  }
  
  const teamId = args[0];
  const season = args[1]; // Optional
  
  if (season) {
    // Clear specific season
    await clearSeasonData(teamId, season);
  } else {
    // Clear all seasons
    await clearAllSeasonsData(teamId);
  }
};
    const raceIds = races.map(race => race._id);
    console.log(`Found ${races.length} races to remove`);
    
    // 2. Delete results associated with these races
    const resultsDeleted = await Result.deleteMany({ race: { $in: raceIds } });
    console.log(`Deleted ${resultsDeleted.deletedCount} results`);
    
    // 3. Delete the races themselves
    const racesDeleted = await Race.deleteMany({ _id: { $in: raceIds } });
    console.log(`Deleted ${racesDeleted.deletedCount} races`);
    
    // 4. Delete performance metrics
    const teamMetricsDeleted = await TeamSeasonMetrics.deleteMany({ teamId, season: parseInt(season) });
    console.log(`Deleted ${teamMetricsDeleted.deletedCount} team season metrics`);
    
    const athleteMetricsDeleted = await AthleteSeasonMetrics.deleteMany({ teamId, season: parseInt(season) });
    console.log(`Deleted ${athleteMetricsDeleted.deletedCount} athlete season metrics`);
    
    const meetMetricsDeleted = await MeetPerformanceMetrics.deleteMany({ teamId, season: parseInt(season) });
    console.log(`Deleted ${meetMetricsDeleted.deletedCount} meet performance metrics`);
    
    console.log(`Season ${season} data cleared successfully!`);
    
    // Note: We're NOT deleting athletes as they should persist across seasons
    console.log('Athletes were preserved as they should persist across seasons');
    
    return {
      season,
      racesDeleted: racesDeleted.deletedCount,
      resultsDeleted: resultsDeleted.deletedCount,
      teamMetricsDeleted: teamMetricsDeleted.deletedCount,
      athleteMetricsDeleted: athleteMetricsDeleted.deletedCount,
      meetMetricsDeleted: meetMetricsDeleted.deletedCount
    };
  } catch (error) {
    console.error(`Error clearing season ${season} data:`, error);
    return {
      season,
      error: error.message
    };
  }
};

// Function to clear data for all seasons for a specific team
const clearAllSeasonsData = async (teamId) => {
  try {
    console.log(`Clearing ALL seasons data for team ${teamId}...`);
    
    // 1. Find all seasons for this team by looking at unique race seasons
    const seasons = await Race.distinct('season', { team: teamId });
    console.log(`Found ${seasons.length} seasons: ${seasons.join(', ')}`);
    
    if (seasons.length === 0) {
      console.log('No seasons found for this team.');
      return { message: 'No seasons found' };
    }
    
    // Ask for confirmation
    console.log(`WARNING: This will delete ALL data for ${seasons.length} seasons!`);
    console.log('Press Ctrl+C now to abort, or wait 5 seconds to continue...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 2. Clear each season
    const results = [];
    for (const season of seasons) {
      console.log(`\n--- Processing season ${season} ---`);
      const result = await clearSeasonData(teamId, season);
      results.push(result);
    }
    
    console.log('\n=== SUMMARY ===');
    let totalRaces = 0;
    let totalResults = 0;
    
    results.forEach(result => {
      if (result.error) {
        console.log(`Season ${result.season}: ERROR - ${result.error}`);
      } else {
        console.log(`Season ${result.season}: ${result.racesDeleted} races, ${result.resultsDeleted} results`);
        totalRaces += result.racesDeleted;
        totalResults += result.resultsDeleted;
      }
    });
    
    console.log(`\nTotal: ${totalRaces} races and ${totalResults} results deleted across ${seasons.length} seasons`);
    console.log('All seasons data cleared successfully!');
    
    return {
      seasons: seasons.length,
      totalRacesDeleted: totalRaces,
      totalResultsDeleted: totalResults,
      details: results
    };
  } catch (error) {
    console.error('Error clearing all seasons data:', error);
    throw error;
  }
};

// Main function
const main = async () => {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node clear-season-data.js <teamId> [season]');
    console.error('  - Provide just teamId to clear ALL seasons');
    console.error('  - Provide teamId and season to clear a specific season');
    process.exit(1);
  }
  
  const teamId = args[0];
  const season = args[1]; // Optional
  
  await connectDB();
  
  try {
    let result;
    
    if (season) {
      // Clear specific season
      console.log(`Clearing data for team ${teamId}, season ${season}...`);
      result = await clearSeasonData(teamId, season);
    } else {
      // Clear all seasons
      console.log(`Clearing ALL seasons data for team ${teamId}...`);
      result = await clearAllSeasonsData(teamId);
    }
    
    console.log('Clear operation completed successfully:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Failed to clear season data:', error);
  } finally {
    mongoose.connection.close();
    console.log('Database connection closed');
  }
};

// Run the script
main();
