import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { refreshAccessToken } from '../../services/auth.service';
import { logger } from '../../utils/logger';
import { handleError, successResponse } from '../../middleware/error.middleware';
import { parseRequestBody } from '../../utils/request';
import { refreshTokenRequestSchema } from '../../middleware/validation.middleware';
import { AppError, ErrorCode } from '../../types/api.types';

/**
 * Lambda handler for POST /api/v1/auth/refresh
 * Refreshes access token using refresh token
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Refresh token request received', {
      path: event.path,
      method: event.httpMethod,
    });

    // Parse request body
    const body = parseRequestBody<{ refreshToken?: string }>(event);

    // Validate refresh token presence before Zod validation for proper error code
    if (!body.refreshToken) {
      throw new AppError(
        ErrorCode.INVALID_TOKEN_FORMAT,
        'Refresh token is required and must be valid JWT format',
        400,
        { field: 'refreshToken' }
      );
    }

    const validatedData = refreshTokenRequestSchema.parse(body);

    // Call service to refresh tokens
    const tokens = await refreshAccessToken(validatedData.refreshToken);

    logger.info('Access token refreshed successfully');

    return successResponse(tokens, 200);
  } catch (error) {
    logger.error('Error in refreshToken handler:', error);
    return handleError(error);
  }
};
