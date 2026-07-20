const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('./models/User');
const Team = require('./models/Team');
const Athlete = require('./models/Athlete');
const Race = require('./models/Race');
const Result = require('./models/Result');

const MONGODB_URI = process.env.DATABASE_URL;

const clearDatabase = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected for cleanup.');

    await User.deleteMany({});
    console.log('Users collection cleared.');

    await Team.deleteMany({});
    console.log('Teams collection cleared.');

    await Athlete.deleteMany({});
    console.log('Athletes collection cleared.');

    await Race.deleteMany({});
    console.log('Races collection cleared.');

    await Result.deleteMany({});
    console.log('Results collection cleared.');

  } catch (error) {
    console.error('Error clearing database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
};

clearDatabase();
