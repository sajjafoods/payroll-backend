import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { handler } from '../../src/handlers/auth/logout';
import { handler as verifyOtpHandler } from '../../src/handlers/auth/verifyOtp';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { db } from '../../src/db/client';
import { users, organizations, organizationUsers, userSessions } from '../../src/db/schema/schema';
import { eq, and } from 'drizzle-orm';
import { storeOtp } from '../../src/utils/otp';
import { getRedisClient } from '../../src/config/redis';
import { hashRefreshToken } from '../../src/utils/jwt';

/**
 * Integration tests for logout endpoint
 * These tests use real database and Redis connections
 * Run with: npm test -- logout.integration.test.ts
 */
describe('POST /api/v1/auth/logout - Integration Tests', () => {
  const testPhoneNumber = '+919876543298';
  const validOtp = '123456';
  
  let event: APIGatewayProxyEvent;
  let validRefreshToken: string;
  let validAccessToken: string;
  let testUserId: string;

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
        // Delete user sessions
        await db.delete(userSessions).where(eq(userSessions.userId, user.id));
        
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

    // Create a fresh user with valid session for testing
    await storeOtp(testPhoneNumber, validOtp);
    
    const loginEvent: APIGatewayProxyEvent = {
      body: JSON.stringify({
        phoneNumber: testPhoneNumber,
        otp: validOtp,
        deviceInfo: {
          deviceId: 'test_device_logout',
          deviceName: 'Test Device',
          platform: 'web',
        },
      }),
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

    const loginResult = await verifyOtpHandler(loginEvent);
    const loginBody = JSON.parse(loginResult.body);
    
    if (loginBody.success) {
      validRefreshToken = loginBody.data.tokens.refreshToken;
      validAccessToken = loginBody.data.tokens.accessToken;
      testUserId = loginBody.data.user.id;
    }

    // Base event structure for logout tests
    event = {
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/api/v1/auth/logout',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        requestId: 'test-request-id',
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
      const existingUsers = await db.select().from(users).where(eq(users.phoneNumber, testPhoneNumber));
      
      for (const user of existingUsers) {
        await db.delete(userSessions).where(eq(userSessions.userId, user.id));
        await db.delete(organizationUsers).where(eq(organizationUsers.userId, user.id));
        
        const userOrgs = await db.select().from(organizations).where(eq(organizations.createdByUserId, user.id));
        for (const org of userOrgs) {
          await db.delete(organizationUsers).where(eq(organizationUsers.organizationId, org.id));
          await db.delete(organizations).where(eq(organizations.id, org.id));
        }
        
        await db.delete(users).where(eq(users.id, user.id));
      }
      
      await db.delete(organizations).where(eq(organizations.phoneNumber, testPhoneNumber));
    } catch (error) {
      console.log('Final cleanup error (may be normal):', error);
    }

    // Close Redis connection
    const redis = getRedisClient();
    await redis.disconnect();
  });

  describe('Success Cases', () => {
    it('should logout from current device successfully', async () => {
      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });
      event.headers = {
        Authorization: `Bearer ${validAccessToken}`,
      };

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Successfully logged out');
      expect(body.data.devicesLoggedOut).toBe(1);
      
      // Verify session was revoked in database
      const tokenHash = hashRefreshToken(validRefreshToken);
      const sessions = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.refreshTokenHash, tokenHash));
      
      expect(sessions.length).toBe(1);
      expect(sessions[0].isActive).toBe(false);
      expect(sessions[0].revokedReason).toBe('user_logout');
    }, 10000);

    it('should logout from all devices when logoutAllDevices is true', async () => {
      // Create second session
      await storeOtp(testPhoneNumber, validOtp);
      
      const loginEvent2: APIGatewayProxyEvent = {
        body: JSON.stringify({
          phoneNumber: testPhoneNumber,
          otp: validOtp,
          deviceInfo: {
            deviceId: 'test_device_logout_2',
            deviceName: 'Test Device 2',
            platform: 'android',
          },
        }),
        headers: {
          'x-forwarded-for': '192.168.1.101',
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
            sourceIp: '192.168.1.101',
          },
        } as any,
        resource: '',
      };
      await verifyOtpHandler(loginEvent2);
      
      // Create third session
      await storeOtp(testPhoneNumber, validOtp);
      const loginEvent3: APIGatewayProxyEvent = {
        body: JSON.stringify({
          phoneNumber: testPhoneNumber,
          otp: validOtp,
          deviceInfo: {
            deviceId: 'test_device_logout_3',
            deviceName: 'Test Device 3',
            platform: 'ios',
          },
        }),
        headers: {
          'x-forwarded-for': '192.168.1.102',
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
            sourceIp: '192.168.1.102',
          },
        } as any,
        resource: '',
      };
      await verifyOtpHandler(loginEvent3);

      // Verify we have 3 active sessions
      const beforeSessions = await db
        .select()
        .from(userSessions)
        .where(and(
          eq(userSessions.userId, testUserId),
          eq(userSessions.isActive, true)
        ));
      expect(beforeSessions.length).toBe(3);

      // Logout from all devices
      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
        logoutAllDevices: true,
      });
      event.headers = {
        Authorization: `Bearer ${validAccessToken}`,
      };

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Successfully logged out from all devices');
      expect(body.data.devicesLoggedOut).toBe(3);
      
      // Verify all sessions were revoked
      const afterSessions = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.userId, testUserId));
      
      expect(afterSessions.length).toBe(3);
      afterSessions.forEach(session => {
        expect(session.isActive).toBe(false);
        expect(session.revokedReason).toBe('user_logout_all_devices');
      });
    }, 15000);
  });

  describe('Authentication Errors - 401', () => {
    it('should return 401 when Authorization header is missing', async () => {
      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });
      // No Authorization header

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Missing Authorization header');
    });

    it('should return 401 when access token is invalid', async () => {
      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });
      event.headers = {
        Authorization: 'Bearer invalid.access.token',
      };

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when refresh token does not exist in database', async () => {
      // Use a valid JWT format but not in database
      const fakeRefreshToken = validRefreshToken.slice(0, -10) + 'fakefake12';
      
      event.body = JSON.stringify({
        refreshToken: fakeRefreshToken,
      });
      event.headers = {
        Authorization: `Bearer ${validAccessToken}`,
      };

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('Validation Errors - 400', () => {
    it('should return 400 when refreshToken is missing', async () => {
      event.body = JSON.stringify({});
      event.headers = {
        Authorization: `Bearer ${validAccessToken}`,
      };

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_REQUIRED_FIELD');
      expect(body.error.message).toBe('Validation failed');
      expect(body.error.details.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'refreshToken',
          })
        ])
      );
    });

    it('should return 400 when refreshToken format is invalid', async () => {
      event.body = JSON.stringify({
        refreshToken: 'not-a-valid-jwt',
      });
      event.headers = {
        Authorization: `Bearer ${validAccessToken}`,
      };

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should return 400 when request body is invalid JSON', async () => {
      event.body = 'invalid-json{';
      event.headers = {
        Authorization: `Bearer ${validAccessToken}`,
      };

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('Authorization Errors - 403', () => {
    it('should return 403 when session is already revoked', async () => {
      // Revoke the session first
      const tokenHash = hashRefreshToken(validRefreshToken);
      await db
        .update(userSessions)
        .set({
          isActive: false,
          revokedAt: new Date().toISOString(),
          revokedReason: 'test_revocation',
        })
        .where(eq(userSessions.refreshTokenHash, tokenHash));

      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });
      event.headers = {
        Authorization: `Bearer ${validAccessToken}`,
      };

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('TOKEN_REVOKED');
      expect(body.error.message).toBe('This session has been terminated. Please login again');
    }, 10000);
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in success response', async () => {
      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });
      event.headers = {
        Authorization: `Bearer ${validAccessToken}`,
      };

      const result = await handler(event);

      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });

    it('should include CORS headers in error response', async () => {
      event.body = JSON.stringify({});
      event.headers = {
        Authorization: `Bearer ${validAccessToken}`,
      };

      const result = await handler(event);

      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });
  });
});
