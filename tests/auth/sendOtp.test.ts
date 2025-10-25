import { handler } from '../../src/handlers/auth/sendOtp';
import { 
  setupRedisForTests, 
  clearOtpRateLimits, 
  teardownRedis,
  createMockEvent,
  generateUniquePhoneNumber 
} from '../helpers';

/**
 * Test file for Send OTP endpoint (Refactored with helpers)
 * 
 * To run tests:
 * 1. Ensure Redis is running: docker-compose up -d
 * 2. Run tests: npm test tests/auth/sendOtp.refactored.test.ts
 */

describe('Send OTP Handler (Refactored)', () => {
  // Setup/Teardown using helpers
  beforeAll(() => setupRedisForTests());
  beforeEach(() => clearOtpRateLimits());
  afterAll(() => teardownRedis());

  describe('Valid Requests', () => {
    it('should send OTP for valid Indian mobile number', async () => {
      const event = createMockEvent(
        { phoneNumber: '+919876543210' },
        '/api/v1/auth/send-otp'
      );

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.otpSent).toBe(true);
      expect(body.data.expiresIn).toBe(300);
      expect(body.data.retryAfter).toBe(60);
      expect(body.data.message).toContain('OTP sent to');
    });

    it('should accept phone number without country code and apply default +91', async () => {
      const event = createMockEvent(
        { phoneNumber: '9876543210' },
        '/api/v1/auth/send-otp'
      );

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.otpSent).toBe(true);
    });

    it('should accept phone number with explicit country code parameter', async () => {
      const event = createMockEvent(
        { phoneNumber: '9876543210', countryCode: '+91' },
        '/api/v1/auth/send-otp'
      );

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe('Invalid Requests', () => {
    it('should reject invalid phone number format', async () => {
      const event = createMockEvent(
        { phoneNumber: '123456' },
        '/api/v1/auth/send-otp'
      );

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBeDefined();
    });

    it('should reject phone number not starting with 6-9', async () => {
      const event = createMockEvent(
        { phoneNumber: '+915876543210' },
        '/api/v1/auth/send-otp'
      );

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBeDefined();
    });

    it('should reject missing phone number', async () => {
      const event = createMockEvent({}, '/api/v1/auth/send-otp');

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should allow first 3 requests from same number', async () => {
      const phoneNumber = generateUniquePhoneNumber();
      
      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        const event = createMockEvent(
          { phoneNumber },
          '/api/v1/auth/send-otp'
        );
        const response = await handler(event);
        const body = JSON.parse(response.body);
        
        expect(response.statusCode).toBe(200);
        expect(body.success).toBe(true);
      }
    });

    it('should rate limit after 3 requests', async () => {
      const phoneNumber = generateUniquePhoneNumber();
      
      // Make 4 requests
      for (let i = 0; i < 4; i++) {
        const event = createMockEvent(
          { phoneNumber },
          '/api/v1/auth/send-otp'
        );
        const response = await handler(event);
        
        if (i < 3) {
          expect(response.statusCode).toBe(200);
        } else {
          // 4th request should be rate limited
          const body = JSON.parse(response.body);
          expect(response.statusCode).toBe(429);
          expect(body.error.code).toBe('TOO_MANY_OTP_REQUESTS');
          expect(body.error.details.retryAfter).toBeDefined();
          expect(body.error.details.maxAttempts).toBe(3);
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const event = {
        body: 'invalid json',
        headers: {},
        httpMethod: 'POST',
        path: '/api/v1/auth/send-otp',
        requestContext: {
          http: {
            sourceIp: '127.0.0.1',
          },
        },
      } as any;

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should include requestId in error responses', async () => {
      const event = createMockEvent(
        { phoneNumber: 'invalid' },
        '/api/v1/auth/send-otp'
      );

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.error.requestId).toBeDefined();
      expect(body.error.requestId).toMatch(/^req_/);
    });
  });

  describe('Response Format', () => {
    it('should mask phone number in response', async () => {
      const event = createMockEvent(
        { phoneNumber: '+919123456789' },
        '/api/v1/auth/send-otp'
      );

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.message).toContain('XXXXX');
      expect(body.data.message).not.toContain('6789');
    });

    it('should include CORS headers', async () => {
      const event = createMockEvent(
        { phoneNumber: '+919876543210' },
        '/api/v1/auth/send-otp'
      );

      const response = await handler(event);

      expect(response.headers).toBeDefined();
      expect(response.headers?.['Access-Control-Allow-Origin']).toBe('*');
      expect(response.headers?.['Content-Type']).toBe('application/json');
    });
  });
});
