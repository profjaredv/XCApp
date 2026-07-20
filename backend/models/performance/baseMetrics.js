const mongoose = require('mongoose');

const baseMetricsSchema = new mongoose.Schema({
  totalRaces: { type: Number, default: 0 },
  totalMiles: { type: Number, default: 0 },
  avgMilePace: {
    overall: { type: Number, default: 0 },
    first5k: { type: Number, default: 0 },
    last5k: { type: Number, default: 0 }
  },
  bestTime: { type: Number, default: 0 },
  bestTimeMeet: { type: String, default: '' },
  improvementPercent: { type: Number, default: 0 },
  totalTimeDropped: { type: Number, default: 0 },
  athleteCount: { type: Number, default: 0 },
  teamBestTime: { type: Number, default: 0 },
  firstMeet: {
    name: { type: String, default: '' },
    date: { type: Date, default: null },
    avgPace: { type: Number, default: 0 },
    avgTime: { type: Number, default: 0 }
  },
  lastMeet: {
    name: { type: String, default: '' },
    date: { type: Date, default: null },
    avgPace: { type: Number, default: 0 },
    avgTime: { type: Number, default: 0 }
  },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

module.exports = baseMetricsSchema;
