import { db } from '../../src/db/client';
import { users, organizations, organizationUsers, userSessions } from '../../src/db/schema/schema';
import { eq } from 'drizzle-orm';

/**
 * Clean up test user and associated data by phone number
 * Removes: user sessions, organization links, created organizations, and the user
 */
export async function cleanupTestUser(phoneNumber: string): Promise<void> {
  try {
    const existingUsers = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
    
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
    
    // Clean up any orphaned organizations with test phone number
    await db.delete(organizations).where(eq(organizations.phoneNumber, phoneNumber));
  } catch (error) {
    // Ignore cleanup errors - may be normal if data doesn't exist
    console.log('Cleanup error (may be normal):', error);
  }
}

/**
 * Clean up multiple test users by phone numbers
 */
export async function cleanupTestUsers(phoneNumbers: string[]): Promise<void> {
  await Promise.all(phoneNumbers.map(cleanupTestUser));
}

/**
 * Clean up test user by user ID
 */
export async function cleanupTestUserById(userId: string): Promise<void> {
  try {
    await db.delete(userSessions).where(eq(userSessions.userId, userId));
    await db.delete(organizationUsers).where(eq(organizationUsers.userId, userId));
    
    const userOrgs = await db.select().from(organizations).where(eq(organizations.createdByUserId, userId));
    for (const org of userOrgs) {
      await db.delete(organizationUsers).where(eq(organizationUsers.organizationId, org.id));
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
    
    await db.delete(users).where(eq(users.id, userId));
  } catch (error) {
    console.log('Cleanup error (may be normal):', error);
  }
}
