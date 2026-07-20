const mongoose = require('mongoose');
const baseMetrics = require('./baseMetrics');

const teamSeasonMetricsSchema = new mongoose.Schema({
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
  metrics: baseMetrics,
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Compound index for faster queries
teamSeasonMetricsSchema.index({ teamId: 1, season: 1 }, { unique: true });

// Update the updatedAt timestamp on save
teamSeasonMetricsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('TeamSeasonMetrics', teamSeasonMetricsSchema);
