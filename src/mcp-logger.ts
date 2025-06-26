/**
 * MCP-Compliant Logger
 * 
 * Follows MCP specification for server-side logging:
 * - NEVER logs to stdout (interferes with protocol)
 * - Uses stderr for local development messages
 * - Sends proper log notifications to MCP client
 * - File-based logging for persistent storage
 * 
 * Reference: https://modelcontextprotocol.io/docs/tools/debugging#server-side-logging
 */

import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir, tmpdir } from 'os';

type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical';

interface LogMessage {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  source?: string;
}

class MCPLogger {
  private logFile: string;
  private currentLevel: LogLevel = 'info';
  private mcpServer: any = null;
  private isServerMode = false;
  private clientInfo: string = '';

  constructor(logFile?: string) {
    this.logFile = logFile || this.getDefaultLogPath();
    this.ensureLogDirectory();
    this.clientInfo = this.getClientInfo();
  }

  /**
   * Set the MCP server instance for sending log notifications
   */
  setMCPServer(server: any): void {
    this.mcpServer = server;
    this.isServerMode = true;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }
  
  /**
   * Set custom log file path
   */
  setLogFile(logFile: string): void {
    this.logFile = logFile;
    this.ensureLogDirectory();
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: any, source?: string): void {
    this.log('debug', message, data, source);
  }

  /**
   * Log info message
   */
  info(message: string, data?: any, source?: string): void {
    this.log('info', message, data, source);
  }

  /**
   * Log notice message
   */
  notice(message: string, data?: any, source?: string): void {
    this.log('notice', message, data, source);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any, source?: string): void {
    this.log('warning', message, data, source);
  }

  /**
   * Log error message
   */
  error(message: string, data?: any, source?: string): void {
    this.log('error', message, data, source);
  }

  /**
   * Log critical message
   */
  critical(message: string, data?: any, source?: string): void {
    this.log('critical', message, data, source);
  }

  /**
   * Main logging method
   */
  private log(level: LogLevel, message: string, data?: any, source?: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const logMessage: LogMessage = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      ...(source && { source })
    };

    // Always write to file for persistence
    this.writeToFile(logMessage);

    // Send to MCP client if server is available and connected (proper MCP logging)
    if (this.isServerMode && this.mcpServer) {
      try {
        // Check if server is connected before sending
        if (this.mcpServer.transport && this.mcpServer.transport.isConnected()) {
          this.mcpServer.sendLoggingMessage({
            level: level === 'critical' ? 'error' : level, // Map critical to error for MCP
            data: data ? `${message} ${JSON.stringify(data)}` : message
          });
          return; // Successfully sent via MCP
        }
      } catch (error) {
        // Fall through to stderr logging
      }
    }
    
    // Fallback: always write to stderr (MCP compliant for local logging)
    this.writeToStderr(logMessage);
  }

  /**
   * Check if message should be logged based on current level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      'debug': 0,
      'info': 1,
      'notice': 2,
      'warning': 3,
      'error': 4,
      'critical': 5
    };

    return levels[level] >= levels[this.currentLevel];
  }

  /**
   * Write to stderr (MCP compliant for local logging)
   */
  private writeToStderr(logMessage: LogMessage): void {
    const formatted = this.formatMessage(logMessage);
    
    // IMPORTANT: Use stderr, NEVER stdout per MCP specification
    process.stderr.write(formatted + '\n');
  }

  /**
   * Write to log file
   */
  private writeToFile(logMessage: LogMessage): void {
    try {
      const formatted = this.formatMessage(logMessage);
      appendFileSync(this.logFile, formatted + '\n', 'utf8');
    } catch (error) {
      // If file logging fails, still write to stderr
      process.stderr.write(`[LOG ERROR] Failed to write to log file: ${error}\n`);
    }
  }

  /**
   * Get client info (parent process and MCP client)
   */
  private getClientInfo(): string {
    try {
      const ppid = process.ppid;
      return `PPID:${ppid}`;
    } catch {
      return 'PPID:unknown';
    }
  }

  /**
   * Format log message for output
   */
  private formatMessage(logMessage: LogMessage): string {
    const { timestamp, level, message, data, source } = logMessage;
    const levelUpper = level.toUpperCase().padEnd(8);
    const pid = `[PID:${process.pid}]`;
    const client = `[${this.clientInfo}]`;
    const sourceStr = source ? `[${source.padEnd(12)}] ` : '';
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    
    return `[${timestamp}] ${pid} ${client} [${levelUpper}] ${sourceStr}${message}${dataStr}`;
  }

  /**
   * Get default log file path
   */
  private getDefaultLogPath(): string {
    try {
      if (process.platform === 'darwin') {
        return join(homedir(), 'Library', 'Logs', 'mcpdev-proxy.log');
      } else {
        return join(homedir(), '.cache', 'mcpdev-proxy', 'mcpdev-proxy.log');
      }
    } catch {
      return join(tmpdir(), 'mcpdev-proxy.log');
    }
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    try {
      const logDir = dirname(this.logFile);
      mkdirSync(logDir, { recursive: true });
    } catch (error) {
      // If we can't create the directory, fall back to stderr logging only
      process.stderr.write(`[LOG WARNING] Cannot create log directory, using stderr only: ${error}\n`);
    }
  }

  /**
   * Get current log file path
   */
  getLogFile(): string {
    return this.logFile;
  }
}

// Export singleton instance
export const logger = new MCPLogger();

// Export class for advanced usage
export { MCPLogger };
export type { LogLevel, LogMessage };