// Stub model for backwards compatibility
// All season operations should use Supabase directly
module.exports = {};
/*
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SeasonSchema = new Schema({
  year: {
    type: Number,
    required: true
  },
  sport: {
    type: String,
    enum: ['XC', 'Track'],
    required: true
  },
  team: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  roster: [{
    athlete: {
      type: Schema.Types.ObjectId,
      ref: 'Athlete'
    },
    grade: {
      type: Number
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Compound index for team + year + sport uniqueness
SeasonSchema.index({ team: 1, year: 1, sport: 1 }, { unique: true });

// Static methods
SeasonSchema.statics.getCurrentSeason = async function(teamId, sport = 'XC') {
  return this.findOne({ team: teamId, sport, isActive: true }).populate('roster.athlete');
};

SeasonSchema.statics.getSeasons = async function(teamId, sport = 'XC') {
  return this.find({ team: teamId, sport }).sort({ year: -1 });
};

// Instance methods
SeasonSchema.methods.addAthlete = async function(athleteId, grade) {
  // Check if athlete already exists in roster
  const existingIndex = this.roster.findIndex(item => 
    item.athlete.toString() === athleteId.toString()
  );
  
  if (existingIndex >= 0) {
    // Update existing athlete
    this.roster[existingIndex].grade = grade;
    this.roster[existingIndex].isActive = true;
  } else {
    // Add new athlete
    this.roster.push({
      athlete: athleteId,
      grade,
      isActive: true
    });
  }
  
  this.updatedAt = Date.now();
  return this.save();
};

SeasonSchema.methods.removeAthlete = async function(athleteId) {
  const existingIndex = this.roster.findIndex(item => 
    item.athlete.toString() === athleteId.toString()
  );
  
  if (existingIndex >= 0) {
    // Mark as inactive instead of removing
    this.roster[existingIndex].isActive = false;
    this.updatedAt = Date.now();
    return this.save();
  }
  
  return this;
};

SeasonSchema.methods.getActiveRoster = function() {
  return this.roster.filter(item => item.isActive);
};

module.exports = mongoose.model('Season', SeasonSchema);
