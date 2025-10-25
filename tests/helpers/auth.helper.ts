import { handler as verifyOtpHandler } from '../../src/handlers/auth/verifyOtp';
import { storeOtp } from '../../src/utils/otp';
import { createMockEvent } from './event.helper';

/**
 * Test authentication session data
 */
export interface TestAuthSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  organizationId: string;
}

/**
 * Create a test session by simulating login flow
 * Returns tokens and user/org IDs for use in authenticated tests
 */
export async function createTestSession(
  phoneNumber: string,
  otp: string = '123456'
): Promise<TestAuthSession> {
  // Store OTP in Redis
  await storeOtp(phoneNumber, otp);
  
  // Create login event
  const loginEvent = createMockEvent({
    phoneNumber,
    otp,
    deviceInfo: {
      deviceId: 'test_device',
      deviceName: 'Test Device',
      platform: 'web',
    },
  }, '/api/v1/auth/verify-otp');

  // Call verify OTP handler
  const result = await verifyOtpHandler(loginEvent);
  const body = JSON.parse(result.body);
  
  if (!body.success) {
    throw new Error(`Failed to create test session: ${JSON.stringify(body)}`);
  }
  
  return {
    userId: body.data.user.id,
    accessToken: body.data.tokens.accessToken,
    refreshToken: body.data.tokens.refreshToken,
    organizationId: body.data.organization.id,
  };
}

/**
 * Create multiple test sessions
 */
export async function createMultipleTestSessions(
  phoneNumbers: string[],
  otp: string = '123456'
): Promise<TestAuthSession[]> {
  return Promise.all(
    phoneNumbers.map(phoneNumber => createTestSession(phoneNumber, otp))
  );
}
