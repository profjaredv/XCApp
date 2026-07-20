let cron;
try {
  cron = require('node-cron');
} catch (e) {
  // node-cron is optional. We'll no-op if it's not installed.
}
const calculationService = require('./calculationService');
const logger = require('../../utils/logger');

class PerformanceScheduler {
  constructor() {
    this.jobs = new Map();
  }

  /**
   * Schedule performance metrics calculation for a team/season
   * @param {string} teamId - Team ID
   * @param {number} season - Season year
   * @param {string} [schedule='0 2 * * *'] - Cron schedule (default: 2 AM daily)
   */
  scheduleTeamMetrics(teamId, season, schedule = '0 2 * * *') {
    const jobId = `team:${teamId}:${season}`;
    
    // Remove existing job if it exists
    this.unscheduleTeamMetrics(teamId, season);
    
    // Schedule the new job
    if (!cron) {
      logger.warn('node-cron not installed; skipping scheduling for performance metrics');
      return null;
    }
    const job = cron.schedule(schedule, async () => {
      try {
        logger.info(`Running scheduled metrics calculation for team ${teamId}, season ${season}`);
        await calculationService.calculateAllMetrics(teamId, season);
        logger.info(`Completed scheduled metrics calculation for team ${teamId}, season ${season}`);
      } catch (error) {
        logger.error(`Error in scheduled job for team ${teamId}: ${error.message}`, { error });
      }
    }, {
      timezone: 'America/New_York', // Adjust based on your needs
      scheduled: true
    });
    
    // Store the job reference
    this.jobs.set(jobId, job);
    logger.info(`Scheduled metrics calculation for team ${teamId}, season ${season} with schedule: ${schedule}`);
    
    return job;
  }
  
  /**
   * Unschedule a team's metrics calculation job
   */
  unscheduleTeamMetrics(teamId, season) {
    const jobId = `team:${teamId}:${season}`;
    const job = this.jobs.get(jobId);
    
    if (job) {
      job.stop();
      this.jobs.delete(jobId);
      logger.info(`Unscheduled metrics calculation for team ${teamId}, season ${season}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Schedule metrics calculation for all active teams
   */
  async scheduleAllActiveTeams() {
    try {
      // Get all active teams (you'll need to implement this based on your data model)
      const activeTeams = await this.getActiveTeams();
      
      // Schedule calculation for each team's current season
      for (const team of activeTeams) {
        const currentSeason = new Date().getFullYear();
        this.scheduleTeamMetrics(team._id, currentSeason);
      }
      
      logger.info(`Scheduled metrics calculation for ${activeTeams.length} active teams`);
    } catch (error) {
      logger.error(`Error scheduling metrics for active teams: ${error.message}`, { error });
    }
  }
  
  /**
   * Get all active teams that need metrics calculation
   * This is a placeholder - implement based on your data model
   */
  async getActiveTeams() {
    // Example implementation - adjust based on your Team model
    const Team = require('../../models/Team');
    return Team.find({ isActive: true }).select('_id').lean();
  }
  
  /**
   * Initialize the scheduler
   */
  async init() {
    if (!cron) {
      logger.warn('node-cron not installed; performance scheduling is disabled. Set REDIS_URL and install node-cron to enable.');
      return;
    }
    // Schedule initial jobs
    await this.scheduleAllActiveTeams();
    
    // Schedule a daily check for new teams or season changes
    cron.schedule('0 1 * * *', () => this.scheduleAllActiveTeams(), {
      timezone: 'America/New_York'
    });
    
    logger.info('Performance metrics scheduler initialized');
  }
  
  /**
   * Stop all scheduled jobs
   */
  stop() {
    for (const [jobId, job] of this.jobs.entries()) {
      job.stop();
      logger.info(`Stopped scheduled job: ${jobId}`);
    }
    
    this.jobs.clear();
    logger.info('Stopped all performance metric jobs');
  }
}

// Export a singleton instance
module.exports = new PerformanceScheduler();
