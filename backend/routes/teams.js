const express = require('express');
const router = express.Router();
const { customAlphabet } = require('nanoid');
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { spawn } = require('child_process');
const { nanoid } = require('nanoid');

function calculateGraduationYear(grade, seasonYear) {
    const year = parseInt(seasonYear, 10);
    // Handle both numeric (9, 10, 11, 12) and string (FR, SO) grades
    const gradeStr = String(grade).toUpperCase();

    switch (gradeStr) {
        case '9':
        case 'FR':
        case 'FR-1':
            return year + 4;
        case '10':
        case 'SO':
        case 'SO-2':
            return year + 3;
        case '11':
        case 'JR':
        case 'JR-3':
            return year + 2;
        case '12':
        case 'SR':
        case 'SR-4':
            return year + 1;
        default:
            return null; // Or handle as an unknown grade
    }
}
const { parse } = require('csv-parse/sync');
const moment = require('moment');
const path = require('path');
const { parseDistanceToMeters } = require('../utils/distanceParser');

function parseTimeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 2) { // MM:SS.ms
        seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 1) { // SS.ms
        seconds = parts[0];
    }
    return seconds;
}

// POST /api/teams/create
// Creates a new team
router.post('/', authenticate, async (req, res) => {
    const { name, athleticTeamId } = req.body;
    const coachUid = req.user._id;

    if (!name || !athleticTeamId) {
        return res.status(400).send({ message: 'Team name and Athletic.net Team ID are required.' });
    }

    try {
        const existingTeam = await Team.findOne({ athleticTeamId });
        if (existingTeam) {
            return res.status(409).send({ message: 'A team with this Athletic.net ID already exists.' });
        }

        const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
        const joinCode = nanoid();

        const newTeam = new Team({
            name,
            athleticTeamId,
            coachUid: coachUid,
            members: [coachUid],
            joinCode
        });
        await newTeam.save();

        const updatedUser = await User.findByIdAndUpdate(
            coachUid,
            { team: newTeam._id },
            { new: true }
        ).populate('team');

        if (!updatedUser) {
            await Team.findByIdAndDelete(newTeam._id);
            return res.status(404).send({ message: 'Coach not found after team creation.' });
        }

        res.status(201).send({ 
            message: 'Team created successfully.',
            user: updatedUser 
        });

    } catch (error) {
        console.error('Error creating team:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// POST /api/teams/scrape
// Scrapes the latest results for a team
router.post('/scrape', authenticate, async (req, res) => {
    const { year } = req.body; // Year will be passed in the request body

    try {
        const team = req.user.team;
        if (!team) {
            return res.status(404).send({ message: 'Team not found.' });
        }

        if (team.coachUid !== req.user._id.toString()) {
            return res.status(403).send({ message: 'Forbidden: You are not the coach of this team.' });
        }

        const yearNum = parseInt(year, 10) || new Date().getFullYear();
        const teamId = team.id;
        
        // Delete existing data for this season to allow re-import
        console.log(`Deleting existing data for team ${teamId}, season ${yearNum}...`);
        
        // Get races for this season
        const { data: racesToDelete, error: racesError } = await supabase
            .from('races')
            .select('id')
            .eq('team_id', teamId)
            .eq('season', String(yearNum));
        
        if (!racesError && racesToDelete && racesToDelete.length > 0) {
            const raceIds = racesToDelete.map(r => r.id);
            
            // Delete results for these races
            const { error: resultsDeleteError } = await supabase
                .from('results')
                .delete()
                .in('race_id', raceIds);
            
            if (resultsDeleteError) {
                console.error('Error deleting results:', resultsDeleteError);
            }
            
            // Delete the races
            const { error: racesDeleteError } = await supabase
                .from('races')
                .delete()
                .in('id', raceIds);
            
            if (racesDeleteError) {
                console.error('Error deleting races:', racesDeleteError);
            }
            
            console.log(`Deleted ${racesToDelete.length} races and their results for season ${yearNum}.`);
        }

        // Choose scraper based on environment
        const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
        const scriptPath = isRailway 
            ? path.join(__dirname, '..', 'scrape_season_playwright.js')
            : path.join(__dirname, '..', 'scrape_season.py');
        
        const scraperProcess = isRailway
            ? spawn('node', [scriptPath, '--team_id', team.athleticTeamId, '--year', yearNum])
            : spawn('python3', [scriptPath, '--team_id', team.athleticTeamId, '--year', yearNum]);

        console.log(`Using ${isRailway ? 'Playwright (Railway)' : 'Python (Local)'} scraper for team ${team.athleticTeamId}, year ${yearNum}`);

        scraperProcess.on('error', (err) => {
            console.error('Failed to start subprocess.', err);
            return res.status(500).send({ message: 'Failed to start scraper process.', error: err.message });
        });

        let csvData = '';
        let errorData = '';

        scraperProcess.stdout.on('data', (data) => {
            csvData += data.toString();
        });

        scraperProcess.stderr.on('data', (data) => {
            errorData += data.toString();
            console.error(`Scraper stderr: ${data}`);
        });

        scraperProcess.on('close', async (code) => {
            if (code !== 0) {
                console.error(`Scraper process exited with code ${code}`);
                return res.status(500).send({ message: 'Failed to scrape data.', error: errorData });
            }

            try {
                const records = parse(csvData, {
                    columns: true,
                    skip_empty_lines: true,
                    trim: true,
                });
                console.log(`Parsed ${records.length} CSV rows from scraper.`);
                if (records.length > 0) {
                    const sample = records[0];
                    console.log(`Sample headers: ${Object.keys(sample).join(', ')}`);
                }
                let recordsProcessed = 0;
                let skippedMissing = 0;
                let skippedDate = 0;

                for (const rowData of records) {
                    const { "Race Name": raceName, "Athlete Name": athleteName, "Grade": grade, "Gender": gender, "Time": time, "Race Date": raceDateStr, "Distance": distance } = rowData;

                    if (!raceName || !athleteName || !time || !raceDateStr) {
                        skippedMissing++;
                        continue;
                    }

                    // Accept multiple date formats produced by the scraper (month name or numeric)
                    const dateFormats = ['MMM D, YYYY', 'MMMM D, YYYY', 'M/D, YYYY', 'M/D/YYYY', 'MM/DD/YYYY', 'MM/D/YYYY', 'M/DD/YYYY'];
                    const parsedDate = moment(raceDateStr, dateFormats, true);
                    if (!parsedDate.isValid()) {
                        skippedDate++;
                        continue;
                    }

                    const gradeNum = grade ? parseInt(grade, 10) : null;
                    const graduationYear = grade ? calculateGraduationYear(grade, yearNum) : null;

                    // Upsert athlete using Supabase
                    const { data: athlete, error: athleteError } = await supabase
                        .from('athletes')
                        .upsert({
                            name: athleteName,
                            team_id: teamId,
                            gender: gender || 'M',
                            grade: gradeNum,
                            graduation_year: graduationYear
                        }, {
                            onConflict: 'name,team_id',
                            ignoreDuplicates: false
                        })
                        .select()
                        .single();

                    if (athleteError) {
                        console.error(`Error upserting athlete ${athleteName}:`, athleteError);
                        continue;
                    }

                    // Upsert race using Supabase
                    const raceDate = parsedDate.format('YYYY-MM-DD');
                    const { data: race, error: raceError } = await supabase
                        .from('races')
                        .upsert({
                            name: raceName,
                            date: raceDate,
                            team_id: teamId,
                            distance: distance,
                            distance_meters: parseDistanceToMeters(distance),
                            season: String(yearNum)
                        }, {
                            onConflict: 'name,date,team_id',
                            ignoreDuplicates: false
                        })
                        .select()
                        .single();

                    if (raceError) {
                        console.error(`Error upserting race ${raceName}:`, raceError);
                        continue;
                    }

                    const timeInSeconds = parseTimeToSeconds(time);

                    // Upsert result using Supabase
                    const { error: resultError } = await supabase
                        .from('results')
                        .upsert({
                            athlete_id: athlete.id,
                            race_id: race.id,
                            team_id: teamId,
                            time: timeInSeconds,
                            grade: gradeNum
                        }, {
                            onConflict: 'athlete_id,race_id',
                            ignoreDuplicates: false
                        });

                    if (resultError) {
                        console.error(`Error upserting result for ${athleteName} in ${raceName}:`, resultError);
                        continue;
                    }

                    recordsProcessed++;
                }

                console.log(`✅ Import complete. processed=${recordsProcessed}, skippedMissing=${skippedMissing}, skippedDate=${skippedDate}`);
                console.log(`📊 Total CSV records received: ${records.length}`);
                console.log(`✓ Successfully processed: ${recordsProcessed}`);
                console.log(`⚠ Skipped (missing data): ${skippedMissing}`);
                console.log(`⚠ Skipped (invalid date): ${skippedDate}`);
                
                // Automatically calculate all analytics after successful import
                if (recordsProcessed > 0) {
                    console.log(`🔄 Starting automatic analytics calculation for team ${teamId}, season ${yearNum}`);
                    try {
                        // Use the Supabase-compatible calculation service
                        const calculationService = require('../services/performance/calculationServiceSupabase');
                        
                        // Calculate performance metrics
                        await calculationService.calculateAllMetrics(teamId, yearNum);
                        console.log(`✅ Analytics calculated for season ${yearNum}`);
                        
                    } catch (calcError) {
                        console.error(`❌ Error calculating analytics for season ${yearNum}:`, calcError);
                        // Don't fail the import if analytics calculation fails
                    }
                }
                
                res.status(200).send({ 
                    success: true,
                    message: `Successfully imported ${recordsProcessed} results for season ${yearNum}. Analytics calculation started.`,
                    recordsProcessed,
                    skippedMissing,
                    skippedDate,
                    totalRecords: records.length
                });
            } catch (dbError) {
                console.error('❌ Error processing scraped data:', dbError);
                res.status(500).send({ 
                    success: false,
                    message: 'Failed to process scraped data.', 
                    error: dbError.message 
                });
            }
        });

    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).send({ message: 'An unexpected error occurred during scraping.' });
    }
});

// POST /api/teams/roster-scrape
// Scrapes roster only (no results) for a given season and upserts athletes
router.post('/roster-scrape', authenticate, async (req, res) => {
    const { year } = req.body;
    try {
        const team = req.user.team;
        if (!team) {
            return res.status(404).send({ message: 'Team not found.' });
        }

        if (team.coachUid !== req.user._id.toString()) {
            return res.status(403).send({ message: 'Forbidden: You are not the coach of this team.' });
        }

        const yearNum = parseInt(year, 10) || new Date().getFullYear();

        const scriptPath = path.join(__dirname, '..', 'scrape_roster.py');
        const pythonProcess = spawn('python3', [scriptPath, '--team_id', team.athleticTeamId, '--year', yearNum]);

        pythonProcess.on('error', (err) => {
            console.error('Failed to start roster subprocess.', err);
            return res.status(500).send({ message: 'Failed to start roster scraper process.', error: err.message });
        });

        let csvData = '';
        let errorData = '';

        pythonProcess.stdout.on('data', (data) => {
            csvData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
            console.error(`Roster scraper stderr: ${data}`);
        });

        pythonProcess.on('close', async (code) => {
            if (code !== 0) {
                console.error(`Roster scraper exited with code ${code}`);
                return res.status(500).send({ message: 'Failed to scrape roster.', error: errorData });
            }

            try {
                const records = parse(csvData, {
                    columns: true,
                    skip_empty_lines: true,
                    trim: true,
                });

                let upserts = 0;
                for (const row of records) {
                    const athleteName = row['Athlete Name'];
                    const gradeStr = (row['Grade'] || '').toString();
                    const gender = row['Gender'] || '';

                    if (!athleteName) continue;

                    const gradeNum = gradeStr && /^(\d+)$/.test(gradeStr) ? parseInt(gradeStr, 10) : null;
                    const gradYear = gradeStr ? calculateGraduationYear(gradeStr, yearNum) : null;

                    await Athlete.findOneAndUpdate(
                        { name: athleteName, team: team._id },
                        {
                            $set: { grade: gradeNum, gender, graduationYear: gradYear },
                            $setOnInsert: { name: athleteName, team: team._id }
                        },
                        { upsert: true, new: true }
                    );
                    upserts++;
                }

                // Mark season imported if not present
                const teamToUpdate = await Team.findById(team._id);
                if (teamToUpdate) {
                    const seasonsNumeric = teamToUpdate.importedSeasons.map((y) => parseInt(y, 10));
                    if (!seasonsNumeric.includes(yearNum)) {
                        teamToUpdate.importedSeasons.push(yearNum);
                        await teamToUpdate.save();
                    }
                }

                return res.status(200).send({ message: `Roster import complete for ${yearNum}. ${upserts} athletes upserted.` });
            } catch (err) {
                console.error('Error processing roster data:', err);
                return res.status(500).send({ message: 'Failed to process roster data.', error: err.message });
            }
        });

    } catch (error) {
        console.error('Roster scraping error:', error);
        res.status(500).send({ message: 'An unexpected error occurred during roster scraping.' });
    }
});

// DELETE /api/teams/data
// Deletes all data for a team
router.delete('/data', authenticate, async (req, res) => {
    try {
        const team = req.user.team;
        if (!team) {
            return res.status(404).send({ message: 'Team not found.' });
        }

        const isCoach = team.coachUid && team.coachUid.toString() === req.user._id.toString();
        if (!isCoach) {
            return res.status(403).send({ message: team.coachUid ? 'Forbidden: You are not the coach of this team.' : 'Forbidden: Team has no coach assigned; only a coach can clear data.' });
        }

        const athleteDeletion = await Athlete.deleteMany({ team: team._id });
        const raceDeletion = await Race.deleteMany({ team: team._id });
        const resultDeletion = await Result.deleteMany({ team: team._id });

        // Also clear the importedSeasons array (update via Model; auth supplies a plain object)
        await Team.findByIdAndUpdate(team._id, { $set: { importedSeasons: [] } });

        res.status(200).send({ 
            message: `Data cleared successfully for team ${team.name}.`,
            details: {
                athletesDeleted: athleteDeletion.deletedCount,
                racesDeleted: raceDeletion.deletedCount,
                resultsDeleted: resultDeletion.deletedCount
            }
        });

    } catch (error) {
        console.error('Error deleting results:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// GET /api/teams/seasons
// Gets all imported seasons for the user's team
router.get('/seasons', authenticate, async (req, res) => {
    try {
        console.log('🔍 GET /teams/seasons called');
        console.log('User:', req.user?._id || req.user?.id);
        console.log('Team:', req.user?.team);
        
        const team = req.user.team;
        if (!team) {
            console.log('❌ No team found for user');
            return res.status(404).send({ message: 'Team not found for the current user.' });
        }

        const teamId = team.id;
        console.log('✅ Team ID:', teamId);
        
        // Get distinct seasons from races table
        const { data: races, error } = await supabase
            .from('races')
            .select('season')
            .eq('team_id', teamId);
        
        if (error) {
            console.error('Error fetching seasons:', error);
            return res.status(500).send({ message: 'Failed to fetch seasons' });
        }
        
        // Extract unique seasons and sort newest first
        const seasons = [...new Set(races.map(r => parseInt(r.season)))]
            .filter(s => !isNaN(s))
            .sort((a, b) => b - a);
        
        console.log('✅ Returning seasons:', seasons);
        res.status(200).send(seasons);

    } catch (error) {
        console.error('Error fetching seasons:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// GET /api/teams/results-grid
// Gets results grid data for the user's team
router.get('/results-grid', authenticate, async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] GET /api/teams/results-grid - Request received`);
    console.log('Request query:', req.query);
    
    const team = req.user.team;
    if (!team || !team.id) {
      console.error('No team assigned to user');
      return res.status(400).json({ message: 'No team assigned to user' });
    }
    
    const teamId = team.id;
    console.log('User team ID:', teamId);
    
    const { seasons, grades } = req.query;
    
    if (!seasons) {
      return res.status(400).json({ message: 'Seasons parameter is required' });
    }
    
    const seasonsArray = seasons.split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s));
    const seasonsStrArray = seasonsArray.map(String);
    const gradesArray = grades 
      ? grades.split(',').map(g => parseInt(g.trim())).filter(g => !isNaN(g) && g > 0)
      : [];
    
    if (seasonsArray.length === 0) {
      return res.status(400).json({ message: 'Invalid seasons format' });
    }

    // 1. Get all races for the team and selected seasons
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('id, name, date, season')
      .eq('team_id', teamId)
      .in('season', seasonsStrArray)
      .order('date', { ascending: true });
    
    if (racesError) {
      console.error('Error fetching races:', racesError);
      return res.status(500).json({ message: 'Failed to fetch races' });
    }
    
    console.log(`Retrieved ${races.length} races for teamId: ${teamId}`);
    const raceHeaders = races.map(r => ({ raceId: r.id, name: r.name }));
    const raceIds = races.map(r => r.id);

    if (raceIds.length === 0) {
      return res.json({ races: [], athletes: [] });
    }

    // 2. Get all results for these races with athlete info
    let resultsQuery = supabase
      .from('results')
      .select(`
        id,
        time,
        grade,
        race_id,
        athlete:athletes(
          id,
          name,
          gender
        )
      `)
      .eq('team_id', teamId)
      .in('race_id', raceIds);
    
    if (gradesArray.length > 0) {
      resultsQuery = resultsQuery.in('grade', gradesArray);
    }
    
    const { data: results, error: resultsError } = await resultsQuery;
    
    if (resultsError) {
      console.error('Error fetching results:', resultsError);
      return res.status(500).json({ message: 'Failed to fetch results' });
    }

    console.log(`Retrieved ${results.length} results`);

    // 3. Group results by athlete
    const athleteMap = new Map();
    
    results.forEach(result => {
      if (!result.athlete) return; // Skip if athlete data is missing
      
      const athleteId = result.athlete.id;
      
      if (!athleteMap.has(athleteId)) {
        athleteMap.set(athleteId, {
          athleteId,
          name: result.athlete.name,
          grade: result.grade,
          gender: result.athlete.gender || '',
          resultsByRace: new Map()
        });
      }
      
      const athlete = athleteMap.get(athleteId);
      athlete.resultsByRace.set(result.race_id, result.time);
    });

    // 4. Format data for the grid
    const gridData = Array.from(athleteMap.values())
      .map(athlete => ({
        athleteId: athlete.athleteId,
        name: athlete.name,
        grade: athlete.grade,
        gender: athlete.gender,
        results: raceHeaders.map(h => athlete.resultsByRace.get(h.raceId) || null)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log(`Successfully formatted data for ${gridData.length} athletes`);
    res.json({
      races: raceHeaders.map(h => h.name),
      athletes: gridData
    });

  } catch (error) {
    console.error(`Error fetching results grid:`, error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT /api/teams/:teamId
// Updates team settings
router.put('/:teamId', authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { name, athleticTeamId } = req.body;
    
    // Verify user has access to this team
    if (!req.user.team || req.user.team._id.toString() !== teamId) {
      return res.status(403).json({ message: 'Access denied. You do not have permission to update this team.' });
    }
    
    // Check if another team already has this Athletic.net Team ID
    if (athleticTeamId) {
      const existingTeam = await Team.findOne({ 
        athleticTeamId, 
        _id: { $ne: teamId } 
      });
      
      if (existingTeam) {
        return res.status(409).json({ message: 'A team with this Athletic.net ID already exists.' });
      }
    }
    
    // Update the team
    const updateData = {};
    if (name) updateData.name = name;
    if (athleticTeamId) updateData.athleticTeamId = athleticTeamId;
    
    const updatedTeam = await Team.findByIdAndUpdate(
      teamId,
      { $set: updateData },
      { new: true }
    );
    
    if (!updatedTeam) {
      return res.status(404).json({ message: 'Team not found.' });
    }
    
    res.status(200).json({
      message: 'Team settings updated successfully.',
      team: updatedTeam
    });
    
  } catch (error) {
    console.error('Error updating team settings:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

// GET /api/teams/current
// Gets the current team for the authenticated user
router.get('/current', authenticate, async (req, res) => {
  try {
    if (!req.user?.team) {
      return res.status(404).json({ message: 'No team assigned to user' });
    }
    
    const team = await Team.findById(req.user.team._id);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    
    res.status(200).json({
      id: team._id,
      name: team.name,
      athleticTeamId: team.athleticTeamId
    });
  } catch (error) {
    console.error('Error fetching current team:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

// POST /api/teams/join
// Allows a user to join a team using a join code
router.post('/join', authenticate, async (req, res) => {
    const { joinCode } = req.body;
    const userId = req.user._id;

    if (!joinCode) {
        return res.status(400).json({ message: 'Join code is required.' });
    }

    try {
        const team = await Team.findOne({ joinCode });
        if (!team) {
            return res.status(404).json({ message: 'Team not found for this join code.' });
        }

        // Add user to team if not already a member
        if (!team.members.includes(userId)) {
            team.members.push(userId);
            await team.save();
        }

        // Update user's team reference
        const updatedUser = await User.findByIdAndUpdate(userId, { team: team._id }, { new: true }).populate('team');

        res.status(200).json({ 
            message: `Successfully joined team: ${team.name}`,
            user: updatedUser
        });

    } catch (error) {
        console.error('Error joining team:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});

module.exports = router;
