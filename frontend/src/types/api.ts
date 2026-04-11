/**
 * API-related type definitions for better type safety
 */

// Standard API response wrapper
export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
  success: boolean;
}

// API error response structure
export interface ApiErrorResponse {
  error: string | { code: string; message: string };
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  timestamp?: string;
}

// Error types for different scenarios
export interface ValidationError extends ApiErrorResponse {
  error: {
    code: "validation_error";
    message: string;
    fields: Record<string, string[]>;
  };
}

export interface AuthenticationError extends ApiErrorResponse {
  error: {
    code: "authentication_error" | "no_refresh_token" | "token_expired";
    message: string;
  };
}

export interface AuthorizationError extends ApiErrorResponse {
  error: {
    code: "authorization_error";
    message: string;
    required_permissions?: string[];
  };
}

export interface NotFoundError extends ApiErrorResponse {
  error: {
    code: "not_found";
    message: string;
    resource?: string;
  };
}

export interface RateLimitError extends ApiErrorResponse {
  error: {
    code: "rate_limit_exceeded";
    message: string;
    retry_after?: number;
  };
}

export interface ServerError extends ApiErrorResponse {
  error: {
    code: "server_error" | "service_unavailable";
    message: string;
    request_id?: string;
  };
}

// Union type for all possible API errors
export type ApiError = 
  | ValidationError
  | AuthenticationError
  | AuthorizationError
  | NotFoundError
  | RateLimitError
  | ServerError;

// Helper type guards
export const isValidationError = (error: ApiErrorResponse): error is ValidationError => {
  return typeof error.error === 'object' && 
         error.error !== null && 
         'code' in error.error && 
         error.error.code === 'validation_error';
};

export const isAuthenticationError = (error: ApiErrorResponse): error is AuthenticationError => {
  return typeof error.error === 'object' && 
         error.error !== null && 
         'code' in error.error && 
         ['authentication_error', 'no_refresh_token', 'token_expired'].includes(error.error.code);
};

export const isAuthorizationError = (error: ApiErrorResponse): error is AuthorizationError => {
  return typeof error.error === 'object' && 
         error.error !== null && 
         'code' in error.error && 
         error.error.code === 'authorization_error';
};

export const isNotFoundError = (error: ApiErrorResponse): error is NotFoundError => {
  return typeof error.error === 'object' && 
         error.error !== null && 
         'code' in error.error && 
         error.error.code === 'not_found';
};

export const isRateLimitError = (error: ApiErrorResponse): error is RateLimitError => {
  return typeof error.error === 'object' && 
         error.error !== null && 
         'code' in error.error && 
         error.error.code === 'rate_limit_exceeded';
};

export const isServerError = (error: ApiErrorResponse): error is ServerError => {
  return typeof error.error === 'object' && 
         error.error !== null && 
         'code' in error.error && 
         ['server_error', 'service_unavailable'].includes(error.error.code);
};

// Request configuration types
export interface RequestConfig {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  signal?: AbortSignal;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Filter and sort types
export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterParams {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: unknown;
}

// Common query parameters
export type QueryParams = PaginationParams & SortParams & FilterParams;
