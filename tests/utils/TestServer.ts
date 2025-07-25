/**
 * Test Server wrapper for E2E testing
 * Manages the test-server-sdk.js process and tracks its state
 */

import { spawn, ChildProcess } from 'child_process';
import { setTimeout } from 'timers/promises';

export interface TestServerOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export class TestServer {
  private process: ChildProcess | null = null;
  private readonly options: TestServerOptions;
  private readonly receivedRequests: any[] = [];
  private readonly logMessages: string[] = [];
  private exitPromise: Promise<number> | null = null;

  constructor(options: TestServerOptions = {}) {
    this.options = {
      timeout: 10000, // 10 second default timeout
      cwd: process.cwd(),
      env: { ...process.env },
      ...options
    };
  }

  /**
   * Start the test server
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Test server already started');
    }

    this.process = spawn('node', ['test-server-sdk.js'], {
      cwd: this.options.cwd,
      env: { ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Monitor stdout for server messages and logs
    this.process.stdout?.on('data', (data) => {
      const output = data.toString();
      this.logMessages.push(output);
      
      // Try to parse JSON messages (MCP requests)
      const lines = output.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          this.receivedRequests.push(parsed);
        } catch (error) {
          // Not JSON, just log output
        }
      }
    });

    // Monitor stderr for error messages
    this.process.stderr?.on('data', (data) => {
      this.logMessages.push(`[STDERR] ${data.toString()}`);
    });

    // Handle process exit
    this.exitPromise = new Promise((resolve) => {
      this.process!.on('exit', (code) => {
        resolve(code || 0);
      });
    });

    // Handle process errors
    this.process.on('error', (error) => {
      throw new Error(`Failed to start test server: ${error.message}`);
    });

    // Wait for server to be ready
    await this.waitForReady();
  }

  /**
   * Wait for the test server to be ready
   */
  private async waitForReady(): Promise<void> {
    const startTime = Date.now();
    const timeout = this.options.timeout!;

    while (Date.now() - startTime < timeout) {
      if (this.logMessages.some(msg => msg.includes('Test MCP server started successfully'))) {
        return;
      }
      await setTimeout(100);
    }

    throw new Error(`Test server did not become ready within ${timeout}ms`);
  }

  /**
   * Send a message to the test server's stdin
   */
  async sendMessage(message: any): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error('Test server not started or stdin not available');
    }

    const messageString = JSON.stringify(message) + '\n';
    this.process.stdin.write(messageString);
  }

  /**
   * Get all requests received by the test server
   */
  getReceivedRequests(): any[] {
    return [...this.receivedRequests];
  }

  /**
   * Get the last received request
   */
  getLastRequest(): any {
    return this.receivedRequests[this.receivedRequests.length - 1] || null;
  }

  /**
   * Get requests of a specific method
   */
  getRequestsByMethod(method: string): any[] {
    return this.receivedRequests.filter(req => req.method === method);
  }

  /**
   * Check if a specific request was received
   */
  hasReceivedRequest(filter: (req: any) => boolean): boolean {
    return this.receivedRequests.some(filter);
  }

  /**
   * Get all log messages from the server
   */
  getLogMessages(): string[] {
    return [...this.logMessages];
  }

  /**
   * Clear received requests and logs (for test isolation)
   */
  clearHistory(): void {
    this.receivedRequests.length = 0;
    this.logMessages.length = 0;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Get server process ID (for debugging)
   */
  getPid(): number | undefined {
    return this.process?.pid;
  }

  /**
   * Wait for server to exit
   */
  async waitForExit(timeout?: number): Promise<number> {
    if (!this.exitPromise) {
      throw new Error('Test server not started');
    }

    const timeoutMs = timeout || this.options.timeout!;
    
    return Promise.race([
      this.exitPromise,
      setTimeout(timeoutMs).then(() => {
        throw new Error(`Test server did not exit within ${timeoutMs}ms`);
      })
    ]);
  }

  /**
   * Stop the test server
   */
  async stop(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
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
   * Get server information (useful for debugging)
   */
  getServerInfo(): {
    isRunning: boolean;
    pid?: number;
    requestCount: number;
    logMessageCount: number;
  } {
    return {
      isRunning: this.isRunning(),
      pid: this.getPid(),
      requestCount: this.receivedRequests.length,
      logMessageCount: this.logMessages.length
    };
  }
}