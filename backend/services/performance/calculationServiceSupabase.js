const supabase = require('../../config/supabase');
const logger = require('../../utils/logger');
const cache = require('./cache');

class CalculationServiceSupabase {
  constructor() {
    this.batchSize = 100;
  }

  /**
   * Calculate and update all performance metrics for a team and season
   */
  async calculateAllMetrics(teamId, season, skipCache = false) {
    try {
      logger.info(`Starting metrics calculation for team ${teamId}, season ${season}`);

      if (!skipCache) {
        await cache.invalidateTeam(teamId, season);
      }

      // 1. Calculate athlete-level metrics
      await this.calculateAthleteMetrics(teamId, season);

      // 2. Calculate meet-level metrics
      await this.calculateMeetMetrics(teamId, season);

      // 3. Calculate team-level metrics
      const result = await this.calculateTeamMetrics(teamId, season);

      logger.info(`Completed metrics calculation for team ${teamId}, season ${season}`);
      
      // Transform result to match UI expectations (camelCase)
      const transformedMetrics = result ? {
        athleteCount: result.total_athletes || 0,
        totalRaces: result.total_races || 0,
        totalMiles: result.total_miles || 0,
        resultCount: result.total_results || result.total_races || 0,
        meetCount: result.meet_count || 0,
        avgPace: result.average_pace || 0,
        improvementPercent: result.improvement_percent || 0
      } : null;
      
      return {
        success: true,
        teamId,
        season,
        metrics: transformedMetrics
      };
    } catch (error) {
      logger.error(`Error calculating metrics: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get season-only race results for an athlete
   */
  async getAthleteRacesSeasonOnly(athleteId, season) {
    try {
      logger.debug(`Fetching races for athlete ${athleteId}, season ${season} (type: ${typeof season})`);
      
      const { data: results, error } = await supabase
        .from('results')
        .select(`
          id,
          time,
          race:races(
            id,
            name,
            date,
            distance,
            distance_meters,
            season
          )
        `)
        .eq('athlete_id', athleteId)
        .gt('time', 0);

      if (error) throw error;

      logger.debug(`Found ${results?.length || 0} total results for athlete ${athleteId}`);
      if (results && results.length > 0) {
        const sampleSeasons = [...new Set(results.map(r => r.race?.season).filter(Boolean))];
        logger.debug(`Sample seasons in results: ${sampleSeasons.join(', ')} (types: ${sampleSeasons.map(s => typeof s).join(', ')})`);
      }

      // Filter by season, normalize, and sort by date
      // Convert season to number for comparison since DB stores it as number
      const seasonNum = typeof season === 'string' ? parseInt(season) : season;
      const filtered = (results || [])
        .filter(r => r.race && r.race.season === seasonNum);
      
      logger.debug(`After filtering for season ${season}: ${filtered.length} races`);
      
      return filtered.map(r => ({
          _id: r.id,
          time: r.time,
          distanceMeters: r.race.distance_meters,
          distanceText: r.race.distance,
          meetName: r.race.name,
          date: r.race.date,
          season: r.race.season,
          raceId: r.race.id,
          distance: this.parseDistanceToMiles(r.race.distance_meters, r.race.distance)
        }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (error) {
      logger.error(`Error fetching season-only races for athlete ${athleteId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate metrics for all athletes in a team/season
   */
  async calculateAthleteMetrics(teamId, season) {
    try {
      logger.info(`🔍 Calculating athlete metrics for team ${teamId}, season ${season} (type: ${typeof season})`);

      // Get all athletes for the team
      const { data: athletes, error } = await supabase
        .from('athletes')
        .select('*')
        .eq('team_id', teamId);

      if (error) throw error;
      
      logger.info(`📊 Found ${athletes?.length || 0} athletes for team ${teamId}`);

      // Process athletes in batches
      for (let i = 0; i < athletes.length; i += this.batchSize) {
        const batch = athletes.slice(i, i + this.batchSize);
        await Promise.all(
          batch.map(athlete => this.processAthleteMetrics(athlete, season))
        );
      }

      logger.info(`Completed athlete metrics for ${athletes.length} athletes`);
    } catch (error) {
      logger.error(`Error calculating athlete metrics: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Process metrics for a single athlete
   */
  async processAthleteMetrics(athlete, season) {
    try {
      const races = await this.getAthleteRacesSeasonOnly(athlete.id, season);

      if (races.length === 0) {
        logger.warn(`No races found for athlete ${athlete.name} (${athlete.id}) in season ${season}`);
        return;
      }

      logger.info(`Processing ${races.length} races for athlete ${athlete.name}`);
      races.sort((a, b) => new Date(a.date) - new Date(b.date));

      const metrics = this.calculateAthleteRaceMetrics(races);
      logger.info(`Calculated metrics for ${athlete.name}: best5k=${metrics.best5kTime}, totalRaces=${metrics.totalRaces}`);

      // Normalize gender
      const genderNorm = athlete.gender === 'Men' ? 'M' : (athlete.gender === 'Women' ? 'F' : athlete.gender || '');

      // Upsert athlete season metrics
      const { error } = await supabase
        .from('athlete_season_metrics')
        .upsert({
          athlete_id: athlete.id,
          team_id: athlete.team_id,
          season: season,
          name: athlete.name,
          gender: genderNorm,
          grade: athlete.grade?.toString() || '',
          total_races: metrics.totalRaces || 0,
          total_miles: metrics.totalMiles || 0,
          total_time_seconds: metrics.totalTimeSeconds || 0,
          average_pace: metrics.avgMilePace?.overall || 0,
          best_pace: metrics.bestPace || 0,
          best_time_5k: metrics.best5kTime || 0,
          improvement: metrics.improvementPercent || 0,
          calculated_at: new Date().toISOString()
        }, {
          onConflict: 'athlete_id,team_id,season'
        });

      if (error) {
        logger.error(`Error upserting athlete metrics for ${athlete.name}: ${error.message}`, { error });
      }

    } catch (error) {
      logger.error(`Error processing athlete ${athlete.id}: ${error.message}`, { error });
    }
  }

  /**
   * Calculate metrics from an athlete's races
   */
  calculateAthleteRaceMetrics(races) {
    if (!races || races.length === 0) return {};

    const sortedByTime = [...races].sort((a, b) => a.time - b.time);
    const bestRace = sortedByTime[0];

    const totals = races.reduce((acc, race) => {
      const miles = this.normalizeDistanceMiles(race.distance);
      return {
        races: acc.races + 1,
        miles: acc.miles + miles,
        time: acc.time + (race.time || 0)
      };
    }, { races: 0, miles: 0, time: 0 });

    const firstRace = races[0];
    const lastRace = races[races.length - 1];
    let improvement = this.calculateImprovement(lastRace.time, firstRace.time);
    if (!Number.isFinite(improvement)) improvement = 0;
    improvement = Math.max(-100, Math.min(100, improvement));

    let totalDropped = 0;
    for (let i = 1; i < races.length; i++) {
      if (races[i].time < races[i-1].time) {
        totalDropped += (races[i-1].time - races[i].time);
      }
    }

    // Find best 5K time
    const FIVE_K_MILES = 3.1;
    logger.debug(`Checking ${races.length} races for 5K matches. Sample distances: ${races.slice(0, 3).map(r => `${r.distance} (${r.distanceText})`).join(', ')}`);
    
    const fiveKRaces = races.filter(r => {
      const distance = Number(r.distance);
      const is5K = Math.abs(distance - FIVE_K_MILES) < 0.05;
      
      // Check if distance text contains 5K indicators
      const distanceText = r.distanceText || '';
      const textIs5K = distanceText.includes('5,000') || 
                       distanceText.includes('5000') || 
                       /\b5\s*k\b/i.test(distanceText);
      
      // Check if meet name contains 5K
      const nameHas5k = r.meetName && /\b5\s*k\b/i.test(r.meetName);
      
      const matches = (is5K || textIs5K || nameHas5k) && Number(r.time) > 0;
      if (matches) {
        logger.debug(`5K race found: ${r.meetName}, distance=${r.distance}, distanceText=${r.distanceText}, time=${r.time}`);
      }
      return matches;
    });
    
    logger.info(`Found ${fiveKRaces.length} 5K races out of ${races.length} total races`);
    const best5kTime = fiveKRaces.length > 0
      ? Math.min(...fiveKRaces.map(r => r.time))
      : 0;

    const metrics = {
      totalRaces: totals.races,
      totalMiles: parseFloat(totals.miles.toFixed(2)),
      totalTimeSeconds: totals.time,
      avgMilePace: {
        overall: this.calculatePace(totals.time, totals.miles)
      },
      bestTime: bestRace.time,
      bestTimeMeet: bestRace.meetName,
      bestPace: this.calculatePace(bestRace.time, this.normalizeDistanceMiles(bestRace.distance)),
      best5kTime: best5kTime,
      improvementPercent: improvement,
      totalTimeDropped: parseFloat(totalDropped.toFixed(2)),
      firstMeet: {
        name: firstRace.meetName || '',
        date: firstRace.date || null,
        avgPace: this.calculatePace(firstRace.time, this.normalizeDistanceMiles(firstRace.distance)),
        avgTime: firstRace.time || 0
      },
      lastMeet: {
        name: lastRace.meetName || '',
        date: lastRace.date || null,
        avgPace: this.calculatePace(lastRace.time, this.normalizeDistanceMiles(lastRace.distance)),
        avgTime: lastRace.time || 0
      }
    };

    return metrics;
  }

  /**
   * Calculate metrics for all meets in a team/season
   */
  async calculateMeetMetrics(teamId, season) {
    try {
      logger.info(`🏁 Calculating meet metrics for team ${teamId}, season ${season} (type: ${typeof season})`);

      // Get all races for the team/season
      const { data: races, error: racesError } = await supabase
        .from('races')
        .select('*')
        .eq('team_id', teamId)
        .eq('season', season)
        .order('date', { ascending: true });

      if (racesError) throw racesError;
      
      logger.info(`📊 Found ${races?.length || 0} races for team ${teamId}, season ${season}`);

      let count = 0;
      for (const race of races || []) {
        // Get all results for this race
        const { data: results, error: resultsError } = await supabase
          .from('results')
          .select(`
            *,
            athlete:athletes(id, name, gender, grade)
          `)
          .eq('race_id', race.id)
          .gt('time', 0);

        if (resultsError || !results || results.length === 0) continue;

        const metrics = this.calculateMeetPerformance(results, race);
        
        // Convert metrics to JSON for storage
        const metricsJson = JSON.parse(JSON.stringify(metrics));

        // Upsert meet performance metrics with nested structure
        const { data: meetMetric, error: meetError } = await supabase
          .from('meet_performance_metrics')
          .upsert({
            race_id: race.id,
            team_id: teamId,
            season: season,
            meet_name: race.name,
            meet_date: race.date,
            distance: race.distance_meters || 5000,
            distance_label: race.distance || '5K',
            // Overall metrics
            participant_count: results.length,
            male_participant_count: metrics.byGender?.M?.totalRaces || 0,
            female_participant_count: metrics.byGender?.F?.totalRaces || 0,
            average_time: metrics.overall?.avgTimeSeconds || 0,
            average_pace: metrics.overall?.avgMilePace?.overall || 0,
            best_time: metrics.overall?.bestTime || 0,
            team_score: metrics.overall?.teamBestTime || 0,
            // Gender-specific metrics for charts
            boys_avg_pace: metrics.byGender?.M?.avgMilePace?.overall || null,
            boys_count: metrics.byGender?.M?.totalRaces || 0,
            girls_avg_pace: metrics.byGender?.F?.avgMilePace?.overall || null,
            girls_count: metrics.byGender?.F?.totalRaces || 0,
            // Store full metrics structure as JSONB for detailed breakdowns
            metrics: metricsJson
          }, {
            onConflict: 'race_id,team_id'
          });

        if (meetError) {
          logger.error(`Failed to upsert meet metrics for race ${race.name}: ${meetError.message}`, { meetError });
          continue; // Skip this race but continue with others
        }

        logger.debug(`✅ Saved meet metrics for ${race.name}: avgPace=${metrics.overall?.avgMilePace?.overall?.toFixed(2)}s/mi`);
        count++;
      }

      logger.info(`Completed meet metrics for ${count} meets`);
      return count;

    } catch (error) {
      logger.error(`Error calculating meet metrics: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Calculate performance metrics for a single meet
   * Matches MongoDB calculationService.js logic
   */
  calculateMeetPerformance(results, race) {
    if (!results || results.length === 0) return {};

    // Group results by gender and grade
    const byGender = { M: [], F: [] };
    const byGrade = {};
    
    // Process each result
    results.forEach(result => {
      // Normalize gender (handle 'Men'/'Women' and 'M'/'F')
      if (result.athlete?.gender) {
        const gRaw = result.athlete.gender;
        const g = gRaw === 'Men' ? 'M' : (gRaw === 'Women' ? 'F' : gRaw);
        byGender[g] = byGender[g] || [];
        byGender[g].push(result);
      }
      
      // Group by grade
      if (result.athlete?.grade !== undefined) {
        byGrade[result.athlete.grade] = byGrade[result.athlete.grade] || [];
        byGrade[result.athlete.grade].push(result);
      }
    });
    
    // Calculate overall metrics
    const overallMetrics = this.calculateTeamMetricsFromRaces(results, race);
    
    // Also compute average time (seconds) across all valid results for display
    const validTimes = results.filter(r => r.time && r.time > 0).map(r => r.time);
    const avgTimeSeconds = validTimes.length ? (validTimes.reduce((a,b)=>a+b,0) / validTimes.length) : 0;
    overallMetrics.avgTimeSeconds = parseFloat(avgTimeSeconds.toFixed(2));

    // Compute best single time
    const best = validTimes.length ? Math.min(...validTimes) : 0;
    overallMetrics.bestTime = best;

    // Compute top-7 team time (sum of seven fastest individual times)
    const topSeven = [...results]
      .filter(r => r.time && r.time > 0)
      .sort((a, b) => a.time - b.time)
      .slice(0, 7);
    const topSevenSum = topSeven.reduce((sum, r) => sum + (r.time || 0), 0);
    overallMetrics.teamBestTime = parseFloat(topSevenSum.toFixed(2));
    
    // Calculate metrics by gender
    const genderMetrics = {};
    Object.entries(byGender).forEach(([gender, races]) => {
      if (races.length > 0) {
        const gm = this.calculateTeamMetricsFromRaces(races, race);
        // Gender top-7 (within gender)
        const gTopSeven = [...races]
          .filter(r => r.time && r.time > 0)
          .sort((a, b) => a.time - b.time)
          .slice(0, 7);
        const gTopSevenSum = gTopSeven.reduce((sum, r) => sum + (r.time || 0), 0);
        gm.teamBestTime = parseFloat(gTopSevenSum.toFixed(2));
        genderMetrics[gender] = gm;
      }
    });
    
    // Calculate metrics by grade
    const gradeMetrics = {};
    Object.entries(byGrade).forEach(([grade, races]) => {
      if (races.length > 0) {
        gradeMetrics[grade] = this.calculateTeamMetricsFromRaces(races, race);
      }
    });
    
    logger.info(`Meet ${race.name}: avgTime=${avgTimeSeconds.toFixed(2)}s, avgPace=${overallMetrics.avgMilePace?.overall?.toFixed(2)}s/mi, participants=${results.length}`);
    
    return {
      overall: overallMetrics,
      byGender: genderMetrics,
      byGrade: gradeMetrics
    };
  }

  /**
   * Calculate team metrics from a set of races
   * Helper method matching MongoDB logic
   */
  calculateTeamMetricsFromRaces(races, race) {
    if (!races || races.length === 0) return {};
    
    // Sort by time (best first)
    const sortedRaces = [...races].sort((a, b) => a.time - b.time);
    
    // Get distance for this race
    const distanceMiles = race ? this.parseDistanceToMiles(race.distance_meters, race.distance) : 3.1;
    
    // Calculate totals
    const totals = races.reduce((acc, result) => {
      return {
        count: acc.count + 1,
        miles: acc.miles + distanceMiles,
        time: acc.time + (result.time || 0)
      };
    }, { count: 0, miles: 0, time: 0 });
    
    // Calculate pace using total time over total miles to get seconds per mile
    const overallPace = totals.miles > 0 ? (totals.time / totals.miles) : 0;
    const avgTimeSeconds = totals.count > 0 ? (totals.time / totals.count) : 0;
    
    return {
      totalRaces: totals.count,
      totalMiles: parseFloat(totals.miles.toFixed(2)),
      avgMilePace: {
        overall: parseFloat(overallPace.toFixed(2))
      },
      avgTimeSeconds: parseFloat(avgTimeSeconds.toFixed(2))
    };
  }

  /**
   * Calculate team-level metrics for a season
   * Enhanced with first/last meet tracking and improvement calculations
   */
  async calculateTeamMetrics(teamId, season) {
    try {
      // Get all athlete metrics for this team/season
      const { data: athleteMetrics, error } = await supabase
        .from('athlete_season_metrics')
        .select('*')
        .eq('team_id', teamId)
        .eq('season', season);

      if (error) throw error;

      if (!athleteMetrics || athleteMetrics.length === 0) {
        return null;
      }

      const maleAthletes = athleteMetrics.filter(a => a.gender === 'M');
      const femaleAthletes = athleteMetrics.filter(a => a.gender === 'F');

      const totalRaces = athleteMetrics.reduce((sum, a) => sum + (a.total_races || 0), 0);
      const totalMiles = athleteMetrics.reduce((sum, a) => sum + (parseFloat(a.total_miles) || 0), 0);
      const totalTime = athleteMetrics.reduce((sum, a) => sum + (parseFloat(a.total_time_seconds) || 0), 0);

      const avgPace = totalMiles > 0 ? totalTime / totalMiles : 0;

      // Get meet metrics to calculate improvement
      const { data: meetMetrics } = await supabase
        .from('meet_performance_metrics')
        .select('*')
        .eq('team_id', teamId)
        .eq('season', season)
        .order('meet_date', { ascending: true });

      const firstMeet = meetMetrics?.[0];
      const lastMeet = meetMetrics?.[meetMetrics.length - 1];

      let improvementPercent = 0;
      let firstMeetData = null;
      let lastMeetData = null;

      // Calculate improvement from first to last meet
      if (firstMeet && lastMeet && firstMeet.race_id !== lastMeet.race_id) {
        const firstMeetPace = firstMeet.average_pace || 0;
        const lastMeetPace = lastMeet.average_pace || 0;
        improvementPercent = this.calculateImprovement(lastMeetPace, firstMeetPace);

        firstMeetData = {
          name: firstMeet.meet_name,
          date: firstMeet.meet_date,
          avgPace: firstMeetPace,
          avgTime: firstMeet.average_time || 0
        };

        lastMeetData = {
          name: lastMeet.meet_name,
          date: lastMeet.meet_date,
          avgPace: lastMeetPace,
          avgTime: lastMeet.average_time || 0
        };
      }

      // Calculate enhanced metrics
      logger.info('Calculating enhanced metrics: gender, grade, distance, depth, pack running...');
      const byGender = this.calculateGenderBreakdown(athleteMetrics);
      const byGrade = this.calculateGradeBreakdown(athleteMetrics);
      const byDistance = await this.calculateDistanceBreakdown(teamId, season);
      const teamDepth = await this.calculateTeamDepth(teamId, season);
      const packRunning = await this.calculatePackRunning(teamId, season);
      logger.info('✅ Enhanced metrics calculated');

      const teamMetrics = {
        team_id: teamId,
        season: season,
        total_athletes: athleteMetrics.length,
        total_races: totalRaces,  // Fixed: was meetMetrics.length (number of meets, not total race results)
        total_results: totalRaces,
        total_miles: parseFloat(totalMiles.toFixed(2)),
        average_pace: parseFloat(avgPace.toFixed(2)),
        male_athlete_count: maleAthletes.length,
        female_athlete_count: femaleAthletes.length,
        meet_count: meetMetrics?.length || 0,
        improvement_percent: parseFloat(improvementPercent.toFixed(2)),
        first_meet: firstMeetData,
        last_meet: lastMeetData,
        // Enhanced metrics (JSONB columns)
        by_gender: byGender,
        by_grade: byGrade,
        by_distance: byDistance,
        team_depth: teamDepth,
        pack_running: packRunning,
        calculated_at: new Date().toISOString()
      };

      // Upsert team season metrics
      const { error: teamError } = await supabase
        .from('team_season_metrics')
        .upsert(teamMetrics, {
          onConflict: 'team_id,season'
        });

      if (teamError) {
        logger.error(`Failed to upsert team metrics: ${teamError.message}`, { teamError });
      }

      logger.info(`Team metrics calculated: ${athleteMetrics.length} athletes, ${meetMetrics?.length || 0} meets, ${improvementPercent.toFixed(2)}% improvement`);
      return teamMetrics;

    } catch (error) {
      logger.error(`Error calculating team metrics: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get season series for charts
   */
  async getSeasonSeries(teamId, season) {
    try {
      const { data: meets, error } = await supabase
        .from('meet_performance_metrics')
        .select('*')
        .eq('team_id', teamId)
        .eq('season', season)
        .order('meet_date', { ascending: true });

      if (error) throw error;

      if (!meets || meets.length === 0) {
        return { series: [], trend: { slope: 0, percentChange: 0 } };
      }

      const series = meets.map((m, idx) => {
        const prev = idx > 0 ? meets[idx - 1] : null;
        const currPace = parseFloat(m.average_pace) || 0;
        const prevPace = prev ? (parseFloat(prev.average_pace) || 0) : 0;
        const deltaPct = prevPace > 0 ? ((prevPace - currPace) / prevPace) * 100 : 0;

        return {
          meetId: m.race_id,
          meetName: m.meet_name,
          meetDate: m.meet_date,
          overall: {
            totalRaces: m.participant_count || 0,
            totalMiles: (m.distance || 5000) / 1609.34,
            avgMilePace: {
              overall: currPace,
              first5k: currPace,
              last5k: currPace
            },
            teamBestTime: parseFloat(m.best_time) || 0
          },
          byGender: {
            M: m.boys_avg_pace ? {
              avgMilePace: {
                overall: parseFloat(m.boys_avg_pace) || 0
              },
              totalRaces: m.boys_count || 0,
              totalMiles: 0
            } : null,
            F: m.girls_avg_pace ? {
              avgMilePace: {
                overall: parseFloat(m.girls_avg_pace) || 0
              },
              totalRaces: m.girls_count || 0,
              totalMiles: 0
            } : null
          },
          deltaVsPrevious: parseFloat(deltaPct.toFixed(2))
        };
      });

      // Calculate trend
      const paces = series.map(s => s.overall.avgMilePace.overall).filter(p => p > 0);
      const trend = this.calculateTrend(paces);

      return { series, trend };
    } catch (error) {
      logger.error(`Error getting season series: ${error.message}`);
      return { series: [], trend: { slope: 0, percentChange: 0 } };
    }
  }

  /**
   * Calculate linear trend from array of values
   */
  calculateTrend(values) {
    if (!values || values.length < 2) {
      return { slope: 0, percentChange: 0 };
    }

    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      const dx = i - xMean;
      num += dx * (values[i] - yMean);
      den += dx * dx;
    }

    const slope = den !== 0 ? num / den : 0;
    const percentChange = yMean !== 0 ? (slope / yMean) * 100 : 0;

    return {
      slope: parseFloat(slope.toFixed(4)),
      percentChange: parseFloat(percentChange.toFixed(2))
    };
  }

  // Helper methods
  parseDistanceToMiles(distanceMeters, distanceText) {
    if (distanceMeters && distanceMeters > 0) {
      return distanceMeters / 1609.34;
    }
    if (distanceText) {
      // Handle "5,000 Meters" or "5000 Meters" or "5K"
      if (distanceText.includes('5,000') || distanceText.includes('5000') || 
          distanceText.includes('5k') || distanceText.includes('5K')) {
        return 3.1; // 5K = 3.1 miles
      }
      // Handle "3 Miles" or "3.0 Miles"
      if (distanceText.includes('3') && distanceText.includes('mile')) return 3.0;
      // Extract first number (handles "1 Miles", "1.5 Miles", etc.)
      const match = distanceText.match(/(\d+\.?\d*)/);
      if (match) return parseFloat(match[1]);
    }
    return 3.1; // Default to 5K
  }

  normalizeDistanceMiles(distance) {
    if (typeof distance === 'number') return distance;
    return this.parseDistanceToMiles(null, distance);
  }

  calculatePace(timeSeconds, distanceMiles) {
    if (!distanceMiles || distanceMiles <= 0) return 0;
    return timeSeconds / distanceMiles;
  }

  calculateImprovement(currentTime, previousTime) {
    if (!previousTime || previousTime <= 0) return 0;
    return ((previousTime - currentTime) / previousTime) * 100;
  }

  /**
   * ENHANCED METRICS CALCULATIONS
   */

  /**
   * Calculate gender-specific metrics from athlete data
   */
  calculateGenderBreakdown(athleteMetrics) {
    const maleAthletes = athleteMetrics.filter(a => a.gender === 'M');
    const femaleAthletes = athleteMetrics.filter(a => a.gender === 'F');
    
    return {
      men: this._calculateGroupStats(maleAthletes),
      women: this._calculateGroupStats(femaleAthletes)
    };
  }

  /**
   * Calculate grade-specific metrics
   */
  calculateGradeBreakdown(athleteMetrics) {
    const byGrade = {
      grade9: athleteMetrics.filter(a => a.grade === '9'),
      grade10: athleteMetrics.filter(a => a.grade === '10'),
      grade11: athleteMetrics.filter(a => a.grade === '11'),
      grade12: athleteMetrics.filter(a => a.grade === '12')
    };
    
    return {
      grade9: this._calculateGroupStats(byGrade.grade9),
      grade10: this._calculateGroupStats(byGrade.grade10),
      grade11: this._calculateGroupStats(byGrade.grade11),
      grade12: this._calculateGroupStats(byGrade.grade12)
    };
  }

  /**
   * Calculate distance-specific performance metrics
   */
  async calculateDistanceBreakdown(teamId, season) {
    try {
      // Fetch all results with race info
      const { data: results, error } = await supabase
        .from('results')
        .select(`
          *,
          race:races!inner(distance_meters, team_id, season)
        `)
        .eq('race.team_id', teamId)
        .eq('race.season', season)
        .gt('time', 0);

      if (error) throw error;

      // Group by distance ranges
      const oneMile = this._filterAndCalculateDistance(results, 1500, 1700);      // ~1 mile (1609m)
      const onePointFiveMile = this._filterAndCalculateDistance(results, 2300, 2600); // ~1.5 miles (2414m)
      const threeMile = this._filterAndCalculateDistance(results, 4700, 4900);    // ~3 miles (4828m)
      const fiveK = this._filterAndCalculateDistance(results, 4900, 5100);         // ~5K (5000m)

      return {
        oneMile,
        onePointFiveMile,
        threeMile,
        fiveK
      };
    } catch (error) {
      logger.error(`Error calculating distance breakdown: ${error.message}`);
      return {
        oneMile: this._emptyDistanceStats(),
        onePointFiveMile: this._emptyDistanceStats(),
        threeMile: this._emptyDistanceStats(),
        fiveK: this._emptyDistanceStats()
      };
    }
  }

  /**
   * Calculate team depth metrics (top 5/7 spread)
   */
  async calculateTeamDepth(teamId, season) {
    try {
      const { data: races } = await supabase
        .from('races')
        .select('id, name')
        .eq('team_id', teamId)
        .eq('season', season);

      if (!races || races.length === 0) {
        return { top5Spread: 0, top7Spread: 0, depthScore: 0, varsityAvgTime: 0, jvAvgTime: 0 };
      }

      let totalTop5Spread = 0;
      let totalTop7Spread = 0;
      let totalVarsityTime = 0;
      let totalJVTime = 0;
      let meetCount = 0;
      let varsityCount = 0;
      let jvCount = 0;

      for (const race of races) {
        const { data: results } = await supabase
          .from('results')
          .select('time')
          .eq('race_id', race.id)
          .gt('time', 0)
          .order('time', { ascending: true });

        if (results && results.length >= 5) {
          const top5Spread = results[4].time - results[0].time;
          totalTop5Spread += top5Spread;

          // Calculate varsity avg (top 7)
          const varsityResults = results.slice(0, 7);
          const varsityAvg = varsityResults.reduce((sum, r) => sum + r.time, 0) / varsityResults.length;
          totalVarsityTime += varsityAvg;
          varsityCount++;

          if (results.length >= 7) {
            const top7Spread = results[6].time - results[0].time;
            totalTop7Spread += top7Spread;

            // Calculate JV avg (8+)
            if (results.length > 7) {
              const jvResults = results.slice(7);
              const jvAvg = jvResults.reduce((sum, r) => sum + r.time, 0) / jvResults.length;
              totalJVTime += jvAvg;
              jvCount++;
            }
          }

          meetCount++;
        }
      }

      return {
        top5Spread: meetCount > 0 ? parseFloat((totalTop5Spread / meetCount).toFixed(2)) : 0,
        top7Spread: meetCount > 0 ? parseFloat((totalTop7Spread / meetCount).toFixed(2)) : 0,
        depthScore: meetCount > 0 ? parseFloat(((totalTop7Spread / meetCount) / 7).toFixed(2)) : 0,
        varsityAvgTime: varsityCount > 0 ? parseFloat((totalVarsityTime / varsityCount).toFixed(2)) : 0,
        jvAvgTime: jvCount > 0 ? parseFloat((totalJVTime / jvCount).toFixed(2)) : 0
      };
    } catch (error) {
      logger.error(`Error calculating team depth: ${error.message}`);
      return { top5Spread: 0, top7Spread: 0, depthScore: 0, varsityAvgTime: 0, jvAvgTime: 0 };
    }
  }

  /**
   * Calculate pack running metrics (gaps between runners)
   */
  async calculatePackRunning(teamId, season) {
    try {
      const { data: races } = await supabase
        .from('races')
        .select('id')
        .eq('team_id', teamId)
        .eq('season', season);

      if (!races || races.length === 0) {
        return { avgGapBetweenRunners: 0, packTightness: 0, packConsistency: 0 };
      }

      let totalGap = 0;
      let gapCount = 0;
      const meetGaps = [];

      for (const race of races) {
        const { data: results } = await supabase
          .from('results')
          .select('time')
          .eq('race_id', race.id)
          .gt('time', 0)
          .order('time', { ascending: true });

        if (results && results.length >= 2) {
          let meetGapSum = 0;
          let meetGapCount = 0;

          // Calculate gaps between consecutive runners
          for (let i = 1; i < results.length; i++) {
            const gap = results[i].time - results[i-1].time;
            totalGap += gap;
            meetGapSum += gap;
            gapCount++;
            meetGapCount++;
          }

          if (meetGapCount > 0) {
            meetGaps.push(meetGapSum / meetGapCount);
          }
        }
      }

      const avgGap = gapCount > 0 ? totalGap / gapCount : 0;
      
      // Calculate consistency (lower variance = more consistent)
      let consistency = 0;
      if (meetGaps.length > 1) {
        const mean = meetGaps.reduce((a, b) => a + b, 0) / meetGaps.length;
        const variance = meetGaps.reduce((sum, gap) => sum + Math.pow(gap - mean, 2), 0) / meetGaps.length;
        const stdDev = Math.sqrt(variance);
        consistency = mean > 0 ? 1 - Math.min(stdDev / mean, 1) : 0;
      }

      return {
        avgGapBetweenRunners: parseFloat(avgGap.toFixed(2)),
        packTightness: avgGap > 0 ? parseFloat((1 / (1 + avgGap / 10)).toFixed(3)) : 0,
        packConsistency: parseFloat(consistency.toFixed(3))
      };
    } catch (error) {
      logger.error(`Error calculating pack running: ${error.message}`);
      return { avgGapBetweenRunners: 0, packTightness: 0, packConsistency: 0 };
    }
  }

  /**
   * Helper: Calculate aggregate stats for a group of athletes
   */
  _calculateGroupStats(athletes) {
    if (!athletes || athletes.length === 0) {
      return { count: 0, avgPace: 0, bestTime: 0, avgTime: 0, totalRaces: 0 };
    }
    
    const totalRaces = athletes.reduce((sum, a) => sum + (a.total_races || 0), 0);
    const totalTime = athletes.reduce((sum, a) => sum + (a.total_time_seconds || 0), 0);
    const totalMiles = athletes.reduce((sum, a) => sum + (a.total_miles || 0), 0);
    const bestTimes = athletes.map(a => a.best_time_5k).filter(t => t > 0);
    
    return {
      count: athletes.length,
      avgPace: totalMiles > 0 ? parseFloat((totalTime / totalMiles).toFixed(2)) : 0,
      bestTime: bestTimes.length > 0 ? parseFloat(Math.min(...bestTimes).toFixed(2)) : 0,
      avgTime: totalRaces > 0 ? parseFloat((totalTime / totalRaces).toFixed(2)) : 0,
      totalRaces: totalRaces
    };
  }

  /**
   * Helper: Filter results by distance range and calculate stats
   */
  _filterAndCalculateDistance(results, minMeters, maxMeters) {
    const filtered = results.filter(r => {
      const distance = r.race?.distance_meters || 0;
      return distance >= minMeters && distance <= maxMeters;
    });

    if (filtered.length === 0) {
      return this._emptyDistanceStats();
    }

    const times = filtered.map(r => r.time);
    const uniqueAthletes = new Set(filtered.map(r => r.athlete_id)).size;
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const bestTime = Math.min(...times);
    
    // Calculate pace (assuming distance is in meters)
    const avgDistance = filtered.reduce((sum, r) => sum + (r.race?.distance_meters || 0), 0) / filtered.length;
    const distanceMiles = avgDistance / 1609.34;
    const avgPace = distanceMiles > 0 ? avgTime / distanceMiles : 0;

    return {
      athleteCount: uniqueAthletes,
      raceCount: filtered.length,
      avgTime: parseFloat(avgTime.toFixed(2)),
      bestTime: parseFloat(bestTime.toFixed(2)),
      avgPace: parseFloat(avgPace.toFixed(2))
    };
  }

  /**
   * Helper: Return empty distance stats
   */
  _emptyDistanceStats() {
    return {
      athleteCount: 0,
      raceCount: 0,
      avgTime: 0,
      bestTime: 0,
      avgPace: 0
    };
  }
}

module.exports = new CalculationServiceSupabase();
