import { APIGatewayProxyResult } from 'aws-lambda';
import { AppError, ErrorCode, ApiResponse } from '../types/api.types';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

/**
 * Generate a unique request ID
 */
export const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle and format errors into API response
 */
export const handleError = (error: unknown, requestId?: string): APIGatewayProxyResult => {
  const reqId = requestId || generateRequestId();

  // Handle AppError (our custom errors)
  if (error instanceof AppError) {
    logger.error(`[${reqId}] AppError:`, error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId: reqId,
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

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    logger.error(`[${reqId}] Validation error:`, error);
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.MISSING_REQUIRED_FIELD,
        message: 'Validation failed',
        details: {
          errors: error.issues.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        requestId: reqId,
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

  // Handle generic errors
  logger.error(`[${reqId}] Internal error:`, error);
  
  const response: ApiResponse = {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      requestId: reqId,
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
};

/**
 * Create a success response
 */
export const successResponse = <T>(data: T, statusCode: number = 200): APIGatewayProxyResult => {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(response),
  };
};
