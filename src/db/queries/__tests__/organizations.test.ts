import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, sql, or } from 'drizzle-orm';
import { organizations, organizationSettings, organizationUsers } from '../../schema/schema';
import * as orgQueries from '../organizations';

// Generate unique test data for each test run to avoid conflicts
const generateTestData = (suffix: string) => ({
  org1: {
    name: `Test Organization 1 ${suffix}`,
    phoneNumber: `+9198765432${Math.floor(Math.random() * 100)}`,
    email: `test1-${suffix}@example.com`,
    displayName: `Test Org 1 ${suffix}`,
    address: '123 Test Street',
    businessType: 'Technology',
    gstin: '29ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
  },
  org2: {
    name: `Test Organization 2 ${suffix}`,
    phoneNumber: `+9198765433${Math.floor(Math.random() * 100)}`,
    email: `test2-${suffix}@example.com`,
  },
});

describe('Organization Queries', () => {
  let testDb: any;
  let testClient: any;
  let testRunId: string;
  let createdOrgIds: string[] = [];

  // Helper to track and cleanup organizations
  const trackOrganization = (orgId: string) => {
    createdOrgIds.push(orgId);
    return orgId;
  };

  // Helper to cleanup all tracked organizations
  const cleanupOrganizations = async () => {
    if (createdOrgIds.length > 0) {
      try {
        await testDb.delete(organizations).where(
          or(...createdOrgIds.map(id => eq(organizations.id, id)))
        );
      } catch (error) {
        console.warn('Cleanup error:', error);
      }
      createdOrgIds = [];
    }
  };

  beforeAll(async () => {
    // Create unique test run ID
    testRunId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create fresh connection
    const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dev_user:dev_password@localhost:5432/payroll_dev';
    testClient = postgres(DATABASE_URL);
    testDb = drizzle(testClient, { 
      schema: { organizations, organizationSettings, organizationUsers } 
    });

    // Set bypass RLS for testing
    await testDb.execute(sql`SET app.bypass_rls = 'true'`);
  });

  afterAll(async () => {
    try {
      // Final cleanup of any remaining test data
      await cleanupOrganizations();
      
      // Reset RLS
      await testDb.execute(sql`SET app.bypass_rls = 'false'`);
    } catch (error) {
      console.warn('Test cleanup failed:', error);
    } finally {
      // Close connection
      await testClient.end();
    }
  });

  describe('CREATE Operations', () => {
    afterEach(async () => {
      await cleanupOrganizations();
    });

    it('should create organization with default settings', async () => {
      const testData = generateTestData(testRunId);
      const org = await orgQueries.createOrganization(testData.org1);
      trackOrganization(org.id);

      expect(org).toBeDefined();
      expect(org.id).toBeDefined();
      expect(org.name).toBe(testData.org1.name);
      expect(org.phoneNumber).toBe(testData.org1.phoneNumber);
      expect(org.email).toBe(testData.org1.email);
      expect(org.status).toBe('active');
      expect(org.setupComplete).toBe(false);

      // Verify settings were created
      const withSettings = await orgQueries.getOrganizationWithSettings(org.id);
      expect(withSettings?.organization_settings).toBeDefined();
      expect(withSettings?.organization_settings?.organizationId).toBe(org.id);
    });

    it('should create organization with custom settings', async () => {
      const testData = generateTestData(testRunId);
      const customSettings = {
        defaultPaymentSchedule: 'weekly',
        defaultWorkingDays: 24,
        timezone: 'America/New_York',
        currency: 'USD',
      };

      const result = await orgQueries.createOrganizationWithSettings(
        testData.org2,
        customSettings as any
      );
      trackOrganization(result.organization.id);

      expect(result.organization).toBeDefined();
      expect(result.settings).toBeDefined();
      expect(result.settings.defaultPaymentSchedule).toBe('weekly');
      expect(result.settings.defaultWorkingDays).toBe(24);
      expect(result.settings.timezone).toBe('America/New_York');
      expect(result.settings.currency).toBe('USD');
    });
  });

  describe('READ Operations', () => {
    let testOrgId: string;
    let testData: ReturnType<typeof generateTestData>;

    beforeEach(async () => {
      testData = generateTestData(testRunId);
      const org = await orgQueries.createOrganization(testData.org1);
      testOrgId = trackOrganization(org.id);
    });

    afterEach(async () => {
      await cleanupOrganizations();
    });

    it('should get organization by ID', async () => {
      const org = await orgQueries.getOrganizationById(testOrgId);
      
      expect(org).toBeDefined();
      expect(org?.id).toBe(testOrgId);
      expect(org?.name).toBe(testData.org1.name);
    });

    it('should get organization by email', async () => {
      const org = await orgQueries.getOrganizationByEmail(testData.org1.email);
      
      expect(org).toBeDefined();
      expect(org?.email).toBe(testData.org1.email);
    });

    it('should get organization by phone', async () => {
      const org = await orgQueries.getOrganizationByPhone(testData.org1.phoneNumber);
      
      expect(org).toBeDefined();
      expect(org?.phoneNumber).toBe(testData.org1.phoneNumber);
    });

    it('should get organization with settings', async () => {
      const result = await orgQueries.getOrganizationWithSettings(testOrgId);
      
      expect(result).toBeDefined();
      expect(result?.organizations).toBeDefined();
      expect(result?.organization_settings).toBeDefined();
      expect(result?.organization_settings?.organizationId).toBe(testOrgId);
    });

    it('should return undefined for non-existent organization', async () => {
      const org = await orgQueries.getOrganizationById('00000000-0000-0000-0000-000000000000');
      
      expect(org).toBeUndefined();
    });
  });

  describe('LIST Operations', () => {
    let testOrgId1: string;
    let testOrgId2: string;

    beforeEach(async () => {
      const testData = generateTestData(testRunId);
      const org1 = await orgQueries.createOrganization(testData.org1);
      const org2 = await orgQueries.createOrganization(testData.org2);
      testOrgId1 = trackOrganization(org1.id);
      testOrgId2 = trackOrganization(org2.id);
    });

    afterEach(async () => {
      await cleanupOrganizations();
    });

    it('should get all organizations with pagination', async () => {
      const orgs = await orgQueries.getOrganizations({ limit: 10, offset: 0 });
      
      expect(Array.isArray(orgs)).toBe(true);
      expect(orgs.length).toBeGreaterThan(0);
    });

    it('should get active organizations', async () => {
      const orgs = await orgQueries.getActiveOrganizations();
      
      expect(Array.isArray(orgs)).toBe(true);
      orgs.forEach(org => {
        expect(org.status).toBe('active');
      });
    });

    it('should get organizations by status', async () => {
      const activeOrgs = await orgQueries.getOrganizationsByStatus('active');
      
      expect(Array.isArray(activeOrgs)).toBe(true);
      activeOrgs.forEach(org => {
        expect(org.status).toBe('active');
      });
    });

    it('should get multiple organizations by IDs', async () => {
      const orgs = await orgQueries.getOrganizationsByIds([testOrgId1, testOrgId2]);
      
      expect(orgs.length).toBe(2);
      expect(orgs.map(o => o.id)).toContain(testOrgId1);
      expect(orgs.map(o => o.id)).toContain(testOrgId2);
    });
  });

  describe('SEARCH Operations', () => {
    let testData: ReturnType<typeof generateTestData>;

    beforeEach(async () => {
      testData = generateTestData(testRunId);
      const org1 = await orgQueries.createOrganization(testData.org1);
      const org2 = await orgQueries.createOrganization(testData.org2);
      trackOrganization(org1.id);
      trackOrganization(org2.id);
    });

    afterEach(async () => {
      await cleanupOrganizations();
    });

    it('should search organizations by name (pattern matching)', async () => {
      const results = await orgQueries.searchOrganizationsByName(testRunId, { limit: 10 });
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should search organizations with case sensitivity', async () => {
      const results = await orgQueries.searchOrganizationsByName(testRunId.toLowerCase(), { 
        caseSensitive: false,
        limit: 10 
      });
      
      expect(Array.isArray(results)).toBe(true);
    });

    it('should perform full-text search', async () => {
      const results = await orgQueries.searchOrganizations(testRunId, { limit: 10 });
      
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('UPDATE Operations', () => {
    let testOrgId1: string;
    let testOrgId2: string;
    let testData: ReturnType<typeof generateTestData>;

    beforeEach(async () => {
      testData = generateTestData(testRunId);
      const org1 = await orgQueries.createOrganization(testData.org1);
      const org2 = await orgQueries.createOrganization(testData.org2);
      testOrgId1 = trackOrganization(org1.id);
      testOrgId2 = trackOrganization(org2.id);
    });

    afterEach(async () => {
      await cleanupOrganizations();
    });

    it('should update organization', async () => {
      const updated = await orgQueries.updateOrganization(testOrgId1, {
        displayName: 'Updated Display Name',
        address: 'Updated Address',
      });

      expect(updated).toBeDefined();
      expect(updated?.displayName).toBe('Updated Display Name');
      expect(updated?.address).toBe('Updated Address');
    });

    it('should update organization status', async () => {
      const updated = await orgQueries.updateOrganizationStatus(testOrgId1, 'suspended');
      
      expect(updated).toBeDefined();
      expect(updated?.status).toBe('suspended');

      // Restore to active
      const restored = await orgQueries.updateOrganizationStatus(testOrgId1, 'active');
      expect(restored?.status).toBe('active');
    });

    it('should complete organization setup', async () => {
      const updated = await orgQueries.completeOrganizationSetup(testOrgId1);
      
      expect(updated).toBeDefined();
      expect(updated?.setupComplete).toBe(true);
    });

    it('should update organization settings', async () => {
      const updated = await orgQueries.updateOrganizationSettings(testOrgId1, {
        defaultWorkingDays: 25,
        timezone: 'Europe/London',
      });

      expect(updated).toBeDefined();
      expect(updated?.defaultWorkingDays).toBe(25);
      expect(updated?.timezone).toBe('Europe/London');
    });

    it('should batch update organization status', async () => {
      const updated = await orgQueries.batchUpdateOrganizationStatus(
        [testOrgId1, testOrgId2],
        'suspended'
      );

      expect(updated.length).toBe(2);
      updated.forEach(org => {
        expect(org.status).toBe('suspended');
      });

      // Restore to active
      const restored = await orgQueries.batchUpdateOrganizationStatus(
        [testOrgId1, testOrgId2],
        'active'
      );
      expect(restored.length).toBe(2);
      restored.forEach(org => {
        expect(org.status).toBe('active');
      });
    });
  });

  describe('ARCHIVE/DELETE Operations', () => {
    let testOrgId1: string;
    let testOrgId2: string;

    beforeEach(async () => {
      const testData = generateTestData(testRunId);
      const org1 = await orgQueries.createOrganization(testData.org1);
      const org2 = await orgQueries.createOrganization(testData.org2);
      testOrgId1 = trackOrganization(org1.id);
      testOrgId2 = trackOrganization(org2.id);
    });

    afterEach(async () => {
      await cleanupOrganizations();
    });

    it('should suspend organization', async () => {
      const suspended = await orgQueries.suspendOrganization(testOrgId1);
      
      expect(suspended?.status).toBe('suspended');
    });

    it('should reactivate organization', async () => {
      // First suspend
      await orgQueries.suspendOrganization(testOrgId1);
      
      // Then reactivate
      const reactivated = await orgQueries.reactivateOrganization(testOrgId1);
      
      expect(reactivated?.status).toBe('active');
    });

    it('should archive organization (soft delete)', async () => {
      const archived = await orgQueries.archiveOrganization(testOrgId2);
      
      expect(archived?.status).toBe('archived');

      // Restore for cleanup
      await orgQueries.reactivateOrganization(testOrgId2);
    });
  });

  describe('VALIDATION Operations', () => {
    let testOrgId: string;
    let testData: ReturnType<typeof generateTestData>;

    beforeEach(async () => {
      testData = generateTestData(testRunId);
      const org = await orgQueries.createOrganization(testData.org1);
      testOrgId = trackOrganization(org.id);
    });

    afterEach(async () => {
      await cleanupOrganizations();
    });

    it('should check if organization name exists', async () => {
      const exists = await orgQueries.organizationNameExists(testData.org1.name);
      
      expect(exists).toBe(true);
    });

    it('should check if organization name exists excluding specific org', async () => {
      const exists = await orgQueries.organizationNameExists(
        testData.org1.name,
        testOrgId
      );
      
      expect(exists).toBe(false);
    });

    it('should check if organization email exists', async () => {
      const exists = await orgQueries.organizationEmailExists(testData.org1.email);
      
      expect(exists).toBe(true);
    });

    it('should check if organization phone exists', async () => {
      const exists = await orgQueries.organizationPhoneExists(testData.org1.phoneNumber);
      
      expect(exists).toBe(true);
    });

    it('should return false for non-existent name', async () => {
      const exists = await orgQueries.organizationNameExists(`Non Existent Org ${testRunId}`);
      
      expect(exists).toBe(false);
    });
  });

  describe('STATISTICS Operations', () => {
    let testOrgId: string;

    beforeEach(async () => {
      const testData = generateTestData(testRunId);
      const org = await orgQueries.createOrganization(testData.org1);
      testOrgId = trackOrganization(org.id);
    });

    afterEach(async () => {
      await cleanupOrganizations();
    });

    it('should get organization stats', async () => {
      const stats = await orgQueries.getOrganizationStats(testOrgId);
      
      expect(stats).toBeDefined();
      expect(typeof stats.totalEmployees).toBe('number');
      expect(typeof stats.activeEmployees).toBe('number');
      expect(typeof stats.totalUsers).toBe('number');
      expect(typeof stats.activeUsers).toBe('number');
    });

    it('should get organization count by status', async () => {
      const counts = await orgQueries.getOrganizationCountByStatus();
      
      expect(Array.isArray(counts)).toBe(true);
      counts.forEach(count => {
        expect(count.status).toBeDefined();
        expect(typeof count.count).toBe('number');
      });
    });
  });
});
