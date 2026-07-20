const mongoose = require('mongoose');

// Load all performance-related models
require('./baseMetrics');
require('./teamSeasonMetrics');
require('./athleteSeasonMetrics');
require('./meetPerformanceMetrics');

// Export all models for easy access
module.exports = {
  TeamSeasonMetrics: mongoose.model('TeamSeasonMetrics'),
  AthleteSeasonMetrics: mongoose.model('AthleteSeasonMetrics'),
  MeetPerformanceMetrics: mongoose.model('MeetPerformanceMetrics')
};
