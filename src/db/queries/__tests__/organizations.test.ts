import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, sql } from 'drizzle-orm';
import { organizations, organizationSettings, organizationUsers } from '../../schema/schema';
import * as orgQueries from '../organizations';

// Test data
const testOrg1 = {
  name: 'Test Organization 1',
  phoneNumber: '+919876543210',
  email: 'test1@example.com',
  displayName: 'Test Org 1',
  address: '123 Test Street',
  businessType: 'Technology',
  gstin: '29ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
};

const testOrg2 = {
  name: 'Test Organization 2',
  phoneNumber: '+919876543211',
  email: 'test2@example.com',
};

describe('Organization Queries', () => {
  let createdOrgId: string;
  let createdOrgId2: string;
  let testDb: any;
  let testClient: any;

  // Clean up before all tests
  beforeAll(async () => {
    // Create fresh connection with correct credentials
    const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://dev_user:dev_password@localhost:5432/payroll_dev';
    testClient = postgres(DATABASE_URL);
    testDb = drizzle(testClient, { 
      schema: { organizations, organizationSettings, organizationUsers } 
    });

    // Set bypass RLS for testing
    await testDb.execute(sql`SET app.bypass_rls = 'true'`);
  });

  // Clean up after all tests
  afterAll(async () => {
    try {
      // Clean up test data
      if (createdOrgId) {
        await testDb.delete(organizations).where(eq(organizations.id, createdOrgId));
      }
      if (createdOrgId2) {
        await testDb.delete(organizations).where(eq(organizations.id, createdOrgId2));
      }
      
      // Reset RLS
      await testDb.execute(sql`SET app.bypass_rls = 'false'`);
    } catch (error) {
      // Ignore cleanup errors if connection is already closed
      console.warn('Test cleanup failed:', error);
    } finally {
      // Close connection
      await testClient.end();
    }
  });

  describe('CREATE Operations', () => {
    it('should create organization with default settings', async () => {
      const org = await orgQueries.createOrganization(testOrg1);
      createdOrgId = org.id;

      expect(org).toBeDefined();
      expect(org.id).toBeDefined();
      expect(org.name).toBe(testOrg1.name);
      expect(org.phoneNumber).toBe(testOrg1.phoneNumber);
      expect(org.email).toBe(testOrg1.email);
      expect(org.status).toBe('active');
      expect(org.setupComplete).toBe(false);

      // Verify settings were created
      const withSettings = await orgQueries.getOrganizationWithSettings(org.id);
      expect(withSettings?.organization_settings).toBeDefined();
      expect(withSettings?.organization_settings?.organizationId).toBe(org.id);
    });

    it('should create organization with custom settings', async () => {
      const customSettings = {
        defaultPaymentSchedule: 'weekly',
        defaultWorkingDays: 24,
        timezone: 'America/New_York',
        currency: 'USD',
      };

      const result = await orgQueries.createOrganizationWithSettings(
        testOrg2,
        customSettings as any
      );
      createdOrgId2 = result.organization.id;

      expect(result.organization).toBeDefined();
      expect(result.settings).toBeDefined();
      expect(result.settings.defaultPaymentSchedule).toBe('weekly');
      expect(result.settings.defaultWorkingDays).toBe(24);
      expect(result.settings.timezone).toBe('America/New_York');
      expect(result.settings.currency).toBe('USD');
    });
  });

  describe('READ Operations', () => {
    it('should get organization by ID', async () => {
      const org = await orgQueries.getOrganizationById(createdOrgId);
      
      expect(org).toBeDefined();
      expect(org?.id).toBe(createdOrgId);
      expect(org?.name).toBe(testOrg1.name);
    });

    it('should get organization by email', async () => {
      const org = await orgQueries.getOrganizationByEmail(testOrg1.email!);
      
      expect(org).toBeDefined();
      expect(org?.email).toBe(testOrg1.email);
    });

    it('should get organization by phone', async () => {
      const org = await orgQueries.getOrganizationByPhone(testOrg1.phoneNumber);
      
      expect(org).toBeDefined();
      expect(org?.phoneNumber).toBe(testOrg1.phoneNumber);
    });

    it('should get organization with settings', async () => {
      const result = await orgQueries.getOrganizationWithSettings(createdOrgId);
      
      expect(result).toBeDefined();
      expect(result?.organizations).toBeDefined();
      expect(result?.organization_settings).toBeDefined();
      expect(result?.organization_settings?.organizationId).toBe(createdOrgId);
    });

    it('should return undefined for non-existent organization', async () => {
      const org = await orgQueries.getOrganizationById('00000000-0000-0000-0000-000000000000');
      
      expect(org).toBeUndefined();
    });
  });

  describe('LIST Operations', () => {
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
      const orgs = await orgQueries.getOrganizationsByIds([createdOrgId, createdOrgId2]);
      
      expect(orgs.length).toBe(2);
      expect(orgs.map(o => o.id)).toContain(createdOrgId);
      expect(orgs.map(o => o.id)).toContain(createdOrgId2);
    });
  });

  describe('SEARCH Operations', () => {
    it('should search organizations by name (pattern matching)', async () => {
      const results = await orgQueries.searchOrganizationsByName('Test', { limit: 10 });
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should search organizations with case sensitivity', async () => {
      const results = await orgQueries.searchOrganizationsByName('test', { 
        caseSensitive: false,
        limit: 10 
      });
      
      expect(Array.isArray(results)).toBe(true);
    });

    it('should perform full-text search', async () => {
      const results = await orgQueries.searchOrganizations('Organization', { limit: 10 });
      
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('UPDATE Operations', () => {
    it('should update organization', async () => {
      const updated = await orgQueries.updateOrganization(createdOrgId, {
        displayName: 'Updated Display Name',
        address: 'Updated Address',
      });

      expect(updated).toBeDefined();
      expect(updated?.displayName).toBe('Updated Display Name');
      expect(updated?.address).toBe('Updated Address');
    });

    it('should update organization status', async () => {
      const updated = await orgQueries.updateOrganizationStatus(createdOrgId, 'suspended');
      
      expect(updated).toBeDefined();
      expect(updated?.status).toBe('suspended');

      // Restore to active
      await orgQueries.updateOrganizationStatus(createdOrgId, 'active');
    });

    it('should complete organization setup', async () => {
      const updated = await orgQueries.completeOrganizationSetup(createdOrgId);
      
      expect(updated).toBeDefined();
      expect(updated?.setupComplete).toBe(true);
    });

    it('should update organization settings', async () => {
      const updated = await orgQueries.updateOrganizationSettings(createdOrgId, {
        defaultWorkingDays: 25,
        timezone: 'Europe/London',
      });

      expect(updated).toBeDefined();
      expect(updated?.defaultWorkingDays).toBe(25);
      expect(updated?.timezone).toBe('Europe/London');
    });

    it('should batch update organization status', async () => {
      const updated = await orgQueries.batchUpdateOrganizationStatus(
        [createdOrgId, createdOrgId2],
        'suspended'
      );

      expect(updated.length).toBe(2);
      updated.forEach(org => {
        expect(org.status).toBe('suspended');
      });

      // Restore to active
      await orgQueries.batchUpdateOrganizationStatus(
        [createdOrgId, createdOrgId2],
        'active'
      );
    });
  });

  describe('ARCHIVE/DELETE Operations', () => {
    it('should suspend organization', async () => {
      const suspended = await orgQueries.suspendOrganization(createdOrgId);
      
      expect(suspended?.status).toBe('suspended');
    });

    it('should reactivate organization', async () => {
      const reactivated = await orgQueries.reactivateOrganization(createdOrgId);
      
      expect(reactivated?.status).toBe('active');
    });

    it('should archive organization (soft delete)', async () => {
      const archived = await orgQueries.archiveOrganization(createdOrgId2);
      
      expect(archived?.status).toBe('archived');

      // Restore for other tests
      await orgQueries.reactivateOrganization(createdOrgId2);
    });
  });

  describe('VALIDATION Operations', () => {
    it('should check if organization name exists', async () => {
      const exists = await orgQueries.organizationNameExists(testOrg1.name);
      
      expect(exists).toBe(true);
    });

    it('should check if organization name exists excluding specific org', async () => {
      const exists = await orgQueries.organizationNameExists(
        testOrg1.name,
        createdOrgId
      );
      
      expect(exists).toBe(false);
    });

    it('should check if organization email exists', async () => {
      const exists = await orgQueries.organizationEmailExists(testOrg1.email!);
      
      expect(exists).toBe(true);
    });

    it('should check if organization phone exists', async () => {
      const exists = await orgQueries.organizationPhoneExists(testOrg1.phoneNumber);
      
      expect(exists).toBe(true);
    });

    it('should return false for non-existent name', async () => {
      const exists = await orgQueries.organizationNameExists('Non Existent Org');
      
      expect(exists).toBe(false);
    });
  });

  describe('STATISTICS Operations', () => {
    it('should get organization stats', async () => {
      const stats = await orgQueries.getOrganizationStats(createdOrgId);
      
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
