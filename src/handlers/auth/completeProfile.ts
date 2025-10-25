import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handleError, successResponse } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';
import { AppError, ErrorCode, CompleteProfileRequest, CompleteProfileResponse } from '../../types/api.types';
import { extractAndVerifyToken } from '../../middleware/auth.middleware';
import { completeProfileSchema } from '../../middleware/validation.middleware';
import { parseRequestBody } from '../../utils/request';
import { db } from '../../db/client';
import { users, organizations } from '../../db/schema/schema';
import { eq, sql } from 'drizzle-orm';
import { 
  getOrganizationById, 
  organizationNameExists 
} from '../../db/queries/organizations';

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

    // Parse and validate request body
    const body = parseRequestBody<CompleteProfileRequest>(event);
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
        ErrorCode.ORGANIZATION_NOT_FOUND,
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
