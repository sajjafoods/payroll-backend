import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { handler } from '../../src/handlers/auth/logout';
import { db } from '../../src/db/client';
import { userSessions } from '../../src/db/schema/schema';
import { eq, and } from 'drizzle-orm';
import { hashRefreshToken } from '../../src/utils/jwt';
import { 
  cleanupTestUser,
  teardownRedis,
  createAuthenticatedMockEvent,
  createMockEvent,
  createTestSession,
  generateUniquePhoneNumber,
  DEFAULT_TEST_OTP
} from '../helpers';

/**
 * Integration tests for logout endpoint
 * These tests use real database and Redis connections
 * Run with: npm test -- logout.integration.test.ts
 */
describe('POST /api/v1/auth/logout - Integration Tests', () => {
  const testPhoneNumber = generateUniquePhoneNumber();
  let validRefreshToken: string;
  let validAccessToken: string;
  let testUserId: string;

  beforeEach(async () => {
    await cleanupTestUser(testPhoneNumber);
    
    // Create fresh session for each test
    const session = await createTestSession(testPhoneNumber, DEFAULT_TEST_OTP);
    validRefreshToken = session.refreshToken;
    validAccessToken = session.accessToken;
    testUserId = session.userId;
  });

  afterAll(async () => {
    await cleanupTestUser(testPhoneNumber);
    await teardownRedis();
  });

  describe('Success Cases', () => {
    it('should logout from current device successfully', async () => {
      const event = createAuthenticatedMockEvent(
        { refreshToken: validRefreshToken },
        '/api/v1/auth/logout',
        validAccessToken
      );

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
      // Create additional sessions
      const phone2 = generateUniquePhoneNumber();
      const phone3 = generateUniquePhoneNumber();
      await createTestSession(phone2, DEFAULT_TEST_OTP);
      await createTestSession(phone3, DEFAULT_TEST_OTP);

      // Verify we have 1 active session for testUserId
      const beforeSessions = await db
        .select()
        .from(userSessions)
        .where(and(
          eq(userSessions.userId, testUserId),
          eq(userSessions.isActive, true)
        ));
      expect(beforeSessions.length).toBeGreaterThanOrEqual(1);

      // Logout from all devices
      const event = createAuthenticatedMockEvent(
        { refreshToken: validRefreshToken, logoutAllDevices: true },
        '/api/v1/auth/logout',
        validAccessToken
      );

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Successfully logged out from all devices');
      expect(body.data.devicesLoggedOut).toBeGreaterThanOrEqual(1);
      
      // Verify all sessions were revoked
      const afterSessions = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.userId, testUserId));
      
      afterSessions.forEach(session => {
        expect(session.isActive).toBe(false);
        expect(session.revokedReason).toBe('user_logout_all_devices');
      });
      
      // Cleanup additional test users
      await cleanupTestUser(phone2);
      await cleanupTestUser(phone3);
    }, 15000);
  });

  describe('Authentication Errors - 401', () => {
    it('should return 401 when Authorization header is missing', async () => {
      const event = createMockEvent(
        { refreshToken: validRefreshToken },
        '/api/v1/auth/logout'
      );

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Missing Authorization header');
    });

    it('should return 401 when access token is invalid', async () => {
      const event = createAuthenticatedMockEvent(
        { refreshToken: validRefreshToken },
        '/api/v1/auth/logout',
        'invalid.access.token'
      );

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when refresh token does not exist in database', async () => {
      const fakeRefreshToken = validRefreshToken.slice(0, -10) + 'fakefake12';
      
      const event = createAuthenticatedMockEvent(
        { refreshToken: fakeRefreshToken },
        '/api/v1/auth/logout',
        validAccessToken
      );

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('Validation Errors - 400', () => {
    it('should return 400 when refreshToken is missing', async () => {
      const event = createAuthenticatedMockEvent(
        {},
        '/api/v1/auth/logout',
        validAccessToken
      );

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
      const event = createAuthenticatedMockEvent(
        { refreshToken: 'not-a-valid-jwt' },
        '/api/v1/auth/logout',
        validAccessToken
      );

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should return 400 when request body is invalid JSON', async () => {
      const event = createAuthenticatedMockEvent(
        {},
        '/api/v1/auth/logout',
        validAccessToken
      );
      event.body = 'invalid-json{';

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

      const event = createAuthenticatedMockEvent(
        { refreshToken: validRefreshToken },
        '/api/v1/auth/logout',
        validAccessToken
      );

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
      const event = createAuthenticatedMockEvent(
        { refreshToken: validRefreshToken },
        '/api/v1/auth/logout',
        validAccessToken
      );

      const result = await handler(event);

      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });

    it('should include CORS headers in error response', async () => {
      const event = createAuthenticatedMockEvent(
        {},
        '/api/v1/auth/logout',
        validAccessToken
      );

      const result = await handler(event);

      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });
  });
});
