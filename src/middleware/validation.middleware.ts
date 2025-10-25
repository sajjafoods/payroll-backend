import { z } from 'zod';
import { AppError, ErrorCode } from '../types/api.types';
import { INDUSTRY_TYPES, PLATFORM_TYPES, OTP_LENGTH, DEFAULT_COUNTRY_CODE } from '../config/constants';

/**
 * Phone number validation schema for Indian mobile numbers
 * Accepts phone numbers with or without country code
 */
export const phoneNumberSchema = z.string()
  .regex(/^(\+91)?[6-9]\d{9}$/, {
    message: 'Phone number format is invalid. Expected format: +91XXXXXXXXXX or XXXXXXXXXX',
  });

/**
 * Final phone number validation (after country code is applied)
 */
export const finalPhoneNumberSchema = z.string()
  .regex(/^\+91[6-9]\d{9}$/, {
    message: 'Phone number format is invalid. Expected format: +91XXXXXXXXXX',
  });

/**
 * Send OTP request validation schema
 */
export const sendOtpRequestSchema = z.object({
  phoneNumber: phoneNumberSchema,
  countryCode: z.string().optional().default(DEFAULT_COUNTRY_CODE),
});

/**
 * Verify OTP request validation schema with device info
 */
export const verifyOtpRequestSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().length(OTP_LENGTH, `OTP must be ${OTP_LENGTH} digits`).regex(/^\d{6}$/, 'OTP must contain only digits'),
  deviceInfo: z.object({
    deviceId: z.string().optional(),
    deviceName: z.string().optional(),
    platform: z.enum(PLATFORM_TYPES).optional(),
  }).optional(),
});

/**
 * Complete profile request validation schema
 */
export const completeProfileSchema = z.object({
  ownerName: z.string()
    .min(2, 'Owner name must be at least 2 characters')
    .max(100, 'Owner name must not exceed 100 characters'),
  organizationName: z.string()
    .min(2, 'Organization name must be at least 2 characters')
    .max(100, 'Organization name must not exceed 100 characters'),
  organizationAddress: z.string()
    .max(500, 'Organization address must not exceed 500 characters')
    .optional(),
  industry: z.enum(INDUSTRY_TYPES).optional(),
  employeeCount: z.number()
    .int('Employee count must be a whole number')
    .min(1, 'Employee count must be at least 1')
    .max(10000, 'Employee count must not exceed 10000')
    .optional(),
  gstNumber: z.string()
    .regex(
      /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
      'Invalid GST number format'
    )
    .optional(),
  panNumber: z.string()
    .regex(
      /^[A-Z]{5}\d{4}[A-Z]{1}$/,
      'Invalid PAN number format'
    )
    .optional(),
});

/**
 * Refresh token request validation schema
 */
export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

/**
 * Logout request validation schema
 */
export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  logoutAllDevices: z.boolean().optional().default(false),
});

/**
 * Validate phone number format
 */
export const validatePhoneNumber = (phoneNumber: string): void => {
  try {
    phoneNumberSchema.parse(phoneNumber);
  } catch (error) {
    throw new AppError(
      ErrorCode.INVALID_PHONE_NUMBER,
      'Phone number format is invalid',
      400,
      {
        field: 'phoneNumber',
        expectedFormat: '+91XXXXXXXXXX',
      }
    );
  }
};

/**
 * Extract client IP from AWS Lambda event
 */
export const extractClientIp = (event: any): string => {
  // Try to get IP from various sources
  const ip = 
    event.requestContext?.http?.sourceIp ||
    event.requestContext?.identity?.sourceIp ||
    event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.headers?.['x-real-ip'] ||
    '0.0.0.0';
  
  return ip;
};
