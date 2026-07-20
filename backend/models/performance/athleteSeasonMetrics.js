const mongoose = require('mongoose');
const baseMetrics = require('./baseMetrics');

const raceImprovementSchema = new mongoose.Schema({
  raceId: { type: String, required: true },
  raceName: { type: String, required: true },
  raceDate: { type: Date, required: true },
  time: { type: Number, required: true },
  pace: { type: Number, required: true },
  improvementFromPrevious: { type: Number, default: 0 },
  _id: false
});

const athleteSeasonMetricsSchema = new mongoose.Schema({
  athleteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Athlete',
    required: true,
    index: true 
  },
  name: {
    type: String,
    required: true
  },
  teamId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Team',
    required: true,
    index: true 
  },
  season: { 
    type: Number, 
    required: true,
    index: true 
  },
  grade: { type: Number },
  gender: { type: String, enum: ['M', 'F'] },
  metrics: baseMetrics,
  raceByRaceImprovement: [raceImprovementSchema],
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Compound indexes for common queries
athleteSeasonMetricsSchema.index({ teamId: 1, season: 1 });
athleteSeasonMetricsSchema.index({ athleteId: 1, season: 1 }, { unique: true });
athleteSeasonMetricsSchema.index({ teamId: 1, season: 1, gender: 1 });
athleteSeasonMetricsSchema.index({ teamId: 1, season: 1, grade: 1 });

// Update the updatedAt timestamp on save
athleteSeasonMetricsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('AthleteSeasonMetrics', athleteSeasonMetricsSchema);
