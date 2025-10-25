# API Implementation Best Practices

**Based on Auth APIs Implementation in Payroll Backend**

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Layered Architecture](#layered-architecture)
3. [Error Handling](#error-handling)
4. [Validation](#validation)
5. [Code Reusability](#code-reusability)
6. [Testing Strategy](#testing-strategy)
7. [Security Best Practices](#security-best-practices)
8. [Database Practices](#database-practices)
9. [API Response Standards](#api-response-standards)
10. [Logging](#logging)

---

## Project Structure

### Organized Directory Layout

```
src/
├── handlers/           # API endpoint handlers
│   ├── auth/
│   │   ├── sendOtp.ts
│   │   ├── verifyOtp.ts
│   │   ├── refreshToken.ts
│   │   └── logout.ts
│   └── ...
├── services/          # Business logic layer
│   ├── auth.service.ts
│   └── ...
├── repositories/      # Data access layer
│   ├── auth.repository.ts
│   └── ...
├── middleware/        # Shared middleware
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   └── validation.middleware.ts
├── utils/            # Utility functions
│   ├── jwt.ts
│   ├── otp.ts
│   ├── logger.ts
│   ├── request.ts
│   └── ...
├── types/            # TypeScript type definitions
│   └── api.types.ts
└── config/           # Configuration
    └── constants.ts

tests/
├── auth/             # Integration tests
├── helpers/          # Test utilities
│   ├── auth.helper.ts
│   ├── database.helper.ts
│   ├── event.helper.ts
│   ├── fixtures.helper.ts
│   └── redis.helper.ts
└── unit/            # Unit tests
```

**Benefits:**
- Clear separation of concerns
- Easy to locate files
- Scalable structure
- Consistent organization

---

## Layered Architecture

### 3-Layer Architecture Pattern

#### 1. Handler Layer (Presentation)

**Responsibility:** HTTP request/response handling

```typescript
// src/handlers/auth/verifyOtp.ts
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Verify OTP request received');

    // 1. Parse request body
    const body = parseRequestBody<VerifyOtpRequest>(event);
    
    // 2. Validate input
    const validatedData = verifyOtpRequestSchema.parse(body);
    
    // 3. Extract client context
    const clientIp = extractClientIp(event);
    
    // 4. Call service layer
    const result = await verifyOtpAndAuthenticate(
      validatedData.phoneNumber,
      validatedData.otp,
      validatedData.deviceInfo,
      clientIp
    );
    
    // 5. Return success response
    return successResponse(result, 200);
  } catch (error) {
    logger.error('Error in verifyOtp handler:', error);
    return handleError(error);
  }
};
```

**Best Practices:**
- ✅ Minimal business logic in handlers
- ✅ Consistent error handling with try-catch
- ✅ Use helper functions for common operations
- ✅ Clear, descriptive logging
- ✅ Single responsibility: HTTP concerns only

#### 2. Service Layer (Business Logic)

**Responsibility:** Core business rules and orchestration

```typescript
// src/services/auth.service.ts
export const verifyOtpAndAuthenticate = async (
  phoneNumber: string,
  otp: string,
  deviceInfo?: DeviceInfo,
  ipAddress?: string
): Promise<VerifyOtpResponse> => {
  try {
    // 1. Verify OTP
    const isValid = await verifyOtpUtil(phoneNumber, otp);
    
    if (!isValid) {
      // Handle failed attempts
      const existingUser = await findUserByPhoneNumber(phoneNumber);
      if (existingUser) {
        await incrementFailedLoginAttempts(existingUser.id);
        // Check if should lock account
      }
      throw new AppError(ErrorCode.INVALID_OTP, 'OTP is invalid or expired', 401);
    }

    // 2. Find or create user
    let user = await findUserByPhoneNumber(phoneNumber);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await createUser({ phoneNumber });
      const org = await createOrganization({ /* ... */ });
      await createOrganizationUser(org.id, user.id, 'owner');
    }

    // 3. Generate tokens
    const tokens = generateTokenPair({ userId: user.id, /* ... */ });
    
    // 4. Create session
    await createUserSession({ /* ... */ });
    
    // 5. Update login info
    await updateUserLogin(user.id, ipAddress);

    // 6. Build and return response
    return buildAuthResponse(user, isNewUser, tokens);
  } catch (error) {
    if (error instanceof AppError) throw error;
    
    logger.error('Error in verifyOtpAndAuthenticate:', error);
    throw new AppError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'An unexpected error occurred',
      500
    );
  }
};
```

**Best Practices:**
- ✅ Contains all business logic
- ✅ Orchestrates multiple repository calls
- ✅ Handles domain-specific errors
- ✅ Re-throws AppError instances
- ✅ Wraps unexpected errors in generic AppError
- ✅ Does not know about HTTP concepts

#### 3. Repository Layer (Data Access)

**Responsibility:** Database operations only

```typescript
// src/repositories/auth.repository.ts
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

export const createUser = async (input: CreateUserInput) => {
  try {
    const [newUser] = await db
      .insert(users)
      .values({
        phoneNumber: input.phoneNumber,
        name: input.name,
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
```

**Best Practices:**
- ✅ Pure data operations
- ✅ No business logic
- ✅ Reusable across services
- ✅ Simple error handling (log and throw)
- ✅ Type-safe with input interfaces
- ✅ Returns null for not found (instead of throwing)

---

## Error Handling

### Standardized Error Codes

**See: ERROR_CODE_STANDARDIZATION_GUIDE.md**

```typescript
// src/types/api.types.ts
export enum ErrorCode {
  // Validation Errors (400)
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Authentication Errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_OTP = 'INVALID_OTP',
  INVALID_REFRESH_TOKEN = 'INVALID_REFRESH_TOKEN',
  
  // Authorization Errors (403)
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  
  // Rate Limiting (429)
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  TOO_MANY_OTP_REQUESTS = 'TOO_MANY_OTP_REQUESTS',
  
  // Account Errors (423)
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  
  // Server Errors (500)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  OTP_DELIVERY_FAILED = 'OTP_DELIVERY_FAILED',
}
```

### Custom AppError Class

```typescript
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

### Error Handling Pattern

```typescript
// In Services
try {
  // Business logic
} catch (error) {
  // Re-throw AppError as-is
  if (error instanceof AppError) {
    throw error;
  }
  
  // Log internal error details
  logger.error('Service error:', error);
  
  // Throw generic error to client
  throw new AppError(
    ErrorCode.INTERNAL_SERVER_ERROR,
    'An unexpected error occurred',
    500
  );
}

// In Handlers
try {
  // Handler logic
  return successResponse(result, 200);
} catch (error) {
  logger.error('Handler error:', error);
  return handleError(error); // Centralized error handler
}
```

### Centralized Error Handler

```typescript
// src/middleware/error.middleware.ts
export const handleError = (error: unknown, requestId?: string): APIGatewayProxyResult => {
  const reqId = requestId || generateRequestId();

  // Handle AppError
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: JSON.stringify({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId: reqId,
        },
      }),
    };
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        error: {
          code: ErrorCode.MISSING_REQUIRED_FIELD,
          message: 'Validation failed',
          details: { errors: error.issues },
        },
      }),
    };
  }

  // Generic error
  return {
    statusCode: 500,
    body: JSON.stringify({
      success: false,
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
        requestId: reqId,
      },
    }),
  };
};
```

**Benefits:**
- ✅ Consistent error responses
- ✅ No implementation details leaked
- ✅ User-friendly error messages
- ✅ Traceable with request IDs
- ✅ Proper HTTP status codes

---

## Validation

### Zod Schema Validation

```typescript
// src/middleware/validation.middleware.ts
import { z } from 'zod';

// Define reusable schemas
export const phoneNumberSchema = z.string()
  .regex(/^(\+91)?[6-9]\d{9}$/, {
    message: 'Phone number format is invalid',
  });

export const verifyOtpRequestSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only digits'),
  deviceInfo: z.object({
    deviceId: z.string().optional(),
    deviceName: z.string().optional(),
    platform: z.enum(['web', 'android', 'ios']).optional(),
  }).optional(),
});
```

### Validation in Handlers

```typescript
// Parse and validate
const body = parseRequestBody<VerifyOtpRequest>(event);
const validationResult = verifyOtpRequestSchema.safeParse(body);

if (!validationResult.success) {
  // Extract unique fields
  const missingFields = [...new Set(
    validationResult.error.issues.map(err => err.path[0])
  )];
  
  throw new AppError(
    ErrorCode.INVALID_REQUEST,
    'Phone number and OTP are required',
    400,
    { missingFields, errors: validationResult.error.issues }
  );
}

const validatedData = validationResult.data;
```

**Best Practices:**
- ✅ Use Zod for runtime type validation
- ✅ Define schemas in middleware
- ✅ Reuse common schemas
- ✅ Use safeParse for custom error handling
- ✅ Provide meaningful validation messages

---

## Code Reusability

### Utility Functions

```typescript
// src/utils/request.ts
export const parseRequestBody = <T = any>(event: APIGatewayProxyEvent): T => {
  try {
    return JSON.parse(event.body || '{}') as T;
  } catch (error) {
    throw new AppError(ErrorCode.INVALID_REQUEST, 'Invalid request body', 400);
  }
};

export const extractAuthToken = (event: APIGatewayProxyEvent): string => {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  
  if (!authHeader) {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing Authorization header', 401);
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AppError(ErrorCode.UNAUTHORIZED, 'Invalid Authorization header format', 401);
  }

  return parts[1];
};
```

### Shared Middleware

```typescript
// src/middleware/auth.middleware.ts
export const extractAndVerifyToken = (event: APIGatewayProxyEvent) => {
  const token = extractAuthToken(event);
  return verifyAccessToken(token); // Returns decoded payload
};
```

### Response Helpers

```typescript
// src/middleware/error.middleware.ts
export const successResponse = <T>(data: T, statusCode = 200): APIGatewayProxyResult => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      success: true,
      data,
    }),
  };
};
```

**Benefits:**
- ✅ DRY principle
- ✅ Consistent behavior
- ✅ Easier to maintain
- ✅ Single source of truth

---

## Testing Strategy

### Real Dependencies Approach

**Philosophy:** Use real database and Redis connections for integration tests

```typescript
// tests/auth/verifyOtp.integration.test.ts
describe('POST /api/v1/auth/verify-otp - Integration Tests', () => {
  const testPhoneNumber = generateUniquePhoneNumber();
  
  beforeEach(async () => {
    await cleanupTestUser(testPhoneNumber);
  });

  afterAll(async () => {
    await cleanupTestUser(testPhoneNumber);
    await teardownRedis();
  });

  it('should create new user and organization', async () => {
    // Store real OTP in Redis
    await storeOtp(testPhoneNumber, DEFAULT_TEST_OTP);

    const event = createMockEvent({
      phoneNumber: testPhoneNumber,
      otp: DEFAULT_TEST_OTP,
    });

    // Call actual handler
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.isNewUser).toBe(true);
    
    // Verify in real database
    const users = await db.select()
      .from(users)
      .where(eq(users.phoneNumber, testPhoneNumber));
    expect(users).toHaveLength(1);
  });
});
```

**Benefits:**
- ✅ Tests real behavior
- ✅ Catches integration issues
- ✅ No mock complexity
- ✅ Validates actual data flow
- ✅ Confidence in production

### Test Helpers for Code Reuse

```typescript
// tests/helpers/index.ts - Barrel export
export {
  cleanupTestUser,
  cleanupTestUsers,
} from './database.helper';

export {
  setupRedisForTests,
  clearOtpRateLimits,
  teardownRedis,
} from './redis.helper';

export {
  createMockEvent,
  createAuthenticatedMockEvent,
} from './event.helper';

export {
  generateUniquePhoneNumber,
  DEFAULT_TEST_OTP,
  TEST_DEVICE_INFO,
} from './fixtures.helper';
```

### Database Helper Example

```typescript
// tests/helpers/database.helper.ts
export const cleanupTestUser = async (phoneNumber: string): Promise<void> => {
  try {
    const user = await db.select()
      .from(users)
      .where(eq(users.phoneNumber, phoneNumber))
      .limit(1);

    if (user.length === 0) return;

    const userId = user[0].id;

    // Cleanup in order (respecting foreign keys)
    await db.delete(userSessions).where(eq(userSessions.userId, userId));
    await db.delete(organizationUsers).where(eq(organizationUsers.userId, userId));
    
    const orgs = await db.select()
      .from(organizations)
      .where(eq(organizations.createdByUserId, userId));
    
    for (const org of orgs) {
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
    
    await db.delete(users).where(eq(users.id, userId));
  } catch (error) {
    console.error('Error cleaning up test user:', error);
  }
};
```

### Event Helper Example

```typescript
// tests/helpers/event.helper.ts
export const createMockEvent = (
  body: any,
  path: string = '/api/v1/test'
): APIGatewayProxyEvent => {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: 'test',
      apiId: 'test',
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      path,
      stage: 'test',
      requestId: 'test-request-id',
      requestTime: new Date().toISOString(),
      requestTimeEpoch: Date.now(),
      identity: {
        sourceIp: '127.0.0.1',
        // ... other fields
      },
      // ... other fields
    } as any,
    resource: path,
  } as APIGatewayProxyEvent;
};
```

### Fixtures Helper Example

```typescript
// tests/helpers/fixtures.helper.ts
export const generateUniquePhoneNumber = (): string => {
  const random = Math.floor(Math.random() * 100);
  return `+919876543${random.toString().padStart(2, '0')}`;
};

export const DEFAULT_TEST_OTP = '123456';

export const TEST_DEVICE_INFO = {
  deviceId: 'test_device_123',
  deviceName: 'Test Device',
  platform: 'web' as const,
};
```

**Code Reduction:**
- 39-41% reduction in test file size
- Eliminates duplication across 5+ test files
- Single source of truth for test utilities

---

## Security Best Practices

### 1. Never Leak Implementation Details

```typescript
// ❌ BAD - Reveals SMS provider
throw new AppError(
  ErrorCode.SMS_SERVICE_ERROR,
  'AWS SNS failed to send message',
  500
);

// ✅ GOOD - Generic delivery error
throw new AppError(
  ErrorCode.OTP_DELIVERY_FAILED,
  'Failed to send OTP. Please try again',
  500
);
```

### 2. Mask Sensitive Data in Logs

```typescript
logger.info('OTP sent successfully', {
  phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, 'X'),
  // Logs: +91XXXXXX3210
});
```

### 3. Rate Limiting

```typescript
// Check phone number rate limit (3 requests in 10 minutes)
const phoneRateLimit = await checkOtpRateLimit(phoneNumber);
if (!phoneRateLimit.allowed) {
  throw new AppError(
    ErrorCode.TOO_MANY_OTP_REQUESTS,
    'Too many OTP requests. Please try after 10 minutes',
    429,
    { retryAfter: phoneRateLimit.retryAfter }
  );
}

// Check IP rate limit (10 requests in 1 hour)
const ipRateLimit = await checkIpRateLimit(clientIp);
if (!ipRateLimit.allowed) {
  throw new AppError(
    ErrorCode.TOO_MANY_REQUESTS,
    'Too many requests from this IP',
    429
  );
}
```

### 4. Account Locking

```typescript
// Increment failed attempts
const updated = await incrementFailedLoginAttempts(existingUser.id);

// Lock after 5 failed attempts
if (updated && updated.failedLoginAttempts >= 5) {
  const lockedUntil = await lockUserAccount(existingUser.id);
  throw new AppError(
    ErrorCode.ACCOUNT_LOCKED,
    'Too many failed attempts. Account locked for 30 minutes',
    423,
    { lockedUntil: lockedUntil.toISOString(), retryAfter: 1800 }
  );
}
```

### 5. Token Security

```typescript
// Hash refresh tokens before storing
const tokenHash = hashRefreshToken(tokens.refreshToken);
await createUserSession({
  userId: user.id,
  refreshTokenHash: tokenHash, // Never store plain tokens
  expiresAt,
});

// Token rotation on refresh
const newTokens = generateTokenPair({ /* ... */ });
await updateSessionRefreshToken(session.id, hashRefreshToken(newTokens.refreshToken));
```

### 6. Session Management

```typescript
// Unique session ID per login
const sessionId = randomUUID();
const tokens = generateTokenPair({
  userId: user.id,
  sessionId, // Embedded in JWT
});

// Track device info
await createUserSession({
  deviceId: deviceInfo?.deviceId,
  deviceName: deviceInfo?.deviceName,
  platform: deviceInfo?.platform || 'web',
  ipAddress,
});
```

---

## Database Practices

### 1. Use Drizzle ORM

```typescript
import { db } from '../db/client';
import { users, organizations } from '../db/schema/schema';
import { eq, and, sql } from 'drizzle-orm';
```

### 2. Type-Safe Queries

```typescript
const result = await db
  .select({
    userId: users.id,
    userName: users.name,
    orgId: organizations.id,
    orgName: organizations.name,
  })
  .from(users)
  .leftJoin(organizations, eq(users.id, organizations.createdByUserId))
  .where(eq(users.id, userId))
  .limit(1);
```

### 3. Use Transactions for Related Operations

```typescript
const result = await db.transaction(async (tx) => {
  // Update user
  const [updatedUser] = await tx
    .update(users)
    .set({ name: validatedData.ownerName })
    .where(eq(users.id, userId))
    .returning();

  // Update organization
  const [updatedOrg] = await tx
    .update(organizations)
    .set({ name: validatedData.organizationName })
    .where(eq(organizations.id, organizationId))
    .returning();

  return { user: updatedUser, organization: updatedOrg };
});
```

### 4. Use SQL Functions Safely

```typescript
await db.update(users).set({
  lastLoginAt: sql`NOW()`,
  failedLoginAttempts: 0,
});
```

### 5. Repository Pattern

```typescript
// Encapsulate data access
export const findUserByPhoneNumber = async (phoneNumber: string) => {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.phoneNumber, phoneNumber))
    .limit(1);
  
  return result[0] || null; // Consistent null handling
};
```

---

## API Response Standards

### Success Response Structure

```typescript
{
  "success": true,
  "data": {
    // Response data
  }
}
```

### Error Response Structure

```typescript
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Optional context
    },
    "requestId": "req_1234567890_abc123"
  }
}
```

### Response Helper Usage

```typescript
// Success
return successResponse(result, 200);

// Error
return handleError(error);
```

### HTTP Status Code Mapping

| Status | Use Case |
|--------|----------|
| 200 | Successful operation |
| 400 | Validation errors |
| 401 | Authentication errors |
| 403 | Authorization errors |
| 404 | Resource not found |
| 409 | Conflict (duplicate resource) |
| 423 | Account/resource locked |
| 429 | Rate limiting |
| 500 | Server errors |

---

## Logging

### Structured Logging

```typescript
import { logger } from '../utils/logger';

// Info logs
logger.info('Send OTP request received', {
  path: event.path,
  method: event.httpMethod,
});

// Success logs with masked data
logger.info('OTP sent successfully', {
  phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, 'X'),
});

// Error logs with context
logger.error('Error in sendOtp service:', error);
```

### Log Levels

- **INFO**: Request received, operation successful
- **ERROR**: Errors (always log before throwing/returning)
- **WARN**: Unusual but handled situations

### What to Log

✅ **DO Log:**
- Request received (method, path)
- Successful operations
- Error occurrences with context
- Masked sensitive data

❌ **DON'T Log:**
- Full phone numbers
- OTP codes
- Passwords
- Tokens
- Personal identifiable information (PII)

---

## Summary Checklist

When implementing new APIs, ensure:

### Architecture
- [ ] Handler → Service → Repository layers
- [ ] Handlers focus on HTTP concerns only
- [ ] Services contain business logic
- [ ] Repositories handle data access only

### Error Handling
- [ ] Use standardized ErrorCode enum
- [ ] Throw AppError with proper status codes
- [ ] Re-throw AppError in services
- [ ] Wrap unexpected errors generically
- [ ] Use centralized error handler
- [ ] Never leak implementation details

### Validation
- [ ] Define Zod schemas in middleware
- [ ] Validate all input data
- [ ] Provide meaningful error messages
- [ ] Use safeParse for custom error handling

### Code Reuse
- [ ] Extract common utilities
- [ ] Use shared middleware
- [ ] Create response helpers
- [ ] Follow DRY principle

### Testing
- [ ] Write integration tests with real dependencies
- [ ] Create reusable test helpers
- [ ] Use barrel exports for helpers
- [ ] Clean up test data properly
- [ ] Test error scenarios

### Security
- [ ] Implement rate limiting
- [ ] Mask sensitive data in logs
- [ ] Hash tokens before storage
- [ ] Implement account locking
- [ ] Rotate refresh tokens
- [ ] Track device and session info

### Database
- [ ] Use Drizzle ORM
- [ ] Type-safe queries
- [ ] Transactions for related operations
- [ ] Repository pattern
- [ ] Consistent null handling

### API Standards
- [ ] Consistent response structure
- [ ] Proper HTTP status codes
- [ ] Request IDs for tracing
- [ ] Structured logging
- [ ] Clear API documentation

---

## Example: Complete API Implementation Flow

```typescript
// 1. HANDLER (src/handlers/example/create.ts)
export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    logger.info('Create request received');
    
    const tokenPayload = extractAndVerifyToken(event);
    const body = parseRequestBody<CreateRequest>(event);
    const validatedData = createSchema.parse(body);
    
    const result = await createService(
      tokenPayload.userId,
      validatedData
    );
    
    return successResponse(result, 201);
  } catch (error) {
    logger.error('Error in create handler:', error);
    return handleError(error);
  }
};

// 2. SERVICE (src/services/example.service.ts)
export const createService = async (
  userId: string,
  data: CreateInput
): Promise<CreateResponse> => {
  try {
    // Business logic
    const exists = await findByName(data.name);
    if (exists) {
      throw new AppError(
        ErrorCode.DUPLICATE_ENTRY,
        'Resource already exists',
        409
      );
    }
    
    const created = await createResource({ userId, ...data });
    return { id: created.id, message: 'Created successfully' };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Error in createService:', error);
    throw new AppError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'An unexpected error occurred',
      500
    );
  }
};

// 3. REPOSITORY (src/repositories/example.repository.ts)
export const createResource = async (input: CreateInput) => {
  try {
    const [created] = await db
      .insert(resources)
      .values(input)
      .returning();
    return created;
  } catch (error) {
    logger.error('Error creating resource:', error);
    throw error;
  }
};

// 4. TEST (tests/example/create.integration.test.ts)
import { 
  createMockEvent,
  createTestSession,
  cleanupTestUser,
} from '../helpers';

describe('Create Resource', () => {
  it('should create resource successfully', async () => {
    const session = await createTestSession('+919876543210');
    
    const event = createAuthenticatedMockEvent(
      { name: 'Test Resource' },
      '/api/v1/resource',
      session.accessToken
    );
    
    const result = await handler(event);
    
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    
    await cleanupTestUser('+919876543210');
  });
});
```

---

**This guide should be followed for all future API implementations to ensure consistency, maintainability, and code quality across the codebase.**
