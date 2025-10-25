import { APIGatewayProxyEvent } from 'aws-lambda';
import { verifyAccessToken } from '../utils/jwt';
import { extractAuthToken } from '../utils/request';
import { AppError, ErrorCode } from '../types/api.types';
import { logger } from '../utils/logger';

/**
 * Extract and verify JWT token from Authorization header
 * Returns decoded token payload or throws AppError
 */
export const extractAndVerifyToken = (event: APIGatewayProxyEvent) => {
  try {
    const token = extractAuthToken(event);
    const decoded = verifyAccessToken(token);
    return decoded;
  } catch (error) {
    // Preserve specific header-related errors, but standardize JWT verification errors
    if (error instanceof AppError) {
      throw error;
    }
    
    // JWT verification failed (expired, invalid signature, etc)
    logger.error('Token verification failed:', error);
    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      'Invalid or expired access token',
      401
    );
  }
};

/**
 * Middleware to authenticate requests
 * Can be used to wrap handler functions
 */
export const requireAuth = (event: APIGatewayProxyEvent) => {
  return extractAndVerifyToken(event);
};
