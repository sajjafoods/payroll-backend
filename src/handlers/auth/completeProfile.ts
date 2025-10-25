import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handleError, successResponse } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';
import { AppError, ErrorCode, CompleteProfileRequest, CompleteProfileResponse } from '../../types/api.types';
import { z } from 'zod';
import { verifyAccessToken } from '../../utils/jwt';
import { db } from '../../db/client';
import { users, organizations, organizationUsers } from '../../db/schema/schema';
import { eq, and, sql } from 'drizzle-orm';
import { 
  getOrganizationById, 
  updateOrganization, 
  organizationNameExists 
} from '../../db/queries/organizations';

// Industry enum values
const industryEnum = [
  'retail',
  'manufacturing',
  'services',
  'hospitality',
  'construction',
  'healthcare',
  'education',
  'transportation',
  'agriculture',
  'other',
] as const;

// Validation schema for complete profile request
const completeProfileSchema = z.object({
  ownerName: z.string()
    .min(2, 'Owner name must be at least 2 characters')
    .max(100, 'Owner name must not exceed 100 characters'),
  organizationName: z.string()
    .min(2, 'Organization name must be at least 2 characters')
    .max(100, 'Organization name must not exceed 100 characters'),
  organizationAddress: z.string()
    .max(500, 'Organization address must not exceed 500 characters')
    .optional(),
  industry: z.enum(industryEnum).optional(),
  employeeCount: z.number()
    .int('Employee count must be a whole number')
    .min(1, 'Employee count must be at least 1')
    .max(10000, 'Employee count must not exceed 10000')
    .optional(),
  gstNumber: z.string()
    .regex(
      /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
      'Invalid GST number format'
    )
    .optional(),
  panNumber: z.string()
    .regex(
      /^[A-Z]{5}\d{4}[A-Z]{1}$/,
      'Invalid PAN number format'
    )
    .optional(),
});

/**
 * Extract and verify JWT token from Authorization header
 */
const extractAndVerifyToken = (event: APIGatewayProxyEvent) => {
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

  const token = parts[1];
  
  try {
    const decoded = verifyAccessToken(token);
    return decoded;
  } catch (error) {
    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      'Invalid or expired access token',
      401
    );
  }
};

/**
 * Handler for PATCH /api/v1/auth/complete-profile
 * Complete initial setup for new users
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Complete profile request received', {
      path: event.path,
      method: event.httpMethod,
    });

    // Verify JWT token and extract user info
    const tokenPayload = extractAndVerifyToken(event);
    const userId = tokenPayload.userId;
    const organizationId = tokenPayload.organizationId;
    const userRole = tokenPayload.role;

    logger.info('Token verified', { userId, organizationId, role: userRole });

    // Check if user is owner
    if (userRole !== 'owner') {
      throw new AppError(
        ErrorCode.PROFILE_ALREADY_COMPLETE,
        'Only owner can complete profile',
        403
      );
    }

    // Parse request body
    let body: CompleteProfileRequest;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      throw new AppError(
        ErrorCode.INVALID_REQUEST,
        'Invalid request body',
        400
      );
    }

    // Validate request
    const validationResult = completeProfileSchema.safeParse(body);
    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      
      validationResult.error.issues.forEach((issue) => {
        const fieldName = issue.path[0];
        if (fieldName && typeof fieldName === 'string') {
          if (!fieldErrors[fieldName]) {
            fieldErrors[fieldName] = issue.message;
          }
        }
      });

      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Invalid input data',
        400,
        {
          fields: fieldErrors,
        }
      );
    }

    const validatedData = validationResult.data;

    // Get current organization
    const organization = await getOrganizationById(organizationId);
    
    if (!organization) {
      throw new AppError(
        ErrorCode.UPDATE_FAILED,
        'Organization not found',
        404
      );
    }

    // Check if profile setup is already complete
    if (organization.setupComplete) {
      throw new AppError(
        ErrorCode.PROFILE_ALREADY_COMPLETE,
        'Initial setup already completed. Use organization update endpoints to modify details',
        403,
        {
          organizationId: organization.id,
          setupComplete: true,
          setupCompletedAt: organization.updatedAt,
        }
      );
    }

    // Check if organization name already exists (excluding current org)
    if (validatedData.organizationName !== organization.name) {
      const nameExists = await organizationNameExists(
        validatedData.organizationName,
        organizationId
      );
      
      if (nameExists) {
        throw new AppError(
          ErrorCode.ORGANIZATION_NAME_EXISTS,
          'Organization name already exists',
          409,
          {
            field: 'organizationName',
          }
        );
      }
    }

    // Update user and organization in a transaction
    const result = await db.transaction(async (tx) => {
      // Update user name
      const [updatedUser] = await tx
        .update(users)
        .set({
          name: validatedData.ownerName,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(users.id, userId))
        .returning();

      // Update organization
      const [updatedOrg] = await tx
        .update(organizations)
        .set({
          name: validatedData.organizationName,
          address: validatedData.organizationAddress,
          businessType: validatedData.industry,
          gstin: validatedData.gstNumber,
          pan: validatedData.panNumber,
          setupComplete: true,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(organizations.id, organizationId))
        .returning();

      return { user: updatedUser, organization: updatedOrg };
    });

    // Build response
    const response: CompleteProfileResponse = {
      user: {
        id: result.user.id as string,
        name: result.user.name,
        phoneNumber: result.user.phoneNumber,
        role: userRole,
      },
      organization: {
        id: result.organization.id as string,
        name: result.organization.name,
        address: result.organization.address || undefined,
        industry: result.organization.businessType || undefined,
        employeeCount: validatedData.employeeCount,
        gstNumber: result.organization.gstin || undefined,
        setupComplete: result.organization.setupComplete,
        updatedAt: result.organization.updatedAt as string,
      },
      message: 'Profile setup completed successfully',
    };

    logger.info('Profile setup completed successfully', {
      userId,
      organizationId,
    });

    return successResponse(response, 200);
  } catch (error) {
    logger.error('Error in completeProfile handler:', error);
    return handleError(error);
  }
};
