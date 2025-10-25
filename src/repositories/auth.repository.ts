import { db } from '../db/client';
import { users, organizations, organizationUsers, userSessions, employees } from '../db/schema/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

export interface CreateUserInput {
  phoneNumber: string;
  name: string;
  email?: string;
}

export interface CreateOrganizationInput {
  name: string;
  phoneNumber: string;
  createdByUserId: string;
}

export interface CreateSessionInput {
  userId: string;
  refreshTokenHash: string;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}

/**
 * Find user by phone number
 */
export const findUserByPhoneNumber = async (phoneNumber: string) => {
  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber))
      .limit(1);

    return result[0] || null;
  } catch (error) {
    logger.error('Error finding user by phone number:', error);
    throw error;
  }
};

/**
 * Create new user
 */
export const createUser = async (input: CreateUserInput) => {
  try {
    const [newUser] = await db
      .insert(users)
      .values({
        phoneNumber: input.phoneNumber,
        name: input.name,
        email: input.email,
        phoneVerified: true,
        phoneVerifiedAt: sql`NOW()`,
      })
      .returning();

    return newUser;
  } catch (error) {
    logger.error('Error creating user:', error);
    throw error;
  }
};

/**
 * Create new organization for user
 */
export const createOrganization = async (input: CreateOrganizationInput) => {
  try {
    const [newOrg] = await db
      .insert(organizations)
      .values({
        name: input.name,
        phoneNumber: input.phoneNumber,
        setupComplete: false,
        createdByUserId: input.createdByUserId,
      })
      .returning();

    return newOrg;
  } catch (error) {
    logger.error('Error creating organization:', error);
    throw error;
  }
};

/**
 * Link user to organization with role and permissions
 */
export const createOrganizationUser = async (
  organizationId: string,
  userId: string,
  role: string,
  permissions: any
) => {
  try {
    await db
      .insert(organizationUsers)
      .values({
        organizationId,
        userId,
        role,
        permissions,
        joinedAt: sql`NOW()`,
      });
  } catch (error) {
    logger.error('Error creating organization user:', error);
    throw error;
  }
};

/**
 * Get user with organization details
 */
export const getUserWithOrganization = async (userId: string) => {
  try {
    const result = await db
      .select({
        userId: users.id,
        phoneNumber: users.phoneNumber,
        userName: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        userCreatedAt: users.createdAt,
        orgId: organizations.id,
        orgName: organizations.name,
        orgPhone: organizations.phoneNumber,
        orgAddress: organizations.address,
        setupComplete: organizations.setupComplete,
        orgCreatedAt: organizations.createdAt,
        role: organizationUsers.role,
        permissions: organizationUsers.permissions,
        employeeCount: sql<number>`(SELECT COUNT(*) FROM ${employees} WHERE ${employees.organizationId} = ${organizations.id} AND ${employees.status} = 'active')`,
      })
      .from(users)
      .leftJoin(organizationUsers, and(
        eq(users.id, organizationUsers.userId),
        eq(organizationUsers.isActive, true)
      ))
      .leftJoin(organizations, eq(organizationUsers.organizationId, organizations.id))
      .where(eq(users.id, userId))
      .limit(1);

    return result[0] || null;
  } catch (error) {
    logger.error('Error getting user with organization:', error);
    throw error;
  }
};

/**
 * Create user session
 */
export const createUserSession = async (input: CreateSessionInput) => {
  try {
    const [session] = await db
      .insert(userSessions)
      .values({
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        platform: input.platform || 'web',
        ipAddress: input.ipAddress,
        expiresAt: input.expiresAt.toISOString(),
      })
      .returning();

    return session;
  } catch (error) {
    logger.error('Error creating user session:', error);
    throw error;
  }
};

/**
 * Update user login info
 */
export const updateUserLogin = async (userId: string, ipAddress?: string) => {
  try {
    await db
      .update(users)
      .set({
        lastLoginAt: sql`NOW()`,
        lastLoginIp: ipAddress,
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
      })
      .where(eq(users.id, userId));
  } catch (error) {
    logger.error('Error updating user login:', error);
    throw error;
  }
};

/**
 * Increment failed login attempts
 */
export const incrementFailedLoginAttempts = async (userId: string) => {
  try {
    const [updated] = await db
      .update(users)
      .set({
        failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`,
        lastFailedLoginAt: sql`NOW()`,
      })
      .where(eq(users.id, userId))
      .returning({ failedLoginAttempts: users.failedLoginAttempts });

    return updated;
  } catch (error) {
    logger.error('Error incrementing failed login attempts:', error);
    throw error;
  }
};

/**
 * Lock user account
 */
export const lockUserAccount = async (userId: string, lockDuration: number = 30) => {
  try {
    const lockedUntil = new Date();
    lockedUntil.setMinutes(lockedUntil.getMinutes() + lockDuration);

    await db
      .update(users)
      .set({
        isLocked: true,
        lockedUntil: lockedUntil.toISOString(),
        lockedReason: 'Too many failed login attempts',
      })
      .where(eq(users.id, userId));

    return lockedUntil;
  } catch (error) {
    logger.error('Error locking user account:', error);
    throw error;
  }
};

/**
 * Check if user account is locked
 */
export const isUserAccountLocked = async (userId: string) => {
  try {
    const result = await db
      .select({
        isLocked: users.isLocked,
        lockedUntil: users.lockedUntil,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = result[0];
    if (!user || !user.isLocked) {
      return { isLocked: false };
    }

    const lockedUntil = new Date(user.lockedUntil as string);
    const now = new Date();

    if (lockedUntil <= now) {
      // Unlock the account
      await db
        .update(users)
        .set({
          isLocked: false,
          lockedUntil: null,
          lockedReason: null,
        })
        .where(eq(users.id, userId));
      return { isLocked: false };
    }

    return {
      isLocked: true,
      lockedUntil: lockedUntil.toISOString(),
      retryAfter: Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000),
    };
  } catch (error) {
    logger.error('Error checking user account lock status:', error);
    throw error;
  }
};

/**
 * Get default owner permissions
 */
export const getDefaultOwnerPermissions = () => {
  return {
    employees: ['create', 'read', 'update', 'delete'],
    attendance: ['create', 'read', 'update', 'delete'],
    leaves: ['create', 'read', 'update', 'delete'],
    payroll: ['create', 'read', 'update', 'delete'],
    payments: ['create', 'read', 'update', 'delete'],
    advances: ['create', 'read', 'update', 'delete'],
    loans: ['create', 'read', 'update', 'delete'],
    reports: ['read', 'export'],
  };
};

/**
 * Find active session by refresh token hash
 */
export const findSessionByRefreshToken = async (refreshTokenHash: string) => {
  try {
    const result = await db
      .select({
        id: userSessions.id,
        userId: userSessions.userId,
        isActive: userSessions.isActive,
        expiresAt: userSessions.expiresAt,
        revokedAt: userSessions.revokedAt,
        revokedReason: userSessions.revokedReason,
      })
      .from(userSessions)
      .where(eq(userSessions.refreshTokenHash, refreshTokenHash))
      .limit(1);

    return result[0] || null;
  } catch (error) {
    logger.error('Error finding session by refresh token:', error);
    throw error;
  }
};

/**
 * Update session with new refresh token
 */
export const updateSessionRefreshToken = async (
  sessionId: string,
  newRefreshTokenHash: string,
  expiresAt: Date
) => {
  try {
    const [updated] = await db
      .update(userSessions)
      .set({
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: expiresAt.toISOString(),
        lastActivityAt: sql`NOW()`,
      })
      .where(eq(userSessions.id, sessionId))
      .returning();

    return updated;
  } catch (error) {
    logger.error('Error updating session refresh token:', error);
    throw error;
  }
};

/**
 * Revoke user session
 */
export const revokeSession = async (sessionId: string, reason: string) => {
  try {
    await db
      .update(userSessions)
      .set({
        isActive: false,
        revokedAt: sql`NOW()`,
        revokedReason: reason,
      })
      .where(eq(userSessions.id, sessionId));
  } catch (error) {
    logger.error('Error revoking session:', error);
    throw error;
  }
};

/**
 * Check if user is still active and not locked
 */
export const validateUserStatus = async (userId: string) => {
  try {
    const result = await db
      .select({
        isActive: users.isActive,
        isLocked: users.isLocked,
        lockedUntil: users.lockedUntil,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = result[0];
    if (!user) {
      return { valid: false, reason: 'user_not_found' };
    }

    if (!user.isActive) {
      return { valid: false, reason: 'user_deactivated' };
    }

    if (user.isLocked) {
      const lockedUntil = new Date(user.lockedUntil as string);
      const now = new Date();
      
      if (lockedUntil > now) {
        return { 
          valid: false, 
          reason: 'account_locked',
          lockedUntil: lockedUntil.toISOString(),
        };
      }
    }

    return { valid: true };
  } catch (error) {
    logger.error('Error validating user status:', error);
    throw error;
  }
};
