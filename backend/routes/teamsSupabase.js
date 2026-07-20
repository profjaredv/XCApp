const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const calculationService = require('../services/performance/calculationServiceSupabase');

router.post('/', authenticate, async (req, res) => {
    const { name, athleticTeamId } = req.body;
    const userId = req.user.id;

    if (!name || !athleticTeamId) {
        return res.status(400).json({ message: 'Team name and Athletic.net Team ID are required.' });
    }

    try {
        const { data: existingTeam } = await supabase
            .from('teams')
            .select('id')
            .eq('athletic_team_id', athleticTeamId)
            .maybeSingle();

        if (existingTeam) {
            return res.status(409).json({ message: 'A team with this Athletic.net ID already exists.' });
        }

        const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);
        const joinCode = nanoid();

        const { data: userRoleCheck } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single();

        const needsRoleUpgrade = !userRoleCheck || userRoleCheck.role !== 'coach';

        const { data: newTeam, error: teamError } = await supabase
            .from('teams')
            .insert({
                name,
                athletic_team_id: athleticTeamId,
                join_code: joinCode,
                coach_uid: userId,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (teamError) {
            console.error('Error creating team:', teamError);
            return res.status(500).json({ message: 'Failed to create team.', error: teamError.message });
        }

        if (needsRoleUpgrade) {
            const { error: roleError } = await supabase
                .from('users')
                .update({
                    role: 'coach',
                    team_id: newTeam.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (roleError) {
                console.error('Error upgrading user to coach:', roleError);
                await supabase.from('teams').delete().eq('id', newTeam.id);
                return res.status(500).json({ message: 'Failed to upgrade user to coach role.' });
            }
        } else {
            const { error: teamAssignError } = await supabase
                .from('users')
                .update({
                    team_id: newTeam.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (teamAssignError) {
                console.error('Error assigning team to user:', teamAssignError);
            }
        }

        const { data: teamMember, error: memberError } = await supabase
            .from('team_members')
            .insert({
                team_id: newTeam.id,
                user_id: userId,
                role: 'coach',
                joined_at: new Date().toISOString()
            })
            .select()
            .single();

        if (memberError) {
            console.error('Error creating team member:', memberError);
        }

        const { data: updatedUser } = await supabase
            .from('users')
            .select('*, teams(*)')
            .eq('id', userId)
            .single();

        res.status(201).json({
            success: true,
            message: 'Team created successfully. You have been upgraded to coach role.',
            user: updatedUser,
            team: newTeam
        });

    } catch (error) {
        console.error('Error creating team:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});

router.get('/current', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const userTeamId = req.user.team_id;

        if (!userTeamId) {
            return res.status(404).json({ message: 'No team assigned to user' });
        }

        const { data: team, error } = await supabase
            .from('teams')
            .select('*')
            .eq('id', userTeamId)
            .single();

        if (error || !team) {
            return res.status(404).json({ message: 'Team not found' });
        }

        res.json({
            id: team.id,
            name: team.name,
            athleticTeamId: team.athletic_team_id,
            joinCode: team.join_code
        });
    } catch (error) {
        console.error('Error fetching current team:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});

router.post('/join', authenticate, async (req, res) => {
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
            return res.status(404).json({ message: 'Team not found for this join code.' });
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
            message: `Successfully joined team: ${team.name}`,
            user: updatedUser,
            team
        });

    } catch (error) {
        console.error('Error joining team:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});

// POST /api/teams/scrape
// Scrapes the latest results for a team
router.post('/scrape', authenticate, async (req, res) => {
    const { year } = req.body;
    const { spawn } = require('child_process');
    const path = require('path');
    const { parse } = require('csv-parse/sync');
    const moment = require('moment');

    try {
        const userId = req.user.id;
        const userTeamId = req.user.team_id;

        if (!userTeamId) {
            return res.status(404).json({ message: 'No team assigned to user' });
        }

        const { data: team, error: teamError } = await supabase
            .from('teams')
            .select('*')
            .eq('id', userTeamId)
            .single();

        if (teamError || !team) {
            return res.status(404).json({ message: 'Team not found' });
        }

        // Check if user is the coach
        if (team.coach_uid !== userId) {
            return res.status(403).json({ message: 'Forbidden: You are not the coach of this team.' });
        }

        const yearNum = parseInt(year, 10) || new Date().getFullYear();

        // If the season has been imported before, delete existing data for that season
        const importedSeasons = team.imported_seasons || [];
        if (importedSeasons.includes(yearNum)) {
            console.log(`Re-importing season ${year}. Deleting existing data...`);
            
            // Delete results and races for this season
            const { data: racesToDelete } = await supabase
                .from('races')
                .select('id')
                .eq('team_id', team.id)
                .eq('season', String(yearNum));

            if (racesToDelete && racesToDelete.length > 0) {
                const raceIds = racesToDelete.map(r => r.id);
                
                await supabase
                    .from('results')
                    .delete()
                    .in('race_id', raceIds);

                await supabase
                    .from('races')
                    .delete()
                    .in('id', raceIds);

                console.log(`Deleted ${racesToDelete.length} races and their results for season ${year}.`);
            }
        }

        // Choose scraper based on environment
        const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
        const scriptPath = isRailway 
            ? path.join(__dirname, '..', 'scrape_season_playwright.js')
            : path.join(__dirname, '..', 'scrape_season.py');
        
        const scraperProcess = isRailway
            ? spawn('node', [scriptPath, '--team_id', team.athletic_team_id, '--year', yearNum])
            : spawn('python3', [scriptPath, '--team_id', team.athletic_team_id, '--year', yearNum]);

        console.log(`Using ${isRailway ? 'Playwright (Railway)' : 'Python (Local)'} scraper for team ${team.athletic_team_id}, year ${yearNum}`);

        let csvData = '';
        let errorData = '';

        scraperProcess.stdout.on('data', (data) => {
            csvData += data.toString();
        });

        scraperProcess.stderr.on('data', (data) => {
            errorData += data.toString();
            console.error(`Scraper stderr: ${data}`);
        });

        scraperProcess.on('error', (err) => {
            console.error('Failed to start subprocess.', err);
            return res.status(500).json({ message: 'Failed to start scraper process.', error: err.message });
        });

        scraperProcess.on('close', async (code) => {
            if (code !== 0) {
                console.error(`Scraper process exited with code ${code}`);
                return res.status(500).json({ message: 'Failed to scrape data.', error: errorData });
            }

            try {
                console.log(`📥 Received CSV data (${csvData.length} bytes)`);
                if (csvData.length === 0) {
                    console.error('❌ No CSV data received from scraper!');
                    return res.status(500).json({ message: 'No data received from scraper.' });
                }
                
                const records = parse(csvData, {
                    columns: true,
                    skip_empty_lines: true,
                    trim: true,
                });
                
                console.log(`📋 Parsed ${records.length} CSV rows from scraper.`);
                if (records.length > 0) {
                    console.log(`📝 Sample record:`, JSON.stringify(records[0], null, 2));
                }
                
                let recordsProcessed = 0;
                let skippedMissing = 0;
                let skippedDate = 0;

                // Helper functions
                const parseTimeToSeconds = (timeStr) => {
                    if (!timeStr) return null;
                    const parts = timeStr.split(':').map(p => parseFloat(p));
                    if (parts.length === 2) return parts[0] * 60 + parts[1];
                    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
                    return null;
                };

                const parseDistanceToMeters = (distStr) => {
                    if (!distStr) return null;
                    // Remove commas first (handles "5,000 Meters")
                    const cleanStr = distStr.replace(/,/g, '');
                    // IMPORTANT: Match longer patterns first (miles before meters before m)
                    const match = cleanStr.match(/(\d+\.?\d*)\s*(miles?|meters?|mi|km|k|m)/i);
                    if (!match) return null;
                    const value = parseFloat(match[1]);
                    const unit = match[2].toLowerCase();
                    if (unit === 'k' || unit === 'km') return value * 1000;
                    if (unit === 'miles' || unit === 'mile' || unit === 'mi') return value * 1609.34;
                    if (unit === 'meters' || unit === 'meter' || unit === 'm') return value;
                    return null;
                };

                const calculateGraduationYear = (grade, currentYear) => {
                    const gradeNum = parseInt(grade, 10);
                    if (isNaN(gradeNum)) return null;
                    return currentYear + (12 - gradeNum);
                };

                for (const rowData of records) {
                    const { 
                        "Race Name": raceName, 
                        "Athlete Name": athleteName, 
                        "Grade": grade, 
                        "Gender": gender, 
                        "Time": time, 
                        "Race Date": raceDate, 
                        "Distance": distance 
                    } = rowData;

                    if (!raceName || !athleteName || !time || !raceDate) {
                        skippedMissing++;
                        continue;
                    }

                    const dateFormats = ['MMM D, YYYY', 'MMMM D, YYYY', 'M/D, YYYY', 'M/D/YYYY', 'MM/DD/YYYY', 'MM/D/YYYY', 'M/DD/YYYY'];
                    const parsedDate = moment(raceDate, dateFormats, true);
                    if (!parsedDate.isValid()) {
                        skippedDate++;
                        continue;
                    }

                    const gradeNum = grade ? parseInt(grade, 10) : null;
                    const graduationYear = grade ? calculateGraduationYear(grade, yearNum) : null;

                    // Upsert athlete
                    const { data: existingAthlete } = await supabase
                        .from('athletes')
                        .select('id')
                        .eq('name', athleteName)
                        .eq('team_id', team.id)
                        .maybeSingle();

                    let athleteId;
                    if (existingAthlete) {
                        const { data: updatedAthlete } = await supabase
                            .from('athletes')
                            .update({ 
                                gender,
                                grade: gradeNum,
                                graduation_year: graduationYear
                            })
                            .eq('id', existingAthlete.id)
                            .select()
                            .single();
                        athleteId = updatedAthlete.id;
                    } else {
                        const { data: newAthlete, error: athleteInsertError } = await supabase
                            .from('athletes')
                            .insert({
                                name: athleteName,
                                team_id: team.id,
                                gender,
                                grade: gradeNum,
                                graduation_year: graduationYear
                            })
                            .select()
                            .single();
                        
                        if (athleteInsertError || !newAthlete) {
                            console.error(`Failed to insert athlete: ${athleteName}`, athleteInsertError);
                            skippedMissing++;
                            continue;
                        }
                        athleteId = newAthlete.id;
                    }

                    // Upsert race (check distance to handle multi-distance meets)
                    const { data: existingRace } = await supabase
                        .from('races')
                        .select('id')
                        .eq('name', raceName)
                        .eq('date', parsedDate.format('YYYY-MM-DD'))
                        .eq('team_id', team.id)
                        .eq('distance', distance)  // IMPORTANT: Check distance for multi-distance meets
                        .maybeSingle();

                    let raceId;
                    if (existingRace) {
                        const { data: updatedRace } = await supabase
                            .from('races')
                            .update({
                                distance,
                                distance_meters: parseDistanceToMeters(distance),
                                season: String(yearNum)
                            })
                            .eq('id', existingRace.id)
                            .select()
                            .single();
                        raceId = updatedRace.id;
                    } else {
                        const { data: newRace, error: raceInsertError } = await supabase
                            .from('races')
                            .insert({
                                name: raceName,
                                date: parsedDate.format('YYYY-MM-DD'),
                                team_id: team.id,
                                distance,
                                distance_meters: parseDistanceToMeters(distance),
                                season: String(yearNum)
                            })
                            .select()
                            .single();
                        
                        if (raceInsertError || !newRace) {
                            console.error(`Failed to insert race: ${raceName}, ${distance}`, raceInsertError);
                            skippedMissing++;
                            continue;
                        }
                        raceId = newRace.id;
                    }

                    // Upsert result
                    const timeInSeconds = parseTimeToSeconds(time);
                    const { data: existingResult } = await supabase
                        .from('results')
                        .select('id')
                        .eq('athlete_id', athleteId)
                        .eq('race_id', raceId)
                        .maybeSingle();

                    if (existingResult) {
                        await supabase
                            .from('results')
                            .update({
                                time: timeInSeconds,
                                grade: gradeNum,
                                team_id: team.id
                            })
                            .eq('id', existingResult.id);
                    } else {
                        await supabase
                            .from('results')
                            .insert({
                                athlete_id: athleteId,
                                race_id: raceId,
                                time: timeInSeconds,
                                grade: gradeNum,
                                team_id: team.id
                            });
                    }

                    recordsProcessed++;
                }

                // Update imported seasons
                const updatedSeasons = [...new Set([...importedSeasons, yearNum])];
                await supabase
                    .from('teams')
                    .update({ imported_seasons: updatedSeasons })
                    .eq('id', team.id);

                console.log(`✅ Import complete. processed=${recordsProcessed}, skippedMissing=${skippedMissing}, skippedDate=${skippedDate}`);
                console.log(`📊 Total CSV records received: ${records.length}`);
                console.log(`✓ Successfully processed: ${recordsProcessed}`);
                console.log(`⚠ Skipped (missing data): ${skippedMissing}`);
                console.log(`⚠ Skipped (invalid date): ${skippedDate}`);

                // Trigger performance calculations in the background
                console.log(`🔄 Starting automatic analytics calculation for team ${team.id}, season ${yearNum}`);
                calculationService.calculateAllMetrics(team.id, yearNum)
                    .then(() => {
                        console.log(`✅ Analytics calculated for season ${yearNum}`);
                    })
                    .catch(calcError => {
                        console.error(`❌ Error calculating analytics for season ${yearNum}:`, calcError);
                    });

                res.status(200).json({
                    success: true,
                    message: `Successfully imported ${recordsProcessed} results for season ${yearNum}. Analytics are calculating in the background - you can safely leave this page.`,
                    recordsProcessed,
                    skippedMissing,
                    skippedDate,
                    totalRecords: records.length,
                    calculationStatus: 'processing'
                });

            } catch (error) {
                console.error('Error processing scraped data:', error);
                res.status(500).json({ message: 'Failed to process scraped data.', error: error.message });
            }
        });

    } catch (error) {
        console.error('Error in scrape endpoint:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});

// GET /api/teams/seasons
// Gets all imported seasons for the user's team
router.get('/seasons', authenticate, async (req, res) => {
    try {
        console.log('🔍 GET /teams/seasons called');
        console.log('User:', req.user?.id);
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
    console.log(`[${new Date().toISOString()}] GET /teams/results-grid - Request received`);
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

module.exports = router;
