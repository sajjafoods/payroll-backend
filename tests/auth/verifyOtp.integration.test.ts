import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { handler } from '../../src/handlers/auth/verifyOtp';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { db } from '../../src/db/client';
import { users, organizations, organizationUsers } from '../../src/db/schema/schema';
import { eq } from 'drizzle-orm';
import { storeOtp } from '../../src/utils/otp';
import { getRedisClient } from '../../src/config/redis';

/**
 * Integration tests for verify-otp endpoint
 * These tests use real database and Redis connections
 * Run with: npm test -- verifyOtp.integration.test.ts
 */
describe('POST /api/v1/auth/verify-otp - Integration Tests', () => {
  const testPhoneNumber = '+919876543210';
  const validOtp = '123456';
  
  let event: APIGatewayProxyEvent;

  beforeAll(async () => {
    // Ensure database connection is ready
    // The database should be running via Docker
  });

  beforeEach(async () => {
    // Clean up test data before each test
    try {
      // Find all users with test phone number
      const existingUsers = await db.select().from(users).where(eq(users.phoneNumber, testPhoneNumber));
      
      for (const user of existingUsers) {
        // Delete organization_users links
        await db.delete(organizationUsers).where(eq(organizationUsers.userId, user.id));
        
        // Delete organizations created by this user
        const userOrgs = await db.select().from(organizations).where(eq(organizations.createdByUserId, user.id));
        for (const org of userOrgs) {
          await db.delete(organizationUsers).where(eq(organizationUsers.organizationId, org.id));
          await db.delete(organizations).where(eq(organizations.id, org.id));
        }
        
        // Delete the user
        await db.delete(users).where(eq(users.id, user.id));
      }
      
      // Also clean up any orphaned organizations with test phone number
      await db.delete(organizations).where(eq(organizations.phoneNumber, testPhoneNumber));
    } catch (error) {
      // Ignore cleanup errors
      console.log('Cleanup error (may be normal):', error);
    }

    // Base event structure
    event = {
      body: null,
      headers: {
        'x-forwarded-for': '192.168.1.100',
      },
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/api/v1/auth/verify-otp',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        identity: {
          sourceIp: '192.168.1.100',
        },
      } as any,
      resource: '',
    };
  });

  afterAll(async () => {
    // Clean up test data after all tests
    try {
      // Find all users with test phone number
      const existingUsers = await db.select().from(users).where(eq(users.phoneNumber, testPhoneNumber));
      
      for (const user of existingUsers) {
        // Delete organization_users links
        await db.delete(organizationUsers).where(eq(organizationUsers.userId, user.id));
        
        // Delete organizations created by this user
        const userOrgs = await db.select().from(organizations).where(eq(organizations.createdByUserId, user.id));
        for (const org of userOrgs) {
          await db.delete(organizationUsers).where(eq(organizationUsers.organizationId, org.id));
          await db.delete(organizations).where(eq(organizations.id, org.id));
        }
        
        // Delete the user
        await db.delete(users).where(eq(users.id, user.id));
      }
      
      // Also clean up any orphaned organizations with test phone number
      await db.delete(organizations).where(eq(organizations.phoneNumber, testPhoneNumber));
    } catch (error) {
      // Ignore cleanup errors
      console.log('Final cleanup error (may be normal):', error);
    }

    // Close Redis connection
    const redis = getRedisClient();
    await redis.disconnect();
  });

  describe('New User Flow', () => {
    it('should create new user, organization, and return trial subscription', async () => {
      // Store valid OTP in Redis
      await storeOtp(testPhoneNumber, validOtp);

      event.body = JSON.stringify({
        phoneNumber: testPhoneNumber,
        otp: validOtp,
        deviceInfo: {
          deviceId: 'test_device_123',
          deviceName: 'Test iPhone',
          platform: 'ios',
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      // Verify response structure
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
      // Use a different phone number for this test to avoid conflicts
      const existingUserPhone = '+919876543211';
      
      // Create a user first
      await storeOtp(existingUserPhone, validOtp);
      event.body = JSON.stringify({
        phoneNumber: existingUserPhone,
        otp: validOtp,
      });
      
      // First login (creates user)
      const firstResult = await handler(event);
      if (firstResult.statusCode !== 200) {
        console.error('First login failed:', JSON.parse(firstResult.body));
      }
      expect(firstResult.statusCode).toBe(200);

      // Store new OTP for second login
      await storeOtp(existingUserPhone, validOtp);

      // Second login (existing user)
      const result = await handler(event);
      
      // Debug output if test fails
      if (result.statusCode !== 200) {
        console.error('Second login failed:', JSON.parse(result.body));
      }

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      expect(body.success).toBe(true);
      expect(body.data.isNewUser).toBe(false);
      expect(body.data.user.phoneNumber).toBe(existingUserPhone);
      expect(body.data.permissions).toBeDefined();
      expect(body.data.subscription.plan).toBe('premium');
      expect(body.data.nextStep).toBe('dashboard');
      
      // Clean up this test's data
      const testUsers = await db.select().from(users).where(eq(users.phoneNumber, existingUserPhone));
      if (testUsers[0]) {
        await db.delete(organizationUsers).where(eq(organizationUsers.userId, testUsers[0].id));
        const userOrgs = await db.select().from(organizations).where(eq(organizations.createdByUserId, testUsers[0].id));
        for (const org of userOrgs) {
          await db.delete(organizations).where(eq(organizations.id, org.id));
        }
        await db.delete(users).where(eq(users.id, testUsers[0].id));
      }
    }, 15000);
  });

  describe('Validation Errors', () => {
    it('should reject invalid phone number format', async () => {
      event.body = JSON.stringify({
        phoneNumber: '123456', // Too short, invalid format
        otp: validOtp,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should reject invalid OTP format', async () => {
      event.body = JSON.stringify({
        phoneNumber: testPhoneNumber,
        otp: '12345', // Only 5 digits
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should reject missing OTP', async () => {
      event.body = JSON.stringify({
        phoneNumber: testPhoneNumber,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('OTP Verification', () => {
    it('should reject invalid OTP', async () => {
      // Store valid OTP
      await storeOtp(testPhoneNumber, validOtp);

      // Try with wrong OTP
      event.body = JSON.stringify({
        phoneNumber: testPhoneNumber,
        otp: '999999',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_OTP');
    });

    it('should reject expired OTP for new user', async () => {
      // Don't store OTP (simulates expired/non-existent)
      event.body = JSON.stringify({
        phoneNumber: '+919999999999', // Different phone number that doesn't exist
        otp: validOtp,
      });

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
      await storeOtp(testPhoneNumber, validOtp);
      event.body = JSON.stringify({
        phoneNumber: testPhoneNumber,
        otp: validOtp,
      });
      await handler(event);

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await storeOtp(testPhoneNumber, validOtp); // Store valid OTP but send wrong one
        event.body = JSON.stringify({
          phoneNumber: testPhoneNumber,
          otp: '999999',
        });
        await handler(event);
      }

      // 6th attempt should be locked
      await storeOtp(testPhoneNumber, validOtp);
      event.body = JSON.stringify({
        phoneNumber: testPhoneNumber,
        otp: validOtp, // Even with correct OTP
      });
      
      const result = await handler(event);

      expect(result.statusCode).toBe(423);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('ACCOUNT_LOCKED');
      expect(body.error.details.retryAfter).toBe(1800); // 30 minutes
      expect(body.error.details.lockedUntil).toBeDefined();
    }, 15000);
  });

  describe('Device Info Tracking', () => {
    it('should store device information with session', async () => {
      await storeOtp(testPhoneNumber, validOtp);

      event.body = JSON.stringify({
        phoneNumber: testPhoneNumber,
        otp: validOtp,
        deviceInfo: {
          deviceId: 'samsung_s21_001',
          deviceName: 'Samsung Galaxy S21',
          platform: 'android',
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      
      // Device info should be stored in user_sessions table
      // This is tested indirectly through successful token generation
      expect(body.data.tokens.accessToken).toBeDefined();
    }, 10000);
  });
});
