import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { organizations, organizationSettings } from './schema/schema';

// Combine all schemas
const schema = {
  organizations,
  organizationSettings,
};

const connectionString = process.env.DATABASE_URL!;

// For query purposes
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

// Export schema for use in queries
export { schema };
