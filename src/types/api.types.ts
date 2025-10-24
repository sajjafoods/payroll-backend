// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  requestId?: string;
}

// Auth Types
export interface SendOtpRequest {
  phoneNumber: string;
  countryCode?: string;
}

export interface SendOtpResponse {
  otpSent: boolean;
  expiresIn: number;
  message: string;
  retryAfter: number;
}

export interface VerifyOtpRequest {
  phoneNumber: string;
  otp: string;
}

export interface VerifyOtpResponse {
  token: string;
  refreshToken: string;
  expiresIn: number;
}

// Error Codes
export enum ErrorCode {
  // Validation Errors
  INVALID_PHONE_NUMBER = 'INVALID_PHONE_NUMBER',
  INVALID_OTP = 'INVALID_OTP',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Rate Limiting
  TOO_MANY_OTP_REQUESTS = 'TOO_MANY_OTP_REQUESTS',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  
  // OTP Errors
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_INVALID = 'OTP_INVALID',
  
  // Service Errors
  SMS_SERVICE_ERROR = 'SMS_SERVICE_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

// Custom Error Class
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}
