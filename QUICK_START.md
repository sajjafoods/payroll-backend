# Quick Start Guide - Authentication API

## Prerequisites

- Node.js 20.x or higher
- Docker (for Redis)
- npm

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Redis

```bash
docker-compose up -d
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env.local
```

The default configuration should work for local development:
- `REDIS_URL=redis://localhost:6379`
- `DATABASE_URL=postgres://dev_user:dev_password@localhost:5432/payroll_dev`
- `JWT_SECRET=your-secret-key-here`

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## Testing the API

### Send OTP - Success Case

```bash
curl -X POST http://localhost:3000/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+919876543210"
  }'
```

**Expected Response:**
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

**Console Output:**
Check your terminal running `npm run dev` - you'll see the OTP logged:
```
[INFO] [SMS] Sending OTP 123456 to +919876543210
```

### Invalid Phone Number

```bash
curl -X POST http://localhost:3000/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "123456"
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "MISSING_REQUIRED_FIELD",
    "message": "Validation failed",
    "details": {
      "errors": [
        {
          "field": "phoneNumber",
          "message": "Phone number format is invalid. Expected format: +91XXXXXXXXXX"
        }
      ]
    },
    "requestId": "req_1234567890_abc123def"
  }
}
```

### Rate Limiting Test

Make 4 requests quickly to the same phone number:

```bash
# Request 1, 2, 3 - Should succeed
for i in {1..3}; do
  curl -X POST http://localhost:3000/api/v1/auth/send-otp \
    -H "Content-Type: application/json" \
    -d '{"phoneNumber": "+919999888877"}'
  echo ""
done

# Request 4 - Should be rate limited
curl -X POST http://localhost:3000/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+919999888877"}'
```

**4th Request Response:**
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
    "requestId": "req_1234567890_xyz789"
  }
}
```

## Using Postman

### Import Collection

Create a new Postman collection with these settings:

**Request Name:** Send OTP  
**Method:** POST  
**URL:** `http://localhost:3000/api/v1/auth/send-otp`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "phoneNumber": "+919876543210"
}
```

### Test Cases

1. **Valid Phone Number:** `+919876543210`
2. **Without Country Code:** `9876543210` (with `countryCode: "+91"`)
3. **Invalid Format:** `123456`
4. **Wrong Starting Digit:** `+915876543210` (should start with 6-9)

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test tests/auth/sendOtp.test.ts
```

### Watch Mode

```bash
npm run test:watch
```

### Coverage Report

```bash
npm run test:coverage
```

## Verifying Redis Data

### Connect to Redis

```bash
docker exec -it payroll-backend-redis-1 redis-cli
```

### Check OTP Storage

```redis
# List all OTP keys
KEYS otp:*

# Get OTP data for a specific number
GET otp:+919876543210

# Check TTL (time to live)
TTL otp:+919876543210

# Check rate limit
GET otp:ratelimit:+919876543210
```

### Clear Test Data

```redis
# Clear all OTP keys
DEL otp:+919876543210
DEL otp:ratelimit:+919876543210
DEL otp:ratelimit:ip:127.0.0.1

# Or flush all Redis data (use with caution!)
FLUSHDB
```

## Common Issues

### Redis Connection Error

**Error:** `Redis connection error: connect ECONNREFUSED`

**Solution:**
```bash
docker-compose up -d
docker ps  # Verify Redis is running
```

### Port Already in Use

**Error:** `Port 3000 is already in use`

**Solution:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev
```

### Build Errors

**Error:** TypeScript compilation errors

**Solution:**
```bash
# Clean build
rm -rf dist/
npm run build
```

## Development Workflow

1. **Make Code Changes** in `src/` directory
2. **Auto-reload** - serverless-offline watches for changes
3. **Test Manually** with curl or Postman
4. **Run Tests** - `npm test`
5. **Check Logs** in terminal for debugging

## What's Next?

After testing the send-otp endpoint, you can:

1. Implement the verify-otp endpoint
2. Add JWT token generation
3. Integrate with a real SMS gateway (Twilio, AWS SNS, MSG91)
4. Add user registration on first OTP verification
5. Implement refresh token functionality

## Additional Resources

- Full API Documentation: `API_DOCUMENTATION.md`
- Project Setup: `README.md`
- Serverless Configuration: `serverless.yml`
- Environment Variables: `.env.example`

## Need Help?

Check the logs in your terminal for detailed error messages and OTP values (in development mode).
