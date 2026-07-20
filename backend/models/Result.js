// Stub model for backwards compatibility
// All result operations should use Supabase directly
module.exports = {};
/*
const mongoose = require('mongoose');
const { Schema } = mongoose;

const resultSchema = new Schema({
    athlete: { type: Schema.Types.ObjectId, ref: 'Athlete', required: true },
    race: { type: Schema.Types.ObjectId, ref: 'Race', required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
        time: { type: Number, required: true },
    grade: { type: Number },
    place: { type: Number },
}, { timestamps: true });

// Ensure a unique result for each athlete in a race
resultSchema.index({ athlete: 1, race: 1 }, { unique: true });

const Result = mongoose.model('Result', resultSchema);

module.exports = Result;
