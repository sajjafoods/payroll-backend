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
import { 
  findUserByPhoneNumber,
  createUser,
  createOrganization,
  createOrganizationUser,
  getUserWithOrganization,
  createUserSession,
  updateUserLogin,
  incrementFailedLoginAttempts,
  lockUserAccount,
  isUserAccountLocked,
  getDefaultOwnerPermissions,
} from '../repositories/auth.repository';
import { 
  generateTokenPair, 
  hashRefreshToken, 
  calculateTokenExpiry 
} from '../utils/jwt';
import { randomUUID } from 'crypto';

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
 * Verify OTP and authenticate user
 */
export const verifyOtpAndAuthenticate = async (
  phoneNumber: string,
  otp: string,
  deviceInfo?: {
    deviceId?: string;
    deviceName?: string;
    platform?: 'web' | 'android' | 'ios';
  },
  ipAddress?: string
): Promise<any> => {
  try {
    // Verify OTP
    const isValid = await verifyOtpUtil(phoneNumber, otp);
    
    if (!isValid) {
      // Try to find user to increment failed attempts
      const existingUser = await findUserByPhoneNumber(phoneNumber);
      if (existingUser) {
        const updated = await incrementFailedLoginAttempts(existingUser.id as string);
        
        // Lock account if too many failed attempts (5+)
        if (updated && updated.failedLoginAttempts >= 5) {
          const lockedUntil = await lockUserAccount(existingUser.id as string);
          throw new AppError(
            ErrorCode.ACCOUNT_LOCKED,
            'Too many failed attempts. Account locked for 30 minutes',
            423,
            {
              lockedUntil: lockedUntil.toISOString(),
              retryAfter: 1800,
            }
          );
        }

        throw new AppError(
          ErrorCode.INVALID_OTP,
          'OTP is invalid or expired',
          401,
          {
            attemptsRemaining: Math.max(0, 5 - (updated?.failedLoginAttempts || 0)),
          }
        );
      }

      throw new AppError(
        ErrorCode.INVALID_OTP,
        'OTP is invalid or expired',
        401
      );
    }

    // Find or create user
    let user = await findUserByPhoneNumber(phoneNumber);
    let isNewUser = false;

    if (!user) {
      // Create new user
      isNewUser = true;
      const defaultName = `User ${phoneNumber.slice(-4)}`;
      user = await createUser({
        phoneNumber,
        name: defaultName,
      });

      // Create default organization
      const org = await createOrganization({
        name: 'My Business',
        phoneNumber,
        createdByUserId: user.id as string,
      });

      // Link user to organization with owner role
      const permissions = getDefaultOwnerPermissions();
      await createOrganizationUser(
        org.id as string,
        user.id as string,
        'owner',
        permissions
      );
    } else {
      // Check if account is locked
      const lockStatus = await isUserAccountLocked(user.id as string);
      if (lockStatus.isLocked) {
        throw new AppError(
          ErrorCode.ACCOUNT_LOCKED,
          'Too many failed attempts. Account locked for 30 minutes',
          423,
          {
            lockedUntil: lockStatus.lockedUntil,
            retryAfter: lockStatus.retryAfter,
          }
        );
      }
    }

    // Get user with organization details
    const userWithOrg = await getUserWithOrganization(user.id as string);

    // Generate unique session ID for this login
    const sessionId = randomUUID();

    // Generate JWT tokens with unique session ID
    const tokens = generateTokenPair({
      userId: user.id as string,
      organizationId: userWithOrg?.orgId as string || '',
      role: userWithOrg?.role as string || 'owner',
      sessionId,
    });

    // Store refresh token session
    const tokenHash = hashRefreshToken(tokens.refreshToken);
    const expiresAt = calculateTokenExpiry('7d');
    
    await createUserSession({
      userId: user.id as string,
      refreshTokenHash: tokenHash,
      deviceId: deviceInfo?.deviceId,
      deviceName: deviceInfo?.deviceName,
      platform: deviceInfo?.platform || 'web',
      ipAddress,
      expiresAt,
    });

    // Update user login info
    await updateUserLogin(user.id as string, ipAddress);

    // Build response
    const response = {
      isNewUser,
      user: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        name: userWithOrg?.userName || user.name,
        email: userWithOrg?.email || user.email,
        role: userWithOrg?.role || 'owner',
        avatar: userWithOrg?.avatarUrl,
        createdAt: user.createdAt,
      },
      organization: {
        id: userWithOrg?.orgId,
        name: userWithOrg?.orgName || 'My Business',
        isDefault: isNewUser,
        setupComplete: userWithOrg?.setupComplete || false,
        address: userWithOrg?.orgAddress,
        employeeCount: userWithOrg?.employeeCount || 0,
        createdAt: userWithOrg?.orgCreatedAt,
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        tokenType: tokens.tokenType,
      },
      subscription: isNewUser
        ? {
            plan: 'trial',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            daysRemaining: 14,
          }
        : {
            plan: 'premium',
            status: 'active',
            renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
      nextStep: isNewUser ? 'complete_profile' : 'dashboard',
    };

    // Add permissions for existing users
    if (!isNewUser && userWithOrg?.permissions) {
      (response as any).permissions = userWithOrg.permissions;
    }

    return response;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error('Error in verifyOtpAndAuthenticate service:', error);
    throw new AppError(
      ErrorCode.AUTHENTICATION_ERROR,
      'Failed to authenticate. Please try again',
      500
    );
  }
};
