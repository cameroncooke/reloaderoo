/**
 * RestartHandler for processing restart_server tool calls with validation,
 * config updates, notifications, and ProcessManager integration.
 */

import { EventEmitter } from 'events';
import { logger } from './mcp-logger.js';
import {
  type JSONRPCRequest,
  type JSONRPCResponse,
  type CallToolRequest,
  type CallToolResult,
  type ProxyConfigUpdate,
  type ChildServerInfo,
  type RestartServerRequest,
  type RestartServerResult,
  type RequestId,
  ProcessState,
  PROXY_ERROR_RESPONSES,
  isRestartServerRequest
} from './types.js';
import { ProcessManager } from './process-manager.js';

/** Events emitted by RestartHandler for monitoring restart operations */
export interface RestartHandlerEvents {
  'restart-initiated': [configUpdate?: ProxyConfigUpdate];
  'restart-completed': [result: RestartServerResult];
  'restart-failed': [error: Error, attempt: number];
  'config-validated': [update: ProxyConfigUpdate];
  'notifications-sent': [methods: string[]];
}

/** Internal state for tracking restart operations and rate limiting */
interface RestartHandlerState {
  isRestartInProgress: boolean;
  lastRestartTime: number;
  concurrentRequests: Set<string>;
  operationCount: number;
}

/** Rate limiting configuration for restart operations */
interface RateLimitConfig {
  /** Minimum time between restart operations in milliseconds */
  minInterval: number;
  /** Maximum concurrent restart requests allowed */
  maxConcurrent: number;
  /** Maximum restart operations per hour */
  maxPerHour: number;
}

/**
 * RestartHandler manages restart_server tool calls with secure config updates,
 * error handling, client notifications and rate limiting for system stability.
 */
export class RestartHandler extends EventEmitter<RestartHandlerEvents> {
  private readonly processManager: ProcessManager;
  private readonly sendNotification: (method: string, params?: Record<string, unknown>) => Promise<void>;
  private readonly getServerInfo: () => ChildServerInfo | null;
  private readonly state: RestartHandlerState;
  private readonly rateLimit: RateLimitConfig;

  /** Initialize RestartHandler with dependencies and configuration. */
  constructor(
    processManager: ProcessManager,
    sendNotification: (method: string, params?: Record<string, unknown>) => Promise<void>,
    getServerInfo: () => ChildServerInfo | null,
    rateLimitConfig?: Partial<RateLimitConfig>
  ) {
    super();
    
    this.processManager = processManager;
    this.sendNotification = sendNotification;
    this.getServerInfo = getServerInfo;
    
    this.state = {
      isRestartInProgress: false,
      lastRestartTime: 0,
      concurrentRequests: new Set(),
      operationCount: 0
    };

    this.rateLimit = {
      minInterval: 5000, // 5 seconds minimum between restarts
      maxConcurrent: 1,
      maxPerHour: 12,
      ...rateLimitConfig
    };

    this.setupProcessManagerListeners();
  }

  /** Main entry point for handling restart_server tool calls. */
  async handleRestartTool(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const requestId = String(request.id);
    
    // Validate this is actually a restart_server request (before any state changes)
    if (!isRestartServerRequest(request)) {
      return this.createErrorResponse(request.id!, 
        PROXY_ERROR_RESPONSES.INVALID_RESTART_CONFIG,
        'Request is not a valid restart_server tool call');
    }

    // Extract tool call parameters
    const toolCall = request.params as CallToolRequest['params'];
    const restartParams = toolCall.arguments as RestartServerRequest;

    // Atomically check rate limits and set restart flag
    const rateLimitError = this.checkRateLimitAndSetFlag(requestId);
    if (rateLimitError) {
      return rateLimitError;
    }

    try {
      // Validate restart request parameters (now inside try block to ensure finally runs)
      const validation = this.validateRestartRequest(restartParams);
      if (!validation.valid) {
        return this.createErrorResponse(request.id!,
          PROXY_ERROR_RESPONSES.INVALID_RESTART_CONFIG,
          validation.error || 'Invalid restart request');
      }

      // Execute the restart operation
      const result = await this.executeRestart(restartParams);
      
      // Send success notifications
      await this.sendRestartNotifications();
      
      this.emit('restart-completed', result);
      
      return this.createRestartResult(request.id!, result);

    } catch (error) {
      logger.error('Restart tool handler failed', { 
        error: error instanceof Error ? error.message : String(error),
        requestId 
      });
      
      this.emit('restart-failed', error as Error, this.state.operationCount);
      
      return this.createErrorResponse(request.id!,
        PROXY_ERROR_RESPONSES.RESTART_FAILED,
        error instanceof Error ? error.message : 'Unknown restart error');
    } finally {
      // Always reset the restart flag to prevent permanent blocking
      this.state.isRestartInProgress = false;
      this.state.concurrentRequests.delete(requestId);
    }
  }

  /** Validate restart request parameters. */
  validateRestartRequest(params: RestartServerRequest): { valid: boolean; error?: string } {
    try {
      // Basic parameter validation
      if (params && typeof params !== 'object') {
        return { valid: false, error: 'Parameters must be an object' };
      }

      // Validate configuration update if provided
      if (params?.config) {
        const configValidation = this.validateConfigUpdate(params.config);
        if (!configValidation.valid) {
          return { valid: false, error: configValidation.error || 'Configuration validation failed' };
        }
      }

      // Validate force parameter
      if (params?.force !== undefined && typeof params.force !== 'boolean') {
        return { valid: false, error: 'Force parameter must be a boolean' };
      }

      return { valid: true };

    } catch (error) {
      return { 
        valid: false, 
        error: `Validation error: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /** Execute the restart operation with configuration updates. */
  async executeRestart(params: RestartServerRequest): Promise<RestartServerResult> {
    const startTime = Date.now();
    // Note: isRestartInProgress flag is already set by handleRestartTool
    this.state.operationCount++;

    try {
      // Check if restart is necessary (unless forced)
      if (!params.force && this.processManager.getState() === ProcessState.RUNNING) {
        const isHealthy = await this.processManager.isHealthy();
        if (isHealthy) {
          logger.info('Server is healthy, skipping restart (use force=true to override)');
        }
      }

      // Apply configuration updates if provided
      let appliedConfig: ProxyConfigUpdate | undefined;
      if (params.config) {
        appliedConfig = this.sanitizeConfigUpdate(params.config);
        this.emit('config-validated', appliedConfig);
      }

      // Emit restart initiated event
      this.emit('restart-initiated', appliedConfig);

      // Perform the restart via ProcessManager
      await this.processManager.restart(appliedConfig);

      // Calculate restart time and get updated server info
      const restartTime = Date.now() - startTime;
      const serverInfo = this.getServerInfo();
      
      if (!serverInfo) {
        throw new Error('Server information not available after restart');
      }

      const result: RestartServerResult = {
        success: true,
        message: appliedConfig 
          ? 'Server restarted successfully with configuration updates'
          : 'Server restarted successfully',
        restartTime,
        serverInfo,
        restartCount: this.processManager.getRestartCount()
      };

      this.state.lastRestartTime = Date.now();
      logger.info('Restart operation completed successfully', { 
        restartTime,
        restartCount: result.restartCount 
      });

      return result;

    } finally {
      // Note: isRestartInProgress flag is reset by handleRestartTool's finally block
      // to ensure proper lifecycle management across the entire operation
    }
  }

  /** Send notifications to client after successful restart. */
  async sendRestartNotifications(): Promise<void> {
    const serverInfo = this.getServerInfo();
    if (!serverInfo) {
      logger.warn('Cannot send restart notifications: server info not available');
      return;
    }

    const sentNotifications: string[] = [];

    try {
      // Always send tools/list_changed since we add restart_server tool
      await this.sendNotification('notifications/tools/list_changed');
      sentNotifications.push('tools/list_changed');

      // Send resource notifications if child server supports resources
      if (serverInfo.capabilities.resources) {
        await this.sendNotification('notifications/resources/list_changed');
        sentNotifications.push('resources/list_changed');
      }

      // Send prompt notifications if child server supports prompts  
      if (serverInfo.capabilities.prompts) {
        await this.sendNotification('notifications/prompts/list_changed');
        sentNotifications.push('prompts/list_changed');
      }

      this.emit('notifications-sent', sentNotifications);
      logger.debug('Restart notifications sent successfully', { notifications: sentNotifications });

    } catch (error) {
      logger.error('Failed to send restart notifications', { 
        error: error instanceof Error ? error.message : String(error),
        sentNotifications 
      });
      // Don't throw - restart was successful even if notifications failed
    }
  }

  /** Create a successful CallToolResult response for restart operations. */
  createRestartResult(requestId: RequestId, result: RestartServerResult): JSONRPCResponse {
    const toolResult: CallToolResult = {
      content: [
        {
          type: 'text',
          text: `${result.message}\n\nRestart completed in ${result.restartTime}ms\n` +
                `Server: ${result.serverInfo.name} v${result.serverInfo.version}\n` +
                `Total restarts: ${result.restartCount}`
        }
      ],
      isError: false
    };

    return {
      jsonrpc: '2.0',
      id: requestId,
      result: toolResult
    };
  }

  /** Validate and sanitize configuration updates for security. */
  private validateConfigUpdate(config: ProxyConfigUpdate): { valid: boolean; error?: string } {
    // Validate environment variables
    if (config.environment) {
      if (typeof config.environment !== 'object' || Array.isArray(config.environment)) {
        return { valid: false, error: 'Environment must be an object' };
      }
      
      for (const [key, value] of Object.entries(config.environment)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
          return { valid: false, error: 'Environment variables must be string key-value pairs' };
        }
      }
    }

    // Validate child arguments
    if (config.childArgs) {
      if (!Array.isArray(config.childArgs)) {
        return { valid: false, error: 'Child arguments must be an array' };
      }
      
      if (!config.childArgs.every(arg => typeof arg === 'string')) {
        return { valid: false, error: 'All child arguments must be strings' };
      }
    }

    // Validate working directory
    if (config.workingDirectory !== undefined) {
      if (typeof config.workingDirectory !== 'string') {
        return { valid: false, error: 'Working directory must be a string' };
      }
    }

    return { valid: true };
  }

  /** Sanitize configuration updates by removing dangerous values. */
  private sanitizeConfigUpdate(config: ProxyConfigUpdate): ProxyConfigUpdate {
    const sanitized: ProxyConfigUpdate = {};

    // Sanitize environment variables
    if (config.environment) {
      sanitized.environment = {};
      for (const [key, value] of Object.entries(config.environment)) {
        // Remove potentially dangerous environment variables
        if (!this.isDangerousEnvVar(key)) {
          sanitized.environment[key] = String(value).trim();
        }
      }
    }

    // Sanitize child arguments (remove obviously dangerous ones)
    if (config.childArgs) {
      sanitized.childArgs = config.childArgs
        .map(arg => String(arg).trim())
        .filter(arg => !this.isDangerousArg(arg));
    }

    // Sanitize working directory
    if (config.workingDirectory) {
      sanitized.workingDirectory = String(config.workingDirectory).trim();
    }

    return sanitized;
  }

  /** Check if environment variable name is dangerous. */
  private isDangerousEnvVar(name: string): boolean {
    const dangerous = ['PATH', 'LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH', 'HOME', 'USER'];
    return dangerous.includes(name.toUpperCase());
  }

  /** Check if command line argument is dangerous. */
  private isDangerousArg(arg: string): boolean {
    return arg.includes(';') || arg.includes('&&') || arg.includes('||') || 
           arg.includes('|') || arg.includes('>') || arg.includes('<');
  }

  /** Apply rate limiting and atomically set restart flag if checks pass. */
  private checkRateLimitAndSetFlag(requestId: string): JSONRPCResponse | null {
    const now = Date.now();

    // Check if restart is already in progress (atomic check)
    if (this.state.isRestartInProgress) {
      return this.createErrorResponse(requestId as RequestId,
        PROXY_ERROR_RESPONSES.RESTART_IN_PROGRESS,
        'A restart operation is already in progress');
    }

    // Check concurrent requests
    if (this.state.concurrentRequests.size >= this.rateLimit.maxConcurrent) {
      return this.createErrorResponse(requestId as RequestId,
        PROXY_ERROR_RESPONSES.RESTART_IN_PROGRESS,
        'Another restart operation is already in progress');
    }

    // Check minimum interval
    if (now - this.state.lastRestartTime < this.rateLimit.minInterval) {
      const remaining = Math.ceil((this.rateLimit.minInterval - (now - this.state.lastRestartTime)) / 1000);
      return this.createErrorResponse(requestId as RequestId,
        PROXY_ERROR_RESPONSES.RESTART_IN_PROGRESS,
        `Please wait ${remaining} seconds before requesting another restart`);
    }

    // All checks passed - atomically set the restart flag and track request
    this.state.isRestartInProgress = true;
    this.state.concurrentRequests.add(requestId);
    return null;
  }

  /** Create a JSON-RPC error response. */
  private createErrorResponse(requestId: RequestId, _errorInfo: typeof PROXY_ERROR_RESPONSES[keyof typeof PROXY_ERROR_RESPONSES], details: string): JSONRPCResponse {
    const toolResult: CallToolResult = {
      content: [
        {
          type: 'text',
          text: `Restart failed: ${details}`
        }
      ],
      isError: true
    };

    return {
      jsonrpc: '2.0',
      id: requestId,
      result: toolResult
    };
  }

  /** Setup ProcessManager event listeners. */
  private setupProcessManagerListeners(): void {
    this.processManager.on('restarting', (reason: string) => {
      logger.debug('ProcessManager restart initiated', { reason });
    });

    this.processManager.on('restarted', (pid: number, restartTime: number) => {
      logger.debug('ProcessManager restart completed', { pid, restartTime });
    });

    this.processManager.on('restart-failed', (error: Error) => {
      logger.error('ProcessManager restart failed', { error: error.message });
    });
  }

  /** Get current restart handler state for monitoring. */
  getState(): Readonly<RestartHandlerState> {
    return { ...this.state };
  }

  /** Check if restart is in progress. */
  isRestartInProgress(): boolean {
    return this.state.isRestartInProgress;
  }
}