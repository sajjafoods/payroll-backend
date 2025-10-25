# Error Code Standardization Guide

## Purpose
This guide provides best practices and standards for using error codes across all APIs in the payroll backend system.

---

## Error Code Principles

### 1. User-Facing & Generic
Error codes should be **user-friendly** and **not leak implementation details**.

✅ **Good Examples:**
- `OTP_DELIVERY_FAILED` - Generic delivery failure
- `INVALID_REQUEST` - Generic validation error
- `INTERNAL_SERVER_ERROR` - Generic server error

❌ **Bad Examples:**
- `SMS_SERVICE_ERROR` - Reveals SMS provider dependency
- `REDIS_CONNECTION_FAILED` - Reveals Redis usage
- `DATABASE_QUERY_ERROR` - Reveals database implementation

### 2. Consistent Across APIs
The same error scenario should use the same error code across all APIs.

**Example:** All validation errors use `INVALID_REQUEST` or `VALIDATION_ERROR`

### 3. Specific Enough to be Actionable
Error codes should help clients understand what went wrong and how to fix it.

✅ **Good:** `ACCOUNT_LOCKED` (clear action: wait or contact support)
❌ **Bad:** `ERROR` (too vague, no actionable information)

### 4. Mapped to Appropriate HTTP Status Codes
Error codes should have consistent HTTP status code mappings.

---

## Standard Error Code Catalog

### Validation Errors (HTTP 400)

| Error Code | Usage | Example Message |
|------------|-------|-----------------|
| `INVALID_REQUEST` | Invalid request body or parameters | "Invalid request body" |
| `MISSING_REQUIRED_FIELD` | Required field missing | "Phone number is required" |
| `VALIDATION_ERROR` | Generic validation failure | "Invalid input data" |
| `INVALID_PHONE_NUMBER` | Invalid phone format | "Invalid phone number format" |
| `INVALID_TOKEN_FORMAT` | Malformed token | "Token format is invalid" |

### Authentication Errors (HTTP 401)

| Error Code | Usage | Example Message |
|------------|-------|-----------------|
| `UNAUTHORIZED` | Missing or invalid auth credentials | "Missing Authorization header" |
| `INVALID_OTP` | OTP verification failed | "OTP is invalid or expired" |
| `INVALID_REFRESH_TOKEN` | Refresh token invalid/expired | "Refresh token is invalid or expired" |

### Authorization Errors (HTTP 403)

| Error Code | Usage | Example Message |
|------------|-------|-----------------|
| `TOKEN_REVOKED` | Token has been revoked | "This session has been terminated" |
| `PROFILE_ALREADY_COMPLETE` | Action not allowed (profile complete) | "Profile already completed" |

### Not Found Errors (HTTP 404)

| Error Code | Usage | Example Message |
|------------|-------|-----------------|
| `ORGANIZATION_NOT_FOUND` | Organization doesn't exist | "Organization not found" |
| `RESOURCE_NOT_FOUND` | Generic resource not found | "Resource not found" |

### Conflict Errors (HTTP 409)

| Error Code | Usage | Example Message |
|------------|-------|-----------------|
| `ORGANIZATION_NAME_EXISTS` | Duplicate organization name | "Organization name already exists" |
| `DUPLICATE_ENTRY` | Generic duplicate error | "This entry already exists" |

### Locked/Suspended (HTTP 423)

| Error Code | Usage | Example Message |
|------------|-------|-----------------|
| `ACCOUNT_LOCKED` | Account temporarily locked | "Account locked due to failed attempts" |

### Rate Limiting (HTTP 429)

| Error Code | Usage | Example Message |
|------------|-------|-----------------|
| `TOO_MANY_REQUESTS` | Generic rate limit exceeded | "Too many requests. Try again later" |
| `TOO_MANY_OTP_REQUESTS` | OTP-specific rate limit | "Too many OTP requests. Try in 10 minutes" |

### Server Errors (HTTP 500)

| Error Code | Usage | Example Message |
|------------|-------|-----------------|
| `INTERNAL_SERVER_ERROR` | Unexpected server error | "An unexpected error occurred" |
| `OTP_DELIVERY_FAILED` | Failed to deliver OTP | "Failed to send OTP. Please try again" |

---

## Error Response Structure

### Standard Format
```typescript
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Optional additional context
    },
    "requestId": "req_1234567890_abc123"
  }
}
```

### Error Details by Type

#### Validation Errors
```typescript
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid input data",
  "details": {
    "fields": {
      "phoneNumber": "Phone number must be 10 digits",
      "organizationName": "Organization name is required"
    }
  }
}
```

#### Rate Limiting Errors
```typescript
{
  "code": "TOO_MANY_OTP_REQUESTS",
  "message": "Too many OTP requests. Please try after 10 minutes",
  "details": {
    "retryAfter": 600,      // seconds
    "maxAttempts": 3
  }
}
```

#### Account Lock Errors
```typescript
{
  "code": "ACCOUNT_LOCKED",
  "message": "Account locked due to too many failed attempts",
  "details": {
    "lockedUntil": "2025-10-25T10:47:00Z",
    "retryAfter": 1800      // seconds
  }
}
```

#### Token Errors
```typescript
{
  "code": "INVALID_REFRESH_TOKEN",
  "message": "Refresh token is invalid or expired",
  "details": {
    "reason": "expired",    // 'expired', 'revoked', 'invalid'
    "expiredAt": "2025-10-25T09:17:00Z"
  }
}
```

---

## HTTP Status Code Mapping

| HTTP Code | Category | Use Cases |
|-----------|----------|-----------|
| 400 | Bad Request | Validation errors, malformed requests |
| 401 | Unauthorized | Missing/invalid authentication |
| 403 | Forbidden | Valid auth but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resources, state conflicts |
| 423 | Locked | Account/resource temporarily locked |
| 429 | Too Many Requests | Rate limiting |
| 500 | Internal Server Error | Unexpected server errors |

---

## Implementation Guidelines

### 1. Using AppError Class

```typescript
import { AppError, ErrorCode } from '../types/api.types';

// Validation error
throw new AppError(
  ErrorCode.VALIDATION_ERROR,
  'Invalid input data',
  400,
  {
    fields: {
      phoneNumber: 'Phone number is required'
    }
  }
);

// Rate limiting error
throw new AppError(
  ErrorCode.TOO_MANY_REQUESTS,
  'Too many requests. Try again later',
  429,
  {
    retryAfter: 3600
  }
);

// Generic server error (no details)
throw new AppError(
  ErrorCode.INTERNAL_SERVER_ERROR,
  'An unexpected error occurred',
  500
);
```

### 2. Error Handling in Services

```typescript
export const myService = async () => {
  try {
    // Service logic
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
};
```

### 3. Error Handling in Handlers

```typescript
export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    // Handler logic
    return successResponse(result, 200);
  } catch (error) {
    logger.error('Handler error:', error);
    return handleError(error);
  }
};
```

---

## Security Best Practices

### ✅ DO

1. **Use generic error messages** for external responses
   ```typescript
   // Good
   throw new AppError(
     ErrorCode.INTERNAL_SERVER_ERROR,
     'An unexpected error occurred',
     500
   );
   ```

2. **Log detailed errors internally**
   ```typescript
   logger.error('Database connection failed:', {
     host: dbConfig.host,
     error: error.message
   });
   ```

3. **Sanitize error details**
   ```typescript
   // Good - generic reason
   { reason: 'session_invalid' }
   
   // Bad - too specific
   { reason: 'user_not_found_in_database_table_users' }
   ```

4. **Separate internal and external error info**
   ```typescript
   // Internal logging
   logger.error('SNS publish failed:', snsError);
   
   // External response
   throw new AppError(
     ErrorCode.OTP_DELIVERY_FAILED,
     'Failed to send OTP',
     500
   );
   ```

### ❌ DON'T

1. **Expose implementation details**
   ```typescript
   // Bad
   throw new AppError(
     ErrorCode.REDIS_CONNECTION_ERROR,
     'Failed to connect to Redis at redis://...',
     500
   );
   ```

2. **Expose stack traces to clients**
   ```typescript
   // Bad
   return {
     error: {
       message: error.stack
     }
   };
   ```

3. **Use database error messages directly**
   ```typescript
   // Bad
   catch (dbError) {
     throw new AppError(
       ErrorCode.DATABASE_ERROR,
       dbError.message,  // Might contain SQL, table names, etc.
       500
     );
   }
   ```

4. **Include sensitive data in error responses**
   ```typescript
   // Bad
   throw new AppError(
     ErrorCode.AUTHENTICATION_FAILED,
     'Failed authentication',
     401,
     {
       attemptedPassword: password,  // NEVER!
       databaseQuery: query          // NEVER!
     }
   );
   ```

---

## Testing Error Codes

### Unit Tests
```typescript
describe('Error codes', () => {
  it('should return INVALID_REQUEST for missing fields', async () => {
    const response = await handler({ body: '{}' });
    const body = JSON.parse(response.body);
    
    expect(response.statusCode).toBe(400);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });
  
  it('should return UNAUTHORIZED for missing token', async () => {
    const response = await handler({ headers: {} });
    const body = JSON.parse(response.body);
    
    expect(response.statusCode).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
```

### Integration Tests
```typescript
describe('Auth API Error Codes', () => {
  it('should return consistent error code for rate limiting', async () => {
    // Send multiple requests
    for (let i = 0; i < 5; i++) {
      await sendOtpRequest(phoneNumber);
    }
    
    // Next request should be rate limited
    const response = await sendOtpRequest(phoneNumber);
    
    expect(response.statusCode).toBe(429);
    expect(response.body.error.code).toBe('TOO_MANY_OTP_REQUESTS');
    expect(response.body.error.details.retryAfter).toBeDefined();
  });
});
```

---

## Migration Checklist

When standardizing error codes in existing code:

- [ ] Identify all error throwing locations
- [ ] Replace implementation-specific error codes
- [ ] Standardize error messages
- [ ] Ensure consistent HTTP status codes
- [ ] Update error details structure
- [ ] Add/update tests for error scenarios
- [ ] Remove deprecated error codes from types
- [ ] Update API documentation

---

## API Documentation

Error codes should be documented in API docs with:

1. **Error code name**
2. **HTTP status code**
3. **When it occurs**
4. **Example response**
5. **How to resolve**

Example:
```markdown
### TOO_MANY_OTP_REQUESTS (429)

**When:** Too many OTP requests for the same phone number

**Response:**
{
  "success": false,
  "error": {
    "code": "TOO_MANY_OTP_REQUESTS",
    "message": "Too many OTP requests. Please try after 10 minutes",
    "details": {
      "retryAfter": 600,
      "maxAttempts": 3
    }
  }
}

**Resolution:** Wait for the specified retry period before requesting again
```

---

## Summary

Following this guide ensures:
- ✅ Consistent error handling across all APIs
- ✅ No internal implementation details leaked
- ✅ User-friendly error messages
- ✅ Secure error responses
- ✅ Easy debugging with proper logging
- ✅ Better client experience
