import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { organizations, organizationSettings } from './schema/schema';

// Combine all schemas
const schema = {
  organizations,
  organizationSettings,
};

// Lazy initialization to allow env vars to be loaded first
let _queryClient: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return connectionString;
}

function getQueryClient() {
  if (!_queryClient) {
    _queryClient = postgres(getConnectionString());
  }
  return _queryClient;
}

// Lazy getter for db instance
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    if (!_db) {
      _db = drizzle(getQueryClient(), { schema });
    }
    return (_db as any)[prop];
  }
});

// Export schema for use in queries
export { schema };
