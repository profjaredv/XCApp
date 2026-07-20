const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Check if the model already exists before creating a new one
let MeetPerformanceMetrics;
try {
  MeetPerformanceMetrics = mongoose.model('MeetPerformanceMetrics');
} catch (error) {
  const MeetPerformanceMetricsSchema = new Schema({
    raceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Race',
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
    meetName: {
      type: String,
      required: true
    },
    meetDate: {
      type: Date,
      required: true
    },
    distance: {
      type: Number,  // Distance in meters
      required: true
    },
    distanceLabel: {
      type: String,
      default: ''
    },
    participantCount: {
      type: Number,
      default: 0
    },
    maleParticipantCount: {
      type: Number,
      default: 0
    },
    femaleParticipantCount: {
      type: Number,
      default: 0
    },
    averageTime: {
      type: Number,  // Average time in seconds
      default: 0
    },
    averagePace: {
      type: Number,  // Average pace in seconds per mile
      default: 0
    },
    bestTime: {
      type: Number,  // Best time in seconds
      default: 0
    },
    bestAthlete: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Athlete'
    },
    bestAthleteTime: {
      type: Number,
      default: 0
    },
    teamScore: {
      type: Number,
      default: 0
    },
    teamPlace: {
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

  // Create a compound index on raceId and teamId for faster lookups
  MeetPerformanceMetricsSchema.index({ raceId: 1, teamId: 1 }, { unique: true });

  MeetPerformanceMetrics = mongoose.model('MeetPerformanceMetrics', MeetPerformanceMetricsSchema);
}

module.exports = MeetPerformanceMetrics;
