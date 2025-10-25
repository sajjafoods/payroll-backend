import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { sendOtpRequestSchema, finalPhoneNumberSchema, extractClientIp } from '../../middleware/validation.middleware';
import { handleError, successResponse } from '../../middleware/error.middleware';
import { sendOtp } from '../../services/auth.service';
import { logger } from '../../utils/logger';
import { parseRequestBody } from '../../utils/request';
import { normalizePhoneNumber } from '../../utils/phone';
import { SendOtpRequest } from '../../types/api.types';

/**
 * Handler for POST /api/v1/auth/send-otp
 * Sends OTP to the provided phone number
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Send OTP request received', {
      path: event.path,
      method: event.httpMethod,
    });

    // Parse and validate request body
    const body = parseRequestBody<SendOtpRequest>(event);
    const validatedData = sendOtpRequestSchema.parse(body);
    
    // Normalize phone number with country code
    const phoneNumber = normalizePhoneNumber(validatedData.phoneNumber, validatedData.countryCode);

    // Validate final phone number format
    finalPhoneNumberSchema.parse(phoneNumber);

    // Extract client IP for rate limiting
    const clientIp = extractClientIp(event);
    logger.info(`Client IP: ${clientIp}`);

    // Send OTP
    const result = await sendOtp(phoneNumber, clientIp);

    logger.info('OTP sent successfully', {
      phoneNumber: phoneNumber.replace(/\d(?=\d{4})/g, 'X'),
    });

    return successResponse(result, 200);
  } catch (error) {
    logger.error('Error in sendOtp handler:', error);
    return handleError(error);
  }
};
