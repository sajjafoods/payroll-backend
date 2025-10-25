import { getRedisClient } from '../../src/config/redis';

/**
 * Setup Redis for tests - flush all data
 */
export async function setupRedisForTests(): Promise<void> {
  const redis = getRedisClient();
  await redis.flushdb();
}

/**
 * Clear OTP rate limit keys from Redis
 */
export async function clearOtpRateLimits(): Promise<void> {
  const redis = getRedisClient();
  const keys = await redis.keys('otp:ratelimit:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Teardown Redis connection after tests
 */
export async function teardownRedis(): Promise<void> {
  const redis = getRedisClient();
  await redis.disconnect();
}

/**
 * Clear all Redis keys matching a pattern
 */
export async function clearRedisPattern(pattern: string): Promise<void> {
  const redis = getRedisClient();
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
