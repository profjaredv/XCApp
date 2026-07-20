const mongoose = require('mongoose');

const enhancedTeamSeasonMetricsSchema = new mongoose.Schema({
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
  
  // Basic team stats
  totalAthletes: { type: Number, default: 0 },
  totalRaces: { type: Number, default: 0 },
  totalMiles: { type: Number, default: 0 },
  avgMilePace: {
    overall: { type: Number, default: 0 }
  },

  // Gender breakdown
  byGender: {
    men: {
      count: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 }
    },
    women: {
      count: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 }
    }
  },
  
  // Grade breakdown
  byGrade: {
    grade9: {
      count: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 }
    },
    grade10: {
      count: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 }
    },
    grade11: {
      count: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 }
    },
    grade12: {
      count: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 }
    }
  },
  
  // Distance-specific team analysis
  byDistance: {
    oneMile: {
      athleteCount: { type: Number, default: 0 },
      avgTime: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 }
    },
    onePointFiveMile: {
      athleteCount: { type: Number, default: 0 },
      avgTime: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 }
    },
    threeMile: {
      athleteCount: { type: Number, default: 0 },
      avgTime: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 }
    },
    fiveK: {
      athleteCount: { type: Number, default: 0 },
      avgTime: { type: Number, default: 0 },
      bestTime: { type: Number, default: 0 },
      avgPace: { type: Number, default: 0 }
    }
  },
  
  // Team depth analysis
  teamDepth: {
    top5Spread: { type: Number, default: 0 },
    top7Spread: { type: Number, default: 0 },
    depthScore: { type: Number, default: 0 }
  },
  
  // Pack running analysis
  packRunning: {
    avgGapBetweenRunners: { type: Number, default: 0 },
    packTightness: { type: Number, default: 0 },
    packConsistency: { type: Number, default: 0 }
  },

  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Compound index for faster queries
enhancedTeamSeasonMetricsSchema.index({ teamId: 1, season: 1 }, { unique: true });

// Update the updatedAt timestamp on save
enhancedTeamSeasonMetricsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('EnhancedTeamSeasonMetrics', enhancedTeamSeasonMetricsSchema);
