/**
 * Jest Test Setup File
 * This file runs before all tests to set up the test environment
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { db } from '../../client';

// Load environment variables from .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// Set test timeout
jest.setTimeout(10000);

// Global test setup
beforeAll(() => {
  // Verify database URL is set
  if (!process.env.DATABASE_URL) {
    console.warn('WARNING: DATABASE_URL not set in environment variables');
  }
});

// Global cleanup - close database connections
afterAll(async () => {
  // Close database connection pool
  // @ts-ignore - accessing internal client
  if (db.$client) {
    // @ts-ignore
    await db.$client.end();
  }
});
