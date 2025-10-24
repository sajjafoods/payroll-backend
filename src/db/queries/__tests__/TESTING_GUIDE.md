# Testing Guide for Organization Queries

This guide provides multiple approaches for testing the organization query functions.

## Table of Contents
1. [Quick Start](#quick-start)
2. [Testing Approaches](#testing-approaches)
3. [Unit Testing with Jest](#unit-testing-with-jest)
4. [Integration Testing](#integration-testing)
5. [Database Setup](#database-setup)
6. [Common Issues](#common-issues)

---

## Quick Start

### Prerequisites
- PostgreSQL database running (via Docker or local installation)
- Database migrated with latest schema
- Environment variables configured (.env.local)

### Run Jest Tests
```bash
# Install Jest and dependencies if not already installed
npm install -D jest @jest/globals @types/jest ts-jest

# Run all tests
npm test

# Run only organization tests
npm test -- organizations.test.ts

# Run with coverage
npm test -- --coverage
```

---

## Testing Approaches

### 1. Unit Testing with Jest ✅ **RECOMMENDED FOR CI/CD**

**File:** `organizations.test.ts`

**Pros:**
- Automated test execution
- Test coverage reports
- Parallel test execution
- CI/CD integration

**Setup Jest Configuration:**

Create `jest.config.js` in the project root:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/db/queries/**/*.ts',
    '!src/db/queries/**/*.test.ts',
    '!src/db/queries/**/*.manual.ts',
  ],
};
```

**Run tests:**
```bash
npm test
```

---

### 2. Using Drizzle Studio (Visual Testing)

**Start Drizzle Studio:**
```bash
npx drizzle-kit studio
```

This opens a web interface where you can:
- View all organizations
- Manually create/update/delete records
- Verify query results visually
- Inspect relationships

---

### 3. Database Client Testing (Direct SQL)

**Using psql:**
```bash
psql -h localhost -U your_user -d your_database
```

**Test queries directly:**
```sql
-- Set bypass RLS for testing
SET app.bypass_rls = 'true';

-- View organizations
SELECT * FROM organizations;

-- View organization with settings
SELECT o.*, s.* 
FROM organizations o
LEFT JOIN organization_settings s ON o.id = s.organization_id
WHERE o.id = 'your-org-id';

-- Test full-text search
SELECT * FROM organizations 
WHERE to_tsvector('english', name) @@ plainto_tsquery('english', 'test');
```

---

## Unit Testing with Jest

### Test Structure

```typescript
describe('Organization Queries', () => {
  let testOrgId: string;

  beforeAll(async () => {
    // Setup: Enable RLS bypass
    await db.execute(sql`SET app.bypass_rls = 'true'`);
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    if (testOrgId) {
      await orgQueries.deleteOrganization(testOrgId);
    }
    await db.execute(sql`SET app.bypass_rls = 'false'`);
  });

  it('should create organization', async () => {
    const org = await orgQueries.createOrganization({
      name: 'Test Org',
      phoneNumber: '+919876543210',
    });
    testOrgId = org.id;
    
    expect(org).toBeDefined();
    expect(org.name).toBe('Test Org');
  });
});
```

### Running Specific Tests

```bash
# Run specific test file
npm test -- organizations.test.ts

# Run specific test suite
npm test -- --testNamePattern="CREATE Operations"

# Run with watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

---

## Integration Testing

### Testing with Real Database

1. **Setup Test Database:**
   ```bash
   # Create test database
   createdb payroll_test
   
   # Run migrations
   DATABASE_URL=postgresql://user:pass@localhost:5432/payroll_test npm run migrate
   ```

2. **Configure Test Environment:**
   ```typescript
   // test.config.ts
   process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/payroll_test';
   ```

3. **Run Integration Tests:**
   ```bash
   NODE_ENV=test npm test
   ```

---

## Database Setup

### Using Docker Compose

```bash
# Start PostgreSQL
docker-compose up -d

# Run migrations
npm run db:migrate

# Seed test data (if you have seed scripts)
npm run db:seed
```

### Manual PostgreSQL Setup

```bash
# Start PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE payroll_db;

# Run migrations
npm run db:migrate
```

### Enable RLS Bypass for Testing

For testing purposes, you need to bypass Row Level Security:

```typescript
import { sql } from 'drizzle-orm';
import { db } from './client';

// Before tests
await db.execute(sql`SET app.bypass_rls = 'true'`);

// After tests
await db.execute(sql`SET app.bypass_rls = 'false'`);
```

---

## Common Issues

### Issue 1: Connection Refused

**Problem:** Can't connect to database

**Solution:**
```bash
# Check if PostgreSQL is running
docker ps
# or
pg_isready

# Check environment variables
echo $DATABASE_URL

# Verify connection string in .env.local
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### Issue 2: RLS Policies Blocking Tests

**Problem:** Queries return empty results

**Solution:**
```typescript
// Always bypass RLS in tests
await db.execute(sql`SET app.bypass_rls = 'true'`);
```

### Issue 3: Unique Constraint Violations

**Problem:** Tests fail due to duplicate data

**Solution:**
```typescript
// Use unique test data
const timestamp = Date.now();
const org = await createOrganization({
  name: `Test Org ${timestamp}`,
  phoneNumber: `+9198765432${timestamp % 100}`,
  email: `test${timestamp}@example.com`,
});
```

### Issue 4: Transaction Rollback in Tests

**Problem:** Want to rollback test data automatically

**Solution:**
```typescript
import { db } from './client';

describe('with transaction rollback', () => {
  beforeEach(async () => {
    await db.execute(sql`BEGIN`);
  });

  afterEach(async () => {
    await db.execute(sql`ROLLBACK`);
  });

  it('test something', async () => {
    // Changes will be rolled back
  });
});
```

---

## Best Practices

1. **Always Clean Up Test Data**
   - Delete test records after tests
   - Use unique identifiers for test data
   - Consider using transactions that rollback

2. **Bypass RLS in Tests**
   - Set `app.bypass_rls = 'true'` before tests
   - Reset it after tests complete

3. **Test Edge Cases**
   - Test with null/undefined values
   - Test with invalid data
   - Test pagination limits
   - Test concurrent operations

4. **Use Meaningful Test Data**
   - Use realistic data that matches production
   - Include edge cases (long names, special characters, etc.)

5. **Monitor Test Performance**
   - Keep tests fast (< 5 seconds per test suite)
   - Use database connections efficiently
   - Clean up connections after tests

---

## Example Test Scenarios

### Scenario 1: Create Organization Flow
```typescript
// Create organization
const org = await createOrganization({ name: 'Test', phoneNumber: '+91...' });

// Verify it exists
const retrieved = await getOrganizationById(org.id);
expect(retrieved).toBeDefined();

// Verify settings were created
const withSettings = await getOrganizationWithSettings(org.id);
expect(withSettings?.organization_settings).toBeDefined();

// Cleanup
await deleteOrganization(org.id);
```

### Scenario 2: Search and Filter
```typescript
// Create test organizations
const org1 = await createOrganization({ name: 'Tech Corp', ... });
const org2 = await createOrganization({ name: 'Tech Solutions', ... });

// Search by name
const results = await searchOrganizationsByName('Tech');
expect(results.length).toBeGreaterThanOrEqual(2);

// Filter by status
const active = await getOrganizationsByStatus('active');
expect(active).toContain(org1);

// Cleanup
await deleteOrganization(org1.id);
await deleteOrganization(org2.id);
```

### Scenario 3: Update and Status Changes
```typescript
// Create organization
const org = await createOrganization({ name: 'Test', ... });

// Suspend
const suspended = await suspendOrganization(org.id);
expect(suspended?.status).toBe('suspended');

// Reactivate
const active = await reactivateOrganization(org.id);
expect(active?.status).toBe('active');

// Archive
const archived = await archiveOrganization(org.id);
expect(archived?.status).toBe('archived');

// Cleanup
await deleteOrganization(org.id);
```

---

## Conclusion

Choose the testing approach that fits your needs:

- **Quick debugging:** Use manual test script
- **CI/CD:** Use Jest unit tests
- **Exploration:** Use REPL or Drizzle Studio
- **Deep inspection:** Use SQL client

For comprehensive testing, combine multiple approaches!
