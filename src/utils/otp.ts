import { getRedisClient } from '../config/redis';
import { logger } from './logger';

const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 300; // 5 minutes
const OTP_RETRY_DELAY_SECONDS = 60; // 1 minute between requests

export interface OtpData {
  otp: string;
  expiresAt: number;
  attempts: number;
}

/**
 * Generate a random OTP
 */
export const generateOtp = (): string => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  return otp;
};

/**
 * Store OTP in Redis with expiry
 */
export const storeOtp = async (phoneNumber: string, otp: string): Promise<void> => {
  const redis = getRedisClient();
  const key = `otp:${phoneNumber}`;
  
  const otpData: OtpData = {
    otp,
    expiresAt: Date.now() + OTP_EXPIRY_SECONDS * 1000,
    attempts: 0,
  };
  
  await redis.setex(key, OTP_EXPIRY_SECONDS, JSON.stringify(otpData));
  logger.info(`OTP stored for ${phoneNumber}`);
};

/**
 * Verify OTP from Redis
 */
export const verifyOtp = async (phoneNumber: string, otp: string): Promise<boolean> => {
  const redis = getRedisClient();
  const key = `otp:${phoneNumber}`;
  
  const data = await redis.get(key);
  if (!data) {
    logger.warn(`OTP not found for ${phoneNumber}`);
    return false;
  }
  
  const otpData: OtpData = JSON.parse(data);
  
  // Check if OTP has expired
  if (Date.now() > otpData.expiresAt) {
    await redis.del(key);
    logger.warn(`OTP expired for ${phoneNumber}`);
    return false;
  }
  
  // Check if OTP matches
  if (otpData.otp !== otp) {
    // Increment attempts
    otpData.attempts += 1;
    const ttl = await redis.ttl(key);
    await redis.setex(key, ttl > 0 ? ttl : OTP_EXPIRY_SECONDS, JSON.stringify(otpData));
    logger.warn(`Invalid OTP attempt for ${phoneNumber}`);
    return false;
  }
  
  // Valid OTP - delete it
  await redis.del(key);
  logger.info(`OTP verified successfully for ${phoneNumber}`);
  return true;
};

/**
 * Check rate limit for OTP requests
 */
export const checkOtpRateLimit = async (phoneNumber: string): Promise<{
  allowed: boolean;
  retryAfter?: number;
  attempts?: number;
}> => {
  const redis = getRedisClient();
  const key = `otp:ratelimit:${phoneNumber}`;
  
  const attempts = await redis.incr(key);
  
  // First request - set expiry to 10 minutes
  if (attempts === 1) {
    await redis.expire(key, 600); // 10 minutes
  }
  
  // Check if exceeded limit (3 requests in 10 minutes)
  if (attempts > 3) {
    const ttl = await redis.ttl(key);
    return {
      allowed: false,
      retryAfter: ttl > 0 ? ttl : 600,
      attempts,
    };
  }
  
  return {
    allowed: true,
    attempts,
  };
};

/**
 * Check IP-based rate limit
 */
export const checkIpRateLimit = async (ip: string): Promise<{
  allowed: boolean;
  retryAfter?: number;
}> => {
  const redis = getRedisClient();
  const key = `otp:ratelimit:ip:${ip}`;
  
  const attempts = await redis.incr(key);
  
  // First request - set expiry to 1 hour
  if (attempts === 1) {
    await redis.expire(key, 3600); // 1 hour
  }
  
  // Check if exceeded limit (10 requests in 1 hour)
  if (attempts > 10) {
    const ttl = await redis.ttl(key);
    return {
      allowed: false,
      retryAfter: ttl > 0 ? ttl : 3600,
    };
  }
  
  return {
    allowed: true,
  };
};

/**
 * Mask phone number for display
 */
export const maskPhoneNumber = (phoneNumber: string): string => {
  // Format: +91-98765-XXXXX
  if (phoneNumber.startsWith('+91') && phoneNumber.length === 13) {
    return `+91-${phoneNumber.slice(3, 8)}-XXXXX`;
  }
  return phoneNumber.replace(/\d(?=\d{4})/g, 'X');
};

/**
 * Send OTP via SMS (mock implementation)
 * In production, integrate with SMS gateway like Twilio, AWS SNS, or MSG91
 */
export const sendOtpSms = async (phoneNumber: string, otp: string): Promise<boolean> => {
  try {
    // Mock SMS sending - in production, use actual SMS gateway
    logger.info(`[SMS] Sending OTP ${otp} to ${phoneNumber}`);
    
    // Simulate SMS gateway delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // In production, implement actual SMS sending:
    // const result = await smsGateway.send({
    //   to: phoneNumber,
    //   message: `Your OTP is: ${otp}. Valid for 5 minutes.`
    // });
    
    return true;
  } catch (error) {
    logger.error('Failed to send OTP SMS:', error);
    throw error;
  }
};
