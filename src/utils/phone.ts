import { DEFAULT_COUNTRY_CODE } from '../config/constants';

/**
 * Normalize phone number to include country code
 * If phone number doesn't start with +91, adds it
 */
export const normalizePhoneNumber = (phoneNumber: string, countryCode: string = DEFAULT_COUNTRY_CODE): string => {
  // If phone number already has country code, return as is
  if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  }
  
  // If phone number doesn't start with country code, add it
  if (!phoneNumber.startsWith(countryCode)) {
    return `${countryCode}${phoneNumber}`;
  }
  
  return phoneNumber;
};

/**
 * Mask phone number for display/logging
 * Shows only last 4 digits
 * Example: +91XXXXXXXXXX -> +91XXXXXX1234
 */
export const maskPhoneNumber = (phoneNumber: string): string => {
  if (phoneNumber.length <= 4) {
    return phoneNumber;
  }
  
  const visibleDigits = phoneNumber.slice(-4);
  const maskedPart = phoneNumber.slice(0, -4).replace(/\d/g, 'X');
  
  return `${maskedPart}${visibleDigits}`;
};

/**
 * Validate phone number format (basic validation)
 */
export const isValidPhoneFormat = (phoneNumber: string): boolean => {
  // Check if it matches Indian phone number format with +91
  const indianPhoneRegex = /^\+91[6-9]\d{9}$/;
  return indianPhoneRegex.test(phoneNumber);
};

/**
 * Extract country code from phone number
 */
export const extractCountryCode = (phoneNumber: string): string | null => {
  const match = phoneNumber.match(/^(\+\d{1,3})/);
  return match ? match[1] : null;
};

/**
 * Remove country code from phone number
 */
export const removeCountryCode = (phoneNumber: string): string => {
  // Remove +91 or any country code prefix
  return phoneNumber.replace(/^\+\d{1,3}/, '');
};
