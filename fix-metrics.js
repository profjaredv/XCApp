// Script to fix incorrect metrics in MongoDB for the 2025 season
const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

// Import the TeamSeasonMetrics model
const TeamSeasonMetrics = require('./backend/models/performance/teamSeasonMetrics');

// Function to fix the metrics directly in the database
const fixMetricsDirectly = async () => {
  try {
    console.log('Fixing metrics directly in the database...');
    
    // Get the team ID from the existing record
    const teamMetrics = await TeamSeasonMetrics.findOne({ season: 2025 });
    if (!teamMetrics) {
      console.error('No metrics found for season 2025');
      return;
    }
    
    const teamId = teamMetrics.teamId;
    console.log(`Found metrics for team ${teamId}, season 2025`);
    
    // Update the metrics with correct values
    const result = await TeamSeasonMetrics.findOneAndUpdate(
      { teamId, season: 2025 },
      { 
        $set: { 
          'metrics.totalRaces': 2, // Correct value for 2025
          'metrics.totalMiles': 6.2, // Correct value for 2025 (2 5k races = 6.2 miles)
          updatedAt: new Date()
        } 
      },
      { new: true }
    );
    
    console.log('Metrics updated successfully:', {
      teamId: result.teamId,
      season: result.season,
      totalRaces: result.metrics.totalRaces,
      totalMiles: result.metrics.totalMiles,
      updatedAt: result.updatedAt
    });
    
  } catch (error) {
    console.error('Error fixing metrics:', error);
  }
};

// Function to recalculate metrics using the API
const recalculateMetrics = async () => {
  try {
    console.log('Recalculating metrics using the API...');
    
    // Get the team ID from the existing record
    const teamMetrics = await TeamSeasonMetrics.findOne({ season: 2025 });
    if (!teamMetrics) {
      console.error('No metrics found for season 2025');
      return;
    }
    
    const teamId = teamMetrics.teamId;
    console.log(`Found metrics for team ${teamId}, season 2025`);
    
    // Get auth token (you'll need to implement this based on your auth system)
    // const token = await getAuthToken();
    
    // Call the API to recalculate metrics
    // const response = await axios.post(
    //   `http://localhost:8080/api/performance/calculate/${teamId}/2025`,
    //   {},
    //   { headers: { Authorization: `Bearer ${token}` } }
    // );
    
    // console.log('API response:', response.data);
    
    // For now, we'll just fix the metrics directly
    await fixMetricsDirectly();
    
  } catch (error) {
    console.error('Error recalculating metrics:', error);
  }
};

// Main function
const main = async () => {
  await connectDB();
  
  // Fix the metrics
  await fixMetricsDirectly();
  
  // Close the database connection
  mongoose.connection.close();
  console.log('Database connection closed');
};

// Run the script
main();
