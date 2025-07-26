/**
 * Test utility for managing Reloaderoo child processes
 * Provides a clean interface for E2E testing
 */

import { spawn, ChildProcess } from 'child_process';
import { setTimeout as setTimeoutPromise } from 'timers/promises';

export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: any;
  result?: any;
  error?: any;
}

export interface ReloaderooOptions {
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  cwd?: string;
}

export class ReloaderooProcess {
  private process: ChildProcess | null = null;
  private readonly options: ReloaderooOptions;
  private readonly receivedMessages: MCPMessage[] = [];
  private readonly receivedStderr: string[] = [];
  private accumulatedStdout: string = ''; // Accumulate all stdout for CLI commands
  private messagePromises: Map<string, { resolve: (msg: MCPMessage) => void; reject: (error: Error) => void; filter: (msg: MCPMessage) => boolean }> = new Map();
  private exitPromise: Promise<number> | null = null;
  private processError: Error | null = null;

  constructor(options: ReloaderooOptions = {}) {
    this.options = {
      timeout: 30000, // 30 second default timeout
      cwd: process.cwd(),
      env: { ...process.env },
      args: [],
      ...options
    };
  }

  /**
   * Start the Reloaderoo process
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Process already started');
    }

    const args = ['dist/bin/reloaderoo.js', ...this.options.args!];
    
    this.process = spawn('node', args, {
      cwd: this.options.cwd,
      env: { ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Set up message parsing from stdout
    let buffer = '';
    this.process.stdout?.on('data', (data) => {
      const dataStr = data.toString();
      this.accumulatedStdout += dataStr; // Always accumulate all stdout
      buffer += dataStr;
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message: MCPMessage = JSON.parse(line.trim());
            this.receivedMessages.push(message);
            this.resolveMessagePromise(message);
          } catch (error) {
            // Non-JSON output (like help text or errors)
            // Store as text message for CLI commands
            this.receivedMessages.push({
              jsonrpc: '2.0',
              method: '_text',
              params: { text: line.trim() }
            });
          }
        }
      }
    });

    // Capture stderr
    this.process.stderr?.on('data', (data) => {
      this.receivedStderr.push(data.toString());
    });

    // Handle process exit
    this.exitPromise = new Promise((resolve) => {
      this.process!.on('exit', (code) => {
        resolve(code || 0);
      });
    });

    // Handle process errors
    this.process.on('error', (error) => {
      this.processError = new Error(`Failed to start Reloaderoo process: ${error.message}`);
      // Reject all pending message promises
      for (const [id, pending] of this.messagePromises) {
        pending.reject(this.processError);
        this.messagePromises.delete(id);
      }
    });

    // Wait for process to be ready
    await this.waitForProcessReady();
  }

  /**
   * Send an MCP message to the process
   */
  async sendMessage(message: MCPMessage): Promise<void> {
    if (this.processError) {
      throw this.processError;
    }
    
    if (!this.process?.stdin) {
      throw new Error('Process not started or stdin not available');
    }

    const messageString = JSON.stringify(message) + '\n';
    this.process.stdin.write(messageString);
  }

  /**
   * Wait for a specific message matching the filter
   */
  async waitForMessage(filter: (msg: MCPMessage) => boolean, timeout?: number): Promise<MCPMessage> {
    if (this.processError) {
      throw this.processError;
    }
    
    const timeoutMs = timeout || this.options.timeout!;
    
    // Check if message already received
    const existing = this.receivedMessages.find(filter);
    if (existing) {
      return existing;
    }

    // Wait for new message
    const promiseId = Math.random().toString(36);
    
    return new Promise((resolve, reject) => {
      const timer = global.setTimeout(() => {
        this.messagePromises.delete(promiseId);
        reject(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
      }, timeoutMs);

      this.messagePromises.set(promiseId, {
        resolve: (msg: MCPMessage) => {
          global.clearTimeout(timer);
          if (filter(msg)) {
            resolve(msg);
          }
        },
        reject,
        filter
      });
    });
  }

  /**
   * Wait for a message with specific ID
   */
  async waitForResponse(id: string | number, timeout?: number): Promise<MCPMessage> {
    return this.waitForMessage(msg => msg.id === id, timeout);
  }

  /**
   * Wait for text output (for CLI commands)
   * This method waits for the process to accumulate output containing the target text,
   * then returns the complete accumulated stdout.
   */
  async waitForTextOutput(contains: string, timeout?: number): Promise<string> {
    const timeoutMs = timeout || this.options.timeout!;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkOutput = () => {
        // Check if the accumulated output contains the target text
        if (this.accumulatedStdout.includes(contains)) {
          resolve(this.accumulatedStdout);
          return;
        }

        // Check for timeout
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Timeout waiting for text output containing "${contains}" after ${timeoutMs}ms. Current output: "${this.accumulatedStdout}"`));
          return;
        }

        // Continue checking  
        global.setTimeout(checkOutput, 50); // Check every 50ms
      };

      checkOutput();
    });
  }

  /**
   * Get all received messages
   */
  getReceivedMessages(): MCPMessage[] {
    return [...this.receivedMessages];
  }

  /**
   * Get stderr output
   */
  getStderrOutput(): string[] {
    return [...this.receivedStderr];
  }

  /**
   * Get accumulated stdout output (for CLI commands)
   */
  getAccumulatedStdout(): string {
    return this.accumulatedStdout;
  }

  /**
   * Wait for process to be ready with timeout
   */
  private async waitForProcessReady(): Promise<void> {
    const startTime = Date.now();
    const timeout = 5000;
    
    while (Date.now() - startTime < timeout) {
      if (this.processError) {
        throw this.processError;
      }
      if (this.process && !this.process.killed) {
        return;
      }
      await setTimeoutPromise(50);
    }
    
    throw new Error('Process failed to start within timeout');
  }

  /**
   * Clear received messages (for test isolation)
   */
  clearMessages(): void {
    this.receivedMessages.length = 0;
    this.receivedStderr.length = 0;
    this.accumulatedStdout = '';
  }

  /**
   * Wait for process to exit
   */
  async waitForExit(timeout?: number): Promise<number> {
    if (!this.exitPromise) {
      throw new Error('Process not started');
    }

    const timeoutMs = timeout || this.options.timeout!;
    
    return Promise.race([
      this.exitPromise,
      setTimeoutPromise(timeoutMs).then(() => {
        throw new Error(`Process did not exit within ${timeoutMs}ms`);
      })
    ]);
  }

  /**
   * Kill the process
   */
  async kill(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    if (!this.process) {
      return;
    }

    this.process.kill(signal);
    
    try {
      await this.waitForExit(5000);
    } catch (error) {
      // Force kill if graceful shutdown fails
      this.process.kill('SIGKILL');
    }

    this.process = null;
    this.exitPromise = null;
  }

  /**
   * Check if process is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  private resolveMessagePromise(message: MCPMessage): void {
    const entries = Array.from(this.messagePromises.entries());
    for (const [id, promise] of entries) {
      if (promise.filter(message)) {
        promise.resolve(message);
        this.messagePromises.delete(id);
      }
    }
  }
}