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
  deviceInfo?: {
    deviceId?: string;
    deviceName?: string;
    platform?: 'web' | 'android' | 'ios';
  };
}

export interface UserInfo {
  id: string;
  phoneNumber: string;
  name?: string;
  email?: string;
  role: string;
  avatar?: string;
  createdAt?: string;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  isDefault: boolean;
  setupComplete: boolean;
  address?: string;
  employeeCount?: number;
  createdAt?: string;
}

export interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface PermissionsInfo {
  employees: string[];
  attendance: string[];
  leaves: string[];
  payroll: string[];
  payments: string[];
  advances: string[];
  loans: string[];
  reports: string[];
}

export interface SubscriptionInfo {
  plan: string;
  status?: string;
  trialEndsAt?: string;
  renewsAt?: string;
  daysRemaining?: number;
}

export interface VerifyOtpResponse {
  isNewUser: boolean;
  user: UserInfo;
  organization: OrganizationInfo;
  permissions?: PermissionsInfo;
  tokens: TokenInfo;
  subscription: SubscriptionInfo;
  nextStep: 'complete_profile' | 'dashboard';
}

// Error Codes
export enum ErrorCode {
  // Validation Errors
  INVALID_PHONE_NUMBER = 'INVALID_PHONE_NUMBER',
  INVALID_OTP = 'INVALID_OTP',
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Rate Limiting
  TOO_MANY_OTP_REQUESTS = 'TOO_MANY_OTP_REQUESTS',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  TOO_MANY_VERIFICATION_ATTEMPTS = 'TOO_MANY_VERIFICATION_ATTEMPTS',
  
  // OTP Errors
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_INVALID = 'OTP_INVALID',
  
  // Account Errors
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  
  // Service Errors
  SMS_SERVICE_ERROR = 'SMS_SERVICE_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
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
