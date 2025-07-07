/**
 * Comprehensive error handling system for mcpdev-proxy
 * 
 * This module provides centralized error management with JSON-RPC compliance,
 * error classification, retry logic, and integration with the logging system.
 */

import { logger } from './mcp-logger.js';
import { ProxyErrorCode } from './types.js';
import type {
  JSONRPCError,
  RequestId,
  ProxyError
} from './types.js';

// Standard JSON-RPC 2.0 error codes
export const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Server-defined errors should be >= -32000
  SERVER_ERROR_START: -32099,
  SERVER_ERROR_END: -32000
} as const;

// Proxy-specific error codes (>= -32000)
export const PROXY_SPECIFIC_ERROR_CODES = {
  CHILD_UNAVAILABLE: -32000,
  RESTART_IN_PROGRESS: -32001,
  RESTART_FAILED: -32002,
  INVALID_RESTART_CONFIG: -32003,
  CHILD_TIMEOUT: -32004,
  CHILD_CRASHED: -32005,
  RESTART_LIMIT_EXCEEDED: -32006,
  INVALID_PROXY_CONFIG: -32007,
  CHILD_START_FAILED: -32008
} as const;

/**
 * Error context information for debugging and logging
 */
export interface ErrorContext extends Record<string, unknown> {
  request?: unknown;
  childProcess?: {
    pid?: number;
    exitCode?: number | null;
    signal?: string | null;
  };
  timing?: {
    startTime?: number;
    duration?: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Extended proxy error with additional context
 */
export class ProxyErrorExtended extends Error implements ProxyError {
  public readonly code: ProxyErrorCode;
  public readonly context?: Record<string, unknown>;
  public override readonly cause?: Error;
  public readonly timestamp: number;
  public readonly retryable: boolean;

  override name = 'ProxyError';

  constructor(
    code: ProxyErrorCode,
    message: string,
    options?: {
      cause?: Error;
      context?: Record<string, unknown>;
      retryable?: boolean;
    }
  ) {
    super(message);
    this.code = code;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    if (options?.context !== undefined) {
      this.context = options.context;
    }
    this.timestamp = Date.now();
    this.retryable = options?.retryable ?? false;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProxyErrorExtended);
    }
  }
}

/**
 * Centralized error handler for the proxy
 */
export class ProxyErrorHandler {
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly circuitBreakerThreshold: number;
  private failureCount: Map<string, number> = new Map();
  private lastFailureTime: Map<string, number> = new Map();

  constructor(options?: {
    maxRetries?: number;
    retryDelayMs?: number;
    circuitBreakerThreshold?: number;
  }) {
    // maxRetries is used by retry logic and stored for error context
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelayMs = options?.retryDelayMs ?? 1000;
    this.circuitBreakerThreshold = options?.circuitBreakerThreshold ?? 5;
  }

  /**
   * Handle an error and determine the appropriate response
   */
  handleError(error: unknown, context?: ErrorContext): { code: number; message: string; data?: unknown } {
    this.logError(error, context);
    this.trackFailure(error);
    return this.toJSONRPCError(error, context);
  }

  /**
   * Create a JSON-RPC error response
   */
  createErrorResponse(
    error: unknown,
    requestId: RequestId | null,
    context?: ErrorContext
  ): JSONRPCError {
    const errorData = this.handleError(error, context);
    return {
      jsonrpc: '2.0',
      id: requestId as RequestId,
      error: errorData
    };
  }

  /**
   * Convert any error to a JSON-RPC error's error object
   */
  private toJSONRPCError(error: unknown, context?: ErrorContext): { code: number; message: string; data?: unknown } {
    if (isJSONRPCError(error)) {
      return error.error;
    }

    if (isProxyError(error)) {
      return this.proxyErrorToJSONRPC(error, context);
    }

    if (error instanceof Error) {
      return this.standardErrorToJSONRPC(error, context);
    }

    // Unknown error type
    return {
      code: JSONRPC_ERROR_CODES.INTERNAL_ERROR,
      message: 'An unknown error occurred',
      data: {
        type: 'unknown',
        value: String(error),
        timestamp: Date.now()
      }
    };
  }

  /**
   * Convert ProxyError to JSON-RPC error object
   */
  private proxyErrorToJSONRPC(error: ProxyError, context?: ErrorContext): { code: number; message: string; data?: unknown } {
    const errorCode = this.mapProxyErrorCode(error.code);
    const sanitizedContext = this.sanitizeContext({
      ...error.context,
      ...context
    });

    return {
      code: errorCode,
      message: error.message,
      data: {
        proxyErrorCode: error.code,
        context: sanitizedContext,
        timestamp: Date.now(),
        retryable: this.isRetryableError(error)
      }
    };
  }

  /**
   * Convert standard Error to JSON-RPC error object
   */
  private standardErrorToJSONRPC(error: Error, context?: ErrorContext): { code: number; message: string; data?: unknown } {
    const errorCode = this.inferErrorCode(error);
    const sanitizedContext = this.sanitizeContext(context as Record<string, unknown>);

    return {
      code: errorCode,
      message: error.message || 'Internal server error',
      data: {
        type: error.name,
        stack: process.env['NODE_ENV'] === 'development' ? error.stack : undefined,
        context: sanitizedContext,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Map ProxyErrorCode to JSON-RPC error code
   */
  private mapProxyErrorCode(code: ProxyErrorCode): number {
    const mapping: Record<ProxyErrorCode, number> = {
      [ProxyErrorCode.CHILD_START_FAILED]: PROXY_SPECIFIC_ERROR_CODES.CHILD_START_FAILED,
      [ProxyErrorCode.CHILD_CRASHED]: PROXY_SPECIFIC_ERROR_CODES.CHILD_CRASHED,
      [ProxyErrorCode.RESTART_LIMIT_EXCEEDED]: PROXY_SPECIFIC_ERROR_CODES.RESTART_LIMIT_EXCEEDED,
      [ProxyErrorCode.OPERATION_TIMEOUT]: PROXY_SPECIFIC_ERROR_CODES.CHILD_TIMEOUT,
      [ProxyErrorCode.CHILD_UNRESPONSIVE]: PROXY_SPECIFIC_ERROR_CODES.CHILD_UNAVAILABLE,
      [ProxyErrorCode.INVALID_CONFIG]: PROXY_SPECIFIC_ERROR_CODES.INVALID_PROXY_CONFIG,
      [ProxyErrorCode.CHILD_UNAVAILABLE]: PROXY_SPECIFIC_ERROR_CODES.CHILD_UNAVAILABLE
    };

    return mapping[code] ?? JSONRPC_ERROR_CODES.INTERNAL_ERROR;
  }

  /**
   * Infer error code from error properties
   */
  private inferErrorCode(error: Error): number {
    const message = error.message.toLowerCase();
    if (message.includes('timeout')) return PROXY_SPECIFIC_ERROR_CODES.CHILD_TIMEOUT;
    if (message.includes('parse') || message.includes('json')) return JSONRPC_ERROR_CODES.PARSE_ERROR;
    if (message.includes('method') || message.includes('not found')) return JSONRPC_ERROR_CODES.METHOD_NOT_FOUND;
    if (message.includes('invalid') || message.includes('parameter')) return JSONRPC_ERROR_CODES.INVALID_PARAMS;
    return JSONRPC_ERROR_CODES.INTERNAL_ERROR;
  }

  /**
   * Log error with appropriate level and context
   */
  private logError(error: unknown, context?: ErrorContext): void {
    const level = this.getErrorLogLevel(error);
    const errorInfo = this.formatErrorForLogging(error, context);

    logger[level]('Error occurred in proxy', errorInfo);
  }

  /**
   * Determine appropriate log level for error
   */
  private getErrorLogLevel(error: unknown): 'debug' | 'info' | 'warn' | 'error' | 'critical' {
    if (isProxyError(error)) {
      const errorLevels = [ProxyErrorCode.CHILD_CRASHED, ProxyErrorCode.RESTART_LIMIT_EXCEEDED];
      const warnLevels = [ProxyErrorCode.CHILD_UNAVAILABLE, ProxyErrorCode.OPERATION_TIMEOUT];
      
      if (errorLevels.includes(error.code)) return 'error';
      if (warnLevels.includes(error.code)) return 'warn';
      return 'info';
    }

    if (error instanceof Error && 
        (error.message.includes('ECONNREFUSED') || error.message.includes('EPIPE'))) {
      return 'warn';
    }

    return 'error';
  }

  /**
   * Format error for structured logging
   */
  private formatErrorForLogging(error: unknown, context?: ErrorContext): Record<string, unknown> {
    const baseInfo: Record<string, unknown> = {
      timestamp: Date.now(),
      context: this.sanitizeContext(context as Record<string, unknown>)
    };

    if (isProxyError(error)) {
      return {
        ...baseInfo,
        type: 'ProxyError',
        code: error.code,
        message: error.message,
        cause: error.cause?.message,
        retryable: this.isRetryableError(error)
      };
    }

    if (error instanceof Error) {
      return {
        ...baseInfo,
        type: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    return {
      ...baseInfo,
      type: 'unknown',
      value: String(error)
    };
  }

  /**
   * Sanitize error context to remove sensitive information
   */
  private sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!context) return undefined;

    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'token', 'secret'];
    
    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(s => lowerKey.includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeContext(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Determine if an error is retryable
   */
  isRetryableError(error: unknown): boolean {
    if (error instanceof ProxyErrorExtended) {
      return error.retryable;
    }

    if (isProxyError(error)) {
      const retryableCodes: ProxyErrorCode[] = [
        ProxyErrorCode.CHILD_CRASHED,
        ProxyErrorCode.OPERATION_TIMEOUT,
        ProxyErrorCode.CHILD_UNRESPONSIVE
      ];
      return retryableCodes.includes(error.code);
    }

    if (error instanceof Error) {
      const retryableMessages = [
        'ECONNREFUSED',
        'EPIPE',
        'ETIMEDOUT',
        'ENOTFOUND',
        'timeout'
      ];
      return retryableMessages.some(msg => 
        error.message.toLowerCase().includes(msg.toLowerCase())
      );
    }

    return false;
  }

  /**
   * Track failure for circuit breaker pattern
   */
  private trackFailure(error: unknown): void {
    const key = this.getCircuitBreakerKey(error);
    const count = (this.failureCount.get(key) ?? 0) + 1;
    
    this.failureCount.set(key, count);
    this.lastFailureTime.set(key, Date.now());

    // Clean up old entries
    this.cleanupFailureTracking();
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen(operation: string): boolean {
    const count = this.failureCount.get(operation) ?? 0;
    const lastFailure = this.lastFailureTime.get(operation) ?? 0;
    const timeSinceFailure = Date.now() - lastFailure;

    // Reset if enough time has passed
    if (timeSinceFailure > 60000) { // 1 minute
      this.failureCount.delete(operation);
      this.lastFailureTime.delete(operation);
      return false;
    }

    return count >= this.circuitBreakerThreshold;
  }

  /**
   * Get circuit breaker key for an error
   */
  private getCircuitBreakerKey(error: unknown): string {
    if (isProxyError(error)) {
      return `proxy_error_${error.code}`;
    }
    return 'general_error';
  }

  /**
   * Clean up old failure tracking entries
   */
  private cleanupFailureTracking(): void {
    const cutoffTime = Date.now() - 300000; // 5 minutes
    for (const [key, time] of this.lastFailureTime.entries()) {
      if (time < cutoffTime) {
        this.failureCount.delete(key);
        this.lastFailureTime.delete(key);
      }
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(attemptNumber: number): number {
    const delay = Math.min(this.retryDelayMs * Math.pow(2, attemptNumber - 1), 30000);
    const jitter = Math.random() * 0.3 * delay; // Add jitter
    return Math.floor(delay + jitter);
  }

  /**
   * Check if retry attempt is within limits
   */
  canRetry(attemptNumber: number): boolean {
    return attemptNumber <= this.maxRetries;
  }
}

/**
 * Helper function to create a JSON-RPC error object
 */
export function createJSONRPCError(
  code: number,
  message: string,
  data?: unknown
): JSONRPCError {
  return {
    jsonrpc: '2.0',
    id: null as any,
    error: {
      code,
      message,
      data
    }
  };
}

/**
 * Helper function to format error for display
 */
export function formatError(error: unknown): string {
  if (isProxyError(error)) {
    return `[${error.code}] ${error.message}`;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return String(error);
}

/**
 * Type guard to check if value is a JSON-RPC error
 */
export function isJSONRPCError(value: unknown): value is JSONRPCError {
  return (
    typeof value === 'object' && value !== null &&
    'code' in value && 'message' in value &&
    typeof (value as any).code === 'number' &&
    typeof (value as any).message === 'string'
  );
}

/**
 * Type guard to check if error is a ProxyError
 */
export function isProxyError(error: unknown): error is ProxyError {
  return error instanceof Error && 'code' in error &&
    Object.values(ProxyErrorCode).includes((error as any).code);
}

/**
 * Sanitize error message for external communication
 */
export function sanitizeError(error: unknown): { message: string; code?: string } {
  if (isProxyError(error)) {
    return {
      message: error.message,
      code: error.code
    };
  }

  if (error instanceof Error) {
    // Remove potentially sensitive information
    const sanitizedMessage = error.message
      .replace(/\/[\w\/]+\/([\w-]+)/g, '/$1') // Remove full paths
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]') // Remove IP addresses
      .replace(/:\d{4,5}/g, ':[PORT]'); // Remove port numbers
    
    return { message: sanitizedMessage };
  }

  return { message: 'An error occurred' };
}

// Export singleton error handler instance
export const errorHandler = new ProxyErrorHandler();