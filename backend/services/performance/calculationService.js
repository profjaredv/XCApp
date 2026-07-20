const TeamSeasonMetrics = require('../../models/performance/teamSeasonMetrics');
const AthleteSeasonMetrics = require('../../models/performance/athleteSeasonMetrics');
const MeetPerformanceMetrics = require('../../models/performance/meetPerformanceMetrics');
const mongoose = require('mongoose');
const Athlete = require('../../models/Athlete');
const Race = require('../../models/Race');
const Result = require('../../models/Result');
const logger = require('../../utils/logger');
const cache = require('./cache');

class CalculationService {
  constructor() {
    this.batchSize = 100; // Number of documents to process in a batch
  }

  /**
   * Calculate and update all performance metrics for a team and season
   * @param {string} teamId - Team ID
   * @param {number} season - Season year
   */
  async calculateAllMetrics(teamId, season, skipCache = false) {
    try {
      logger.info(`Starting metrics calculation for team ${teamId}, season ${season}`);
      
      // Invalidate cache if we're not skipping it
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
      return { 
        success: true,
        teamId,
        season,
        metrics: result
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
      const results = await Result.aggregate([
        {
          $match: {
            athlete: new mongoose.Types.ObjectId(athleteId),
            time: { $gt: 0 }
          }
        },
        {
          $lookup: {
            from: 'races',
            localField: 'race',
            foreignField: '_id',
            as: 'race'
          }
        },
        { $unwind: '$race' },
        {
          $match: {
            'race.season': season.toString()
          }
        },
        {
          $project: {
            _id: 1,
            time: 1,
            distanceMeters: '$race.distanceMeters',
            distanceText: '$race.distance',
            meetName: '$race.name',
            date: '$race.date',
            season: '$race.season',
            raceId: '$race._id'
          }
        },
        { $sort: { date: 1 } }
      ]);

      // Normalize distances to miles for downstream calculations
      return results.map(r => ({
        ...r,
        distance: this.parseDistanceToMiles(r.distanceMeters, r.distanceText)
      }));
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
      logger.info(`Calculating athlete metrics for team ${teamId}, season ${season}`);
      
      // Get all athletes for the team/season
      const athletes = await this.getAthletes(teamId, season);
      
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
      // Get SEASON-ONLY races for the athlete (exclude historical from other seasons)
      const races = await this.getAthleteRacesSeasonOnly(athlete._id, season);
      
      if (races.length === 0) return;
      
      // Sort races by date
      races.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Calculate metrics
      const metrics = this.calculateAthleteRaceMetrics(races);
      // Attach a rich races array for UI consumption and team-level dedupe
      // Shape: { id, date, meetName, distance, time }
      try {
        metrics.races = (races || []).map(r => ({
          id: r._id?.toString?.() || r._id || r.raceId || '',
          date: r.date,
          meetName: r.meetName,
          distance: this.normalizeDistanceMiles(r.distance), // miles
          time: r.time,
        }));
      } catch (e) {
        // Safe-guard: if mapping fails, skip attaching
      }
      
      // Normalize gender to 'M'/'F'
      const genderNorm = athlete.gender === 'Men' ? 'M' : (athlete.gender === 'Women' ? 'F' : athlete.gender);

      // Update or create athlete metrics
      await AthleteSeasonMetrics.findOneAndUpdate(
        { athleteId: athlete._id, season },
        {
          $set: {
            name: athlete.name,
            teamId: athlete.team,
            grade: athlete.grade,
            gender: genderNorm,
            metrics,
            raceByRaceImprovement: this.calculateRaceByRaceImprovement(races),
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true, runValidators: true }
      );
      
    } catch (error) {
      logger.error(`Error processing athlete ${athlete._id}: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Calculate metrics from an athlete's races
   */
  calculateAthleteRaceMetrics(races) {
    if (!races || races.length === 0) return {};
    
    // Sort by time (best first)
    const sortedByTime = [...races].sort((a, b) => a.time - b.time);
    const bestRace = sortedByTime[0];
    
    // Calculate total miles and times
    const totals = races.reduce((acc, race) => {
      const miles = this.normalizeDistanceMiles(race.distance);
      return {
        races: acc.races + 1,
        miles: acc.miles + miles,
        time: acc.time + (race.time || 0)
      };
    }, { races: 0, miles: 0, time: 0 });
    
    // Calculate improvement from first to last race (guard and clamp)
    const firstRace = races[0];
    const lastRace = races[races.length - 1];
    let improvement = this.calculateImprovement(lastRace.time, firstRace.time);
    if (!Number.isFinite(improvement)) improvement = 0;
    // Clamp extreme values to [-100, 100]
    improvement = Math.max(-100, Math.min(100, improvement));
    
    // Calculate total time dropped (sum of improvements between consecutive races)
    let totalDropped = 0;
    for (let i = 1; i < races.length; i++) {
      if (races[i].time < races[i-1].time) {
        totalDropped += (races[i-1].time - races[i].time);
      }
    }
    
    const metrics = {
      totalRaces: totals.races,
      totalMiles: parseFloat(totals.miles.toFixed(2)),
      avgMilePace: {
        overall: this.calculatePace(totals.time, totals.miles)
      },
      bestTime: bestRace.time,
      bestTimeMeet: bestRace.meetName,
      improvementPercent: improvement,
      totalTimeDropped: parseFloat(totalDropped.toFixed(2))
    };
    // Add first/last meet summary for the athlete season
    metrics.firstMeet = {
      name: firstRace.meetName || '',
      date: firstRace.date || null,
      avgPace: this.calculatePace(firstRace.time, this.normalizeDistanceMiles(firstRace.distance)),
      avgTime: firstRace.time || 0
    };
    metrics.lastMeet = {
      name: lastRace.meetName || '',
      date: lastRace.date || null,
      avgPace: this.calculatePace(lastRace.time, this.normalizeDistanceMiles(lastRace.distance)),
      avgTime: lastRace.time || 0
    };
    return metrics;
  }
  
  /**
   * Calculate race-by-race improvement data
   */
  calculateRaceByRaceImprovement(races) {
    if (!races || races.length < 2) return [];
    
    return races.map((race, index) => ({
      raceId: race._id,
      raceName: race.meetName,
      raceDate: race.date,
      time: race.time,
      pace: race.pace || this.calculatePace(race.time, this.normalizeDistanceMiles(race.distance)),
      improvementFromPrevious: index > 0 ? 
        this.calculateImprovement(race.time, races[index - 1].time) : 0
    }));
  }

  /**
   * Calculate metrics for all meets in a team/season
   */
  async calculateMeetMetrics(teamId, season) {
    try {
      logger.info(`Calculating meet metrics for team ${teamId}, season ${season}`);
      
      // Get all meets for the team/season
      const meets = await this.getTeamMeets(teamId, season);
      
      // Process meets in order of date
      const sortedMeets = [...meets].sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Store previous meet for trend calculations
      let previousMeetMetrics = null;
      
      for (const meet of sortedMeets) {
        // Get all race results for this meet
        const meetResults = await this.getMeetResults(meet._id, teamId);
        
        if (meetResults.length === 0) continue;
        
        // Calculate metrics for this meet
        const metrics = this.calculateMeetPerformance(meetResults);
        
        // Calculate trends if we have previous meet data
        const trends = previousMeetMetrics ? 
          this.calculateMeetTrends(metrics, previousMeetMetrics) : 
          { vsPreviousMeet: {}, seasonTrend: {} };
        
        // Save the metrics
        await MeetPerformanceMetrics.findOneAndUpdate(
          { meetId: meet._id, teamId, season },
          {
            $set: {
              meetName: meet.name,
              meetDate: meet.date,
              metrics,
              trends,
              updatedAt: new Date()
            }
          },
          { upsert: true, new: true }
        );
        
        previousMeetMetrics = metrics;
      }
      
      logger.info(`Completed meet metrics for ${sortedMeets.length} meets`);
      return sortedMeets.length;
      
    } catch (error) {
      logger.error(`Error calculating meet metrics: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Calculate performance metrics for a single meet
   */
  calculateMeetPerformance(meetResults) {
    if (!meetResults || meetResults.length === 0) return {};
    
    // Group results by gender and grade
    const byGender = { M: [], F: [] };
    const byGrade = {};
    
    // Process each result
    meetResults.forEach(result => {
      // Group by gender (normalize 'Men'/'Women' to 'M'/'F')
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
    const overallMetrics = this.calculateTeamMetricsFromRaces(meetResults);
    // Also compute average time (seconds) across all valid results for display
    const validTimes = meetResults.filter(r => r.time && r.time > 0).map(r => r.time);
    const avgTimeSeconds = validTimes.length ? (validTimes.reduce((a,b)=>a+b,0) / validTimes.length) : 0;
    overallMetrics.avgTimeSeconds = parseFloat(avgTimeSeconds.toFixed(2));

    // Compute best single time and meet ref (use current meet name from results)
    const best = validTimes.length ? Math.min(...validTimes) : 0;
    overallMetrics.bestTime = best;
    overallMetrics.bestTimeMeet = meetResults[0]?.meetName || '';

    // Compute top-7 team time (sum of seven fastest individual times)
    const topSeven = [...meetResults]
      .filter(r => r.time && r.time > 0)
      .sort((a, b) => a.time - b.time)
      .slice(0, 7);
    const topSevenSum = topSeven.reduce((sum, r) => sum + (r.time || 0), 0);
    overallMetrics.teamBestTime = parseFloat(topSevenSum.toFixed(2));
    
    // Calculate metrics by gender
    const genderMetrics = {};
    Object.entries(byGender).forEach(([gender, races]) => {
      if (races.length > 0) {
        const gm = this.calculateTeamMetricsFromRaces(races);
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
        gradeMetrics[grade] = this.calculateTeamMetricsFromRaces(races);
      }
    });
    
    return {
      overall: overallMetrics,
      byGender: genderMetrics,
      byGrade: gradeMetrics
    };
  }
  
  /**
   * Build meet-by-meet season series for charts
   */
  async getSeasonSeries(teamId, season) {
    try {
      const meets = await MeetPerformanceMetrics.find({ teamId, season })
        .sort({ meetDate: 1 })
        .lean();
      
      if (!meets || meets.length === 0) {
        return { series: [], trend: { slope: 0, percentChange: 0 } };
      }
      
      const series = meets.map((m, idx) => {
        const overall = m.metrics?.overall || {};
        const byGender = m.metrics?.byGender || {};
        const prev = idx > 0 ? meets[idx - 1] : null;
        const currPace = overall?.avgMilePace?.overall || 0;
        const prevPace = prev?.metrics?.overall?.avgMilePace?.overall || 0;
        const deltaPct = prevPace > 0 ? ((prevPace - currPace) / prevPace) * 100 : 0;
        
        return {
          meetId: m.meetId?.toString?.() || null,
          meetName: m.meetName,
          meetDate: m.meetDate,
          overall: {
            totalRaces: overall.totalRaces || 0,
            totalMiles: overall.totalMiles || 0,
            avgMilePace: {
              overall: overall.avgMilePace?.overall || 0,
              first5k: overall.avgMilePace?.first5k || 0,
              last5k: overall.avgMilePace?.last5k || 0,
            },
            teamBestTime: overall.teamBestTime || 0,
          },
          byGender: {
            M: byGender.M || null,
            F: byGender.F || null,
          },
          deltaVsPrevious: parseFloat(deltaPct.toFixed(2)),
        };
      });
      
      const y = series.map(s => s.overall.avgMilePace?.overall || 0);
      const n = y.length;
      const xMean = (n - 1) / 2;
      const yMean = y.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        const dx = i - xMean;
        num += dx * (y[i] - yMean);
        den += dx * dx;
      }
      const slope = den > 0 ? num / den : 0;
      const first = y[0] || 0;
      const last = y[n - 1] || 0;
      const percentChange = first > 0 ? ((first - last) / first) * 100 : 0;
      
      return {
        series,
        trend: {
          slope: parseFloat(slope.toFixed(4)),
          percentChange: parseFloat(percentChange.toFixed(2)),
        },
      };
    } catch (error) {
      logger.error(`Error creating season series for team ${teamId}, season ${season}: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Calculate team metrics from a set of races
   */
  calculateTeamMetricsFromRaces(races) {
    if (!races || races.length === 0) return {};
    
    // Sort by time (best first)
    const sortedRaces = [...races].sort((a, b) => a.time - b.time);
    
    // Calculate totals
    const totals = races.reduce((acc, race) => {
      const miles = this.normalizeDistanceMiles(race.distance);
      return {
        count: acc.count + 1,
        miles: acc.miles + miles,
        time: acc.time + (race.time || 0),
        first5kTime: acc.first5kTime + (race.first5kTime || 0),
        last5kTime: acc.last5kTime + (race.last5kTime || 0)
      };
    }, { count: 0, miles: 0, time: 0, first5kTime: 0, last5kTime: 0 });
    
    // Calculate pace using total time over total miles to get seconds per mile
    const overallPace = totals.miles > 0 ? (totals.time / totals.miles) : 0;
    const first5kPace = this.calculatePace(totals.first5kTime, 3.1); // 5k = 3.1 miles
    const last5kPace = this.calculatePace(totals.last5kTime, 3.1);
    const avgTimeSeconds = totals.count > 0 ? (totals.time / totals.count) : 0; // average race time per athlete
    
    return {
      totalRaces: totals.count,
      totalMiles: parseFloat(totals.miles.toFixed(2)),
      avgMilePace: {
        overall: overallPace,
        first5k: first5kPace,
        last5k: last5kPace
      },
      avgTimeSeconds,
      // Add more metrics as needed
    };
  }
  
  /**
   * Calculate trends between two sets of meet metrics
   */
  calculateMeetTrends(currentMetrics, previousMetrics) {
    if (!currentMetrics || !previousMetrics) return {};
    
    // Calculate pace change vs previous meet
    const currentPace = currentMetrics.overall?.avgMilePace?.overall || 0;
    const previousPace = previousMetrics.overall?.avgMilePace?.overall || 0;
    const paceChange = previousPace > 0 ? ((previousPace - currentPace) / previousPace) * 100 : 0;
    
    // Calculate time change vs previous meet
    const currentTime = currentMetrics.overall?.avgMilePace?.overall || 0;
    const previousTime = previousMetrics.overall?.avgMilePace?.overall || 0;
    const timeChange = previousTime > 0 ? ((previousTime - currentTime) / previousTime) * 100 : 0;
    
    return {
      vsPreviousMeet: {
        paceChange: parseFloat(paceChange.toFixed(2)),
        timeChange: parseFloat(timeChange.toFixed(2))
      },
      // Season trend would be calculated based on all previous meets
      seasonTrend: {
        paceTrend: 0, // Would be calculated from all meets
        timeTrend: 0  // Would be calculated from all meets
      }
    };
  }

  /**
   * Calculate overall team metrics for a season
   */
  async calculateTeamMetrics(teamId, season, useCache = true) {
    const cacheKey = `team:${teamId}:${season}`;
    
    // Use in-memory cache to prevent repeated calculations
    if (!this._memoryCache) {
      this._memoryCache = new Map();
    }
    
    // Check memory cache first (with 5-minute TTL)
    const memoryCacheKey = `team:${teamId}:${season}`;
    const memoryCached = this._memoryCache.get(memoryCacheKey);
    if (memoryCached && (Date.now() - memoryCached.timestamp < 300000)) { // 5 minutes TTL
      logger.info(`Using memory-cached team metrics for team ${teamId}, season ${season}`);
      return memoryCached.data;
    }
    
    // Try to get from Redis cache if enabled
    if (useCache) {
      const cachedMetrics = await cache.getTeamMetrics(teamId, season);
      if (cachedMetrics) {
        logger.info(`Using cached team metrics for team ${teamId}, season ${season}`);
        // Update memory cache
        this._memoryCache.set(memoryCacheKey, {
          data: cachedMetrics,
          timestamp: Date.now()
        });
        return cachedMetrics;
      }
    }
    
    try {
      logger.info(`Calculating team metrics for team ${teamId}, season ${season}`);
      
      // Get all athlete metrics for this team/season
      const athleteMetrics = await AthleteSeasonMetrics.find({ teamId, season });
      
      // Get all meet metrics for this team/season
      const meetMetrics = await MeetPerformanceMetrics.find({ teamId, season })
        .sort({ meetDate: 1 });
      
      if (athleteMetrics.length === 0 && meetMetrics.length === 0) {
        logger.warn(`No data found for team ${teamId}, season ${season}`);
        
        // Store empty result in memory cache to prevent repeated calculations
        const emptyResult = { teamId, season, metrics: {}, noData: true };
        this._memoryCache.set(memoryCacheKey, {
          data: emptyResult,
          timestamp: Date.now()
        });
        
        return emptyResult;
      }
      
      // Calculate overall team metrics
      const teamMetrics = this.calculateOverallTeamMetrics(athleteMetrics);
      
      // Get first and last meet for comparison
      const firstMeet = meetMetrics[0];
      const lastMeet = meetMetrics[meetMetrics.length - 1];
      
      // Calculate improvement from first to last meet if available
      if (firstMeet && lastMeet && firstMeet._id !== lastMeet._id) {
        const firstMeetPace = firstMeet.metrics.overall.avgMilePace.overall;
        const lastMeetPace = lastMeet.metrics.overall.avgMilePace.overall;
        teamMetrics.improvementPercent = this.calculateImprovement(lastMeetPace, firstMeetPace);
        
        // Expose season-start and season-end paces in avgMilePace as growth markers
        teamMetrics.avgMilePace = teamMetrics.avgMilePace || {};
        teamMetrics.avgMilePace.first5k = firstMeetPace;
        teamMetrics.avgMilePace.last5k = lastMeetPace;

        // Store first and last meet data
        teamMetrics.firstMeet = {
          name: firstMeet.meetName,
          date: firstMeet.meetDate,
          avgPace: firstMeetPace,
          avgTime: firstMeet.metrics.overall.avgTimeSeconds || 0
        };
        
        teamMetrics.lastMeet = {
          name: lastMeet.meetName,
          date: lastMeet.meetDate,
          avgPace: lastMeetPace,
          avgTime: lastMeet.metrics.overall.avgTimeSeconds || 0
        };
      }
      
      // Include season meet count for UI display (distinct meets in season)
      teamMetrics.totalMeets = meetMetrics.length;

      // Save the team metrics to database
      const updatedTeamMetrics = await TeamSeasonMetrics.findOneAndUpdate(
        { teamId, season },
        {
          $set: {
            teamId,
            season,
            metrics: teamMetrics,
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
      
      // Cache the result
      if (cache.cacheEnabled) {
        await cache.setTeamMetrics(teamId, season, updatedTeamMetrics);
      }
      
      // Always update memory cache
      this._memoryCache.set(memoryCacheKey, {
        data: updatedTeamMetrics,
        timestamp: Date.now()
      });
      
      logger.info(`Completed team metrics for team ${teamId}, season ${season}`);
      return updatedTeamMetrics;
      
    } catch (error) {
      logger.error(`Error calculating team metrics: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Calculate overall team metrics from athlete metrics
   */
  calculateOverallTeamMetrics(athleteMetrics) {
    if (!athleteMetrics || athleteMetrics.length === 0) return {};
    
    // Group by gender
    const byGender = { M: [], F: [] };
    const byGrade = {};
    
    athleteMetrics.forEach(athlete => {
      // Group by gender
      if (athlete.gender) {
        byGender[athlete.gender] = byGender[athlete.gender] || [];
        byGender[athlete.gender].push(athlete);
      }
      
      // Group by grade
      if (athlete.grade !== undefined) {
        byGrade[athlete.grade] = byGrade[athlete.grade] || [];
        byGrade[athlete.grade].push(athlete);
      }
    });
    
    // Calculate overall metrics
    const overallMetrics = this.calculateTeamMetricsFromAthletes(athleteMetrics);
    
    // Calculate metrics by gender
    const genderMetrics = {};
    Object.entries(byGender).forEach(([gender, athletes]) => {
      if (athletes.length > 0) {
        genderMetrics[gender] = this.calculateTeamMetricsFromAthletes(athletes);
      }
    });
    
    // Calculate metrics by grade
    const gradeMetrics = {};
    Object.entries(byGrade).forEach(([grade, athletes]) => {
      if (athletes.length > 0) {
        gradeMetrics[grade] = this.calculateTeamMetricsFromAthletes(athletes);
      }
    });
    
    return {
      ...overallMetrics,
      byGender: genderMetrics,
      byGrade: gradeMetrics
    };
  }
  
  /**
   * Calculate team metrics from a set of athlete metrics
   */
  calculateTeamMetricsFromAthletes(athletes) {
    if (!athletes || athletes.length === 0) return {};
    
    // Get all unique races across all athletes to count actual race count
    const uniqueRaceIds = new Set();
    let actualTotalRaces = 0;
    let actualTotalMiles = 0;
    
    // Calculate totals (and total time via weighted sum)
    const totals = athletes.reduce((acc, athlete) => {
      const metrics = athlete.metrics || {};
      const miles = Number(metrics.totalMiles) || 0;
      const pace = Number(metrics.avgMilePace?.overall) || 0; // sec/mi
      const time = miles * pace; // seconds
      
      // Count actual races and miles if we have race data
      if (metrics.races && Array.isArray(metrics.races)) {
        metrics.races.forEach(race => {
          if (race.id && !uniqueRaceIds.has(race.id)) {
            uniqueRaceIds.add(race.id);
            actualTotalRaces++;
            actualTotalMiles += this.normalizeDistanceMiles(race.distance || '5K');
          }
        });
      }
      
      return {
        totalRaces: acc.totalRaces + (metrics.totalRaces || 0),
        totalMiles: acc.totalMiles + miles,
        totalTimeDropped: acc.totalTimeDropped + (metrics.totalTimeDropped || 0),
        totalTimeSeconds: acc.totalTimeSeconds + time,
        count: acc.count + 1
      };
    }, { totalRaces: 0, totalMiles: 0, totalTimeDropped: 0, totalTimeSeconds: 0, count: 0 });
    
    // Weighted team pace = total time / total miles
    const weightedPace = totals.totalMiles > 0 ? (totals.totalTimeSeconds / totals.totalMiles) : 0;
    
    // Find best times
    const bestTimes = athletes
      .filter(a => a.metrics?.bestTime)
      .sort((a, b) => (a.metrics.bestTime || Infinity) - (b.metrics.bestTime || Infinity))
      .slice(0, 7); // Top 7 runners
    
    const teamBestTime = bestTimes.length > 0 ? 
      bestTimes.reduce((sum, a) => sum + (a.metrics?.bestTime || 0), 0) : 0;
    
    // Use actual race and mile counts if available, otherwise fall back to aggregated totals
    const finalTotalRaces = actualTotalRaces > 0 ? actualTotalRaces : totals.totalRaces;
    const finalTotalMiles = actualTotalMiles > 0 ? parseFloat(actualTotalMiles.toFixed(2)) : parseFloat(totals.totalMiles.toFixed(2));
    
    return {
      totalRaces: finalTotalRaces,
      totalMiles: finalTotalMiles,
      totalTimeDropped: parseFloat(totals.totalTimeDropped.toFixed(2)),
      avgMilePace: {
        overall: parseFloat(weightedPace.toFixed(2))
      },
      teamBestTime: parseFloat(teamBestTime.toFixed(2)),
      athleteCount: totals.count,
      // Add more metrics as needed
    };
  }

  /**
   * Helper: Calculate pace in seconds per mile
   */
  // ======================
  // Data Access Methods
  // ======================

  /**
   * Get all athletes for a team/season
   */
  async getAthletes(teamId, season) {
    try {
      // Derive athlete list from results joined to races filtered by season
      const rows = await Result.aggregate([
        {
          $match: {
            team: new mongoose.Types.ObjectId(teamId),
          }
        },
        {
          $lookup: {
            from: 'races',
            localField: 'race',
            foreignField: '_id',
            as: 'race'
          }
        },
        { $unwind: '$race' },
        {
          $match: {
            'race.season': season.toString()
          }
        },
        {
          $group: { _id: '$athlete' }
        }
      ]);

      const athleteIds = rows.map(r => r._id);
      if (athleteIds.length === 0) return [];

      return await Athlete.find({ _id: { $in: athleteIds }, team: teamId }).lean();
    } catch (error) {
      logger.error(`Error fetching athletes for team ${teamId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all race results for an athlete in a season
   */
  async getAthleteRaces(athleteId, season) {
    try {
      // Results do not store season directly; join to Race to filter by season
      const results = await Result.aggregate([
        {
          $match: {
            athlete: new mongoose.Types.ObjectId(athleteId),
            time: { $gt: 0 }
          }
        },
        {
          $lookup: {
            from: 'races',
            localField: 'race',
            foreignField: '_id',
            as: 'race'
          }
        },
        { $unwind: '$race' },
        {
          $match: {
            'race.season': season.toString()
          }
        },
        {
          $project: {
            _id: 1,
            time: 1,
            distanceMeters: '$race.distanceMeters',
            distanceText: '$race.distance',
            meetName: '$race.name',
            date: '$race.date',
            season: '$race.season'
          }
        },
        { $sort: { date: 1 } }
      ]);
      
      // Also fetch historical results from previous seasons
      const historicalResults = await Result.aggregate([
        {
          $match: {
            athlete: new mongoose.Types.ObjectId(athleteId),
            time: { $gt: 0 }
          }
        },
        {
          $lookup: {
            from: 'races',
            localField: 'race',
            foreignField: '_id',
            as: 'race'
          }
        },
        { $unwind: '$race' },
        {
          $match: {
            'race.season': { $ne: season.toString() } // Get results from other seasons
          }
        },
        {
          $project: {
            _id: 1,
            time: 1,
            distanceMeters: '$race.distanceMeters',
            distanceText: '$race.distance',
            meetName: '$race.name',
            date: '$race.date',
            season: '$race.season'
          }
        },
        { $sort: { date: 1 } }
      ]);
      
      // Combine current season and historical results
      const allResults = [...results, ...historicalResults];
      
      // Post-process distance to miles
      return allResults.map(r => ({
        ...r,
        distance: this.parseDistanceToMiles(r.distanceMeters, r.distanceText)
      }));
    } catch (error) {
      logger.error(`Error fetching races for athlete ${athleteId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all meets for a team/season
   */
  async getTeamMeets(teamId, season) {
    try {
      return await Race.find({
        team: new mongoose.Types.ObjectId(teamId),
        season: season.toString()
      })
        .sort('date')
        .select('name date season')
        .lean();
    } catch (error) {
      logger.error(`Error fetching meets for team ${teamId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all race results for a meet
   */
  async getMeetResults(meetId, teamId) {
    try {
      const results = await Result.aggregate([
        {
          $match: {
            race: new mongoose.Types.ObjectId(meetId),
            team: new mongoose.Types.ObjectId(teamId),
            time: { $gt: 0 }
          }
        },
        {
          $lookup: {
            from: 'races',
            localField: 'race',
            foreignField: '_id',
            as: 'race'
          }
        },
        { $unwind: '$race' },
        {
          $lookup: {
            from: 'athletes',
            localField: 'athlete',
            foreignField: '_id',
            as: 'athlete'
          }
        },
        { $unwind: '$athlete' },
        {
          $project: {
            'athlete._id': 1,
            'athlete.name': 1,
            'athlete.gender': 1,
            'athlete.grade': 1,
            time: 1,
            place: 1,
            distanceMeters: '$race.distanceMeters',
            distanceText: '$race.distance',
            date: '$race.date',
            meetName: '$race.name'
          }
        },
        { $sort: { date: 1 } }
      ]);
      // Post-process distance to miles
      return results.map(r => ({
        ...r,
        distance: this.parseDistanceToMiles(r.distanceMeters, r.distanceText)
      }));
    } catch (error) {
      logger.error(`Error fetching results for meet ${meetId}: ${error.message}`);
      throw error;
    }
  }

  // ======================
  // Helper Methods
  // ======================

  /**
   * Calculate pace in seconds per mile
   */
  calculatePace(timeInSeconds, distanceInMiles) {
    if (!distanceInMiles || distanceInMiles <= 0) return 0;
    return timeInSeconds / distanceInMiles;
  }

  /**
   * Parse distance to miles from either meters or textual description.
   * Supports: '5k', '3k', '1 Mile', '2 Miles', '3 mi', '3200m', etc.
   */
  parseDistanceToMiles(distanceMeters, distanceText) {
    const meters = Number(distanceMeters) || 0;
    const hasText = !!(distanceText && typeof distanceText === 'string');
    const t = hasText ? distanceText.toLowerCase().trim() : '';

    // Try to parse miles explicitly from text first (handles '1.5 miles', '3 mi')
    if (hasText) {
      const mileNumMatch = t.match(/(\d{1,3}(?:[\.,]\d{1,3})*|\d+(?:\.\d+)?)\s*(mi|mile|miles)\b/);
      if (mileNumMatch) {
        const raw = mileNumMatch[1].replace(/,/g, '');
        const n = parseFloat(raw);
        if (!isNaN(n) && n > 0) return n;
      }
    }

    // If meters are clearly valid (>= 1000), trust them
    if (meters >= 1000) return meters / 1609.34;

    // Otherwise, parse meters from text if present (handles '5,000 meters', '3200m')
    if (hasText) {
      // e.g., '5,000 meters' or '5000 meters'
      const metersMatch = t.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*(meters|meter|m)\b/);
      if (metersMatch) {
        const raw = metersMatch[1].replace(/,/g, '');
        const m = parseInt(raw, 10);
        if (!isNaN(m) && m > 0) return m / 1609.34;
      }
      // Common short units
      if (/\b5k\b/.test(t)) return 5000 / 1609.34;
      if (/\b3k\b/.test(t)) return 3000 / 1609.34;
      if (/\b3200\s*m\b/.test(t)) return 3200 / 1609.34;
      if (/\b1600\s*m\b/.test(t)) return 1600 / 1609.34; // ~1 mile
      if (/\bmile\b/.test(t)) return 1.0; // mentions 'mile' without number -> 1 mile TT
    }

    // As a final fallback, if meters was small but present (e.g., accidental '5'),
    // treat common small integers 3, 5 as kilometers
    if (meters > 0 && meters < 100) return (meters * 1000) / 1609.34;

    // Default XC distance
    return 3.1;
  }

  /**
   * Normalize a distance value (miles). If missing or out of XC range, default to 3.1 (5k).
   */
  normalizeDistanceMiles(distance) {
    const d = Number(distance) || 0;
    // Accept common XC and time-trial distances (>=1 mile up to marathon-ish bounds)
    if (d >= 1 && d <= 30) return d;
    return 3.1;
  }

  /**
   * Calculate improvement percentage
   */
  calculateImprovement(current, previous) {
    if (!previous || previous <= 0) return 0;
    return ((previous - current) / previous) * 100;
  }
}

module.exports = new CalculationService();
