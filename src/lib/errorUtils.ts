/**
 * Utility functions for handling errors gracefully
 */

export type ErrorType = 'connection' | 'auth' | 'notFound' | 'rateLimit' | 'unknown';

export interface ParsedError {
  type: ErrorType;
  message: string;
  userFriendlyMessage: string;
  isRetryable: boolean;
}

/**
 * Parse an error and return a user-friendly representation
 */
export function parseError(error: unknown): ParsedError {
  if (!error) {
    return {
      type: 'unknown',
      message: 'Unknown error',
      userFriendlyMessage: 'An unexpected error occurred. Please try again.',
      isRetryable: true,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Connection/Network errors
  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('connection') ||
    lowerMessage.includes('aborted') ||
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('econnrefused')
  ) {
    return {
      type: 'connection',
      message,
      userFriendlyMessage: 'Unable to connect to the server. Please check your internet connection and try again.',
      isRetryable: true,
    };
  }

  // Auth errors
  if (
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('jwt') ||
    lowerMessage.includes('token') ||
    lowerMessage.includes('session') ||
    lowerMessage.includes('auth')
  ) {
    return {
      type: 'auth',
      message,
      userFriendlyMessage: 'Your session has expired. Please log in again.',
      isRetryable: false,
    };
  }

  // Not found errors
  if (
    lowerMessage.includes('not found') ||
    lowerMessage.includes('404') ||
    lowerMessage.includes('does not exist')
  ) {
    return {
      type: 'notFound',
      message,
      userFriendlyMessage: 'The requested content could not be found.',
      isRetryable: false,
    };
  }

  // Rate limit errors
  if (
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('too many requests') ||
    lowerMessage.includes('429')
  ) {
    return {
      type: 'rateLimit',
      message,
      userFriendlyMessage: 'Too many requests. Please wait a moment before trying again.',
      isRetryable: true,
    };
  }

  // Default unknown error
  return {
    type: 'unknown',
    message,
    userFriendlyMessage: 'Something went wrong. Please try again.',
    isRetryable: true,
  };
}

/**
 * Check if an error is a connection/network error
 */
export function isConnectionError(error: unknown): boolean {
  return parseError(error).type === 'connection';
}

/**
 * Check if an error is an auth error
 */
export function isAuthError(error: unknown): boolean {
  return parseError(error).type === 'auth';
}
