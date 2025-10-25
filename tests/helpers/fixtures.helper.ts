/**
 * Generate a unique phone number for testing
 * Format: +9198765432XX where XX is random
 */
export function generateUniquePhoneNumber(): string {
  return `+9198765432${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
}

/**
 * Generate test organization data with unique identifiers
 */
export function generateTestOrgData(suffix: string) {
  return {
    name: `Test Organization ${suffix}`,
    phoneNumber: generateUniquePhoneNumber(),
    email: `test-${suffix}-${Date.now()}@example.com`,
  };
}

/**
 * Generate multiple unique phone numbers
 */
export function generateUniquePhoneNumbers(count: number): string[] {
  return Array.from({ length: count }, () => generateUniquePhoneNumber());
}

/**
 * Default OTP for testing
 */
export const DEFAULT_TEST_OTP = '123456';

/**
 * Default device info for testing
 */
export const TEST_DEVICE_INFO = {
  deviceId: 'test_device',
  deviceName: 'Test Device',
  platform: 'web' as const,
};

/**
 * Alternative device info for multi-device testing
 */
export const TEST_DEVICE_INFO_ANDROID = {
  deviceId: 'test_device_android',
  deviceName: 'Test Android Device',
  platform: 'android' as const,
};

export const TEST_DEVICE_INFO_IOS = {
  deviceId: 'test_device_ios',
  deviceName: 'Test iOS Device',
  platform: 'ios' as const,
};
