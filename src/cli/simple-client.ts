/**
 * Simplified MCP Client for CLI mode
 * 
 * A basic implementation that spawns child processes and communicates via JSON-RPC
 * This avoids the complexity of the full MCP SDK for now
 */

import { spawn, ChildProcess } from 'child_process';
import { logger } from '../mcp-logger.js';
import { MCP_PROTOCOL, ERROR_MESSAGES } from '../constants.js';

export interface SimpleClientConfig {
  command: string;
  args: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  timeout?: number;
}

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Simple MCP client that communicates via JSON-RPC over stdio
 */
export class SimpleClient {
  private config: SimpleClientConfig;
  private childProcess?: ChildProcess;
  private connected = false;
  private requestId = 1;
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor(config: SimpleClientConfig) {
    this.config = {
      timeout: 30000,
      workingDirectory: process.cwd(),
      environment: process.env as Record<string, string>,
      ...config
    };
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected to MCP server');
    }

    logger.debug('Spawning child MCP server', {
      command: this.config.command,
      args: this.config.args,
      cwd: this.config.workingDirectory
    });

    // Spawn the child process
    this.childProcess = spawn(this.config.command, this.config.args, {
      cwd: this.config.workingDirectory,
      env: this.config.environment,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Handle child process errors
    this.childProcess.on('error', (error) => {
      logger.error('Child process error', { error: error.message });
      this.connected = false;
    });

    this.childProcess.on('exit', (code, signal) => {
      logger.debug('Child process exited', { code, signal });
      this.connected = false;
      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Child process exited'));
      }
      this.pendingRequests.clear();
    });

    // Capture stderr for debugging
    this.childProcess.stderr?.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        logger.debug('Child stderr', { message });
      }
    });

    // Handle stdout for JSON-RPC responses
    let buffer = '';
    this.childProcess.stdout?.on('data', (data) => {
      buffer += data.toString();
      buffer = this.processBuffer(buffer);
    });

    this.connected = true;

    // Initialize the MCP connection
    await this.sendRequest(MCP_PROTOCOL.METHODS.INITIALIZE, {
      protocolVersion: MCP_PROTOCOL.VERSION,
      capabilities: {},
      clientInfo: {
        name: 'reloaderoo-cli',
        version: '1.0.0'
      }
    });

    logger.debug('Connected to MCP server');
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    // Clear pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Disconnecting'));
    }
    this.pendingRequests.clear();

    // Clean up event listeners to prevent memory leaks
    if (this.childProcess) {
      this.childProcess.removeAllListeners('error');
      this.childProcess.removeAllListeners('exit');
      
      // Clean up stdio stream listeners
      this.childProcess.stderr?.removeAllListeners('data');
      this.childProcess.stdout?.removeAllListeners('data');
    }

    // Terminate child process if still running
    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill('SIGTERM');
      
      // Give it time to shut down gracefully
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!this.childProcess.killed) {
        this.childProcess.kill('SIGKILL');
      }
    }

    this.connected = false;
    logger.debug('Disconnected from MCP server');
  }

  /**
   * Send a JSON-RPC request to the server
   */
  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.connected || !this.childProcess?.stdin) {
      throw new Error('Not connected to MCP server');
    }

    const id = this.requestId++;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.config.timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const message = JSON.stringify(request) + '\n';
      this.childProcess?.stdin?.write(message);
    });
  }

  /**
   * Process incoming data buffer for JSON-RPC responses
   * Returns the unprocessed portion of the buffer
   */
  private processBuffer(buffer: string): string {
    const lines = buffer.split('\n');
    
    // Process all complete lines (all but the last, which might be incomplete)
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      try {
        const response: JSONRPCResponse = JSON.parse(line);
        this.handleResponse(response);
      } catch (error) {
        logger.debug('Failed to parse JSON-RPC response', { line, error });
      }
    }
    
    // Return the last line (unprocessed remainder)
    return lines[lines.length - 1] || '';
  }

  /**
   * Handle a JSON-RPC response
   */
  private handleResponse(response: JSONRPCResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      logger.debug('Received response for unknown request', { id: response.id });
      return;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeout);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<any[]> {
    try {
      const result = await this.sendRequest(MCP_PROTOCOL.METHODS.TOOLS_LIST);
      return result.tools || [];
    } catch (error) {
      // If method not found, return empty array
      if (error instanceof Error && error.message === ERROR_MESSAGES.METHOD_NOT_FOUND) {
        logger.debug('Server does not support tools/list method');
        return [];
      }
      throw error;
    }
  }

  /**
   * Call a tool with parameters
   */
  async callTool(name: string, args?: unknown): Promise<any> {
    return await this.sendRequest(MCP_PROTOCOL.METHODS.TOOLS_CALL, {
      name,
      arguments: args || {}
    });
  }

  /**
   * List available resources
   */
  async listResources(): Promise<any[]> {
    try {
      const result = await this.sendRequest(MCP_PROTOCOL.METHODS.RESOURCES_LIST);
      return result.resources || [];
    } catch (error) {
      // If method not found, return empty array
      if (error instanceof Error && error.message === ERROR_MESSAGES.METHOD_NOT_FOUND) {
        logger.debug('Server does not support resources/list method');
        return [];
      }
      throw error;
    }
  }

  /**
   * Read a specific resource
   */
  async readResource(uri: string): Promise<any> {
    return await this.sendRequest(MCP_PROTOCOL.METHODS.RESOURCES_READ, { uri });
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<any[]> {
    try {
      const result = await this.sendRequest(MCP_PROTOCOL.METHODS.PROMPTS_LIST);
      return result.prompts || [];
    } catch (error) {
      // If method not found, return empty array
      if (error instanceof Error && error.message === ERROR_MESSAGES.METHOD_NOT_FOUND) {
        logger.debug('Server does not support prompts/list method');
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a specific prompt with arguments
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<any> {
    return await this.sendRequest(MCP_PROTOCOL.METHODS.PROMPTS_GET, {
      name,
      arguments: args || {}
    });
  }

  /**
   * Get server information
   */
  async getServerInfo(): Promise<any> {
    // Return basic info since we already have it from initialization
    return {
      protocolVersion: MCP_PROTOCOL.VERSION,
      capabilities: {},
      serverInfo: {
        name: 'child-server',
        version: 'unknown'
      }
    };
  }

  /**
   * Simple ping to check connectivity
   */
  async ping(): Promise<boolean> {
    try {
      // Try to list tools as a simple operation
      await this.listTools();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute a single operation and disconnect
   * Convenience method for CLI usage
   */
  static async executeOperation<T>(
    config: SimpleClientConfig,
    operation: (client: SimpleClient) => Promise<T>
  ): Promise<T> {
    const client = new SimpleClient(config);
    
    try {
      await client.connect();
      const result = await operation(client);
      return result;
    } finally {
      await client.disconnect();
    }
  }
}