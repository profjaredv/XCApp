const mongoose = require('mongoose');

const enhancedAthleteSeasonMetricsSchema = new mongoose.Schema({
  athleteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Athlete',
    required: true,
    index: true 
  },
  athleteName: { type: String, required: true },
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
  gender: { type: String, enum: ['Men', 'Women'] },
  
  // Basic metrics
  totalRaces: { type: Number, default: 0 },
  totalMiles: { type: Number, default: 0 },
  avgMilePace: {
    overall: { type: Number, default: 0 }
  },
  bestTime: { type: Number, default: 0 },
  worstTime: { type: Number, default: 0 },
  
  // Distance-specific performance
  byDistance: {
    oneMile: {
      count: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 },
      worstTime: { type: Number, default: 0 },
      avgTime: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 },
      consistency: { type: Number, default: 0 },
      totalMiles: { type: Number, default: 0 }
    },
    onePointFiveMile: {
      count: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 },
      worstTime: { type: Number, default: 0 },
      avgTime: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 },
      consistency: { type: Number, default: 0 },
      totalMiles: { type: Number, default: 0 }
    },
    threeMile: {
      count: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 },
      worstTime: { type: Number, default: 0 },
      avgTime: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 },
      consistency: { type: Number, default: 0 },
      totalMiles: { type: Number, default: 0 }
    },
    fiveK: {
      count: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 },
      worstTime: { type: Number, default: 0 },
      avgTime: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 },
      consistency: { type: Number, default: 0 },
      totalMiles: { type: Number, default: 0 }
    },
    other: {
      count: { type: Number, default: 0 },
      avgTime: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 },
      totalMiles: { type: Number, default: 0 }
    }
  },

  // Season progression analysis
  seasonProgression: {
    earlySeasonAvg: { type: Number, default: 0 },
    lateSeasonAvg: { type: Number, default: 0 },
    improvementRate: { type: Number, default: 0 },
    peakPerformanceRace: { type: Number, default: 0 },
    consistencyTrend: { type: Number, default: 0 }
  },

  // Placement analysis
  placement: {
    avgPlace: { type: Number, default: 0 },
    bestPlace: { type: Number, default: 0 },
    worstPlace: { type: Number, default: 0 },
    placementTrend: { type: Number, default: 0 },
    top10Finishes: { type: Number, default: 0 },
    top25Finishes: { type: Number, default: 0 }
  },

  // Course performance
  coursePerformance: [{
    courseName: { type: String },
    raceCount: { type: Number, default: 0 },
    avgTime: { type: Number, default: 0 },
    bestTime: { type: Number, default: 0 },
    improvementOnCourse: { type: Number, default: 0 }
  }],

  // Season-over-season race comparisons
  raceComparisons: [{
    raceName: { type: String },
    seasons: [{
      season: { type: Number },
      raceCount: { type: Number, default: 0 },
      avgTime: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 },
      avgPlace: { type: Number, default: 0 },
      timeImprovement: { type: Number, default: 0 },
      placeImprovement: { type: Number, default: 0 }
    }]
  }],

  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Compound index for faster queries
enhancedAthleteSeasonMetricsSchema.index({ athleteId: 1, season: 1 }, { unique: true });
enhancedAthleteSeasonMetricsSchema.index({ teamId: 1, season: 1 });

// Update the updatedAt timestamp on save
enhancedAthleteSeasonMetricsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('EnhancedAthleteSeasonMetrics', enhancedAthleteSeasonMetricsSchema);
