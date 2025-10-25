import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Create a mock APIGatewayProxyEvent for testing
 */
export function createMockEvent(
  body: any,
  path: string,
  method: string = 'POST',
  headers: Record<string, string> = {}
): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {
      'x-forwarded-for': '192.168.1.100',
      ...headers,
    },
    multiValueHeaders: {},
    httpMethod: method,
    isBase64Encoded: false,
    path,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      identity: {
        sourceIp: '192.168.1.100',
      },
    } as any,
    resource: '',
  };
}

/**
 * Create a mock APIGatewayProxyEvent with authentication headers
 */
export function createAuthenticatedMockEvent(
  body: any,
  path: string,
  accessToken: string,
  method: string = 'POST'
): APIGatewayProxyEvent {
  return createMockEvent(body, path, method, {
    Authorization: `Bearer ${accessToken}`,
  });
}

/**
 * Create a mock event for OTP sending
 */
export function createSendOtpEvent(phoneNumber: string, countryCode?: string): APIGatewayProxyEvent {
  const body: any = { phoneNumber };
  if (countryCode) {
    body.countryCode = countryCode;
  }
  return createMockEvent(body, '/api/v1/auth/send-otp');
}

/**
 * Create a mock event for OTP verification
 */
export function createVerifyOtpEvent(
  phoneNumber: string,
  otp: string,
  deviceInfo?: {
    deviceId: string;
    deviceName: string;
    platform: string;
  }
): APIGatewayProxyEvent {
  const body: any = { phoneNumber, otp };
  if (deviceInfo) {
    body.deviceInfo = deviceInfo;
  }
  return createMockEvent(body, '/api/v1/auth/verify-otp');
}
