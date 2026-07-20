const logger = require('../../utils/logger');

class PerformanceCache {
  constructor() {
    this.redis = null;
    this.cacheEnabled = !!process.env.REDIS_URL;
    this.cacheTtl = parseInt(process.env.CACHE_TTL || '3600', 10); // Default 1 hour
    
    if (this.cacheEnabled) {
      try {
        // Lazy-load ioredis only if needed
        // eslint-disable-next-line global-require, import/no-extraneous-dependencies
        const Redis = require('ioredis');
        this.redis = new Redis(process.env.REDIS_URL);
        logger.info('Redis cache connected');
        
        // Handle Redis connection errors
        this.redis.on('error', (error) => {
          logger.error('Redis error:', error);
          this.cacheEnabled = false; // Disable cache on error
        });
        
        this.redis.on('connect', () => {
          this.cacheEnabled = true;
          logger.info('Redis reconnected');
        });
        
      } catch (error) {
        logger.warn('Redis disabled (ioredis not installed or connection failed). Continuing without cache.');
        this.cacheEnabled = false;
        this.redis = null;
      }
    }
  }
  
  /**
   * Generate a cache key for performance metrics
   */
  _getCacheKey(type, ...ids) {
    return `perf:${type}:${ids.join(':')}`;
  }
  
  /**
   * Get cached performance metrics
   */
  async get(cacheKey) {
    if (!this.cacheEnabled || !this.redis) return null;
    
    try {
      const cachedData = await this.redis.get(cacheKey);
      if (cachedData) {
        logger.debug(`Cache hit for key: ${cacheKey}`);
        return JSON.parse(cachedData);
      }
      return null;
    } catch (error) {
      logger.error(`Error getting from cache (${cacheKey}):`, error);
      return null;
    }
  }
  
  /**
   * Set performance metrics in cache
   */
  async set(cacheKey, data, ttl = null) {
    if (!this.cacheEnabled || !this.redis) return;
    
    try {
      const ttlToUse = ttl !== null ? ttl : this.cacheTtl;
      await this.redis.set(
        cacheKey,
        JSON.stringify(data),
        'EX',
        ttlToUse
      );
      logger.debug(`Cached data for key: ${cacheKey} (TTL: ${ttlToUse}s)`);
    } catch (error) {
      logger.error(`Error setting cache (${cacheKey}):`, error);
    }
  }
  
  /**
   * Invalidate cache for specific keys
   */
  async invalidate(keys) {
    if (!this.cacheEnabled || !this.redis) return;
    
    try {
      const keysToDelete = Array.isArray(keys) ? keys : [keys];
      if (keysToDelete.length > 0) {
        await this.redis.del(keysToDelete);
        logger.debug(`Invalidated cache for keys: ${keysToDelete.join(', ')}`);
      }
    } catch (error) {
      logger.error('Error invalidating cache:', error);
    }
  }
  
  /**
   * Invalidate all performance-related cache
   */
  async invalidateAll() {
    if (!this.cacheEnabled || !this.redis) return;
    
    try {
      const stream = this.redis.scanStream({
        match: 'perf:*',
        count: 100
      });
      
      let keys = [];
      
      return new Promise((resolve, reject) => {
        stream.on('data', (resultKeys) => {
          if (resultKeys.length > 0) {
            keys = keys.concat(resultKeys);
          }
        });
        
        stream.on('end', async () => {
          if (keys.length > 0) {
            await this.redis.del(keys);
            logger.info(`Invalidated ${keys.length} performance cache entries`);
          }
          resolve(keys.length);
        });
        
        stream.on('error', (err) => {
          logger.error('Error scanning Redis for cache invalidation:', err);
          reject(err);
        });
      });
    } catch (error) {
      logger.error('Error in cache invalidation:', error);
      throw error;
    }
  }
  
  /**
   * Get team season metrics with cache support
   */
  async getTeamMetrics(teamId, season) {
    const cacheKey = this._getCacheKey('team', teamId, season);
    const cachedData = await this.get(cacheKey);
    
    if (cachedData) {
      return {
        ...cachedData,
        _cached: true
      };
    }
    
    return null;
  }
  
  /**
   * Set team season metrics with cache support
   */
  async setTeamMetrics(teamId, season, data) {
    const cacheKey = this._getCacheKey('team', teamId, season);
    await this.set(cacheKey, data);
    return data;
  }
  
  /**
   * Invalidate team-related cache
   */
  async invalidateTeam(teamId, season = null) {
    const keys = [];
    
    if (season) {
      // Invalidate specific team/season
      keys.push(this._getCacheKey('team', teamId, season));
    } else {
      // Invalidate all seasons for this team
      const pattern = this._getCacheKey('team', teamId, '*');
      const stream = this.redis.scanStream({
        match: pattern,
        count: 100
      });
      
      for await (const resultKeys of stream) {
        if (resultKeys.length > 0) {
          keys.push(...resultKeys);
        }
      }
    }
    
    if (keys.length > 0) {
      await this.invalidate(keys);
    }
    
    return keys.length;
  }
}

// Export a singleton instance
module.exports = new PerformanceCache();
