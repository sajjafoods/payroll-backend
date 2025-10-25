/**
 * Test helpers barrel export
 * Provides a single import point for all test utilities
 */

// Database helpers
export {
  cleanupTestUser,
  cleanupTestUsers,
  cleanupTestUserById,
} from './database.helper';

// Redis helpers
export {
  setupRedisForTests,
  clearOtpRateLimits,
  teardownRedis,
  clearRedisPattern,
} from './redis.helper';

// Event helpers
export {
  createMockEvent,
  createAuthenticatedMockEvent,
  createSendOtpEvent,
  createVerifyOtpEvent,
} from './event.helper';

// Auth helpers
export {
  createTestSession,
  createMultipleTestSessions,
  type TestAuthSession,
} from './auth.helper';

// Fixtures
export {
  generateUniquePhoneNumber,
  generateTestOrgData,
  generateUniquePhoneNumbers,
  DEFAULT_TEST_OTP,
  TEST_DEVICE_INFO,
  TEST_DEVICE_INFO_ANDROID,
  TEST_DEVICE_INFO_IOS,
} from './fixtures.helper';
