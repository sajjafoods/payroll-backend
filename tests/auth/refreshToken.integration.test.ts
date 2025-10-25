import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { handler } from '../../src/handlers/auth/refreshToken';
import { handler as verifyOtpHandler } from '../../src/handlers/auth/verifyOtp';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { db } from '../../src/db/client';
import { users, organizations, organizationUsers, userSessions } from '../../src/db/schema/schema';
import { eq } from 'drizzle-orm';
import { storeOtp } from '../../src/utils/otp';
import { getRedisClient } from '../../src/config/redis';
import { hashRefreshToken } from '../../src/utils/jwt';

/**
 * Integration tests for refresh-token endpoint
 * These tests use real database and Redis connections
 * Run with: npm test -- refreshToken.integration.test.ts
 */
describe('POST /api/v1/auth/refresh - Integration Tests', () => {
  const testPhoneNumber = '+919876543299';
  const validOtp = '123456';
  
  let event: APIGatewayProxyEvent;
  let validRefreshToken: string;
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
          deviceId: 'test_device_refresh',
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
      testUserId = loginBody.data.user.id;
    }

    // Base event structure for refresh token tests
    event = {
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/api/v1/auth/refresh',
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
    it('should return new tokens when refresh token is valid', async () => {
      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();
      expect(body.data.expiresIn).toBe(3600);
      expect(body.data.tokenType).toBe('Bearer');
      
      // Verify new refresh token is different (token rotation)
      expect(body.data.refreshToken).not.toBe(validRefreshToken);
      
      // Verify session was updated in database
      const sessions = await db.select().from(userSessions).where(eq(userSessions.userId, testUserId));
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].isActive).toBe(true);
    }, 10000);

    it('should allow multiple successive refreshes with token rotation', async () => {
      // First refresh
      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });

      const result1 = await handler(event);
      const body1 = JSON.parse(result1.body);
      expect(result1.statusCode).toBe(200);
      
      const newRefreshToken1 = body1.data.refreshToken;

      // Second refresh with new token
      event.body = JSON.stringify({
        refreshToken: newRefreshToken1,
      });

      const result2 = await handler(event);
      const body2 = JSON.parse(result2.body);
      expect(result2.statusCode).toBe(200);
      expect(body2.data.refreshToken).not.toBe(newRefreshToken1);
      
      // Old token should not work anymore
      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });

      const result3 = await handler(event);
      expect(result3.statusCode).toBe(401);
    }, 15000);
  });

  describe('Validation Errors - 400', () => {
    it('should return 400 when refreshToken is missing', async () => {
      event.body = JSON.stringify({});

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_TOKEN_FORMAT');
      expect(body.error.message).toBe('Refresh token is required and must be valid JWT format');
      expect(body.error.details.field).toBe('refreshToken');
    });

    it('should return 400 when request body is invalid JSON', async () => {
      event.body = 'invalid-json{';

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
    });

    it('should return 400 when refreshToken is not a valid JWT format', async () => {
      event.body = JSON.stringify({
        refreshToken: 'not-a-valid-jwt-token',
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_TOKEN_FORMAT');
    });
  });

  describe('Authentication Errors - 401', () => {
    it('should return 401 when refresh token does not exist in database', async () => {
      // Delete the session from database but keep using the valid token
      const tokenHash = hashRefreshToken(validRefreshToken);
      await db.delete(userSessions).where(eq(userSessions.refreshTokenHash, tokenHash));
      
      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('Authorization Errors - 403', () => {
    it('should return 403 when session is revoked', async () => {
      // Revoke the session
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

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('TOKEN_REVOKED');
      expect(body.error.message).toBe('This session has been terminated. Please login again');
    }, 10000);

    it('should return 403 when user is deactivated', async () => {
      // Deactivate the user
      await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, testUserId));

      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('TOKEN_REVOKED');
      expect(body.error.details.reason).toBe('user_account_deactivated');
    }, 10000);

    it('should return 403 when user is removed from organization', async () => {
      // Remove user from organization
      await db
        .delete(organizationUsers)
        .where(eq(organizationUsers.userId, testUserId));

      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('TOKEN_REVOKED');
      expect(body.error.details.reason).toBe('user_removed_from_organization');
    }, 10000);
  });

  describe('Session Expiration', () => {
    it('should return 401 when session is expired', async () => {
      // Delete the existing session and create a new one with past expiry
      const tokenHash = hashRefreshToken(validRefreshToken);
      await db.delete(userSessions).where(eq(userSessions.refreshTokenHash, tokenHash));
      
      // Create a new session with past expiry
      const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const createdDate = new Date(Date.now() - 1000 * 60 * 120); // 2 hours ago
      
      await db.insert(userSessions).values({
        userId: testUserId,
        refreshTokenHash: tokenHash,
        deviceId: 'test_device_refresh',
        deviceName: 'Test Device',
        platform: 'web',
        isActive: true,
        expiresAt: pastDate.toISOString(),
        createdAt: createdDate.toISOString(),
        lastActivityAt: createdDate.toISOString(),
      });

      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
      expect(body.error.details.reason).toBe('expired');
      
      // Verify session was revoked
      const sessions = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.refreshTokenHash, tokenHash));
      expect(sessions[0].isActive).toBe(false);
      expect(sessions[0].revokedReason).toBe('token_expired');
    }, 10000);
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in success response', async () => {
      event.body = JSON.stringify({
        refreshToken: validRefreshToken,
      });

      const result = await handler(event);

      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });

    it('should include CORS headers in error response', async () => {
      event.body = JSON.stringify({});

      const result = await handler(event);

      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });
  });
});
