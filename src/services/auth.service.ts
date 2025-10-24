import { 
  generateOtp, 
  storeOtp, 
  verifyOtp as verifyOtpUtil,
  sendOtpSms,
  checkOtpRateLimit,
  checkIpRateLimit,
  maskPhoneNumber,
} from '../utils/otp';
import { AppError, ErrorCode, SendOtpResponse } from '../types/api.types';
import { logger } from '../utils/logger';

/**
 * Send OTP to phone number
 */
export const sendOtp = async (
  phoneNumber: string,
  clientIp: string
): Promise<SendOtpResponse> => {
  try {
    // Check phone number rate limit (3 requests in 10 minutes)
    const phoneRateLimit = await checkOtpRateLimit(phoneNumber);
    if (!phoneRateLimit.allowed) {
      throw new AppError(
        ErrorCode.TOO_MANY_OTP_REQUESTS,
        'Too many OTP requests. Please try after 10 minutes',
        429,
        {
          retryAfter: phoneRateLimit.retryAfter,
          maxAttempts: 3,
        }
      );
    }

    // Check IP rate limit (10 requests in 1 hour)
    const ipRateLimit = await checkIpRateLimit(clientIp);
    if (!ipRateLimit.allowed) {
      throw new AppError(
        ErrorCode.TOO_MANY_REQUESTS,
        'Too many OTP requests from this IP. Please try later',
        429,
        {
          retryAfter: ipRateLimit.retryAfter,
        }
      );
    }

    // Generate OTP
    const otp = generateOtp();
    logger.info(`Generated OTP for ${phoneNumber}`);

    // Store OTP in Redis
    await storeOtp(phoneNumber, otp);

    // Send OTP via SMS
    try {
      await sendOtpSms(phoneNumber, otp);
    } catch (error) {
      logger.error('Failed to send OTP SMS:', error);
      throw new AppError(
        ErrorCode.SMS_SERVICE_ERROR,
        'Failed to send OTP. Please try again',
        500
      );
    }

    // Return success response
    const maskedPhone = maskPhoneNumber(phoneNumber);
    return {
      otpSent: true,
      expiresIn: 300, // 5 minutes
      message: `OTP sent to ${maskedPhone}`,
      retryAfter: 60, // 1 minute
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Error in sendOtp service:', error);
    throw new AppError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'An unexpected error occurred',
      500
    );
  }
};

/**
 * Verify OTP
 */
export const verifyOtp = async (
  phoneNumber: string,
  otp: string
): Promise<boolean> => {
  try {
    const isValid = await verifyOtpUtil(phoneNumber, otp);
    
    if (!isValid) {
      throw new AppError(
        ErrorCode.OTP_INVALID,
        'Invalid or expired OTP',
        400
      );
    }

    return true;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Error in verifyOtp service:', error);
    throw new AppError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'An unexpected error occurred',
      500
    );
  }
};
