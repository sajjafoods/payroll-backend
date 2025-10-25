import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { logoutUser } from '../../services/auth.service';
import { logger } from '../../utils/logger';
import { handleError, successResponse } from '../../middleware/error.middleware';
import { extractAndVerifyToken } from '../../middleware/auth.middleware';
import { parseRequestBody, isValidJwtFormat } from '../../utils/request';
import { logoutRequestSchema } from '../../middleware/validation.middleware';
import { AppError, ErrorCode } from '../../types/api.types';

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
  try {
    logger.info('Logout request received', {
      path: event.path,
      method: event.httpMethod,
    });

    // Extract and verify access token
    const decoded = extractAndVerifyToken(event);

    // Parse and validate request body
    const body = parseRequestBody<LogoutRequest>(event);
    const validatedData = logoutRequestSchema.parse(body);

    // Logout user
    const result = await logoutUser(
      decoded.userId,
      validatedData.refreshToken,
      validatedData.logoutAllDevices
    );

    logger.info('User logged out successfully', {
      userId: decoded.userId,
      logoutAllDevices: validatedData.logoutAllDevices,
    });

    return successResponse(result, 200);
  } catch (error) {
    logger.error('Error in logout handler:', error);
    return handleError(error);
  }
};
