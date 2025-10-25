import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handleError, successResponse } from '../../middleware/error.middleware';
import { verifyOtpAndAuthenticate } from '../../services/auth.service';
import { logger } from '../../utils/logger';
import { extractClientIp, verifyOtpRequestSchema } from '../../middleware/validation.middleware';
import { AppError, ErrorCode, VerifyOtpRequest } from '../../types/api.types';
import { parseRequestBody } from '../../utils/request';
import { normalizePhoneNumber } from '../../utils/phone';

/**
 * Handler for POST /api/v1/auth/verify-otp
 * Verifies OTP and authenticates user
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Verify OTP request received', {
      path: event.path,
      method: event.httpMethod,
    });

    // Parse and validate request body
    const body = parseRequestBody<VerifyOtpRequest>(event);
    
    const validationResult = verifyOtpRequestSchema.safeParse(body);
    if (!validationResult.success) {
      // Get unique field names that failed validation
      const missingFields = [...new Set(
        validationResult.error.issues.map((err: any) => err.path[0] || 'unknown')
      )];
      
      // Get unique, meaningful error messages
      const errorMessages = [...new Set(
        validationResult.error.issues.map((err: any) => {
          // Use custom message if available, otherwise use field name
          return err.message;
        })
      )];
      
      throw new AppError(
        ErrorCode.INVALID_REQUEST,
        'Phone number and OTP are required',
        400,
        {
          missingFields,
          errors: errorMessages,
        }
      );
    }

    const validatedData = validationResult.data;

    // Normalize phone number to include country code
    const phoneNumber = normalizePhoneNumber(validatedData.phoneNumber);

    // Extract client IP for session tracking
    const clientIp = extractClientIp(event);
    logger.info(`Client IP: ${clientIp}`);

    // Verify OTP and authenticate
    const result = await verifyOtpAndAuthenticate(
      phoneNumber,
      validatedData.otp,
      validatedData.deviceInfo,
      clientIp
    );

    logger.info('OTP verified successfully', {
      phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, 'X'),
      isNewUser: result.isNewUser,
    });

    return successResponse(result, 200);
  } catch (error) {
    logger.error('Error in verifyOtp handler:', error);
    return handleError(error);
  }
};
