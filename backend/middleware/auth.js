const supabase = require('../config/supabase');

const authenticate = async (req, res, next) => {
    const { authorization } = req.headers;

    if (!authorization || !authorization.startsWith('Bearer ')) {
        console.log('❌ No authorization header or invalid format');
        return res.status(401).send({ message: 'Unauthorized: No token provided.' });
    }

    const token = authorization.split('Bearer ')[1];
    console.log('🔑 Token received:', token.substring(0, 20) + '...');

    try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !authUser) {
            console.log('❌ Auth error:', authError?.message || 'No user found');
            return res.status(403).send({ message: 'Invalid or expired token', details: authError?.message });
        }

        console.log('✅ Auth user found:', authUser.id, authUser.email);

        const { data: user, error: userError } = await supabase
            .from('users')
            .select(`
                *,
                team:teams(*)
            `)
            .eq('id', authUser.id)
            .maybeSingle();

        if (userError) {
            console.error('Error fetching user:', userError);
            return res.status(500).send({ message: 'Error fetching user data' });
        }

        if (!user) {
            const { data: ownedTeam } = await supabase
                .from('teams')
                .select('*')
                .eq('coach_uid', authUser.id)
                .maybeSingle();

            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    id: authUser.id,
                    email: authUser.email,
                    name: authUser.user_metadata?.name || authUser.email.split('@')[0],
                    role: ownedTeam ? 'coach' : 'athlete',
                    team_id: ownedTeam?.id
                })
                .select(`
                    *,
                    team:teams(*)
                `)
                .single();

            if (createError) {
                console.error('Error creating user:', createError);
                return res.status(500).send({ message: 'Error creating user profile' });
            }

            req.user = newUser;
        } else {
            if (user.team && user.team.coach_uid === user.id && user.role !== 'coach') {
                await supabase
                    .from('users')
                    .update({ role: 'coach' })
                    .eq('id', user.id);
                user.role = 'coach';
            }

            req.user = user;
        }

        next();
    } catch (error) {
        console.error('Error in auth middleware:', error);
        res.status(500).send({ message: 'An unexpected error occurred during authentication.', error: error.message });
    }
};

const authorizeTeamAccess = (req, res, next) => {
    try {
        const routeTeamId = req.params?.teamId || req.body?.teamId || null;
        if (!routeTeamId) return next();

        if (!req.user) {
            console.log('❌ authorizeTeamAccess: No user in request');
            return res.status(401).send({ message: 'Unauthorized' });
        }

        // Handle both object and array formats for team
        let userTeam = req.user.team;
        if (Array.isArray(userTeam)) {
            userTeam = userTeam[0];
        }
        
        const userTeamId = userTeam?.id || req.user.team_id;

        console.log('🔐 Team Authorization Check:');
        console.log('  Route teamId:', routeTeamId);
        console.log('  User teamId:', userTeamId);
        console.log('  User team object:', userTeam);
        console.log('  Match:', userTeamId === routeTeamId);

        if (!userTeamId) {
            console.log('❌ No team assigned to user');
            return res.status(403).send({ message: 'Forbidden: No team assigned to user' });
        }

        if (userTeamId !== routeTeamId) {
            console.log('❌ Team ID mismatch');
            return res.status(403).send({ message: 'Forbidden: You do not have access to this team' });
        }

        console.log('✅ Team access authorized');
        return next();
    } catch (e) {
        console.error('Authorization error:', e);
        return res.status(500).send({ message: 'Authorization error', error: e.message });
    }
};

module.exports = { authenticate, authorizeTeamAccess };
