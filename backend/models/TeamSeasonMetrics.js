const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Check if the model already exists before creating a new one
let TeamSeasonMetrics;
try {
  TeamSeasonMetrics = mongoose.model('TeamSeasonMetrics');
} catch (error) {
  const TeamSeasonMetricsSchema = new Schema({
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true
    },
    season: {
      type: Number,
      required: true
    },
    totalAthletes: {
      type: Number,
      default: 0
    },
    totalRaces: {
      type: Number,
      default: 0
    },
    totalResults: {
      type: Number,
      default: 0
    },
    totalMiles: {
      type: Number,
      default: 0
    },
    averagePace: {
      type: Number,
      default: 0
    },
    maleAthleteCount: {
      type: Number,
      default: 0
    },
    femaleAthleteCount: {
      type: Number,
      default: 0
    },
    meetCount: {
      type: Number,
      default: 0
    },
    calculatedAt: {
      type: Date,
      default: Date.now
    }
  }, {
    timestamps: true
  });

  // Create a compound index on teamId and season for faster lookups
  TeamSeasonMetricsSchema.index({ teamId: 1, season: 1 }, { unique: true });

  TeamSeasonMetrics = mongoose.model('TeamSeasonMetrics', TeamSeasonMetricsSchema);
}

module.exports = TeamSeasonMetrics;
