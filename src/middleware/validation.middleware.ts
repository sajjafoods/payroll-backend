import { z } from 'zod';
import { AppError, ErrorCode } from '../types/api.types';

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
  countryCode: z.string().optional().default('+91'),
});

/**
 * Verify OTP request validation schema
 */
export const verifyOtpRequestSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().length(6, 'OTP must be 6 digits'),
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
