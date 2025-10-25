import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from './logger';

// Environment variables with validation
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;
const JWT_ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_TOKEN_EXPIRY || '1h';
const JWT_REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d';

// Validate JWT secrets at module load
const validateSecrets = () => {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  
  if (JWT_SECRET === 'your-secret-key-change-in-production') {
    throw new Error('JWT_SECRET must be changed from default value in production');
  }
  
  if (JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters for security');
  }
  
  // Warn if using same secret for both token types
  if (JWT_ACCESS_SECRET === JWT_REFRESH_SECRET) {
    logger.warn('Using same secret for access and refresh tokens. Consider using separate secrets for better security.');
  }
};

// Run validation in production/staging
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  validateSecrets();
}

// Custom error classes
export class TokenExpiredError extends Error {
  constructor(message: string = 'Token has expired') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class TokenInvalidError extends Error {
  constructor(message: string = 'Token is invalid') {
    super(message);
    this.name = 'TokenInvalidError';
  }
}

export class TokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

export interface JwtPayload {
  userId: string;
  organizationId: string;
  role: string;
  sessionId?: string;
  jti?: string; // JWT ID for token revocation
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * Validate JWT payload before signing
 */
const validatePayload = (payload: JwtPayload): void => {
  if (!payload.userId || typeof payload.userId !== 'string') {
    throw new TokenValidationError('userId is required and must be a string');
  }
  
  if (!payload.organizationId || typeof payload.organizationId !== 'string') {
    throw new TokenValidationError('organizationId is required and must be a string');
  }
  
  if (!payload.role || typeof payload.role !== 'string') {
    throw new TokenValidationError('role is required and must be a string');
  }
};

/**
 * Parse expiry string to seconds
 */
const parseExpiryToSeconds = (expiryString: string): number => {
  const match = expiryString.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error('Invalid expiry format. Use format like: 1h, 30m, 7d');
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      throw new Error('Invalid time unit');
  }
};

/**
 * Generate a JWT token (generic function)
 */
const generateToken = (
  payload: JwtPayload,
  secret: string,
  expiresIn: string,
  tokenType: 'access' | 'refresh'
): string => {
  try {
    validatePayload(payload);
    
    // Add jti if not present (for token revocation)
    const tokenPayload = {
      ...payload,
      jti: payload.jti || crypto.randomBytes(16).toString('hex'),
    };
    
    // Convert expiry string to seconds to avoid type issues
    const expiresInSeconds = parseExpiryToSeconds(expiresIn);
    
    return jwt.sign(tokenPayload, secret, {
      expiresIn: expiresInSeconds,
      issuer: 'payroll-backend',
      audience: 'payroll-app',
    });
  } catch (error) {
    if (error instanceof TokenValidationError) {
      throw error;
    }
    logger.error(`Error generating ${tokenType} token:`, error);
    throw new Error(`Failed to generate ${tokenType} token`);
  }
};

/**
 * Verify a JWT token (generic function)
 */
const verifyToken = (
  token: string,
  secret: string,
  tokenType: 'access' | 'refresh'
): JwtPayload => {
  try {
    const decoded = jwt.verify(token, secret, {
      issuer: 'payroll-backend',
      audience: 'payroll-app',
    }) as JwtPayload;
    
    return decoded;
  } catch (error: any) {
    logger.error(`Error verifying ${tokenType} token:`, error);
    
    // Provide specific error types
    if (error.name === 'TokenExpiredError') {
      throw new TokenExpiredError(`${tokenType} token has expired`);
    } else if (error.name === 'JsonWebTokenError') {
      throw new TokenInvalidError(`Invalid ${tokenType} token`);
    } else {
      throw new TokenInvalidError(`Failed to verify ${tokenType} token`);
    }
  }
};

/**
 * Generate access token
 */
export const generateAccessToken = (payload: JwtPayload): string => {
  return generateToken(payload, JWT_ACCESS_SECRET!, JWT_ACCESS_TOKEN_EXPIRY, 'access');
};

/**
 * Generate refresh token
 */
export const generateRefreshToken = (payload: JwtPayload): string => {
  return generateToken(payload, JWT_REFRESH_SECRET!, JWT_REFRESH_TOKEN_EXPIRY, 'refresh');
};

/**
 * Generate both access and refresh tokens
 */
export const generateTokenPair = (payload: JwtPayload): TokenPair => {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  
  // Parse expiry dynamically instead of hardcoding
  const expiresIn = parseExpiryToSeconds(JWT_ACCESS_TOKEN_EXPIRY);
  
  return {
    accessToken,
    refreshToken,
    expiresIn,
    tokenType: 'Bearer',
  };
};

/**
 * Verify and decode access token
 */
export const verifyAccessToken = (token: string): JwtPayload => {
  return verifyToken(token, JWT_ACCESS_SECRET!, 'access');
};

/**
 * Verify and decode refresh token
 */
export const verifyRefreshToken = (token: string): JwtPayload => {
  return verifyToken(token, JWT_REFRESH_SECRET!, 'refresh');
};

/**
 * Hash refresh token for storage
 * Uses SHA-256 to securely store refresh tokens in database
 */
export const hashRefreshToken = (token: string): string => {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
};

/**
 * Calculate token expiry timestamp
 * Converts expiry string (e.g., '7d', '1h') to a Date object
 */
export const calculateTokenExpiry = (expiryString: string = JWT_REFRESH_TOKEN_EXPIRY): Date => {
  const match = expiryString.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error('Invalid expiry format. Use format like: 1h, 30m, 7d');
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  const now = new Date();
  
  switch (unit) {
    case 's':
      now.setSeconds(now.getSeconds() + value);
      break;
    case 'm':
      now.setMinutes(now.getMinutes() + value);
      break;
    case 'h':
      now.setHours(now.getHours() + value);
      break;
    case 'd':
      now.setDate(now.getDate() + value);
      break;
    default:
      throw new Error('Invalid time unit');
  }
  
  return now;
};

/**
 * Extract JWT payload without verification (use with caution)
 * Useful for getting token metadata without validating signature
 */
export const decodeToken = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.decode(token) as JwtPayload;
    return decoded;
  } catch (error) {
    logger.error('Error decoding token:', error);
    return null;
  }
};
