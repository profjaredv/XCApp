const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Check if the model already exists before creating a new one
let AthleteSeasonMetrics;
try {
  AthleteSeasonMetrics = mongoose.model('AthleteSeasonMetrics');
} catch (error) {
  const AthleteSeasonMetricsSchema = new Schema({
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Athlete',
      required: true
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true
    },
    season: {
      type: Number,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    gender: {
      type: String,
      enum: ['M', 'F', ''],
      default: ''
    },
    grade: {
      type: String,
      default: ''
    },
    totalRaces: {
      type: Number,
      default: 0
    },
    totalMiles: {
      type: Number,
      default: 0
    },
    totalTimeSeconds: {
      type: Number,
      default: 0
    },
    averagePace: {
      type: Number,
      default: 0
    },
    bestPace: {
      type: Number,
      default: 0
    },
    bestPaceRaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Race'
    },
    bestTime5K: {
      type: Number,
      default: 0
    },
    bestTime5KRaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Race'
    },
    improvement: {
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

  // Create a compound index on athleteId, teamId and season for faster lookups
  AthleteSeasonMetricsSchema.index({ athleteId: 1, teamId: 1, season: 1 }, { unique: true });

  AthleteSeasonMetrics = mongoose.model('AthleteSeasonMetrics', AthleteSeasonMetricsSchema);
}

module.exports = AthleteSeasonMetrics;
