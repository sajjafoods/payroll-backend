# Authentication API Implementation

## Overview
This document describes the implementation of the OTP-based authentication API for Indian small businesses.

## Implemented Endpoint

### POST `/api/v1/auth/send-otp`
Send OTP to mobile number for authentication.

## API Structure

### Request Format

The API accepts phone numbers in two formats:

**Option 1: With country code prefix**
```json
{
  "phoneNumber": "+919876543210"
}
```

**Option 2: Without country code prefix (automatically applies +91)**
```json
{
  "phoneNumber": "9876543210"
}
```

**Option 3: With explicit country code parameter**
```json
{
  "phoneNumber": "9876543210",
  "countryCode": "+91"  // optional, defaults to +91
}
```

**Phone Number Validation Rules:**
- Must be a valid 10-digit Indian mobile number
- First digit must be 6, 7, 8, or 9
- Can be provided with or without the +91 country code prefix
- If no country code is provided, +91 is automatically applied

### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "otpSent": true,
    "expiresIn": 300,
    "message": "OTP sent to +91-98765-XXXXX",
    "retryAfter": 60
  }
}
```

### Error Responses

#### 400 Bad Request - Invalid Phone Number
```json
{
  "success": false,
  "error": {
    "code": "INVALID_PHONE_NUMBER",
    "message": "Phone number format is invalid",
    "details": {
      "field": "phoneNumber",
      "expectedFormat": "+91XXXXXXXXXX or XXXXXXXXXX"
    },
    "requestId": "req_123xyz"
  }
}
```

#### 429 Too Many Requests - Phone Number Rate Limit
```json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_OTP_REQUESTS",
    "message": "Too many OTP requests. Please try after 10 minutes",
    "details": {
      "retryAfter": 600,
      "maxAttempts": 3
    },
    "requestId": "req_456abc"
  }
}
```

#### 429 Too Many Requests - IP Rate Limit
```json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Too many OTP requests from this IP. Please try later",
    "details": {
      "retryAfter": 3600
    },
    "requestId": "req_789def"
  }
}
```

#### 500 Internal Server Error - SMS Service Error
```json
{
  "success": false,
  "error": {
    "code": "SMS_SERVICE_ERROR",
    "message": "Failed to send OTP. Please try again",
    "requestId": "req_789xyz"
  }
}
```

## Implementation Details

### Components Implemented

1. **Type Definitions** (`src/types/api.types.ts`)
   - API response interfaces
   - Error types and codes
   - Custom AppError class

2. **Configuration** (`src/config/redis.ts`)
   - Redis client setup with connection pooling
   - Auto-reconnection on errors
   - Proper error logging

3. **Utilities**
   - **Logger** (`src/utils/logger.ts`): Simple logging utility
   - **OTP** (`src/utils/otp.ts`):
     - Generate 6-digit OTP
     - Store OTP in Redis (5 min expiry)
     - Verify OTP
     - Rate limiting (phone & IP)
     - Phone number masking
     - SMS sending (mock implementation)

4. **Middleware**
   - **Error Handler** (`src/middleware/error.middleware.ts`):
     - Centralized error handling
     - Standard error response format
     - Request ID generation
   - **Validation** (`src/middleware/validation.middleware.ts`):
     - Zod schemas for validation
     - Phone number validation (Indian format)
     - IP extraction from Lambda event

5. **Services** (`src/services/auth.service.ts`)
   - Send OTP logic with rate limiting
   - OTP verification logic
   - Error handling and logging

6. **Handlers** (`src/handlers/auth/sendOtp.ts`)
   - AWS Lambda handler for send-otp endpoint
   - Request parsing and validation
   - Response formatting

## Rate Limiting

### Phone Number Rate Limit
- **Limit**: 3 OTP requests per phone number
- **Window**: 10 minutes
- **Storage**: Redis with TTL

### IP Address Rate Limit
- **Limit**: 10 OTP requests per IP
- **Window**: 1 hour
- **Storage**: Redis with TTL

## Security Features

1. **Phone Number Validation**: 
   - Strict regex validation for Indian mobile numbers
   - Accepts format with or without +91 country code prefix
   - Validates final phone number after country code application
2. **Rate Limiting**: Multi-level rate limiting (phone + IP)
3. **OTP Expiry**: 5-minute TTL for OTPs
4. **Phone Number Masking**: Sensitive data protection in responses
5. **Request ID Tracking**: Unique ID for each request for debugging

## Testing the API

### Local Development

1. Start Redis:
```bash
docker-compose up -d
```

2. Start the development server:
```bash
npm run dev
```

3. Test the endpoint:

**With country code:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+919876543210"
  }'
```

**Without country code (automatically applies +91):**
```bash
curl -X POST http://localhost:3000/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "9876543210"
  }'
```

### Expected Behavior

1. **First Request**: Returns success with OTP sent
2. **Subsequent Requests**: Allowed after 60 seconds
3. **After 3 Requests**: Rate limited for 10 minutes
4. **Invalid Phone**: Returns 400 error with validation details

## SMS Integration

The current implementation uses a **mock SMS service**. To integrate with a real SMS gateway:

1. Choose a provider (Twilio, AWS SNS, MSG91, etc.)
2. Update `src/utils/otp.ts` → `sendOtpSms()` function
3. Add provider credentials to environment variables
4. Implement actual SMS sending logic

Example for AWS SNS:
```typescript
import { SNS } from '@aws-sdk/client-sns';

export const sendOtpSms = async (phoneNumber: string, otp: string): Promise<boolean> => {
  const sns = new SNS({ region: 'ap-south-1' });
  
  await sns.publish({
    PhoneNumber: phoneNumber,
    Message: `Your OTP is: ${otp}. Valid for 5 minutes.`,
  });
  
  return true;
};
```

## Environment Variables

Required environment variables (already configured in `.env.example`):
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: Secret for JWT token generation

## Next Steps

To complete the authentication flow, implement:
1. **Verify OTP Endpoint** (`/api/v1/auth/verify-otp`)
2. **JWT Token Generation** (after OTP verification)
3. **Refresh Token Endpoint** (`/api/v1/auth/refresh-token`)
4. **User Registration** (on first-time OTP verification)

## Architecture

```
Request → API Gateway → Lambda Handler → Service Layer → Utils/Repos
                          ↓
                      Validation
                          ↓
                      Rate Limiting
                          ↓
                      OTP Generation
                          ↓
                      Redis Storage
                          ↓
                      SMS Gateway
                          ↓
                      Response
```

## Error Handling Flow

```
Error → AppError Check → Zod Error Check → Generic Error
           ↓                  ↓                  ↓
     Custom Response    Validation Resp    500 Response
```

All errors are logged with request IDs for tracking and debugging.
