const prisma = require('../../lib/db');
const logger = require('../../utils/logger');
const cache = require('./cache');
const { deriveGrade } = require('../../lib/season');
const { parseDistanceToMeters, metersToMiles } = require('../../lib/distance');

class CalculationService {
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

      await this.calculateAthleteMetrics(teamId, season);
      await this.calculateMeetMetrics(teamId, season);
      const result = await this.calculateTeamMetrics(teamId, season);

      logger.info(`Completed metrics calculation for team ${teamId}, season ${season}`);

      const transformedMetrics = result
        ? {
            athleteCount: result.athleteCount || 0,
            totalRaces: result.totalRaces || 0,
            totalMiles: result.totalMiles || 0,
            resultCount: result.totalRaces || 0,
            meetCount: result.meetCount || 0,
            avgPace: result.averagePace || 0,
            improvementPercent: result.improvementPercent || 0,
          }
        : null;

      return { success: true, teamId, season, metrics: transformedMetrics };
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
      const seasonNum = typeof season === 'string' ? parseInt(season, 10) : season;

      const results = await prisma.result.findMany({
        where: { athleteId, status: 'FINISHED', time: { gt: 0 }, race: { season: seasonNum } },
        select: {
          id: true,
          time: true,
          place: true,
          overallPlace: true,
          overallFieldSize: true,
          race: {
            select: {
              id: true,
              name: true,
              date: true,
              distance: true,
              distanceMeters: true,
              season: true,
              fieldFinisherCount: true,
            },
          },
        },
      });

      return results
        .filter((r) => r.race)
        .map((r) => ({
          _id: r.id,
          time: r.time,
          // Race place/field size: this athlete's place within their own
          // race's field, matched from a field-results upload — see
          // lib/fieldPlacement.js and the Result schema comments. Null
          // until a field-results upload exists for this race.
          place: r.place,
          fieldSize: r.race.fieldFinisherCount,
          // Overall place/field size: only set when this meet split the
          // event into 2+ same-distance/same-gender heats (Boys Varsity
          // Gold/Silver/Bronze, etc.) — the combined rank across all of them.
          overallPlace: r.overallPlace,
          overallFieldSize: r.overallFieldSize,
          distanceMeters: r.race.distanceMeters,
          distanceText: r.race.distance,
          meetName: r.race.name,
          date: r.race.date,
          season: r.race.season,
          raceId: r.race.id,
          distance: this.parseDistanceToMiles(r.race.distanceMeters, r.race.distance),
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
      const athletes = await prisma.athlete.findMany({ where: { teamId } });

      for (let i = 0; i < athletes.length; i += this.batchSize) {
        const batch = athletes.slice(i, i + this.batchSize);
        await Promise.all(batch.map((athlete) => this.processAthleteMetrics(athlete, season)));
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
      if (races.length === 0) return;

      races.sort((a, b) => new Date(a.date) - new Date(b.date));
      const metrics = this.calculateAthleteRaceMetrics(races);
      const genderNorm = athlete.gender === 'Men' ? 'M' : athlete.gender === 'Women' ? 'F' : athlete.gender || '';
      // Derive grade for THIS season from the athlete's stable graduationYear,
      // rather than reading the stored `athlete.grade` column. That column is
      // no longer written on import (see routes/teams.js) and, even when it
      // was, held only a single snapshot value shared across every season —
      // so a team's grade-9-12 breakdown either went stale or silently
      // dropped whichever grades weren't present in the most recent import.
      const grade = deriveGrade(athlete.graduationYear, season);

      await prisma.athleteSeasonMetrics.upsert({
        where: { athleteId_teamId_season: { athleteId: athlete.id, teamId: athlete.teamId, season } },
        update: {
          name: athlete.name,
          gender: genderNorm,
          grade,
          totalRaces: metrics.totalRaces || 0,
          totalMiles: metrics.totalMiles || 0,
          totalTimeSeconds: metrics.totalTimeSeconds || 0,
          averagePace: metrics.avgMilePace?.overall || 0,
          bestPace: metrics.bestPace || 0,
          bestTime5k: metrics.best5kTime || 0,
          improvementPercent: metrics.improvementPercent || 0,
          calculatedAt: new Date(),
        },
        create: {
          athleteId: athlete.id,
          teamId: athlete.teamId,
          season,
          name: athlete.name,
          gender: genderNorm,
          grade,
          totalRaces: metrics.totalRaces || 0,
          totalMiles: metrics.totalMiles || 0,
          totalTimeSeconds: metrics.totalTimeSeconds || 0,
          averagePace: metrics.avgMilePace?.overall || 0,
          bestPace: metrics.bestPace || 0,
          bestTime5k: metrics.best5kTime || 0,
          improvementPercent: metrics.improvementPercent || 0,
          calculatedAt: new Date(),
        },
      });
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

    const totals = races.reduce(
      (acc, race) => {
        const miles = this.normalizeDistanceMiles(race.distance);
        return { races: acc.races + 1, miles: acc.miles + miles, time: acc.time + (race.time || 0) };
      },
      { races: 0, miles: 0, time: 0 }
    );

    const firstRace = races[0];
    const lastRace = races[races.length - 1];
    let improvement = this.calculateImprovement(lastRace.time, firstRace.time);
    if (!Number.isFinite(improvement)) improvement = 0;
    improvement = Math.max(-100, Math.min(100, improvement));

    let totalDropped = 0;
    for (let i = 1; i < races.length; i++) {
      if (races[i].time < races[i - 1].time) {
        totalDropped += races[i - 1].time - races[i].time;
      }
    }

    // F2 (pre-season fix): best5kTime only ever finds anything for a team
    // that races 5Ks — zero for an all-2-mile or all-8K season. bestPace
    // below is the real, distance-agnostic replacement: the best pace
    // across every race, each converted through its own actual distance
    // (calculatePace/normalizeDistanceMiles, not a fixed 3.1mi/5K guess).
    // This also fixes a subtler existing bug: bestPace used to mean "the
    // pace of whichever race had the smallest raw time" (bestRace, sorted
    // by time) rather than the actual fastest pace — those aren't the same
    // race when a longer race was run faster per-mile than a shorter one.
    // best5kTime/fiveKRaces are untouched, kept only for backward
    // compatibility with existing callers/frontend fields.
    const FIVE_K_MILES = 3.1;
    const fiveKRaces = races.filter((r) => {
      const distance = Number(r.distance);
      const is5K = Math.abs(distance - FIVE_K_MILES) < 0.05;
      const distanceText = r.distanceText || '';
      const textIs5K = distanceText.includes('5,000') || distanceText.includes('5000') || /\b5\s*k\b/i.test(distanceText);
      const nameHas5k = r.meetName && /\b5\s*k\b/i.test(r.meetName);
      return (is5K || textIs5K || nameHas5k) && Number(r.time) > 0;
    });

    const best5kTime = fiveKRaces.length > 0 ? Math.min(...fiveKRaces.map((r) => r.time)) : 0;

    const racePaces = races
      .map((r) => this.calculatePace(r.time, this.normalizeDistanceMiles(r.distance)))
      .filter((p) => p > 0);
    const bestPace = racePaces.length > 0 ? Math.min(...racePaces) : 0;

    return {
      totalRaces: totals.races,
      totalMiles: parseFloat(totals.miles.toFixed(2)),
      totalTimeSeconds: totals.time,
      avgMilePace: { overall: this.calculatePace(totals.time, totals.miles) },
      bestTime: bestRace.time,
      bestTimeMeet: bestRace.meetName,
      bestPace,
      best5kTime,
      improvementPercent: improvement,
      totalTimeDropped: parseFloat(totalDropped.toFixed(2)),
      firstMeet: {
        name: firstRace.meetName || '',
        date: firstRace.date || null,
        avgPace: this.calculatePace(firstRace.time, this.normalizeDistanceMiles(firstRace.distance)),
        avgTime: firstRace.time || 0,
      },
      lastMeet: {
        name: lastRace.meetName || '',
        date: lastRace.date || null,
        avgPace: this.calculatePace(lastRace.time, this.normalizeDistanceMiles(lastRace.distance)),
        avgTime: lastRace.time || 0,
      },
    };
  }

  /**
   * Calculate metrics for all meets in a team/season
   */
  async calculateMeetMetrics(teamId, season) {
    try {
      const races = await prisma.race.findMany({ where: { teamId, season }, orderBy: { date: 'asc' } });

      let count = 0;
      for (const race of races) {
        const results = await prisma.result.findMany({
          where: { raceId: race.id, status: 'FINISHED', time: { gt: 0 } },
          include: { athlete: { select: { id: true, name: true, gender: true, grade: true } } },
        });

        if (results.length === 0) continue;

        const metrics = this.calculateMeetPerformance(results, race);
        const metricsJson = JSON.parse(JSON.stringify(metrics));

        try {
          await prisma.meetPerformanceMetrics.upsert({
            where: { raceId_teamId: { raceId: race.id, teamId } },
            update: {
              season,
              meetName: race.name,
              meetDate: race.date,
              distance: race.distanceMeters || 5000,
              distanceLabel: race.distance || '5K',
              participantCount: results.length,
              maleParticipantCount: metrics.byGender?.M?.totalRaces || 0,
              femaleParticipantCount: metrics.byGender?.F?.totalRaces || 0,
              averageTime: metrics.overall?.avgTimeSeconds || 0,
              averagePace: metrics.overall?.avgMilePace?.overall || 0,
              bestTime: metrics.overall?.bestTime || 0,
              teamScore: metrics.overall?.teamBestTime || 0,
              boysAvgPace: metrics.byGender?.M?.avgMilePace?.overall ?? null,
              boysCount: metrics.byGender?.M?.totalRaces || 0,
              girlsAvgPace: metrics.byGender?.F?.avgMilePace?.overall ?? null,
              girlsCount: metrics.byGender?.F?.totalRaces || 0,
              metrics: metricsJson,
              calculatedAt: new Date(),
            },
            create: {
              raceId: race.id,
              teamId,
              season,
              meetName: race.name,
              meetDate: race.date,
              distance: race.distanceMeters || 5000,
              distanceLabel: race.distance || '5K',
              participantCount: results.length,
              maleParticipantCount: metrics.byGender?.M?.totalRaces || 0,
              femaleParticipantCount: metrics.byGender?.F?.totalRaces || 0,
              averageTime: metrics.overall?.avgTimeSeconds || 0,
              averagePace: metrics.overall?.avgMilePace?.overall || 0,
              bestTime: metrics.overall?.bestTime || 0,
              teamScore: metrics.overall?.teamBestTime || 0,
              boysAvgPace: metrics.byGender?.M?.avgMilePace?.overall ?? null,
              boysCount: metrics.byGender?.M?.totalRaces || 0,
              girlsAvgPace: metrics.byGender?.F?.avgMilePace?.overall ?? null,
              girlsCount: metrics.byGender?.F?.totalRaces || 0,
              metrics: metricsJson,
              calculatedAt: new Date(),
            },
          });
          count++;
        } catch (meetError) {
          logger.error(`Failed to upsert meet metrics for race ${race.name}: ${meetError.message}`);
        }
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
   */
  calculateMeetPerformance(results, race) {
    if (!results || results.length === 0) return {};

    const byGender = { M: [], F: [] };
    const byGrade = {};

    results.forEach((result) => {
      if (result.athlete?.gender) {
        const gRaw = result.athlete.gender;
        const g = gRaw === 'Men' ? 'M' : gRaw === 'Women' ? 'F' : gRaw;
        byGender[g] = byGender[g] || [];
        byGender[g].push(result);
      }
      if (result.athlete?.grade !== undefined && result.athlete?.grade !== null) {
        byGrade[result.athlete.grade] = byGrade[result.athlete.grade] || [];
        byGrade[result.athlete.grade].push(result);
      }
    });

    const overallMetrics = this.calculateTeamMetricsFromRaces(results, race);

    const validTimes = results.filter((r) => r.time && r.time > 0).map((r) => r.time);
    const avgTimeSeconds = validTimes.length ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length : 0;
    overallMetrics.avgTimeSeconds = parseFloat(avgTimeSeconds.toFixed(2));

    const best = validTimes.length ? Math.min(...validTimes) : 0;
    overallMetrics.bestTime = best;

    const topSeven = [...results]
      .filter((r) => r.time && r.time > 0)
      .sort((a, b) => a.time - b.time)
      .slice(0, 7);
    const topSevenSum = topSeven.reduce((sum, r) => sum + (r.time || 0), 0);
    overallMetrics.teamBestTime = parseFloat(topSevenSum.toFixed(2));

    const genderMetrics = {};
    Object.entries(byGender).forEach(([gender, races]) => {
      if (races.length > 0) {
        const gm = this.calculateTeamMetricsFromRaces(races, race);
        const gTopSeven = [...races]
          .filter((r) => r.time && r.time > 0)
          .sort((a, b) => a.time - b.time)
          .slice(0, 7);
        const gTopSevenSum = gTopSeven.reduce((sum, r) => sum + (r.time || 0), 0);
        gm.teamBestTime = parseFloat(gTopSevenSum.toFixed(2));
        genderMetrics[gender] = gm;
      }
    });

    const gradeMetrics = {};
    Object.entries(byGrade).forEach(([grade, races]) => {
      if (races.length > 0) {
        gradeMetrics[grade] = this.calculateTeamMetricsFromRaces(races, race);
      }
    });

    return { overall: overallMetrics, byGender: genderMetrics, byGrade: gradeMetrics };
  }

  /**
   * Calculate team metrics from a set of races
   */
  calculateTeamMetricsFromRaces(races, race) {
    if (!races || races.length === 0) return {};

    const distanceMiles = race ? this.parseDistanceToMiles(race.distanceMeters, race.distance) : 3.1;

    const totals = races.reduce(
      (acc, result) => ({ count: acc.count + 1, miles: acc.miles + distanceMiles, time: acc.time + (result.time || 0) }),
      { count: 0, miles: 0, time: 0 }
    );

    const overallPace = totals.miles > 0 ? totals.time / totals.miles : 0;
    const avgTimeSeconds = totals.count > 0 ? totals.time / totals.count : 0;

    return {
      totalRaces: totals.count,
      totalMiles: parseFloat(totals.miles.toFixed(2)),
      avgMilePace: { overall: parseFloat(overallPace.toFixed(2)) },
      avgTimeSeconds: parseFloat(avgTimeSeconds.toFixed(2)),
    };
  }

  /**
   * Calculate team-level metrics for a season
   */
  async calculateTeamMetrics(teamId, season) {
    try {
      const athleteMetrics = await prisma.athleteSeasonMetrics.findMany({ where: { teamId, season } });
      if (!athleteMetrics || athleteMetrics.length === 0) return null;

      const maleAthletes = athleteMetrics.filter((a) => a.gender === 'M');
      const femaleAthletes = athleteMetrics.filter((a) => a.gender === 'F');

      const totalRaces = athleteMetrics.reduce((sum, a) => sum + (a.totalRaces || 0), 0);
      const totalMiles = athleteMetrics.reduce((sum, a) => sum + (a.totalMiles || 0), 0);
      const totalTime = athleteMetrics.reduce((sum, a) => sum + (a.totalTimeSeconds || 0), 0);
      const avgPace = totalMiles > 0 ? totalTime / totalMiles : 0;

      const meetMetrics = await prisma.meetPerformanceMetrics.findMany({
        where: { teamId, season },
        orderBy: { meetDate: 'asc' },
      });

      const firstMeet = meetMetrics[0];
      const lastMeet = meetMetrics[meetMetrics.length - 1];

      let improvementPercent = 0;
      let firstMeetData = null;
      let lastMeetData = null;

      if (firstMeet && lastMeet && firstMeet.raceId !== lastMeet.raceId) {
        const firstMeetPace = firstMeet.averagePace || 0;
        const lastMeetPace = lastMeet.averagePace || 0;
        improvementPercent = this.calculateImprovement(lastMeetPace, firstMeetPace);

        firstMeetData = { name: firstMeet.meetName, date: firstMeet.meetDate, avgPace: firstMeetPace, avgTime: firstMeet.averageTime || 0 };
        lastMeetData = { name: lastMeet.meetName, date: lastMeet.meetDate, avgPace: lastMeetPace, avgTime: lastMeet.averageTime || 0 };
      }

      const byGender = this.calculateGenderBreakdown(athleteMetrics);
      const byGrade = this.calculateGradeBreakdown(athleteMetrics);
      const byDistance = await this.calculateDistanceBreakdown(teamId, season);
      const teamDepth = await this.calculateTeamDepth(teamId, season);
      const packRunning = await this.calculatePackRunning(teamId, season);

      const teamMetrics = {
        athleteCount: athleteMetrics.length,
        totalRaces,
        totalMiles: parseFloat(totalMiles.toFixed(2)),
        averagePace: parseFloat(avgPace.toFixed(2)),
        maleAthleteCount: maleAthletes.length,
        femaleAthleteCount: femaleAthletes.length,
        meetCount: meetMetrics.length,
        improvementPercent: parseFloat(improvementPercent.toFixed(2)),
        firstMeet: firstMeetData,
        lastMeet: lastMeetData,
        byGender,
        byGrade,
        byDistance,
        teamDepth,
        packRunning,
        calculatedAt: new Date(),
      };

      try {
        await prisma.teamSeasonMetrics.upsert({
          where: { teamId_season: { teamId, season } },
          update: teamMetrics,
          create: { teamId, season, ...teamMetrics },
        });
      } catch (teamError) {
        logger.error(`Failed to upsert team metrics: ${teamError.message}`);
      }

      logger.info(`Team metrics calculated: ${athleteMetrics.length} athletes, ${meetMetrics.length} meets, ${improvementPercent.toFixed(2)}% improvement`);
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
      const meets = await prisma.meetPerformanceMetrics.findMany({
        where: { teamId, season },
        orderBy: { meetDate: 'asc' },
      });

      if (!meets || meets.length === 0) {
        return { series: [], trend: { slope: 0, percentChange: 0 } };
      }

      const series = meets.map((m, idx) => {
        const prev = idx > 0 ? meets[idx - 1] : null;
        const currPace = m.averagePace || 0;
        const prevPace = prev ? prev.averagePace || 0 : 0;
        const deltaPct = prevPace > 0 ? ((prevPace - currPace) / prevPace) * 100 : 0;

        return {
          meetId: m.raceId,
          meetName: m.meetName,
          meetDate: m.meetDate,
          overall: {
            totalRaces: m.participantCount || 0,
            totalMiles: (m.distance || 5000) / 1609.34,
            avgMilePace: { overall: currPace, first5k: currPace, last5k: currPace },
            teamBestTime: m.bestTime || 0,
          },
          byGender: {
            M: m.boysAvgPace ? { avgMilePace: { overall: m.boysAvgPace }, totalRaces: m.boysCount || 0, totalMiles: 0 } : null,
            F: m.girlsAvgPace ? { avgMilePace: { overall: m.girlsAvgPace }, totalRaces: m.girlsCount || 0, totalMiles: 0 } : null,
          },
          deltaVsPrevious: parseFloat(deltaPct.toFixed(2)),
        };
      });

      const paces = series.map((s) => s.overall.avgMilePace.overall).filter((p) => p > 0);
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
    if (!values || values.length < 2) return { slope: 0, percentChange: 0 };

    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const dx = i - xMean;
      num += dx * (values[i] - yMean);
      den += dx * dx;
    }

    const slope = den !== 0 ? num / den : 0;
    const percentChange = yMean !== 0 ? (slope / yMean) * 100 : 0;

    return { slope: parseFloat(slope.toFixed(4)), percentChange: parseFloat(percentChange.toFixed(2)) };
  }

  // Helper methods
  //
  // This used to have its own regex (stopped at a comma: "5,000" -> 5) and,
  // worse, defaulted to "3.1 miles" — i.e. silently asserted every
  // unparseable race was a 5K — for anything it couldn't make sense of.
  // That's exactly the "never guess" rule this codebase is supposed to
  // follow. Now delegates to lib/distance.js and falls back to 0 (already
  // this file's existing convention for "unknown" — see calculatePace's
  // own !distanceMiles guard below), which callers already handle by
  // excluding the race rather than corrupting a total with a fabricated
  // distance.
  parseDistanceToMiles(distanceMeters, distanceText) {
    const meters = distanceMeters > 0 ? distanceMeters : parseDistanceToMeters(distanceText);
    return metersToMiles(meters) ?? 0;
  }

  // Some callers already have a race pre-transformed with `distance` as a
  // computed miles number (see the .map() that builds distanceMeters/
  // distanceText/distance together above); others pass the raw text.
  // Accept either.
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

  calculateGenderBreakdown(athleteMetrics) {
    const maleAthletes = athleteMetrics.filter((a) => a.gender === 'M');
    const femaleAthletes = athleteMetrics.filter((a) => a.gender === 'F');
    return { men: this._calculateGroupStats(maleAthletes), women: this._calculateGroupStats(femaleAthletes) };
  }

  calculateGradeBreakdown(athleteMetrics) {
    const byGrade = {
      grade9: athleteMetrics.filter((a) => a.grade === 9),
      grade10: athleteMetrics.filter((a) => a.grade === 10),
      grade11: athleteMetrics.filter((a) => a.grade === 11),
      grade12: athleteMetrics.filter((a) => a.grade === 12),
    };

    return {
      grade9: this._calculateGroupStats(byGrade.grade9),
      grade10: this._calculateGroupStats(byGrade.grade10),
      grade11: this._calculateGroupStats(byGrade.grade11),
      grade12: this._calculateGroupStats(byGrade.grade12),
    };
  }

  /**
   * Calculate distance-specific performance metrics
   */
  async calculateDistanceBreakdown(teamId, season) {
    try {
      const results = await prisma.result.findMany({
        where: { status: 'FINISHED', time: { gt: 0 }, race: { teamId, season } },
        select: { time: true, athleteId: true, race: { select: { distanceMeters: true } } },
      });

      const oneMile = this._filterAndCalculateDistance(results, 1500, 1700);
      const onePointFiveMile = this._filterAndCalculateDistance(results, 2300, 2600);
      const threeMile = this._filterAndCalculateDistance(results, 4700, 4900);
      const fiveK = this._filterAndCalculateDistance(results, 4900, 5100);

      return { oneMile, onePointFiveMile, threeMile, fiveK };
    } catch (error) {
      logger.error(`Error calculating distance breakdown: ${error.message}`);
      return {
        oneMile: this._emptyDistanceStats(),
        onePointFiveMile: this._emptyDistanceStats(),
        threeMile: this._emptyDistanceStats(),
        fiveK: this._emptyDistanceStats(),
      };
    }
  }

  /**
   * Calculate team depth metrics (top 5/7 spread). One query for all
   * results in the season instead of one query per race (the original
   * looped a query per race — this fetches once and groups in memory).
   */
  async calculateTeamDepth(teamId, season) {
    try {
      const races = await prisma.race.findMany({ where: { teamId, season }, select: { id: true } });
      if (races.length === 0) {
        return { top5Spread: 0, top7Spread: 0, depthScore: 0, varsityAvgTime: 0, jvAvgTime: 0 };
      }

      const raceIds = races.map((r) => r.id);
      const allResults = await prisma.result.findMany({
        where: { raceId: { in: raceIds }, status: 'FINISHED', time: { gt: 0 } },
        select: { raceId: true, time: true },
        orderBy: { time: 'asc' },
      });

      const byRace = new Map();
      for (const r of allResults) {
        if (!byRace.has(r.raceId)) byRace.set(r.raceId, []);
        byRace.get(r.raceId).push(r.time);
      }

      let totalTop5Spread = 0;
      let totalTop7Spread = 0;
      let totalVarsityTime = 0;
      let totalJVTime = 0;
      let meetCount = 0;
      let varsityCount = 0;
      let jvCount = 0;

      for (const times of byRace.values()) {
        if (times.length >= 5) {
          totalTop5Spread += times[4] - times[0];

          const varsityTimes = times.slice(0, 7);
          totalVarsityTime += varsityTimes.reduce((sum, t) => sum + t, 0) / varsityTimes.length;
          varsityCount++;

          if (times.length >= 7) {
            totalTop7Spread += times[6] - times[0];

            if (times.length > 7) {
              const jvTimes = times.slice(7);
              totalJVTime += jvTimes.reduce((sum, t) => sum + t, 0) / jvTimes.length;
              jvCount++;
            }
          }

          meetCount++;
        }
      }

      return {
        top5Spread: meetCount > 0 ? parseFloat((totalTop5Spread / meetCount).toFixed(2)) : 0,
        top7Spread: meetCount > 0 ? parseFloat((totalTop7Spread / meetCount).toFixed(2)) : 0,
        depthScore: meetCount > 0 ? parseFloat((totalTop7Spread / meetCount / 7).toFixed(2)) : 0,
        varsityAvgTime: varsityCount > 0 ? parseFloat((totalVarsityTime / varsityCount).toFixed(2)) : 0,
        jvAvgTime: jvCount > 0 ? parseFloat((totalJVTime / jvCount).toFixed(2)) : 0,
      };
    } catch (error) {
      logger.error(`Error calculating team depth: ${error.message}`);
      return { top5Spread: 0, top7Spread: 0, depthScore: 0, varsityAvgTime: 0, jvAvgTime: 0 };
    }
  }

  /**
   * Calculate pack running metrics (gaps between runners). Same
   * single-query-then-group optimization as calculateTeamDepth.
   */
  async calculatePackRunning(teamId, season) {
    try {
      const races = await prisma.race.findMany({ where: { teamId, season }, select: { id: true } });
      if (races.length === 0) {
        return { avgGapBetweenRunners: 0, packTightness: 0, packConsistency: 0 };
      }

      const raceIds = races.map((r) => r.id);
      const allResults = await prisma.result.findMany({
        where: { raceId: { in: raceIds }, status: 'FINISHED', time: { gt: 0 } },
        select: { raceId: true, time: true },
        orderBy: { time: 'asc' },
      });

      const byRace = new Map();
      for (const r of allResults) {
        if (!byRace.has(r.raceId)) byRace.set(r.raceId, []);
        byRace.get(r.raceId).push(r.time);
      }

      let totalGap = 0;
      let gapCount = 0;
      const meetGaps = [];

      for (const times of byRace.values()) {
        if (times.length >= 2) {
          let meetGapSum = 0;
          let meetGapCount = 0;
          for (let i = 1; i < times.length; i++) {
            const gap = times[i] - times[i - 1];
            totalGap += gap;
            meetGapSum += gap;
            gapCount++;
            meetGapCount++;
          }
          if (meetGapCount > 0) meetGaps.push(meetGapSum / meetGapCount);
        }
      }

      const avgGap = gapCount > 0 ? totalGap / gapCount : 0;

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
        packConsistency: parseFloat(consistency.toFixed(3)),
      };
    } catch (error) {
      logger.error(`Error calculating pack running: ${error.message}`);
      return { avgGapBetweenRunners: 0, packTightness: 0, packConsistency: 0 };
    }
  }

  _calculateGroupStats(athletes) {
    if (!athletes || athletes.length === 0) {
      return { count: 0, avgPace: 0, bestTime: 0, avgTime: 0, totalRaces: 0 };
    }

    const totalRaces = athletes.reduce((sum, a) => sum + (a.totalRaces || 0), 0);
    const totalTime = athletes.reduce((sum, a) => sum + (a.totalTimeSeconds || 0), 0);
    const totalMiles = athletes.reduce((sum, a) => sum + (a.totalMiles || 0), 0);
    const bestTimes = athletes.map((a) => a.bestTime5k).filter((t) => t > 0);

    return {
      count: athletes.length,
      avgPace: totalMiles > 0 ? parseFloat((totalTime / totalMiles).toFixed(2)) : 0,
      bestTime: bestTimes.length > 0 ? parseFloat(Math.min(...bestTimes).toFixed(2)) : 0,
      avgTime: totalRaces > 0 ? parseFloat((totalTime / totalRaces).toFixed(2)) : 0,
      totalRaces,
    };
  }

  _filterAndCalculateDistance(results, minMeters, maxMeters) {
    const filtered = results.filter((r) => {
      const distance = r.race?.distanceMeters || 0;
      return distance >= minMeters && distance <= maxMeters;
    });

    if (filtered.length === 0) return this._emptyDistanceStats();

    const times = filtered.map((r) => r.time);
    const uniqueAthletes = new Set(filtered.map((r) => r.athleteId)).size;
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const bestTime = Math.min(...times);

    const avgDistance = filtered.reduce((sum, r) => sum + (r.race?.distanceMeters || 0), 0) / filtered.length;
    const distanceMiles = avgDistance / 1609.34;
    const avgPace = distanceMiles > 0 ? avgTime / distanceMiles : 0;

    return {
      athleteCount: uniqueAthletes,
      raceCount: filtered.length,
      avgTime: parseFloat(avgTime.toFixed(2)),
      bestTime: parseFloat(bestTime.toFixed(2)),
      avgPace: parseFloat(avgPace.toFixed(2)),
    };
  }

  _emptyDistanceStats() {
    return { athleteCount: 0, raceCount: 0, avgTime: 0, bestTime: 0, avgPace: 0 };
  }
}

module.exports = new CalculationService();
