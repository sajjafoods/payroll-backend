import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err: Error) {
        logger.error('Redis connection error:', err);
        return true;
      },
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('error', (err: Error) => {
      logger.error('Redis client error:', err);
    });

    redisClient.on('close', () => {
      logger.warn('Redis client connection closed');
    });
  }

  return redisClient;
};

export const closeRedisConnection = async (): Promise<void> => {
  if (redisClient) {
    // Remove all event listeners to prevent logging after tests are done
    redisClient.removeAllListeners();
    await redisClient.quit();
    redisClient = null;
  }
};
