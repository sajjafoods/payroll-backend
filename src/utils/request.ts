import { APIGatewayProxyEvent } from 'aws-lambda';
import { AppError, ErrorCode } from '../types/api.types';
import { logger } from './logger';

/**
 * Parse and validate JSON request body
 * Returns parsed body or throws AppError
 */
export const parseRequestBody = <T = any>(event: APIGatewayProxyEvent): T => {
  try {
    const body = JSON.parse(event.body || '{}');
    return body as T;
  } catch (error) {
    logger.error('Invalid JSON in request body', { error });
    throw new AppError(
      ErrorCode.INVALID_REQUEST,
      'Invalid request body',
      400
    );
  }
};

/**
 * Extract and validate Authorization header
 * Returns token string or throws AppError
 */
export const extractAuthToken = (event: APIGatewayProxyEvent): string => {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  
  if (!authHeader) {
    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      'Missing Authorization header',
      401
    );
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      'Invalid Authorization header format',
      401
    );
  }

  return parts[1];
};

/**
 * Validate JWT token format (basic structure check)
 */
export const isValidJwtFormat = (token: string): boolean => {
  const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
  return jwtPattern.test(token);
};
