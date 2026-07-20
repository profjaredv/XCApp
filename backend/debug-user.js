// Debug script to check and fix user role
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Team = require('./models/Team');

async function debugAndFixUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/xc-analytics');
    console.log('Connected to MongoDB');
    
    // Find all teams and their coaches
    const teams = await Team.find({}).select('name coachUid');
    console.log('\nTeams and their coaches:');
    teams.forEach(team => {
      console.log(`Team: ${team.name}, Coach UID: ${team.coachUid}`);
    });
    
    // Find all users
    const users = await User.find({}).populate('team');
    console.log('\nAll users:');
    users.forEach(user => {
      console.log(`User: ${user.email}, Role: ${user.role}, UID: ${user._id}, Team: ${user.team?.name || 'None'}`);
    });
    
    // Check for coach role mismatches
    console.log('\nChecking for role mismatches...');
    for (const team of teams) {
      const user = await User.findById(team.coachUid);
      if (user && user.role !== 'coach') {
        console.log(`MISMATCH: User ${user.email} owns team ${team.name} but has role ${user.role}`);
        console.log('Fixing...');
        
        user.role = 'coach';
        user.team = team._id;
        await user.save();
        
        console.log(`Fixed: ${user.email} is now a coach`);
      }
    }
    
    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugAndFixUser();
