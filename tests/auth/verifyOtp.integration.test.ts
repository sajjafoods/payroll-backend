import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { handler } from '../../src/handlers/auth/verifyOtp';
import { db } from '../../src/db/client';
import { users, organizations, organizationUsers } from '../../src/db/schema/schema';
import { eq } from 'drizzle-orm';
import { storeOtp } from '../../src/utils/otp';
import { 
  cleanupTestUser,
  teardownRedis,
  createMockEvent,
  generateUniquePhoneNumber,
  DEFAULT_TEST_OTP
} from '../helpers';

/**
 * Integration tests for verify-otp endpoint
 * These tests use real database and Redis connections
 * Run with: npm test -- verifyOtp.integration.test.ts
 */
describe('POST /api/v1/auth/verify-otp - Integration Tests', () => {
  const testPhoneNumber = generateUniquePhoneNumber();
  
  beforeEach(async () => {
    await cleanupTestUser(testPhoneNumber);
  });

  afterAll(async () => {
    await cleanupTestUser(testPhoneNumber);
    await teardownRedis();
  });

  describe('New User Flow', () => {
    it('should create new user, organization, and return trial subscription', async () => {
      await storeOtp(testPhoneNumber, DEFAULT_TEST_OTP);

      const event = createMockEvent({
        phoneNumber: testPhoneNumber,
        otp: DEFAULT_TEST_OTP,
        deviceInfo: {
          deviceId: 'test_device_123',
          deviceName: 'Test iPhone',
          platform: 'ios',
        },
      }, '/api/v1/auth/verify-otp');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      expect(body.success).toBe(true);
      expect(body.data.isNewUser).toBe(true);
      expect(body.data.user.phoneNumber).toBe(testPhoneNumber);
      expect(body.data.user.role).toBe('owner');
      expect(body.data.organization.name).toBe('My Business');
      expect(body.data.organization.setupComplete).toBe(false);
      expect(body.data.tokens.accessToken).toBeDefined();
      expect(body.data.tokens.refreshToken).toBeDefined();
      expect(body.data.subscription.plan).toBe('trial');
      expect(body.data.subscription.daysRemaining).toBe(14);
      expect(body.data.nextStep).toBe('complete_profile');

      // Verify user was created in database
      const createdUsers = await db.select().from(users).where(eq(users.phoneNumber, testPhoneNumber));
      expect(createdUsers).toHaveLength(1);
      expect(createdUsers[0].phoneVerified).toBe(true);

      // Verify organization was created
      const createdOrgs = await db.select().from(organizations).where(eq(organizations.phoneNumber, testPhoneNumber));
      expect(createdOrgs).toHaveLength(1);
      expect(createdOrgs[0].setupComplete).toBe(false);

      // Verify organization user link was created
      const orgUsers = await db.select().from(organizationUsers).where(eq(organizationUsers.userId, createdUsers[0].id));
      expect(orgUsers).toHaveLength(1);
      expect(orgUsers[0].role).toBe('owner');
      expect(orgUsers[0].permissions).toBeDefined();
    }, 10000);
  });

  describe('Existing User Flow', () => {
    it('should authenticate existing user and return premium subscription', async () => {
      const existingUserPhone = generateUniquePhoneNumber();
      
      // First login (creates user)
      await storeOtp(existingUserPhone, DEFAULT_TEST_OTP);
      const firstEvent = createMockEvent({
        phoneNumber: existingUserPhone,
        otp: DEFAULT_TEST_OTP,
      }, '/api/v1/auth/verify-otp');
      
      const firstResult = await handler(firstEvent);
      expect(firstResult.statusCode).toBe(200);

      // Second login (existing user)
      await storeOtp(existingUserPhone, DEFAULT_TEST_OTP);
      const secondEvent = createMockEvent({
        phoneNumber: existingUserPhone,
        otp: DEFAULT_TEST_OTP,
      }, '/api/v1/auth/verify-otp');
      
      const result = await handler(secondEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      expect(body.success).toBe(true);
      expect(body.data.isNewUser).toBe(false);
      expect(body.data.user.phoneNumber).toBe(existingUserPhone);
      expect(body.data.permissions).toBeDefined();
      expect(body.data.subscription.plan).toBe('premium');
      expect(body.data.nextStep).toBe('dashboard');
      
      // Cleanup
      await cleanupTestUser(existingUserPhone);
    }, 15000);
  });

  describe('Validation Errors', () => {
    it('should reject invalid phone number format', async () => {
      const event = createMockEvent({
        phoneNumber: '123456',
        otp: DEFAULT_TEST_OTP,
      }, '/api/v1/auth/verify-otp');

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should reject invalid OTP format', async () => {
      const event = createMockEvent({
        phoneNumber: testPhoneNumber,
        otp: '12345',
      }, '/api/v1/auth/verify-otp');

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should reject missing OTP', async () => {
      const event = createMockEvent({
        phoneNumber: testPhoneNumber,
      }, '/api/v1/auth/verify-otp');

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('OTP Verification', () => {
    it('should reject invalid OTP', async () => {
      await storeOtp(testPhoneNumber, DEFAULT_TEST_OTP);

      const event = createMockEvent({
        phoneNumber: testPhoneNumber,
        otp: '999999',
      }, '/api/v1/auth/verify-otp');

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_OTP');
    });

    it('should reject expired OTP for new user', async () => {
      const event = createMockEvent({
        phoneNumber: '+919999999999',
        otp: DEFAULT_TEST_OTP,
      }, '/api/v1/auth/verify-otp');

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_OTP');
    });
  });

  describe('Account Locking', () => {
    it('should lock account after 5 failed attempts', async () => {
      // Create user first
      await storeOtp(testPhoneNumber, DEFAULT_TEST_OTP);
      const createEvent = createMockEvent({
        phoneNumber: testPhoneNumber,
        otp: DEFAULT_TEST_OTP,
      }, '/api/v1/auth/verify-otp');
      await handler(createEvent);

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await storeOtp(testPhoneNumber, DEFAULT_TEST_OTP);
        const failEvent = createMockEvent({
          phoneNumber: testPhoneNumber,
          otp: '999999',
        }, '/api/v1/auth/verify-otp');
        await handler(failEvent);
      }

      // 6th attempt should be locked
      await storeOtp(testPhoneNumber, DEFAULT_TEST_OTP);
      const lockedEvent = createMockEvent({
        phoneNumber: testPhoneNumber,
        otp: DEFAULT_TEST_OTP,
      }, '/api/v1/auth/verify-otp');
      
      const result = await handler(lockedEvent);

      expect(result.statusCode).toBe(423);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('ACCOUNT_LOCKED');
      expect(body.error.details.retryAfter).toBe(1800);
      expect(body.error.details.lockedUntil).toBeDefined();
    }, 15000);
  });

  describe('Device Info Tracking', () => {
    it('should store device information with session', async () => {
      await storeOtp(testPhoneNumber, DEFAULT_TEST_OTP);

      const event = createMockEvent({
        phoneNumber: testPhoneNumber,
        otp: DEFAULT_TEST_OTP,
        deviceInfo: {
          deviceId: 'samsung_s21_001',
          deviceName: 'Samsung Galaxy S21',
          platform: 'android',
        },
      }, '/api/v1/auth/verify-otp');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.tokens.accessToken).toBeDefined();
    }, 10000);
  });
});
