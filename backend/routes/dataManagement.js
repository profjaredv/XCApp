const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');

router.post('/clear/:teamId/:season', authenticate, async (req, res) => {
  try {
    const { teamId, season } = req.params;

    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied. Coach role required.' });
    }

    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('id')
      .eq('team_id', teamId)
      .eq('season', season);

    if (racesError) {
      console.error('Error fetching races:', racesError);
      return res.status(500).json({ message: 'Error fetching races' });
    }

    const raceIds = races.map(race => race.id);

    let resultsDeleted = 0;
    if (raceIds.length > 0) {
      const { error: resultsError } = await supabase
        .from('results')
        .delete()
        .in('race_id', raceIds);

      if (resultsError) {
        console.error('Error deleting results:', resultsError);
      } else {
        resultsDeleted = raceIds.length;
      }
    }

    let racesDeleted = 0;
    if (raceIds.length > 0) {
      const { error: deleteRacesError } = await supabase
        .from('races')
        .delete()
        .in('id', raceIds);

      if (!deleteRacesError) {
        racesDeleted = raceIds.length;
      }
    }

    await supabase.from('team_season_metrics').delete().eq('team_id', teamId).eq('season', parseInt(season));
    await supabase.from('athlete_season_metrics').delete().eq('team_id', teamId).eq('season', parseInt(season));
    await supabase.from('meet_performance_metrics').delete().eq('team_id', teamId).eq('season', parseInt(season));

    res.json({
      racesDeleted,
      resultsDeleted
    });

  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/import/:teamId/:season', authenticate, async (req, res) => {
  try {
    const { teamId, season } = req.params;
    const { athleticNetTeamId } = req.body;

    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied. Coach role required.' });
    }

    if (!athleticNetTeamId) {
      return res.status(400).json({ message: 'Athletic.net Team ID is required' });
    }

    const { scrapeSeasonResults } = require('../scrape_season_playwright');
    const { processScrapedData } = require('../utils/dataImporter');

    console.log(`Starting scrape for team ${athleticNetTeamId}, season ${season}`);
    const scrapedData = await scrapeSeasonResults(athleticNetTeamId, season);

    const importResult = await processScrapedData(scrapedData, teamId, season);

    res.json({
      racesImported: importResult.racesImported,
      athletesImported: importResult.athletesImported,
      resultsImported: importResult.resultsImported
    });

  } catch (error) {
    console.error('Error importing data:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/calculate/:teamId/:season', authenticate, async (req, res) => {
  try {
    const { teamId, season } = req.params;

    if (req.user.role !== 'coach') {
      return res.status(403).json({ message: 'Access denied. Coach role required.' });
    }

    console.log(`Starting metrics calculation for team ${teamId}, season ${season}`);

    const { data: athletes } = await supabase
      .from('athletes')
      .select('id')
      .eq('team_id', teamId);

    const { data: races } = await supabase
      .from('races')
      .select('id')
      .eq('team_id', teamId)
      .eq('season', season);

    const { data: results } = await supabase
      .from('results')
      .select('id')
      .eq('team_id', teamId);

    res.json({
      success: true,
      athleteCount: athletes?.length || 0,
      raceCount: races?.length || 0,
      resultCount: results?.length || 0,
      message: 'Basic metrics calculated (advanced calculations not yet implemented)'
    });

  } catch (error) {
    console.error('Error calculating metrics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
