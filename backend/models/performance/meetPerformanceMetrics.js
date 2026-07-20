const mongoose = require('mongoose');
const baseMetrics = require('./baseMetrics');

const meetMetricsSchema = new mongoose.Schema({
  meetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meet',
    required: true,
    index: true
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
  meetName: {
    type: String,
    required: true
  },
  meetDate: {
    type: Date,
    required: true
  },
  metrics: {
    overall: baseMetrics,
    byGender: {
      M: baseMetrics,
      F: baseMetrics,
      _id: false
    },
    byGrade: {
      type: Map,
      of: baseMetrics,
      default: {}
    }
  },
  trends: {
    vsPreviousMeet: {
      paceChange: { type: Number, default: 0 },
      timeChange: { type: Number, default: 0 }
    },
    seasonTrend: {
      paceTrend: { type: Number, default: 0 },
      timeTrend: { type: Number, default: 0 }
    }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Compound indexes for common queries
meetMetricsSchema.index({ teamId: 1, season: 1, meetDate: 1 });
meetMetricsSchema.index({ meetId: 1, teamId: 1 }, { unique: true });

// Update the updatedAt timestamp on save
meetMetricsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('MeetPerformanceMetrics', meetMetricsSchema);
