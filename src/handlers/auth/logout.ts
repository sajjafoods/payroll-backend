import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logoutUser } from '../../services/auth.service';
import { AppError, ErrorCode } from '../../types/api.types';
import { logger } from '../../utils/logger';
import { verifyAccessToken, TokenExpiredError, TokenInvalidError } from '../../utils/jwt';

/**
 * Logout request body interface
 */
interface LogoutRequest {
  refreshToken: string;
  logoutAllDevices?: boolean;
}

/**
 * Lambda handler for POST /api/v1/auth/logout
 * Invalidate tokens and end user session
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;
  
  try {
    // Extract and verify Authorization header
    const authHeader = event.headers.Authorization || event.headers.authorization;
    
    if (!authHeader) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: 'Invalid or expired access token',
          },
        }),
      };
    }

    // Extract token from Bearer header
    const token = authHeader.replace('Bearer ', '');
    
    // Verify access token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      if (error instanceof TokenExpiredError || error instanceof TokenInvalidError) {
        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            success: false,
            error: {
              code: ErrorCode.UNAUTHORIZED,
              message: 'Invalid or expired access token',
            },
          }),
        };
      }
      throw error;
    }

    // Parse request body
    let body: LogoutRequest;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: {
            code: ErrorCode.INVALID_REQUEST,
            message: 'Invalid JSON in request body',
          },
        }),
      };
    }

    // Validate required fields
    if (!body.refreshToken) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: {
            code: ErrorCode.INVALID_REQUEST,
            message: 'Refresh token is required',
            details: {
              missingFields: ['refreshToken'],
            },
          },
        }),
      };
    }

    // Validate token format (basic JWT format check)
    const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
    if (!jwtPattern.test(body.refreshToken)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: {
            code: ErrorCode.INVALID_REQUEST,
            message: 'Refresh token is required',
            details: {
              missingFields: ['refreshToken'],
            },
          },
        }),
      };
    }

    // Logout user
    const result = await logoutUser(
      decoded.userId,
      body.refreshToken,
      body.logoutAllDevices || false
    );

    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: result,
      }),
    };
  } catch (error) {
    logger.error('Logout error:', error);

    // Handle AppError
    if (error instanceof AppError) {
      return {
        statusCode: error.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        }),
      };
    }

    // Handle unexpected errors
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: {
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Failed to logout. Please try again',
          requestId,
        },
      }),
    };
  }
};
