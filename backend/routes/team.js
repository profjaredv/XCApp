const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const crypto = require('crypto');
const calculationService = require('../services/performance/calculationServiceSupabase');

// @route   GET /api/team/performance
// @desc    Get team performance data for a specific season
// @access  Private
router.get('/performance', authenticate, async (req, res) => {
  const { season } = req.query;
  const teamId = req.user.team_id || req.user.team?.id;

  if (!teamId) {
    return res.status(400).json({ msg: 'Team context is required.' });
  }

  try {
    // TODO: Migrate to Supabase - use /api/performance endpoints instead
    // This endpoint is deprecated and returns minimal data
    const seasonYear = season ? parseInt(season) : new Date().getFullYear();
    
    console.log(`[DEPRECATED] /api/team/performance called for team ${teamId}, season ${seasonYear}`);
    console.log('Use /api/performance/team/:teamId/season/:season instead');
    
    // Return minimal structure to avoid breaking frontend
    return res.json({
      meetCount: 0,
      totalRaces: 0,
      totalMiles: 0,
      avgPace: 0,
      totalRunners: 0,
      improvement: 0,
      message: 'This endpoint is deprecated. Use /api/performance endpoints instead.'
    });
    
    console.log(`Found ${races.length} races for season ${seasonStr}`);

    // Get all results for the team in the season
    const results = await Result.aggregate([{
      $lookup: {
        from: 'races',
        localField: 'race',
        foreignField: '_id',
        as: 'raceData'
      }
    }, {
      $unwind: '$raceData'
    }, {
      $match: {
        'raceData.team': teamId,
        'raceData.season': seasonStr
      }
    }]);
    
    console.log(`Found ${results.length} results for races in season ${seasonStr}`);

    // Get team info
    const { data: team } = await supabase.from('teams').select('name').eq('id', teamId).single();
    
    // Helpers to derive distance in miles from race data
    const toMiles = (meters) => meters > 0 ? meters / 1609.34 : 0;
    const parseDistanceMiles = (race) => {
      const meters = race?.distanceMeters || 0;
      if (meters > 0) return toMiles(meters);
      const label = (race?.distance || '').toLowerCase();
      // Try patterns like '5k', '3k', '10k'
      const kMatch = label.match(/([0-9]+(?:\.[0-9]+)?)\s*k/);
      if (kMatch) return (parseFloat(kMatch[1]) * 1000) / 1609.34;
      // Try miles like '3 miles', '3.1 mi'
      const miMatch = label.match(/([0-9]+(?:\.[0-9]+)?)\s*(mi|mile|miles)/);
      if (miMatch) return parseFloat(miMatch[1]);
      // Common XC default if explicitly labeled 5k without number extracted
      if (label.includes('5k')) return 3.10686;
      return 0;
    };

    // Calculate team stats using results (more reliable than races for distances)
    const meetCount = races.length;
    const derivedResults = results.map(r => ({
      time: r.time,
      distanceMiles: parseDistanceMiles(r.raceData),
      athlete: r.athlete.toString()
    }));
    const validResults = derivedResults.filter(r => r.time > 0 && r.distanceMiles > 0);
    const totalRaces = validResults.length;
    const totalMiles = validResults.reduce((sum, r) => sum + r.distanceMiles, 0);
    const totalTime = validResults.reduce((sum, r) => sum + r.time, 0);
    const totalRunners = new Set(validResults.map(r => r.athlete)).size;
    // Weighted average pace (seconds per mile)
    const avgPace = totalMiles > 0 ? (totalTime / totalMiles) : 0;
    
    console.log(`Season ${seasonStr} stats: ${meetCount} meets, ${totalRaces} races, ${totalMiles.toFixed(2)} miles`);

    // Get first and last meet of the season
    const sortedRaces = [...races].sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstMeet = sortedRaces[0];
    const lastMeet = sortedRaces[sortedRaces.length - 1];

    // Get first and last meet average paces
    const getMeetAvgPace = async (race) => {
      if (!race) return 0;
      const raceResults = await Result.find({ race: race._id, time: { $gt: 0 } });
      if (raceResults.length === 0) return 0;
      const distanceMiles = parseDistanceMiles(race);
      if (distanceMiles <= 0) return 0;
      const totalTime = raceResults.reduce((sum, result) => sum + result.time, 0);
      // Weighted by distance; distance is constant for a given race
      return totalTime / (raceResults.length * distanceMiles);
    };

    const firstMeetAvgPace = firstMeet ? await getMeetAvgPace(firstMeet) : 0;
    const lastMeetAvgPace = lastMeet ? await getMeetAvgPace(lastMeet) : 0;

    // Calculate improvement percentage
    let improvementPercent = 0;
    if (firstMeetAvgPace > 0 && lastMeetAvgPace > 0 && firstMeet && lastMeet && 
        firstMeet._id.toString() !== lastMeet._id.toString()) {
      improvementPercent = ((firstMeetAvgPace - lastMeetAvgPace) / firstMeetAvgPace) * 100;
    }

    res.json({
      id: teamId,
      name: team?.name || 'Team',
      totalRaces,
      totalMiles: parseFloat(totalMiles.toFixed(2)),
      avgMilePace: avgPace,
      meetCount,
      totalRunners,
      improvementPercent: parseFloat(improvementPercent.toFixed(1)),
      firstMeet: firstMeet ? {
        name: firstMeet.name,
        date: firstMeet.date,
        avgPace: firstMeetAvgPace
      } : null,
      lastMeet: lastMeet ? {
        name: lastMeet.name,
        date: lastMeet.date,
        avgPace: lastMeetAvgPace
      } : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/team/generate-join-code
// @desc    Generate a new team join code (coaches only)
// @access  Private
router.post('/generate-join-code', authenticate, async (req, res) => {
  try {
    const teamId = req.user.team?._id;
    const userRole = req.user.role;

    if (!teamId) {
      return res.status(400).json({ msg: 'Team context is required.' });
    }

    if (userRole !== 'coach') {
      return res.status(403).json({ msg: 'Only coaches can generate join codes.' });
    }

    // Generate a readable join code (team name + random suffix)
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ msg: 'Team not found.' });
    }

    const teamPrefix = team.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 6);
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const joinCode = `${teamPrefix}${randomSuffix}`;

    // Update team with new join code (object format)
    team.joinCode = {
      code: joinCode,
      createdBy: req.user.id,
      createdAt: new Date(),
      isActive: true
    };

    await team.save();

    res.json({
      msg: 'Join code generated successfully.',
      joinCode: joinCode
    });
  } catch (error) {
    console.error('Error generating join code:', error);
    res.status(500).json({ msg: 'Failed to generate join code.' });
  }
});

// @route   POST /api/team/join
// @desc    Join a team using a join code
// @access  Private
router.post('/join', authenticate, async (req, res) => {
  try {
    const { joinCode } = req.body;
    const userId = req.user.id;

    if (!joinCode) {
      return res.status(400).json({ msg: 'Join code is required.' });
    }

    // Find team by join code (handle both old string format and new object format)
    const team = await Team.findOne({
      $or: [
        { joinCode: joinCode.toUpperCase() }, // Old string format
        { 'joinCode.code': joinCode.toUpperCase(), 'joinCode.isActive': true } // New object format
      ]
    });

    if (!team) {
      return res.status(404).json({ msg: 'Invalid or expired join code.' });
    }

    // Check if user is already a member
    if (team.members.includes(userId)) {
      return res.status(400).json({ msg: 'You are already a member of this team.' });
    }

    // Add user to team members
    team.members.push(userId);
    await team.save();

    // Find potential athlete profiles for this user to claim
    const athletes = await Athlete.find({ 
      team: team._id,
      user: { $exists: false } // Not yet claimed
    }).select('name _id');

    res.json({
      msg: `Successfully joined ${team.name}!`,
      teamId: team._id,
      teamName: team.name,
      availableProfiles: athletes
    });
  } catch (error) {
    console.error('Error joining team:', error);
    res.status(500).json({ msg: 'Failed to join team.' });
  }
});

// @route   POST /api/team/claim-profile
// @desc    Request to claim an athlete profile
// @access  Private
router.post('/claim-profile', authenticate, async (req, res) => {
  try {
    const { athleteId } = req.body;
    const userId = req.user.id;
    const teamId = req.user.team?._id;

    if (!teamId || !athleteId) {
      return res.status(400).json({ msg: 'Team and athlete ID are required.' });
    }

    // Verify athlete exists and belongs to team
    const athlete = await Athlete.findOne({ _id: athleteId, team: teamId });
    if (!athlete) {
      return res.status(404).json({ msg: 'Athlete not found.' });
    }

    if (athlete.user) {
      return res.status(400).json({ msg: 'This profile is already claimed.' });
    }

    // Calculate name similarity score (simple implementation)
    const userName = req.user.displayName || req.user.email?.split('@')[0] || '';
    const athleteName = athlete.name || '';
    const matchScore = calculateNameSimilarity(userName, athleteName);

    // Find team and add pending claim
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ msg: 'Team not found.' });
    }

    // Check if claim already exists
    const existingClaim = team.pendingClaims.find(
      claim => claim.userId === userId && claim.athleteId.toString() === athleteId
    );

    if (existingClaim) {
      return res.status(400).json({ msg: 'You have already requested this profile.' });
    }

    // Add pending claim
    team.pendingClaims.push({
      userId,
      athleteId,
      matchScore,
      status: 'pending'
    });

    await team.save();

    res.json({
      msg: 'Profile claim request submitted. Waiting for coach approval.',
      athleteName: athlete.name,
      matchScore
    });
  } catch (error) {
    console.error('Error claiming profile:', error);
    res.status(500).json({ msg: 'Failed to claim profile.' });
  }
});

// @route   POST /api/team/approve-claim
// @desc    Approve or reject a profile claim (coaches only)
// @access  Private
router.post('/approve-claim', authenticate, async (req, res) => {
  try {
    const { claimId, action } = req.body; // action: 'approve' or 'reject'
    const teamId = req.user.team?._id;
    const userRole = req.user.role;

    if (!teamId || !claimId || !action) {
      return res.status(400).json({ msg: 'Team ID, claim ID, and action are required.' });
    }

    if (userRole !== 'coach') {
      return res.status(403).json({ msg: 'Only coaches can approve claims.' });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ msg: 'Team not found.' });
    }

    const claim = team.pendingClaims.id(claimId);
    if (!claim) {
      return res.status(404).json({ msg: 'Claim not found.' });
    }

    if (action === 'approve') {
      // Link athlete to user
      await Athlete.findByIdAndUpdate(claim.athleteId, { 
        user: claim.userId,
        'invite.status': 'accepted',
        'invite.acceptedAt': new Date()
      });

      claim.status = 'approved';
      res.json({ msg: 'Profile claim approved successfully.' });
    } else if (action === 'reject') {
      claim.status = 'rejected';
      res.json({ msg: 'Profile claim rejected.' });
    } else {
      return res.status(400).json({ msg: 'Invalid action. Use "approve" or "reject".' });
    }

    await team.save();
  } catch (error) {
    console.error('Error processing claim:', error);
    res.status(500).json({ msg: 'Failed to process claim.' });
  }
});

// @route   GET /api/team/pending-claims
// @desc    Get pending profile claims for coach review
// @access  Private
router.get('/pending-claims', authenticate, async (req, res) => {
  try {
    const teamId = req.user.team_id || req.user.team?.id;
    const userRole = req.user.role;

    if (!teamId) {
      return res.status(400).json({ msg: 'Team context is required.' });
    }

    if (userRole !== 'coach') {
      return res.status(403).json({ msg: 'Only coaches can view pending claims.' });
    }

    // For now, return empty array since pending claims feature needs to be implemented in Supabase
    // TODO: Implement pending_claims table in Supabase
    res.json({ pendingClaims: [] });
  } catch (error) {
    console.error('Error fetching pending claims:', error);
    res.status(500).json({ msg: 'Failed to fetch pending claims.' });
  }
});

// Helper function to calculate name similarity
function calculateNameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;
  
  const normalize = str => str.toLowerCase().replace(/[^a-z]/g, '');
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  if (n1 === n2) return 100;
  if (n1.includes(n2) || n2.includes(n1)) return 80;
  
  // Simple Levenshtein distance approximation
  const maxLength = Math.max(n1.length, n2.length);
  if (maxLength === 0) return 100;
  
  let matches = 0;
  for (let i = 0; i < Math.min(n1.length, n2.length); i++) {
    if (n1[i] === n2[i]) matches++;
  }
  
  return Math.round((matches / maxLength) * 100);
}

module.exports = router;
