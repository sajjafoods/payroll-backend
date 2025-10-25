import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { handler } from '../../src/handlers/auth/completeProfile';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { db } from '../../src/db/client';
import { users, organizations, organizationUsers } from '../../src/db/schema/schema';
import { eq, sql } from 'drizzle-orm';
import { generateTokenPair } from '../../src/utils/jwt';
import { getRedisClient } from '../../src/config/redis';

/**
 * Integration tests for complete-profile endpoint
 * These tests use real database and Redis connections
 * Run with: npm test -- completeProfile.integration.test.ts
 */
describe('PATCH /api/v1/auth/complete-profile - Integration Tests', () => {
  // Generate unique phone number for each test run to avoid conflicts
  const testPhoneNumber = `+9198765432${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
  let testUserId: string;
  let testOrgId: string;
  let testAccessToken: string;
  
  let event: APIGatewayProxyEvent;

  beforeAll(async () => {
    // Ensure database connection is ready
    // The database should be running via Docker
    
    // Create a test user and organization for testing
    const [user] = await db
      .insert(users)
      .values({
        phoneNumber: testPhoneNumber,
        name: 'Test User',
        phoneVerified: true,
      })
      .returning();

    testUserId = user.id as string;

    const [org] = await db
      .insert(organizations)
      .values({
        name: `My Business ${Date.now()}`, // Unique name to avoid conflicts
        phoneNumber: testPhoneNumber,
        setupComplete: false,
        createdByUserId: testUserId,
      })
      .returning();

    testOrgId = org.id as string;

    // Link user to organization
    await db
      .insert(organizationUsers)
      .values({
        organizationId: testOrgId,
        userId: testUserId,
        role: 'owner',
        permissions: {
          employees: ['create', 'read', 'update', 'delete'],
          attendance: ['create', 'read', 'update', 'delete'],
          leaves: ['create', 'read', 'update', 'delete'],
          payroll: ['create', 'read', 'update', 'delete'],
          payments: ['create', 'read', 'update', 'delete'],
          advances: ['create', 'read', 'update', 'delete'],
          loans: ['create', 'read', 'update', 'delete'],
          reports: ['read', 'export'],
        },
      });

    // Generate access token
    const tokens = generateTokenPair({
      userId: testUserId,
      organizationId: testOrgId,
      role: 'owner',
      sessionId: 'test_session',
    });
    testAccessToken = tokens.accessToken;
  });

  beforeEach(async () => {
    // Reset database state before each test to ensure isolation
    // This prevents tests from affecting each other
    const [updatedUser] = await db
      .update(users)
      .set({
        name: 'Test User',
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(users.id, testUserId))
      .returning();

    const [updatedOrg] = await db
      .update(organizations)
      .set({
        name: `My Business ${Date.now()}`, // Reset with unique name
        setupComplete: false,
        address: null,
        businessType: null,
        gstin: null,
        pan: null,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(organizations.id, testOrgId))
      .returning();

    // Verify the reset was successful
    if (!updatedUser) {
      throw new Error(`Failed to reset user ${testUserId} in beforeEach`);
    }
    if (!updatedOrg) {
      throw new Error(`Failed to reset organization ${testOrgId} in beforeEach`);
    }

    // Base event structure
    event = {
      body: null,
      headers: {
        Authorization: `Bearer ${testAccessToken}`,
      },
      multiValueHeaders: {},
      httpMethod: 'PATCH',
      isBase64Encoded: false,
      path: '/api/v1/auth/complete-profile',
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
    // Clean up test data
    try {
      if (testUserId && testOrgId) {
        // Delete organizationUsers by composite key
        await db.delete(organizationUsers)
          .where(sql`${organizationUsers.organizationId} = ${testOrgId} AND ${organizationUsers.userId} = ${testUserId}`);
      }
      if (testOrgId) {
        await db.delete(organizations).where(eq(organizations.id, testOrgId));
      }
      if (testUserId) {
        await db.delete(users).where(eq(users.id, testUserId));
      }
    } catch (error) {
      console.log('Cleanup error (may be normal):', error);
    }

    // Close Redis connection
    const redis = getRedisClient();
    await redis.disconnect();
  });

  describe('Successful Profile Completion', () => {
    it('should complete profile with all required fields', async () => {
      event.body = JSON.stringify({
        ownerName: 'Raj Kumar',
        organizationName: 'Raj Electronics',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      expect(body.success).toBe(true);
      expect(body.data.user.id).toBe(testUserId);
      expect(body.data.user.name).toBe('Raj Kumar');
      expect(body.data.user.phoneNumber).toBe(testPhoneNumber);
      expect(body.data.user.role).toBe('owner');
      expect(body.data.organization.id).toBe(testOrgId);
      expect(body.data.organization.name).toBe('Raj Electronics');
      expect(body.data.organization.setupComplete).toBe(true);
      expect(body.data.message).toBe('Profile setup completed successfully');

      // Verify database updates
      const [updatedUser] = await db.select().from(users).where(eq(users.id, testUserId));
      expect(updatedUser.name).toBe('Raj Kumar');

      const [updatedOrg] = await db.select().from(organizations).where(eq(organizations.id, testOrgId));
      expect(updatedOrg.name).toBe('Raj Electronics');
      expect(updatedOrg.setupComplete).toBe(true);
    }, 10000);

    it('should complete profile with all optional fields', async () => {
      event.body = JSON.stringify({
        ownerName: 'Suresh Patel',
        organizationName: 'Suresh Manufacturing',
        organizationAddress: '123 MG Road, Bangalore, Karnataka 560001',
        industry: 'manufacturing',
        employeeCount: 25,
        gstNumber: '29ABCDE1234F1Z5',
        panNumber: 'ABCDE1234F',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      
      expect(body.success).toBe(true);
      expect(body.data.organization.name).toBe('Suresh Manufacturing');
      expect(body.data.organization.address).toBe('123 MG Road, Bangalore, Karnataka 560001');
      expect(body.data.organization.industry).toBe('manufacturing');
      expect(body.data.organization.employeeCount).toBe(25);
      expect(body.data.organization.gstNumber).toBe('29ABCDE1234F1Z5');
      expect(body.data.organization.setupComplete).toBe(true);

      // Verify database
      const [updatedOrg] = await db.select().from(organizations).where(eq(organizations.id, testOrgId));
      expect(updatedOrg.businessType).toBe('manufacturing');
      expect(updatedOrg.gstin).toBe('29ABCDE1234F1Z5');
      expect(updatedOrg.pan).toBe('ABCDE1234F');
    }, 10000);
  });

  describe('Authentication Errors', () => {
    it('should reject request without Authorization header', async () => {
      event.headers = {};
      event.body = JSON.stringify({
        ownerName: 'Test User',
        organizationName: 'Test Org',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Missing Authorization header');
    });

    it('should reject invalid token format', async () => {
      event.headers.Authorization = 'InvalidTokenFormat';
      event.body = JSON.stringify({
        ownerName: 'Test User',
        organizationName: 'Test Org',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Invalid Authorization header format');
    });

    it('should reject expired/invalid token', async () => {
      event.headers.Authorization = 'Bearer invalid_token_xyz';
      event.body = JSON.stringify({
        ownerName: 'Test User',
        organizationName: 'Test Org',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Invalid or expired access token');
    });
  });

  describe('Validation Errors', () => {
    it('should reject missing ownerName', async () => {
      event.body = JSON.stringify({
        organizationName: 'Test Org',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid input data');
      expect(body.error.details.fields.ownerName).toBeDefined();
    });

    it('should reject ownerName too short', async () => {
      event.body = JSON.stringify({
        ownerName: 'A',
        organizationName: 'Test Org',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fields.ownerName).toContain('at least 2 characters');
    });

    it('should reject invalid GST number format', async () => {
      event.body = JSON.stringify({
        ownerName: 'Test User',
        organizationName: 'Test Org',
        gstNumber: 'INVALID_GST',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fields.gstNumber).toContain('Invalid GST number format');
    });

    it('should reject invalid PAN number format', async () => {
      event.body = JSON.stringify({
        ownerName: 'Test User',
        organizationName: 'Test Org',
        panNumber: 'INVALID',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fields.panNumber).toContain('Invalid PAN number format');
    });

    it('should reject invalid industry value', async () => {
      event.body = JSON.stringify({
        ownerName: 'Test User',
        organizationName: 'Test Org',
        industry: 'invalid_industry',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject employeeCount out of range', async () => {
      event.body = JSON.stringify({
        ownerName: 'Test User',
        organizationName: 'Test Org',
        employeeCount: 20000, // Exceeds max of 10000
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details.fields.employeeCount).toContain('10000');
    });
  });

  describe('Business Logic Errors', () => {
    it('should reject if profile already completed', async () => {
      // Ensure setupComplete is true
      await db
        .update(organizations)
        .set({ setupComplete: true })
        .where(eq(organizations.id, testOrgId));

      event.body = JSON.stringify({
        ownerName: 'Test User',
        organizationName: 'Test Org',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('PROFILE_ALREADY_COMPLETE');
      expect(body.error.message).toContain('already completed');
      expect(body.error.details.organizationId).toBe(testOrgId);
      expect(body.error.details.setupComplete).toBe(true);
    });

    it('should reject duplicate organization name', async () => {
      // Create another organization with a specific name
      const [anotherOrg] = await db
        .insert(organizations)
        .values({
          name: 'Existing Business Name',
          phoneNumber: '+919999999999',
          setupComplete: true,
        })
        .returning();

      event.body = JSON.stringify({
        ownerName: 'Test User',
        organizationName: 'Existing Business Name',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('ORGANIZATION_NAME_EXISTS');
      expect(body.error.message).toBe('Organization name already exists');
      expect(body.error.details.field).toBe('organizationName');

      // Clean up
      await db.delete(organizations).where(eq(organizations.id, anotherOrg.id));
    });

    it('should reject if user is not owner', async () => {
      // Generate token with non-owner role
      const nonOwnerToken = generateTokenPair({
        userId: testUserId,
        organizationId: testOrgId,
        role: 'accountant',
        sessionId: 'test_session',
      });

      event.headers.Authorization = `Bearer ${nonOwnerToken.accessToken}`;
      event.body = JSON.stringify({
        ownerName: 'Test User',
        organizationName: 'Test Org',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('PROFILE_ALREADY_COMPLETE');
      expect(body.error.message).toContain('Only owner');
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid JSON in request body', async () => {
      event.body = 'invalid json {{{';

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INVALID_REQUEST');
      expect(body.error.message).toBe('Invalid request body');
    });

    it('should handle empty request body', async () => {
      event.body = '{}';

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should allow updating to same organization name', async () => {
      // Set the org name to 'Current Name' for this specific test
      await db
        .update(organizations)
        .set({ name: 'Current Name' })
        .where(eq(organizations.id, testOrgId));

      event.body = JSON.stringify({
        ownerName: 'Test User',
        organizationName: 'Current Name', // Same as current
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.organization.name).toBe('Current Name');
    });
  });

  describe('Industry Enum Validation', () => {
    it('should accept all valid industry values', async () => {
      const validIndustries = [
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
      ];

      for (const industry of validIndustries) {
        // Reset setupComplete for each iteration since previous iteration sets it to true
        await db
          .update(organizations)
          .set({ setupComplete: false })
          .where(eq(organizations.id, testOrgId));

        event.body = JSON.stringify({
          ownerName: 'Test User',
          organizationName: `Test ${industry} Business`,
          industry,
        });

        const result = await handler(event);
        expect(result.statusCode).toBe(200);
        
        const body = JSON.parse(result.body);
        expect(body.data.organization.industry).toBe(industry);
      }
    }, 30000);
  });
});
