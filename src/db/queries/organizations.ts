import { db } from '../client';
import { eq, sql, and, or, desc, asc, like, ilike } from 'drizzle-orm';

// Import tables from schema
import { 
  organizations, 
  organizationSettings,
  organizationUsers,
  employees,
  users
} from '../schema/schema';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type Organization = typeof organizations.$inferSelect;
export type OrganizationInsert = typeof organizations.$inferInsert;
export type OrganizationUpdate = Partial<Omit<OrganizationInsert, 'id' | 'createdAt'>>;

export type OrganizationSettings = typeof organizationSettings.$inferSelect;
export type OrganizationSettingsInsert = typeof organizationSettings.$inferInsert;
export type OrganizationSettingsUpdate = Partial<Omit<OrganizationSettingsInsert, 'organizationId' | 'createdAt'>>;

export type OrganizationWithSettings = {
  organizations: Organization;
  organization_settings: OrganizationSettings | null;
};

export type OrganizationStatus = 'active' | 'suspended' | 'cancelled' | 'archived';

// ============================================================================
// BASIC QUERIES
// ============================================================================

/**
 * Get organization by ID
 */
export async function getOrganizationById(orgId: string): Promise<Organization | undefined> {
  const result = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  
  return result[0];
}

/**
 * Get organization by ID with settings
 */
export async function getOrganizationWithSettings(
  orgId: string
): Promise<OrganizationWithSettings | undefined> {
  const result = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .leftJoin(
      organizationSettings,
      eq(organizations.id, organizationSettings.organizationId)
    )
    .limit(1);
  
  return result[0];
}

/**
 * Get organization by email
 */
export async function getOrganizationByEmail(email: string): Promise<Organization | undefined> {
  const result = await db
    .select()
    .from(organizations)
    .where(eq(organizations.email, email))
    .limit(1);
  
  return result[0];
}

/**
 * Get organization by phone number
 */
export async function getOrganizationByPhone(phoneNumber: string): Promise<Organization | undefined> {
  const result = await db
    .select()
    .from(organizations)
    .where(eq(organizations.phoneNumber, phoneNumber))
    .limit(1);
  
  return result[0];
}

// ============================================================================
// LIST QUERIES
// ============================================================================

/**
 * Get all organizations with optional status filter
 */
export async function getOrganizations(params?: {
  status?: OrganizationStatus;
  limit?: number;
  offset?: number;
}): Promise<Organization[]> {
  const { status, limit = 50, offset = 0 } = params || {};

  let query = db.select().from(organizations);

  if (status) {
    query = query.where(eq(organizations.status, status)) as any;
  }

  return await query
    .orderBy(desc(organizations.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Get active organizations
 */
export async function getActiveOrganizations(): Promise<Organization[]> {
  return await db
    .select()
    .from(organizations)
    .where(eq(organizations.status, 'active'))
    .orderBy(desc(organizations.createdAt));
}

/**
 * Get organizations by status
 */
export async function getOrganizationsByStatus(
  status: OrganizationStatus
): Promise<Organization[]> {
  return await db
    .select()
    .from(organizations)
    .where(eq(organizations.status, status))
    .orderBy(desc(organizations.createdAt));
}

/**
 * Get organizations created by a specific user
 */
export async function getOrganizationsByCreator(userId: string): Promise<Organization[]> {
  return await db
    .select()
    .from(organizations)
    .where(eq(organizations.createdByUserId, userId))
    .orderBy(desc(organizations.createdAt));
}

// ============================================================================
// SEARCH QUERIES
// ============================================================================

/**
 * Search organizations by name (full-text search)
 */
export async function searchOrganizations(
  searchTerm: string,
  options?: {
    status?: OrganizationStatus;
    limit?: number;
  }
): Promise<Organization[]> {
  const { status, limit = 20 } = options || {};

  const conditions = [
    sql`to_tsvector('english', ${organizations.name}) @@ plainto_tsquery('english', ${searchTerm})`,
  ];

  if (status) {
    conditions.push(eq(organizations.status, status));
  }

  return await db
    .select()
    .from(organizations)
    .where(and(...conditions))
    .limit(limit);
}

/**
 * Search organizations by name (simple pattern matching)
 */
export async function searchOrganizationsByName(
  searchTerm: string,
  options?: {
    caseSensitive?: boolean;
    limit?: number;
  }
): Promise<Organization[]> {
  const { caseSensitive = false, limit = 20 } = options || {};
  const pattern = `%${searchTerm}%`;

  return await db
    .select()
    .from(organizations)
    .where(caseSensitive ? like(organizations.name, pattern) : ilike(organizations.name, pattern))
    .limit(limit);
}

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create organization with default settings (transaction)
 */
export async function createOrganization(data: {
  name: string;
  phoneNumber: string;
  email?: string;
  displayName?: string;
  address?: string;
  businessType?: string;
  gstin?: string;
  pan?: string;
  createdByUserId?: string;
}): Promise<Organization> {
  return await db.transaction(async (tx) => {
    // Create organization
    const [org] = await tx
      .insert(organizations)
      .values({
        name: data.name,
        phoneNumber: data.phoneNumber,
        email: data.email,
        displayName: data.displayName,
        address: data.address,
        businessType: data.businessType,
        gstin: data.gstin,
        pan: data.pan,
        createdByUserId: data.createdByUserId,
      })
      .returning();

    // Create default settings
    await tx
      .insert(organizationSettings)
      .values({
        organizationId: org.id,
      });

    return org;
  });
}

/**
 * Create organization with custom settings (transaction)
 */
export async function createOrganizationWithSettings(
  orgData: {
    name: string;
    phoneNumber: string;
    email?: string;
    displayName?: string;
    address?: string;
    businessType?: string;
    gstin?: string;
    pan?: string;
    createdByUserId?: string;
  },
  settingsData?: Partial<OrganizationSettingsInsert>
): Promise<{ organization: Organization; settings: OrganizationSettings }> {
  return await db.transaction(async (tx) => {
    // Create organization
    const [org] = await tx
      .insert(organizations)
      .values(orgData)
      .returning();

    // Create settings with custom values
    const [settings] = await tx
      .insert(organizationSettings)
      .values({
        organizationId: org.id,
        ...settingsData,
      })
      .returning();

    return { organization: org, settings };
  });
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update organization
 */
export async function updateOrganization(
  orgId: string,
  data: OrganizationUpdate
): Promise<Organization | undefined> {
  const [updated] = await db
    .update(organizations)
    .set({
      ...data,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(organizations.id, orgId))
    .returning();
  
  return updated;
}

/**
 * Update organization status
 */
export async function updateOrganizationStatus(
  orgId: string,
  status: OrganizationStatus
): Promise<Organization | undefined> {
  return await updateOrganization(orgId, { status });
}

/**
 * Mark organization setup as complete
 */
export async function completeOrganizationSetup(
  orgId: string
): Promise<Organization | undefined> {
  return await updateOrganization(orgId, { setupComplete: true });
}

/**
 * Update organization settings
 */
export async function updateOrganizationSettings(
  orgId: string,
  data: OrganizationSettingsUpdate
): Promise<OrganizationSettings | undefined> {
  const [updated] = await db
    .update(organizationSettings)
    .set({
      ...data,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(organizationSettings.organizationId, orgId))
    .returning();
  
  return updated;
}

// ============================================================================
// DELETE/ARCHIVE OPERATIONS
// ============================================================================

/**
 * Soft delete organization (set status to archived)
 */
export async function archiveOrganization(orgId: string): Promise<Organization | undefined> {
  return await updateOrganizationStatus(orgId, 'archived');
}

/**
 * Suspend organization
 */
export async function suspendOrganization(orgId: string): Promise<Organization | undefined> {
  return await updateOrganizationStatus(orgId, 'suspended');
}

/**
 * Reactivate organization
 */
export async function reactivateOrganization(orgId: string): Promise<Organization | undefined> {
  return await updateOrganizationStatus(orgId, 'active');
}

/**
 * Hard delete organization (use with caution - will cascade delete)
 */
export async function deleteOrganization(orgId: string): Promise<void> {
  await db
    .delete(organizations)
    .where(eq(organizations.id, orgId));
}

// ============================================================================
// ACCESS CONTROL QUERIES
// ============================================================================

/**
 * Check if user has access to organization
 */
export async function hasOrganizationAccess(
  userId: string,
  orgId: string
): Promise<boolean> {
  const result = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(organizationUsers)
    .where(
      and(
        eq(organizationUsers.userId, userId),
        eq(organizationUsers.organizationId, orgId),
        eq(organizationUsers.isActive, true)
      )
    );

  return (result[0]?.count ?? 0) > 0;
}

/**
 * Get organizations for a user
 */
export async function getOrganizationsForUser(
  userId: string,
  options?: {
    includeInactive?: boolean;
  }
): Promise<Organization[]> {
  const { includeInactive = false } = options || {};

  let whereConditions = [
    eq(organizationUsers.userId, userId),
  ];

  if (!includeInactive) {
    whereConditions.push(eq(organizationUsers.isActive, true));
  }

  const result = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      displayName: organizations.displayName,
      phoneNumber: organizations.phoneNumber,
      email: organizations.email,
      address: organizations.address,
      setupComplete: organizations.setupComplete,
      status: organizations.status,
      businessType: organizations.businessType,
      gstin: organizations.gstin,
      pan: organizations.pan,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
      createdByUserId: organizations.createdByUserId,
    })
    .from(organizations)
    .innerJoin(
      organizationUsers,
      eq(organizations.id, organizationUsers.organizationId)
    )
    .where(and(...whereConditions))
    .orderBy(desc(organizations.createdAt));

  return result;
}

// ============================================================================
// STATISTICS QUERIES
// ============================================================================

/**
 * Get organization statistics
 */
export async function getOrganizationStats(orgId: string): Promise<{
  totalEmployees: number;
  activeEmployees: number;
  totalUsers: number;
  activeUsers: number;
}> {
  const [employeeStats] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`,
      active: sql<number>`cast(count(*) filter (where ${employees.status} = 'active') as int)`,
    })
    .from(employees)
    .where(eq(employees.organizationId, orgId));

  const [userStats] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`,
      active: sql<number>`cast(count(*) filter (where ${organizationUsers.isActive} = true) as int)`,
    })
    .from(organizationUsers)
    .where(eq(organizationUsers.organizationId, orgId));

  return {
    totalEmployees: employeeStats?.total ?? 0,
    activeEmployees: employeeStats?.active ?? 0,
    totalUsers: userStats?.total ?? 0,
    activeUsers: userStats?.active ?? 0,
  };
}

/**
 * Get count of organizations by status
 */
export async function getOrganizationCountByStatus(): Promise<
  Array<{ status: string; count: number }>
> {
  return await db
    .select({
      status: organizations.status,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(organizations)
    .groupBy(organizations.status)
    .orderBy(desc(sql`count(*)`));
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Get multiple organizations by IDs
 */
export async function getOrganizationsByIds(orgIds: string[]): Promise<Organization[]> {
  if (orgIds.length === 0) return [];

  return await db
    .select()
    .from(organizations)
    .where(sql`${organizations.id} = ANY(ARRAY[${sql.join(orgIds.map(id => sql`${id}`), sql`, `)}]::uuid[])`);
}

/**
 * Batch update organization status
 */
export async function batchUpdateOrganizationStatus(
  orgIds: string[],
  status: OrganizationStatus
): Promise<Organization[]> {
  if (orgIds.length === 0) return [];

  return await db
    .update(organizations)
    .set({
      status,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(sql`${organizations.id} = ANY(ARRAY[${sql.join(orgIds.map(id => sql`${id}`), sql`, `)}]::uuid[])`)
    .returning();
}

// ============================================================================
// VALIDATION QUERIES
// ============================================================================

/**
 * Check if organization name exists
 */
export async function organizationNameExists(
  name: string,
  excludeOrgId?: string
): Promise<boolean> {
  const conditions = [eq(organizations.name, name)];

  if (excludeOrgId) {
    conditions.push(sql`${organizations.id} != ${excludeOrgId}`);
  }

  const result = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(organizations)
    .where(and(...conditions));

  return (result[0]?.count ?? 0) > 0;
}

/**
 * Check if organization email exists
 */
export async function organizationEmailExists(
  email: string,
  excludeOrgId?: string
): Promise<boolean> {
  let whereConditions = [eq(organizations.email, email)];

  if (excludeOrgId) {
    whereConditions.push(sql`${organizations.id} != ${excludeOrgId}`);
  }

  const result = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(organizations)
    .where(and(...whereConditions));

  return (result[0]?.count ?? 0) > 0;
}

/**
 * Check if organization phone exists
 */
export async function organizationPhoneExists(
  phoneNumber: string,
  excludeOrgId?: string
): Promise<boolean> {
  let whereConditions = [eq(organizations.phoneNumber, phoneNumber)];

  if (excludeOrgId) {
    whereConditions.push(sql`${organizations.id} != ${excludeOrgId}`);
  }

  const result = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(organizations)
    .where(and(...whereConditions));

  return (result[0]?.count ?? 0) > 0;
}
