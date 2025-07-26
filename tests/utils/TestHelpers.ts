/**
 * Common test helpers and assertions for Reloaderoo testing
 */

import { expect } from 'vitest';
import { MCPMessage } from './ReloaderooProcess.js';
import { MCPResponse } from './TestMCPClient.js';

/**
 * Test assertion helpers
 */
export class TestHelpers {
  /**
   * Assert that a CLI command output contains expected text
   */
  static assertCliOutputContains(output: string, expectedText: string): void {
    expect(output).toContain(expectedText);
  }

  /**
   * Assert that a CLI command output contains all expected texts
   */
  static assertCliOutputContainsAll(output: string, expectedTexts: string[]): void {
    for (const text of expectedTexts) {
      expect(output).toContain(text);
    }
  }

  /**
   * Assert that an MCP response is successful
   */
  static assertMCPSuccess(response: MCPMessage): asserts response is MCPResponse {
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id');
    expect(response).toHaveProperty('result');
    expect(response).not.toHaveProperty('error');
  }

  /**
   * Assert that an MCP response is an error
   */
  static assertMCPError(response: MCPMessage, expectedErrorMessage?: string): void {
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id');
    expect(response).toHaveProperty('error');
    expect(response).not.toHaveProperty('result');
    
    if (expectedErrorMessage) {
      expect(response).toHaveProperty('error');
      const errorResponse = response as MCPMessage & { error: { message: string } };
      expect(errorResponse.error.message).toContain(expectedErrorMessage);
    }
  }

  /**
   * Assert that a tools/list response has the expected structure
   */
  static assertToolsListResponse(response: MCPResponse): void {
    this.assertMCPSuccess(response);
    expect(response.result).toHaveProperty('tools');
    expect(Array.isArray(response.result.tools)).toBe(true);
    
    // Validate each tool has required properties
    for (const tool of response.result.tools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.inputSchema).toBe('object');
    }
  }

  /**
   * Assert that a tools/call response has the expected structure
   */
  static assertToolCallResponse(response: MCPResponse): void {
    this.assertMCPSuccess(response);
    expect(response.result).toHaveProperty('content');
    expect(Array.isArray(response.result.content)).toBe(true);
  }

  /**
   * Assert that restart_server tool exists in tools list
   */
  static assertHasRestartServerTool(response: MCPResponse): void {
    this.assertToolsListResponse(response);
    const toolNames = response.result.tools.map((tool: { name: string }) => tool.name);
    expect(toolNames).toContain('restart_server');
  }

  /**
   * Assert that specific tools exist in tools list
   */
  static assertHasTools(response: MCPResponse, expectedTools: string[]): void {
    this.assertToolsListResponse(response);
    const toolNames = response.result.tools.map((tool: { name: string }) => tool.name);
    
    for (const toolName of expectedTools) {
      expect(toolNames).toContain(toolName);
    }
  }

  /**
   * Assert that server info response has expected structure
   */
  static assertServerInfoResponse(response: MCPResponse): void {
    this.assertMCPSuccess(response);
    expect(response.result).toHaveProperty('protocolVersion');
    expect(response.result).toHaveProperty('capabilities');
    expect(response.result).toHaveProperty('serverInfo');
    expect(typeof response.result.protocolVersion).toBe('string');
    expect(typeof response.result.capabilities).toBe('object');
    expect(typeof response.result.serverInfo).toBe('object');
    expect(typeof response.result.serverInfo.name).toBe('string');
  }

  /**
   * Assert that two tool lists represent a successful restart (different tools)
   */
  static assertToolsChangedAfterRestart(beforeTools: string[], afterTools: string[]): void {
    // Both should have restart_server
    expect(beforeTools).toContain('restart_server');
    expect(afterTools).toContain('restart_server');
    
    // Filter out restart_server and compare
    const beforeFiltered = beforeTools.filter(name => name !== 'restart_server');
    const afterFiltered = afterTools.filter(name => name !== 'restart_server');
    
    // Should have different random tools (indicating restart occurred)
    expect(JSON.stringify(beforeFiltered.sort())).not.toBe(JSON.stringify(afterFiltered.sort()));
  }

  /**
   * Create a test timeout promise
   */
  static createTimeout(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Wait for a condition to be true
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeoutMs: number = 5000,
    intervalMs: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    
    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }


  /**
   * Wait for a specific log message to appear in process output
   */
  static async waitForLogMessage(
    process: { getStderrOutput(): string[] },
    message: string,
    timeoutMs: number = 10000
  ): Promise<void> {
    return this.waitFor(
      () => {
        const stderr = process.getStderrOutput();
        return Array.isArray(stderr) && stderr.some((log: string) => log.includes(message));
      },
      timeoutMs,
      100
    );
  }

  /**
   * Wait for process to be in running state
   */
  static async waitForProcessRunning(
    process: { isRunning(): boolean },
    timeoutMs: number = 10000
  ): Promise<void> {
    return this.waitFor(
      () => process.isRunning(),
      timeoutMs,
      100
    );
  }

  /**
   * Wait for successful startup indication
   */
  static async waitForStartupSuccess(
    process: { getStderrOutput(): string[] },
    timeoutMs: number = 15000
  ): Promise<void> {
    return this.waitFor(
      () => {
        const stderr = process.getStderrOutput();
        return Array.isArray(stderr) && stderr.some((log: string) => 
          log.includes('Reloaderoo started successfully') ||
          log.includes('started successfully') ||
          log.includes('Server started')
        );
      },
      timeoutMs,
      200
    );
  }

  /**
   * Wait for successful restart completion
   */
  static async waitForRestartSuccess(
    process: { getStderrOutput(): string[] },
    timeoutMs: number = 15000
  ): Promise<void> {
    return this.waitFor(
      () => {
        const stderr = process.getStderrOutput();
        return Array.isArray(stderr) && stderr.some((log: string) => 
          log.includes('restarted successfully') ||
          log.includes('restart completed') ||
          log.includes('Child MCP server restarted') ||
          log.includes('Connected to child MCP server successfully')
        );
      },
      timeoutMs,
      200
    );
  }

  /**
   * Wait for child server to be fully ready for requests
   */
  static async waitForChildServerReady(
    process: { getStderrOutput(): string[] },
    timeoutMs: number = 15000
  ): Promise<void> {
    return this.waitFor(
      () => {
        const stderr = process.getStderrOutput();
        return Array.isArray(stderr) && stderr.some((log: string) => 
          log.includes('Connected to child MCP server successfully') ||
          log.includes('Mirrored child capabilities') ||
          log.includes('child capabilities')
        );
      },
      timeoutMs,
      200
    );
  }

  /**
   * Generate a unique test identifier
   */
  static generateTestId(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Standard E2E test setup for ReloaderooProcess
   */
  static async setupE2ETest(
    args: string[] = ['--', 'node', 'test-server-sdk.js'],
    timeout: number = 15000
  ): Promise<any> {
    const { ReloaderooProcess } = await import('./ReloaderooProcess.js');
    const process = new ReloaderooProcess({ args, timeout });
    
    await process.start();
    await this.waitForStartupSuccess(process);
    
    return process;
  }

  /**
   * Advanced E2E test runner that handles lifecycle automatically
   */
  static async runE2ETest<T>(
    testFn: (process: any) => Promise<T>,
    options: {
      args?: string[];
      timeout?: number;
      env?: Record<string, string>;
      expectSuccess?: boolean;
    } = {}
  ): Promise<T> {
    const {
      args = ['--', 'node', 'test-server-sdk.js'],
      timeout = 15000,
      env,
      expectSuccess = true
    } = options;

    const { ReloaderooProcess } = await import('./ReloaderooProcess.js');
    const process = new ReloaderooProcess({ args, timeout, env });
    
    try {
      await process.start();
      
      if (expectSuccess) {
        await this.waitForStartupSuccess(process);
      }
      
      return await testFn(process);
    } finally {
      await this.cleanupResources(() => process.kill());
    }
  }

  /**
   * Validate that error output contains helpful information
   */
  static assertHelpfulErrorMessage(errorOutput: string): void {
    expect(errorOutput.length).toBeGreaterThan(0);
    // Should contain some indication of what went wrong
    expect(
      errorOutput.toLowerCase().includes('error') ||
      errorOutput.toLowerCase().includes('failed') ||
      errorOutput.toLowerCase().includes('invalid') ||
      errorOutput.toLowerCase().includes('not found')
    ).toBe(true);
  }

  /**
   * Assert that a process exit code indicates success
   */
  static assertSuccessExitCode(exitCode: number): void {
    expect(exitCode).toBe(0);
  }

  /**
   * Assert that a process exit code indicates failure
   */
  static assertFailureExitCode(exitCode: number): void {
    expect(exitCode).not.toBe(0);
  }

  /**
   * Clean up multiple resources safely
   */
  static async cleanupResources(...cleanupFunctions: Array<() => Promise<void> | void>): Promise<void> {
    const errors: Error[] = [];
    
    for (const cleanup of cleanupFunctions) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Cleanup failed: ${errors.map(e => e.message).join(', ')}`);
    }
  }
}