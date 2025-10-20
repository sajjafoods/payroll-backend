import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });


export default defineConfig({
  out: './src/db/schema',  // All generated files go inside src
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  introspect: {
    casing: 'camel', // Convert snake_case to camelCase
  },
  tablesFilter: ['!_prisma_migrations', '!flyway_schema_history'], // Exclude migration tracking tables
  verbose: true,
  strict: true,
});
