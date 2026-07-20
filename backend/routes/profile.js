const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/profile
// Fetches the profile of the authenticated user
router.get('/', authenticate, async (req, res) => {
    try {
        // req.user is already populated by authenticate middleware with team data
        const user = req.user;

        if (!user) {
            return res.status(404).send({ message: 'User not found.' });
        }

        const teamData = user.team || null;

        res.status(200).send({
            uid: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            team: teamData
        });

    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// POST /api/profile/join-team
// Allows an authenticated user to join a team using a join code
router.post('/join-team', authenticate, async (req, res) => {
    const { joinCode } = req.body;
    const userId = req.user.id;

    if (!joinCode) {
        return res.status(400).json({ message: 'Join code is required.' });
    }

    try {
        const { data: team, error: teamError } = await supabase
            .from('teams')
            .select('*')
            .eq('join_code', joinCode)
            .maybeSingle();

        if (teamError || !team) {
            return res.status(404).json({ message: 'Team not found.' });
        }

        const { data: existingMember } = await supabase
            .from('team_members')
            .select('id')
            .eq('team_id', team.id)
            .eq('user_id', userId)
            .maybeSingle();

        if (!existingMember) {
            const { error: memberError } = await supabase
                .from('team_members')
                .insert({
                    team_id: team.id,
                    user_id: userId,
                    role: 'athlete',
                    joined_at: new Date().toISOString()
                });

            if (memberError) {
                console.error('Error adding team member:', memberError);
                return res.status(500).json({ message: 'Failed to join team.' });
            }
        }

        const { error: userError } = await supabase
            .from('users')
            .update({
                team_id: team.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (userError) {
            console.error('Error updating user team:', userError);
        }

        const { data: updatedUser } = await supabase
            .from('users')
            .select('*, teams(*)')
            .eq('id', userId)
            .single();

        res.status(200).json({
            success: true,
            message: 'Successfully joined team.',
            user: updatedUser
        });

    } catch (error) {
        console.error('Error joining team:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// POST /api/profile/upgrade-to-coach
// Upgrades a user's role to 'coach' using a secret code
router.post('/upgrade-to-coach', authenticate, async (req, res) => {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
        return res.status(400).send({ message: 'Upgrade code is required.' });
    }

    // Clean the upgrade code from the environment variable (remove quotes if present)
    const expectedCode = process.env.COACH_UPGRADE_CODE.replace(/^"|"$/g, '');
    
    if (code !== expectedCode) {
        return res.status(401).send({ message: 'Invalid upgrade code.' });
    }

    try {
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (userError || !user) {
            return res.status(404).send({ message: 'User not found.' });
        }

        if (user.role === 'coach') {
            return res.status(400).send({ message: 'User is already a coach.' });
        }

        const { error: updateError } = await supabase
            .from('users')
            .update({ role: 'coach', updated_at: new Date().toISOString() })
            .eq('id', userId);

        if (updateError) {
            console.error('Error updating user role:', updateError);
            return res.status(500).send({ message: 'Failed to upgrade role.' });
        }

        const { data: updatedUser } = await supabase
            .from('users')
            .select('*, team:teams(*)')
            .eq('id', userId)
            .single();

        res.status(200).send({
            message: 'Successfully upgraded to coach.',
            user: {
                uid: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                role: updatedUser.role,
                team: updatedUser.team
            }
        });

    } catch (error) {
        console.error('Error upgrading user role:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// POST /api/profile/fix-coach-role
// Emergency endpoint to fix coach role based on team ownership
router.post('/fix-coach-role', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Check if user owns a team
        const { data: ownedTeam, error: teamError } = await supabase
            .from('teams')
            .select('*')
            .eq('coach_uid', userId)
            .maybeSingle();
        
        if (teamError || !ownedTeam) {
            return res.status(400).json({ message: 'User does not own any team.' });
        }
        
        // Update user role to coach
        const { error: updateError } = await supabase
            .from('users')
            .update({ 
                role: 'coach', 
                team_id: ownedTeam.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        
        if (updateError) {
            console.error('Error updating user:', updateError);
            return res.status(500).json({ message: 'Failed to update user.' });
        }
        
        // Return updated user data
        const { data: updatedUser } = await supabase
            .from('users')
            .select('*, team:teams(*)')
            .eq('id', userId)
            .single();
        
        res.json({
            message: 'Coach role restored successfully.',
            user: {
                uid: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                role: updatedUser.role,
                team: updatedUser.team
            }
        });
    } catch (error) {
        console.error('Error fixing coach role:', error);
        res.status(500).json({ message: 'Failed to fix coach role.', error: error.message });
    }
});

module.exports = router;
