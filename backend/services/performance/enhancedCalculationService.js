const TeamSeasonMetrics = require('../../models/performance/teamSeasonMetrics');
const AthleteSeasonMetrics = require('../../models/performance/athleteSeasonMetrics');
const MeetPerformanceMetrics = require('../../models/performance/meetPerformanceMetrics');
const EnhancedAthleteSeasonMetrics = require('../../models/performance/enhancedAthleteSeasonMetrics');
const EnhancedTeamSeasonMetrics = require('../../models/performance/enhancedTeamSeasonMetrics');
const mongoose = require('mongoose');
const Athlete = require('../../models/Athlete');
const Race = require('../../models/Race');
const Result = require('../../models/Result');
const logger = require('../../utils/logger');
const cache = require('./cache');

class EnhancedCalculationService {
  constructor() {
    this.batchSize = 100;
  }

  /**
   * Parse distance to miles for consistent calculations
   */
  parseDistanceToMiles(distanceMeters, distanceText) {
    if (distanceMeters && distanceMeters > 0) {
      return distanceMeters / 1609.34; // meters to miles
    }
    
    const text = (distanceText || '').toLowerCase();
    if (text.includes('5k') || text.includes('5 k')) return 3.1;
    if (text.includes('3k') || text.includes('3 k')) return 1.86;
    if (text.includes('3 mile') || text === '3 miles') return 3.0;
    if (text.includes('1.5 mile') || text.includes('1.5 miles')) return 1.5;
    if (text.includes('1 mile') || text === 'mile' || text === '1 miles') return 1.0;
    if (text.includes('2 mile')) return 2.0;
    
    return 0; // Unknown distance
  }

  /**
   * Categorize distance for analysis
   */
  categorizeDistance(miles) {
    if (Math.abs(miles - 1.0) < 0.1) return 'oneMile';
    if (Math.abs(miles - 1.5) < 0.1) return 'onePointFiveMile';
    if (Math.abs(miles - 3.0) < 0.1) return 'threeMile';
    if (Math.abs(miles - 3.1) < 0.1) return 'fiveK';
    return 'other';
  }

  /**
   * Calculate enhanced athlete metrics for a season
   */
  async calculateEnhancedAthleteMetrics(teamId, season) {
    try {
      logger.info(`Calculating enhanced athlete metrics for team ${teamId}, season ${season}`);

      // Get all athletes for the team
      const athletes = await Athlete.find({ team: teamId }).lean();
      
      // Get all races for the team and season
      const races = await Race.find({ 
        team: teamId, 
        season: season.toString() 
      }).lean();
      
      const raceIds = races.map(r => r._id);
      
      // Get all results for these races
      const results = await Result.find({ 
        race: { $in: raceIds },
        time: { $gt: 0 }
      }).populate('race').lean();

      // Process each athlete
      const athleteMetrics = [];
      
      for (const athlete of athletes) {
        const athleteResults = results.filter(r => 
          r.athlete.toString() === athlete._id.toString()
        );
        
        if (athleteResults.length === 0) continue;

        const metrics = await this.calculateSingleAthleteMetrics(
          athlete, 
          athleteResults, 
          season,
          teamId
        );
        
        athleteMetrics.push(metrics);
      }

      return athleteMetrics;
    } catch (error) {
      logger.error(`Error calculating enhanced athlete metrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate comprehensive metrics for a single athlete
   */
  async calculateSingleAthleteMetrics(athlete, results, season, teamId) {
    // Sort results by date
    const sortedResults = results.sort((a, b) => new Date(a.race.date) - new Date(b.race.date));
    
    // Basic stats
    const totalRaces = results.length;
    const totalMiles = results.reduce((sum, r) => {
      const miles = this.parseDistanceToMiles(r.race.distanceMeters, r.race.distance);
      return sum + miles;
    }, 0);

    // Distance-specific analysis
    const byDistance = this.calculateDistanceSpecificMetrics(results);
    
    // Season progression
    const seasonProgression = this.calculateSeasonProgression(sortedResults);
    
    // Placement analysis
    const placement = this.calculatePlacementMetrics(results);
    
    // Course performance
    const coursePerformance = this.calculateCoursePerformance(results);
    
    // Season-over-season race comparisons
    const raceComparisons = await this.calculateRaceComparisons(athlete._id, season, teamId);

    // Overall pace calculation
    const totalTime = results.reduce((sum, r) => sum + r.time, 0);
    const avgMilePace = totalMiles > 0 ? totalTime / totalMiles : 0;

    return {
      athleteId: athlete._id,
      athleteName: athlete.name,
      season: season,
      teamId: teamId,
      grade: athlete.grade,
      gender: athlete.gender,
      
      // Basic metrics
      totalRaces,
      totalMiles,
      avgMilePace: {
        overall: avgMilePace
      },
      
      // Enhanced metrics
      byDistance,
      seasonProgression,
      placement,
      coursePerformance,
      raceComparisons,
      
      // Best/worst times
      bestTime: Math.min(...results.map(r => r.time)),
      worstTime: Math.max(...results.map(r => r.time)),
      
      updatedAt: new Date()
    };
  }

  /**
   * Calculate distance-specific metrics
   */
  calculateDistanceSpecificMetrics(results) {
    const byDistance = {
      oneMile: { count: 0, times: [], paces: [], totalMiles: 0 },
      onePointFiveMile: { count: 0, times: [], paces: [], totalMiles: 0 },
      threeMile: { count: 0, times: [], paces: [], totalMiles: 0 },
      fiveK: { count: 0, times: [], paces: [], totalMiles: 0 },
      other: { count: 0, times: [], paces: [], totalMiles: 0 }
    };

    results.forEach(result => {
      const miles = this.parseDistanceToMiles(result.race.distanceMeters, result.race.distance);
      const category = this.categorizeDistance(miles);
      const pace = miles > 0 ? result.time / miles : 0;
      
      if (byDistance[category] && miles > 0) {
        byDistance[category].count++;
        byDistance[category].times.push(result.time);
        byDistance[category].paces.push(pace);
        byDistance[category].totalMiles += miles;
      }
    });

    // Calculate averages and consistency for each distance
    Object.keys(byDistance).forEach(distance => {
      const data = byDistance[distance];
      if (data.count > 0) {
        data.avgTime = data.times.reduce((a, b) => a + b, 0) / data.count;
        data.bestTime = Math.min(...data.times);
        data.worstTime = Math.max(...data.times);
        data.avgPace = data.paces.reduce((a, b) => a + b, 0) / data.count;
        
        // Calculate consistency (standard deviation)
        const mean = data.avgPace;
        const variance = data.paces.reduce((sum, pace) => sum + Math.pow(pace - mean, 2), 0) / data.count;
        data.consistency = Math.sqrt(variance);
      }
      
      // Clean up temporary arrays
      delete data.times;
      delete data.paces;
    });

    return byDistance;
  }

  /**
   * Calculate season progression metrics
   */
  calculateSeasonProgression(sortedResults) {
    if (sortedResults.length < 3) {
      return {
        earlySeasonAvg: 0,
        lateSeasonAvg: 0,
        improvementRate: 0,
        peakPerformanceRace: 0,
        consistencyTrend: 0
      };
    }

    // Early season (first 3 races) vs late season (last 3 races)
    const earlyRaces = sortedResults.slice(0, 3);
    const lateRaces = sortedResults.slice(-3);
    
    const earlySeasonAvg = earlyRaces.reduce((sum, r) => {
      const miles = this.parseDistanceToMiles(r.race.distanceMeters, r.race.distance);
      return sum + (miles > 0 ? r.time / miles : 0);
    }, 0) / earlyRaces.length;
    
    const lateSeasonAvg = lateRaces.reduce((sum, r) => {
      const miles = this.parseDistanceToMiles(r.race.distanceMeters, r.race.distance);
      return sum + (miles > 0 ? r.time / miles : 0);
    }, 0) / lateRaces.length;

    // Linear regression for improvement rate
    const paces = sortedResults.map((r, index) => {
      const miles = this.parseDistanceToMiles(r.race.distanceMeters, r.race.distance);
      return { x: index, y: miles > 0 ? r.time / miles : 0 };
    }).filter(p => p.y > 0);

    let improvementRate = 0;
    if (paces.length > 1) {
      const n = paces.length;
      const sumX = paces.reduce((sum, p) => sum + p.x, 0);
      const sumY = paces.reduce((sum, p) => sum + p.y, 0);
      const sumXY = paces.reduce((sum, p) => sum + p.x * p.y, 0);
      const sumXX = paces.reduce((sum, p) => sum + p.x * p.x, 0);
      
      improvementRate = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    }

    // Find peak performance race (best pace)
    let bestPace = Infinity;
    let peakPerformanceRace = 0;
    sortedResults.forEach((result, index) => {
      const miles = this.parseDistanceToMiles(result.race.distanceMeters, result.race.distance);
      const pace = miles > 0 ? result.time / miles : Infinity;
      if (pace < bestPace) {
        bestPace = pace;
        peakPerformanceRace = index + 1;
      }
    });

    return {
      earlySeasonAvg,
      lateSeasonAvg,
      improvementRate,
      peakPerformanceRace,
      consistencyTrend: 0 // TODO: Calculate consistency trend
    };
  }

  /**
   * Calculate placement metrics
   */
  calculatePlacementMetrics(results) {
    const validPlacements = results.filter(r => r.place && r.place > 0);
    
    if (validPlacements.length === 0) {
      return {
        avgPlace: 0,
        bestPlace: 0,
        worstPlace: 0,
        placementTrend: 0,
        top10Finishes: 0,
        top25Finishes: 0
      };
    }

    const places = validPlacements.map(r => r.place);
    const avgPlace = places.reduce((a, b) => a + b, 0) / places.length;
    const bestPlace = Math.min(...places);
    const worstPlace = Math.max(...places);
    const top10Finishes = places.filter(p => p <= 10).length;
    const top25Finishes = places.filter(p => p <= 25).length;

    // Calculate placement trend (simple linear regression)
    let placementTrend = 0;
    if (validPlacements.length > 1) {
      const sortedByDate = validPlacements.sort((a, b) => new Date(a.race.date) - new Date(b.race.date));
      const n = sortedByDate.length;
      const sumX = sortedByDate.reduce((sum, _, index) => sum + index, 0);
      const sumY = sortedByDate.reduce((sum, r) => sum + r.place, 0);
      const sumXY = sortedByDate.reduce((sum, r, index) => sum + index * r.place, 0);
      const sumXX = sortedByDate.reduce((sum, _, index) => sum + index * index, 0);
      
      placementTrend = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    }

    return {
      avgPlace,
      bestPlace,
      worstPlace,
      placementTrend,
      top10Finishes,
      top25Finishes
    };
  }

  /**
   * Calculate course-specific performance
   */
  calculateCoursePerformance(results) {
    const courseMap = new Map();
    
    results.forEach(result => {
      const courseName = result.race.name;
      const miles = this.parseDistanceToMiles(result.race.distanceMeters, result.race.distance);
      const pace = miles > 0 ? result.time / miles : 0;
      
      if (!courseMap.has(courseName)) {
        courseMap.set(courseName, {
          courseName,
          raceCount: 0,
          times: [],
          paces: []
        });
      }
      
      const courseData = courseMap.get(courseName);
      courseData.raceCount++;
      courseData.times.push(result.time);
      if (pace > 0) courseData.paces.push(pace);
    });

    return Array.from(courseMap.values()).map(course => {
      const avgTime = course.times.reduce((a, b) => a + b, 0) / course.times.length;
      const bestTime = Math.min(...course.times);
      const improvementOnCourse = course.times.length > 1 ? 
        course.times[0] - course.times[course.times.length - 1] : 0;
      
      return {
        courseName: course.courseName,
        raceCount: course.raceCount,
        avgTime,
        bestTime,
        improvementOnCourse
      };
    });
  }

  /**
   * Calculate season-over-season race comparisons
   */
  async calculateRaceComparisons(athleteId, currentSeason, teamId) {
    try {
      // Get all results for this athlete across all seasons
      const allResults = await Result.aggregate([
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
            'race.team': new mongoose.Types.ObjectId(teamId)
          }
        },
        {
          $project: {
            time: 1,
            place: 1,
            season: '$race.season',
            raceName: '$race.name',
            raceDate: '$race.date',
            distance: '$race.distance',
            distanceMeters: '$race.distanceMeters'
          }
        }
      ]);

      // Group by race name
      const raceMap = new Map();
      allResults.forEach(result => {
        const raceName = result.raceName;
        if (!raceMap.has(raceName)) {
          raceMap.set(raceName, []);
        }
        raceMap.get(raceName).push(result);
      });

      // Calculate comparisons for races that appear in multiple seasons
      const comparisons = [];
      raceMap.forEach((raceResults, raceName) => {
        const seasonMap = new Map();
        raceResults.forEach(result => {
          if (!seasonMap.has(result.season)) {
            seasonMap.set(result.season, []);
          }
          seasonMap.get(result.season).push(result);
        });

        // Only include races that appear in multiple seasons
        if (seasonMap.size > 1) {
          const seasons = Array.from(seasonMap.keys()).sort();
          const comparison = {
            raceName,
            seasons: []
          };

          seasons.forEach(season => {
            const seasonResults = seasonMap.get(season);
            const avgTime = seasonResults.reduce((sum, r) => sum + r.time, 0) / seasonResults.length;
            const bestTime = Math.min(...seasonResults.map(r => r.time));
            const avgPlace = seasonResults.filter(r => r.place).length > 0 ?
              seasonResults.filter(r => r.place).reduce((sum, r) => sum + r.place, 0) / 
              seasonResults.filter(r => r.place).length : 0;

            comparison.seasons.push({
              season: parseInt(season),
              raceCount: seasonResults.length,
              avgTime,
              bestTime,
              avgPlace
            });
          });

          // Calculate year-over-year improvement
          if (comparison.seasons.length >= 2) {
            comparison.seasons.forEach((seasonData, index) => {
              if (index > 0) {
                const prevSeason = comparison.seasons[index - 1];
                seasonData.timeImprovement = prevSeason.avgTime - seasonData.avgTime;
                seasonData.placeImprovement = prevSeason.avgPlace - seasonData.avgPlace;
              }
            });
          }

          comparisons.push(comparison);
        }
      });

      return comparisons;
    } catch (error) {
      logger.error(`Error calculating race comparisons for athlete ${athleteId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate enhanced team metrics
   */
  async calculateEnhancedTeamMetrics(teamId, season) {
    try {
      logger.info(`Calculating enhanced team metrics for team ${teamId}, season ${season}`);

      // Get all athlete metrics for this team/season
      const athleteMetrics = await this.calculateEnhancedAthleteMetrics(teamId, season);
      
      if (athleteMetrics.length === 0) {
        return null;
      }

      // Calculate team-level aggregations
      const teamMetrics = {
        teamId,
        season,
        totalAthletes: athleteMetrics.length,
        
        // Basic team stats
        totalRaces: athleteMetrics.reduce((sum, a) => sum + a.totalRaces, 0),
        totalMiles: athleteMetrics.reduce((sum, a) => sum + a.totalMiles, 0),
        avgMilePace: {
          overall: athleteMetrics.reduce((sum, a) => sum + a.avgMilePace.overall, 0) / athleteMetrics.length
        },

        // Gender breakdown
        byGender: this.calculateGenderBreakdown(athleteMetrics),
        
        // Grade breakdown
        byGrade: this.calculateGradeBreakdown(athleteMetrics),
        
        // Distance-specific team analysis
        byDistance: this.calculateTeamDistanceMetrics(athleteMetrics),
        
        // Team depth analysis
        teamDepth: this.calculateTeamDepth(athleteMetrics),
        
        // Pack running analysis
        packRunning: this.calculatePackRunning(athleteMetrics),
        
        updatedAt: new Date()
      };

      return teamMetrics;
    } catch (error) {
      logger.error(`Error calculating enhanced team metrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate gender breakdown
   */
  calculateGenderBreakdown(athleteMetrics) {
    const men = athleteMetrics.filter(a => a.gender === 'Men');
    const women = athleteMetrics.filter(a => a.gender === 'Women');

    return {
      men: {
        count: men.length,
        avgPace: men.length > 0 ? men.reduce((sum, a) => sum + a.avgMilePace.overall, 0) / men.length : 0,
        bestTime: men.length > 0 ? Math.min(...men.map(a => a.bestTime)) : 0
      },
      women: {
        count: women.length,
        avgPace: women.length > 0 ? women.reduce((sum, a) => sum + a.avgMilePace.overall, 0) / women.length : 0,
        bestTime: women.length > 0 ? Math.min(...women.map(a => a.bestTime)) : 0
      }
    };
  }

  /**
   * Calculate grade breakdown
   */
  calculateGradeBreakdown(athleteMetrics) {
    const gradeMap = new Map();
    
    athleteMetrics.forEach(athlete => {
      const grade = athlete.grade || 12; // default to senior if no grade
      if (!gradeMap.has(grade)) {
        gradeMap.set(grade, []);
      }
      gradeMap.get(grade).push(athlete);
    });

    const breakdown = {};
    gradeMap.forEach((athletes, grade) => {
      breakdown[`grade${grade}`] = {
        count: athletes.length,
        avgPace: athletes.reduce((sum, a) => sum + a.avgMilePace.overall, 0) / athletes.length,
        bestTime: Math.min(...athletes.map(a => a.bestTime))
      };
    });

    return breakdown;
  }

  /**
   * Calculate team distance-specific metrics
   */
  calculateTeamDistanceMetrics(athleteMetrics) {
    const distances = ['oneMile', 'onePointFiveMile', 'threeMile', 'fiveK'];
    const teamByDistance = {};

    distances.forEach(distance => {
      const athletesWithDistance = athleteMetrics.filter(a => 
        a.byDistance[distance] && a.byDistance[distance].count > 0
      );

      if (athletesWithDistance.length > 0) {
        teamByDistance[distance] = {
          athleteCount: athletesWithDistance.length,
          avgTime: athletesWithDistance.reduce((sum, a) => sum + a.byDistance[distance].avgTime, 0) / athletesWithDistance.length,
          bestTime: Math.min(...athletesWithDistance.map(a => a.byDistance[distance].bestTime)),
          avgPace: athletesWithDistance.reduce((sum, a) => sum + a.byDistance[distance].avgPace, 0) / athletesWithDistance.length
        };
      }
    });

    return teamByDistance;
  }

  /**
   * Calculate team depth (gap between top runners)
   */
  calculateTeamDepth(athleteMetrics) {
    // Sort athletes by best time
    const sortedAthletes = athleteMetrics
      .filter(a => a.bestTime > 0)
      .sort((a, b) => a.bestTime - b.bestTime);

    if (sortedAthletes.length < 5) {
      return {
        top5Spread: 0,
        top7Spread: 0,
        depthScore: 0
      };
    }

    const top5Spread = sortedAthletes[4].bestTime - sortedAthletes[0].bestTime;
    const top7Spread = sortedAthletes.length >= 7 ? 
      sortedAthletes[6].bestTime - sortedAthletes[0].bestTime : 0;

    // Depth score: lower is better (tighter pack)
    const depthScore = top5Spread / sortedAthletes[0].bestTime;

    return {
      top5Spread,
      top7Spread,
      depthScore
    };
  }

  /**
   * Calculate pack running metrics
   */
  calculatePackRunning(athleteMetrics) {
    // This would require race-by-race analysis
    // For now, return basic structure
    return {
      avgGapBetweenRunners: 0,
      packTightness: 0,
      packConsistency: 0
    };
  }

  /**
   * Main calculation method that orchestrates all calculations
   */
  async calculateAllEnhancedMetrics(teamId, season, skipCache = false) {
    try {
      logger.info(`Starting enhanced metrics calculation for team ${teamId}, season ${season}`);
      
      if (!skipCache) {
        await cache.invalidateTeam(teamId, season);
      }

      // Calculate enhanced athlete metrics
      const athleteMetrics = await this.calculateEnhancedAthleteMetrics(teamId, season);
      
      // Calculate enhanced team metrics
      const teamMetrics = await this.calculateEnhancedTeamMetrics(teamId, season);
      
      // Store enhanced athlete metrics in MongoDB
      await this.storeEnhancedAthleteMetrics(athleteMetrics);
      
      // Store enhanced team metrics in MongoDB
      await this.storeEnhancedTeamMetrics(teamMetrics);
      
      logger.info(`Completed enhanced metrics calculation for team ${teamId}, season ${season}`);
      
      return {
        success: true,
        teamId,
        season,
        athleteMetrics,
        teamMetrics,
        calculatedAt: new Date()
      };
    } catch (error) {
      logger.error(`Error calculating enhanced metrics: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Store enhanced athlete metrics in MongoDB
   */
  async storeEnhancedAthleteMetrics(athleteMetrics) {
    try {
      logger.info(`Storing ${athleteMetrics.length} enhanced athlete metrics`);
      
      for (const metrics of athleteMetrics) {
        await EnhancedAthleteSeasonMetrics.findOneAndUpdate(
          { 
            athleteId: metrics.athleteId, 
            season: metrics.season 
          },
          metrics,
          { 
            upsert: true, 
            new: true 
          }
        );
      }
      
      logger.info(`Successfully stored enhanced athlete metrics`);
    } catch (error) {
      logger.error(`Error storing enhanced athlete metrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Store enhanced team metrics in MongoDB
   */
  async storeEnhancedTeamMetrics(teamMetrics) {
    try {
      if (!teamMetrics) {
        logger.warn('No team metrics to store');
        return;
      }
      
      logger.info(`Storing enhanced team metrics for team ${teamMetrics.teamId}, season ${teamMetrics.season}`);
      
      await EnhancedTeamSeasonMetrics.findOneAndUpdate(
        { 
          teamId: teamMetrics.teamId, 
          season: teamMetrics.season 
        },
        teamMetrics,
        { 
          upsert: true, 
          new: true 
        }
      );
      
      logger.info(`Successfully stored enhanced team metrics`);
    } catch (error) {
      logger.error(`Error storing enhanced team metrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve stored enhanced athlete metrics
   */
  async getStoredEnhancedAthleteMetrics(teamId, season, athleteId = null) {
    try {
      const query = { teamId, season };
      if (athleteId) {
        query.athleteId = athleteId;
      }
      
      const metrics = await EnhancedAthleteSeasonMetrics.find(query)
        .populate('athleteId', 'name grade gender')
        .lean();
      
      return metrics;
    } catch (error) {
      logger.error(`Error retrieving enhanced athlete metrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve stored enhanced team metrics
   */
  async getStoredEnhancedTeamMetrics(teamId, season) {
    try {
      const metrics = await EnhancedTeamSeasonMetrics.findOne({ teamId, season }).lean();
      return metrics;
    } catch (error) {
      logger.error(`Error retrieving enhanced team metrics: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new EnhancedCalculationService();
