// Stub model for backwards compatibility
// All race operations should use Supabase directly
module.exports = {};
/*
const mongoose = require('mongoose');
const { Schema } = mongoose;

const raceSchema = new Schema({
    name: { type: String, required: true },
    date: { type: Date, required: true },
    distance: { type: String }, // e.g., '3 Miles', '5k'
    distanceMeters: { type: Number },
    season: { type: String, required: true }, // e.g., '2024'
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
}, { timestamps: true });

// Ensure that a race is unique for a team on a given date
raceSchema.index({ name: 1, date: 1, team: 1 }, { unique: true });

const Race = mongoose.model('Race', raceSchema);

module.exports = Race;
