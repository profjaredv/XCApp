const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const supabase = require('../config/supabase');

router.get('/', authenticate, async (req, res) => {
    try {
        if (!req.user.team) {
            return res.status(404).send({ message: 'User is not associated with a team.' });
        }

        const { data: results, error } = await supabase
            .from('results')
            .select(`
                *,
                athlete:athletes(id, name, graduation_year, gender, grade),
                race:races(id, name, date, distance, season)
            `)
            .eq('team_id', req.user.team.id);

        if (error) {
            console.error('Error fetching results:', error);
            return res.status(500).send({ message: 'Error fetching results' });
        }

        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

module.exports = router;
