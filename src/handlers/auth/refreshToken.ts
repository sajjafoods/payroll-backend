import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { refreshAccessToken } from '../../services/auth.service';
import { AppError, ErrorCode, ApiResponse } from '../../types/api.types';
import { logger } from '../../utils/logger';

/**
 * Lambda handler for POST /api/v1/auth/refresh
 * Refreshes access token using refresh token
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestId = event.requestContext.requestId;

  try {
    // Parse request body
    let body: { refreshToken?: string };
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      logger.error('Invalid JSON in request body', { requestId });
      const response: ApiResponse = {
        success: false,
        error: {
          code: ErrorCode.INVALID_REQUEST,
          message: 'Invalid JSON in request body',
          requestId,
        },
      };
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(response),
      };
    }

    // Validate refresh token presence
    if (!body.refreshToken) {
      logger.warn('Missing refreshToken in request', { requestId });
      const response: ApiResponse = {
        success: false,
        error: {
          code: ErrorCode.INVALID_TOKEN_FORMAT,
          message: 'Refresh token is required and must be valid JWT format',
          details: {
            field: 'refreshToken',
          },
          requestId,
        },
      };
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(response),
      };
    }

    // Call service to refresh tokens
    const tokens = await refreshAccessToken(body.refreshToken);

    logger.info('Access token refreshed successfully', { requestId });

    // Return success response
    const response: ApiResponse = {
      success: true,
      data: tokens,
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    // Handle AppError
    if (error instanceof AppError) {
      logger.warn('Token refresh failed', {
        requestId,
        code: error.code,
        message: error.message,
      });

      const response: ApiResponse = {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId,
        },
      };

      return {
        statusCode: error.statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(response),
      };
    }

    // Handle unexpected errors
    logger.error('Unexpected error in refresh token handler', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
        requestId,
      },
    };

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response),
    };
  }
};
