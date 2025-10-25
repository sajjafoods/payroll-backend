/**
 * Application constants
 */

/**
 * Industry types for organizations
 */
export const INDUSTRY_TYPES = [
  'retail',
  'manufacturing',
  'services',
  'hospitality',
  'construction',
  'healthcare',
  'education',
  'transportation',
  'agriculture',
  'other',
] as const;

export type IndustryType = typeof INDUSTRY_TYPES[number];

/**
 * User roles
 */
export const USER_ROLES = ['owner', 'admin', 'manager', 'employee'] as const;

export type UserRole = typeof USER_ROLES[number];

/**
 * Platform types
 */
export const PLATFORM_TYPES = ['web', 'android', 'ios'] as const;

export type PlatformType = typeof PLATFORM_TYPES[number];

/**
 * Default country code for phone numbers
 */
export const DEFAULT_COUNTRY_CODE = '+91';

/**
 * JWT token format regex
 */
export const JWT_TOKEN_REGEX = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;

/**
 * Failed login attempt limits
 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const ACCOUNT_LOCK_DURATION_MINUTES = 30;

/**
 * OTP settings
 */
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_SECONDS = 300; // 5 minutes
export const OTP_RETRY_AFTER_SECONDS = 60; // 1 minute
export const MAX_OTP_REQUESTS_PER_PHONE = 3;
export const OTP_RATE_LIMIT_WINDOW_MINUTES = 10;
export const MAX_OTP_REQUESTS_PER_IP = 10;
export const IP_RATE_LIMIT_WINDOW_HOURS = 1;
