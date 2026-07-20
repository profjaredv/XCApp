// Stub model for backwards compatibility
// All athlete operations should use Supabase directly
module.exports = {};
/*
const mongoose = require('mongoose');
const { Schema } = mongoose;

const inviteStatusSchema = new Schema({
  status: {
    type: String,
    enum: ['not_invited', 'pending', 'accepted', 'expired', 'revoked'],
    default: 'not_invited'
  },
  email: { type: String },
  token: { type: String },
  sentAt: { type: Date },
  acceptedAt: { type: Date },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const athleteSchema = new Schema({
    name: { type: String, required: true },
    team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    graduationYear: { type: Number },
    grade: { type: Number },
    gender: { type: String, enum: ['Men', 'Women'] },
    invite: { type: inviteStatusSchema, default: () => ({}) },
    user: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Ensure that an athlete's name is unique within a team
athleteSchema.index({ name: 1, team: 1 }, { unique: true });

const Athlete = mongoose.model('Athlete', athleteSchema);

module.exports = Athlete;
