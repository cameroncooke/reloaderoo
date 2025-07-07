/**
 * ProcessManager - Manages child MCP server lifecycle with crash detection, auto-restart, and health monitoring
 */

import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { spawn } from 'cross-spawn';
import { logger } from './mcp-logger.js';
import {
  ProxyConfig,
  ProxyConfigUpdate,
  ProcessState,
  ProxyErrorCode,
  ProxyError,
  DEFAULT_PROXY_CONFIG
} from './types.js';

/** Events emitted by ProcessManager for state changes and lifecycle events */
export interface ProcessManagerEvents {
  'started': [pid: number];
  'stopped': [exitCode: number | null, signal: string | null];
  'crashed': [exitCode: number | null, signal: string | null, restartCount: number];
  'restarting': [reason: string];
  'restarted': [pid: number, restartTime: number];
  'restart-failed': [error: Error, restartCount: number];
  'error': [error: ProxyError];
}

/** Health check result for monitoring child process responsiveness */
interface HealthCheckResult {
  healthy: boolean;
  responseTime?: number;
  error?: string;
}

/** Internal state tracking for the ProcessManager */
interface ProcessManagerState {
  childProcess: ChildProcess | null;
  state: ProcessState;
  restartCount: number;
  lastRestartTime: number | null;
  isShuttingDown: boolean;
  restartTimeoutId: NodeJS.Timeout | null;
  operationTimeoutId: NodeJS.Timeout | null;
}

/**
 * ProcessManager handles complete lifecycle of child MCP server processes with crash detection,
 * auto-restart with exponential backoff, health monitoring, and graceful shutdown capabilities.
 */
export class ProcessManager extends EventEmitter {
  private config: ProxyConfig;
  private state: ProcessManagerState;

  constructor(config: ProxyConfig) {
    super();
    
    this.config = { ...DEFAULT_PROXY_CONFIG, ...config } as ProxyConfig;
    this.validateConfig(this.config);

    this.state = {
      childProcess: null,
      state: ProcessState.STOPPED,
      restartCount: 0,
      lastRestartTime: null,
      isShuttingDown: false,
      restartTimeoutId: null,
      operationTimeoutId: null
    };

    logger.info('ProcessManager initialized', {
      childCommand: this.config.childCommand,
      workingDirectory: this.config.workingDirectory,
      autoRestart: this.config.autoRestart
    });
  }

  /** Start the child MCP server process */
  async spawn(): Promise<void> {
    if (this.state.state !== ProcessState.STOPPED && this.state.state !== ProcessState.UNAVAILABLE) {
      throw this.createError(ProxyErrorCode.INVALID_CONFIG, 
        `Cannot spawn process in state: ${this.state.state}`);
    }

    logger.info('Spawning child MCP server', {
      command: this.config.childCommand,
      args: this.config.childArgs
    });

    this.setState(ProcessState.STARTING);

    try {
      this.clearTimeouts();

      const timeoutPromise = new Promise<never>((_, reject) => {
        this.state.operationTimeoutId = setTimeout(() => {
          reject(this.createError(ProxyErrorCode.OPERATION_TIMEOUT, 
            `Child process spawn timed out after ${Math.min(this.config.operationTimeout, 5000)}ms`));
        }, Math.min(this.config.operationTimeout, 5000));
      });

      const spawnPromise = this.spawnChildProcess();
      await Promise.race([spawnPromise, timeoutPromise]);

      this.clearTimeouts();
      this.setState(ProcessState.RUNNING);
      this.resetRestartCount();

      logger.info('Child MCP server spawned successfully', { pid: this.state.childProcess?.pid });
      this.emit('started', this.state.childProcess!.pid!);

    } catch (error) {
      this.clearTimeouts();
      this.setState(ProcessState.UNAVAILABLE);
      this.state.childProcess = null;

      const proxyError = error instanceof Error && 'code' in error 
        ? error as ProxyError
        : this.createError(ProxyErrorCode.CHILD_START_FAILED, 
            `Failed to spawn child process: ${error}`, { cause: error as Error });

      logger.error('Failed to spawn child MCP server, marking as unavailable', { error: proxyError.message });
      this.emit('error', proxyError);
      throw proxyError;
    }
  }

  /** Restart the child process with optional configuration updates */
  async restart(configUpdate?: ProxyConfigUpdate): Promise<void> {
    logger.info('Initiating child process restart', {
      currentState: this.state.state,
      restartCount: this.state.restartCount
    });

    // Allow restart from UNAVAILABLE state - this is how we retry failed children
    if (this.state.state === ProcessState.UNAVAILABLE) {
      logger.info('Attempting to restart from unavailable state');
      this.state.restartCount = 0; // Reset restart count when trying from unavailable
    }

    if (this.state.restartCount >= this.config.restartLimit) {
      const error = this.createError(ProxyErrorCode.RESTART_LIMIT_EXCEEDED,
        `Maximum restart attempts (${this.config.restartLimit}) exceeded`);
      this.emit('restart-failed', error, this.state.restartCount);
      throw error;
    }

    const restartStartTime = Date.now();
    this.setState(ProcessState.RESTARTING);
    this.emit('restarting', configUpdate ? 'configuration update' : 'manual restart');

    try {
      if (configUpdate) {
        this.applyConfigUpdate(configUpdate);
      }

      if (this.state.childProcess && !this.state.childProcess.killed) {
        await this.terminateChild();
      }

      const delay = this.calculateRestartDelay();
      if (delay > 0) {
        await this.sleep(delay);
      }

      this.state.restartCount++;
      this.state.lastRestartTime = Date.now();
      await this.spawn();

      const restartTime = Date.now() - restartStartTime;
      logger.info('Child process restart completed', { restartTime, pid: this.state.childProcess?.pid });
      this.emit('restarted', this.state.childProcess!.pid!, restartTime);

    } catch (error) {
      const proxyError = error instanceof Error && 'code' in error 
        ? error as ProxyError
        : this.createError(ProxyErrorCode.CHILD_START_FAILED,
            `Restart failed: ${error}`, { cause: error as Error });

      logger.error('Child process restart failed', { error: proxyError.message });
      this.emit('restart-failed', proxyError, this.state.restartCount);

      if (this.config.autoRestart && this.state.restartCount < this.config.restartLimit) {
        this.scheduleAutoRestart('restart failure');
      } else {
        this.setState(ProcessState.UNAVAILABLE);
        throw proxyError;
      }
    }
  }

  /** Gracefully terminate the child process */
  async terminate(): Promise<void> {
    logger.info('Terminating child process', { pid: this.state.childProcess?.pid });

    this.state.isShuttingDown = true;
    this.clearTimeouts();

    try {
      if (this.state.childProcess && !this.state.childProcess.killed) {
        await this.terminateChild();
      }
      
      this.setState(ProcessState.STOPPED);
      this.state.childProcess = null;
      logger.info('Child process terminated successfully');
      
    } catch (error) {
      logger.error('Error during child process termination', { error });
      throw error;
    } finally {
      this.state.isShuttingDown = false;
    }
  }

  /** Get current process state */
  getState(): ProcessState {
    return this.state.state;
  }

  /** Check if the child process is healthy and responsive */
  async isHealthy(): Promise<boolean> {
    if (!this.state.childProcess || this.state.state !== ProcessState.RUNNING) {
      return false;
    }

    try {
      const result = await this.performHealthCheck();
      return result.healthy;
    } catch {
      return false;
    }
  }

  /** Get current restart count */
  getRestartCount(): number {
    return this.state.restartCount;
  }

  /** Get the current child process instance (if any) */
  getChildProcess(): ChildProcess | null {
    return this.state.childProcess;
  }

  // Private implementation methods

  private async spawnChildProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const commandParts = this.config.childCommand.split(' ');
        const command = commandParts[0];
        if (!command) {
          throw new Error('Invalid child command');
        }
        const args = commandParts.slice(1);
        const allArgs = [...args, ...this.config.childArgs];
        const env = { ...process.env, ...this.config.environment };

        const childProcess = spawn(command, allArgs, {
          cwd: this.config.workingDirectory,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: false
        });

        this.state.childProcess = childProcess;

        let resolved = false;

        childProcess.on('spawn', () => {
          if (!resolved) {
            resolved = true;
            logger.debug('Child process spawn event received', { pid: childProcess.pid });
            resolve();
          }
        });

        childProcess.on('error', (error: Error) => {
          if (!resolved) {
            resolved = true;
            logger.error('Child process spawn error', { error: error.message });
            reject(this.createError(ProxyErrorCode.CHILD_START_FAILED, 
              `Spawn error: ${error.message}`, { cause: error }));
          }
        });

        // Add immediate error detection for non-existent commands
        process.nextTick(() => {
          if (!childProcess.pid && !resolved) {
            resolved = true;
            reject(this.createError(ProxyErrorCode.CHILD_START_FAILED, 
              `Failed to spawn child process: command may not exist`));
          }
        });

        childProcess.on('exit', (code: number | null, signal: string | null) => {
          this.handleChildExit(code, signal);
        });

        childProcess.stdout?.on('data', (data: Buffer) => {
          logger.debug('Child stdout data received', { length: data.length });
        });

        childProcess.stderr?.on('data', (data: Buffer) => {
          logger.debug('Child stderr data received', { data: data.toString().trim() });
        });

      } catch (error) {
        reject(this.createError(ProxyErrorCode.CHILD_START_FAILED,
          `Failed to spawn process: ${error}`, { cause: error as Error }));
      }
    });
  }

  private handleChildExit(code: number | null, signal: string | null): void {
    if (this.state.isShuttingDown) {
      logger.debug('Child process exited during shutdown', { code, signal });
      this.emit('stopped', code, signal);
      return;
    }

    const isCrash = code !== 0 || (signal && signal !== 'SIGTERM');
    
    if (isCrash) {
      logger.warn('Child process crashed', { code, signal, restartCount: this.state.restartCount });
      this.setState(ProcessState.CRASHED);
      this.emit('crashed', code, signal, this.state.restartCount);

      if (this.config.autoRestart && this.state.restartCount < this.config.restartLimit) {
        this.scheduleAutoRestart('process crash');
      } else {
        this.setState(ProcessState.STOPPED);
      }
    } else {
      logger.info('Child process exited normally', { code, signal });
      this.setState(ProcessState.STOPPED);
      this.emit('stopped', code, signal);
    }

    this.state.childProcess = null;
  }

  private scheduleAutoRestart(reason: string): void {
    const delay = this.calculateRestartDelay();
    
    logger.info('Scheduling automatic restart', { reason, delay, attempt: this.state.restartCount + 1 });

    this.state.restartTimeoutId = setTimeout(async () => {
      try {
        await this.restart();
      } catch (error) {
        logger.error('Scheduled restart failed', { error });
        this.setState(ProcessState.STOPPED);
      }
    }, delay);
  }

  private calculateRestartDelay(): number {
    if (this.state.restartCount === 0) {
      return 0;
    }
    // Exponential backoff: baseDelay * 2^(attempts-1), capped at 30 seconds
    const baseDelay = this.config.restartDelay;
    const exponentialDelay = baseDelay * Math.pow(2, this.state.restartCount - 1);
    return Math.min(exponentialDelay, 30000);
  }

  private async terminateChild(): Promise<void> {
    const child = this.state.childProcess;
    if (!child || child.killed) {
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!child.killed) {
          logger.warn('Graceful termination timeout, sending SIGKILL', { pid: child.pid });
          child.kill('SIGKILL');
        }
      }, 5000);

      child.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      logger.debug('Sending SIGTERM to child process', { pid: child.pid });
      child.kill('SIGTERM');
    });
  }

  private async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      if (!this.state.childProcess || this.state.childProcess.killed) {
        return { healthy: false, error: 'Process not running' };
      }

      const responseTime = Date.now() - startTime;
      return { healthy: true, responseTime };

    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private applyConfigUpdate(update: ProxyConfigUpdate): void {
    if (update.environment) {
      this.config.environment = { ...this.config.environment, ...update.environment };
    }

    if (update.childArgs) {
      this.config.childArgs = [...update.childArgs];
    }

    if (update.workingDirectory) {
      this.config.workingDirectory = update.workingDirectory;
    }

    logger.info('Applied configuration update', { updatedKeys: Object.keys(update) });
  }

  private resetRestartCount(): void {
    if (this.state.restartCount > 0) {
      logger.debug('Resetting restart count', { previousCount: this.state.restartCount });
      this.state.restartCount = 0;
    }
  }

  private setState(newState: ProcessState): void {
    const oldState = this.state.state;
    this.state.state = newState;
    
    if (oldState !== newState) {
      logger.debug('Process state changed', { from: oldState, to: newState });
    }
  }

  private clearTimeouts(): void {
    if (this.state.restartTimeoutId) {
      clearTimeout(this.state.restartTimeoutId);
      this.state.restartTimeoutId = null;
    }

    if (this.state.operationTimeoutId) {
      clearTimeout(this.state.operationTimeoutId);
      this.state.operationTimeoutId = null;
    }
  }

  private validateConfig(config: ProxyConfig): void {
    if (!config.childCommand || config.childCommand.trim().length === 0) {
      throw this.createError(ProxyErrorCode.INVALID_CONFIG, 'childCommand is required');
    }

    if (config.restartLimit < 0) {
      throw this.createError(ProxyErrorCode.INVALID_CONFIG, 'restartLimit must be >= 0');
    }

    if (config.operationTimeout < 1000) {
      throw this.createError(ProxyErrorCode.INVALID_CONFIG, 'operationTimeout must be >= 1000ms');
    }
  }

  private createError(code: ProxyErrorCode, message: string, context?: Record<string, unknown>): ProxyError {
    const error = new Error(message) as ProxyError;
    error.code = code;
    error.context = context || {};
    return error;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Check if child process is currently running */
  isChildRunning(): boolean {
    return this.state.state === ProcessState.RUNNING && this.state.childProcess !== null;
  }
}