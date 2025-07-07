/**
 * Output formatting utilities for CLI mode
 * 
 * Provides consistent JSON formatting and error handling for CLI output
 */

import { logger } from '../mcp-logger.js';

export interface CLIResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    command: string;
    timestamp: string;
    duration?: number;
  } | undefined;
}

export class OutputFormatter {
  /**
   * Format successful result
   */
  static success<T>(data: T, metadata?: CLIResult['metadata']): string {
    const result: CLIResult<T> = {
      success: true,
      data,
      metadata: metadata || undefined
    };
    
    return JSON.stringify(result, null, 2);
  }

  /**
   * Format error result
   */
  static error(error: Error | unknown, metadata?: CLIResult['metadata']): string {
    let errorInfo: CLIResult['error'];
    
    if (error instanceof Error) {
      errorInfo = {
        code: error.name || 'ERROR',
        message: error.message,
        details: error.stack
      };
    } else {
      errorInfo = {
        code: 'UNKNOWN_ERROR',
        message: String(error),
        details: error
      };
    }
    
    const result: CLIResult = {
      success: false,
      error: errorInfo,
      metadata: metadata || undefined
    };
    
    return JSON.stringify(result, null, 2);
  }

  /**
   * Format raw output (for compatibility mode)
   */
  static raw(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Output to stdout
   */
  static output(data: string): void {
    process.stdout.write(data);
    process.stdout.write('\n');
  }

  /**
   * Output error to stderr and set exit code
   */
  static outputError(error: Error | unknown, exitCode = 1): void {
    const formatted = OutputFormatter.error(error);
    process.stderr.write(formatted);
    process.stderr.write('\n');
    process.exit(exitCode);
  }

  /**
   * Create metadata for a command
   */
  static createMetadata(command: string, startTime?: number): CLIResult['metadata'] {
    const metadata: CLIResult['metadata'] = {
      command,
      timestamp: new Date().toISOString()
    };
    
    if (startTime) {
      metadata.duration = Date.now() - startTime;
    }
    
    return metadata;
  }

  /**
   * Execute operation with timing and error handling
   */
  static async executeWithTiming<T>(
    command: string,
    operation: () => Promise<T>,
    rawOutput = false
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const metadata = OutputFormatter.createMetadata(command, startTime);
      
      if (rawOutput) {
        OutputFormatter.output(OutputFormatter.raw(result));
      } else {
        OutputFormatter.output(OutputFormatter.success(result, metadata));
      }
      
      process.exit(0);
    } catch (error) {
      logger.error(`Command failed: ${command}`, { error });
      
      // const metadata = OutputFormatter.createMetadata(command, startTime);
      OutputFormatter.outputError(error, 1);
    }
  }
}