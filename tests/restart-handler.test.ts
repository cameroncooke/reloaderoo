/**
 * Tests for RestartHandler - concurrent restart prevention and race condition fixes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RestartHandler } from '../src/restart-handler';
import { ProcessManager } from '../src/process-manager';
import { ProcessState, ProxyConfig } from '../src/types';

// Mock ProcessManager
vi.mock('../src/process-manager');

// Mock logger
vi.mock('../src/mcp-logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn()
  }
}));

describe('RestartHandler', () => {
  let restartHandler: RestartHandler;
  let mockProcessManager: any;
  let mockSendNotification: any;
  let mockGetServerInfo: any;

  const mockConfig: ProxyConfig = {
    childCommand: 'node test-server.js',
    childArgs: ['--test'],
    workingDirectory: '/tmp',
    environment: { NODE_ENV: 'test' },
    restartLimit: 3,
    operationTimeout: 5000,
    logLevel: 'info',
    autoRestart: true,
    restartDelay: 100
  };

  beforeEach(() => {
    // Create mock ProcessManager
    mockProcessManager = {
      restart: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockReturnValue(ProcessState.RUNNING),
      isHealthy: vi.fn().mockResolvedValue(true),
      getRestartCount: vi.fn().mockReturnValue(0),
      on: vi.fn(),
      emit: vi.fn()
    };

    // Mock notification sender
    mockSendNotification = vi.fn().mockResolvedValue(undefined);

    // Mock server info getter
    mockGetServerInfo = vi.fn().mockReturnValue({
      name: 'test-server',
      version: '1.0.0',
      capabilities: {
        tools: true,
        resources: true,
        prompts: true
      }
    });

    // Mock ProcessManager constructor
    const MockProcessManager = ProcessManager as any;
    MockProcessManager.mockImplementation(() => mockProcessManager);

    // Create RestartHandler with short rate limit for testing
    restartHandler = new RestartHandler(
      mockProcessManager,
      mockSendNotification,
      mockGetServerInfo,
      {
        minInterval: 100, // 100ms for faster testing
        maxConcurrent: 1,
        maxPerHour: 12
      }
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('race condition prevention', () => {
    it('should prevent concurrent restart requests', async () => {
      const request1 = {
        jsonrpc: '2.0' as const,
        id: 'req1',
        method: 'tools/call',
        params: {
          name: 'restart_server',
          arguments: { force: true }
        }
      };

      const request2 = {
        jsonrpc: '2.0' as const,
        id: 'req2',
        method: 'tools/call',
        params: {
          name: 'restart_server',
          arguments: { force: true }
        }
      };

      // Start both requests simultaneously
      const [result1, result2] = await Promise.all([
        restartHandler.handleRestartTool(request1),
        restartHandler.handleRestartTool(request2)
      ]);

      // One should succeed, one should be rejected
      const results = [result1, result2];
      const successResults = results.filter(r => (r.result as any)?.isError !== true);
      const errorResults = results.filter(r => (r.result as any)?.isError === true);

      expect(successResults).toHaveLength(1);
      expect(errorResults).toHaveLength(1);
      
      // Check error message mentions restart in progress
      const errorResult = errorResults[0];
      expect((errorResult.result as any).content[0].text).toContain('restart operation is already in progress');
    });

    it('should properly reset restart flag after completion', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'req1',
        method: 'tools/call',
        params: {
          name: 'restart_server',
          arguments: { force: true }
        }
      };

      // First restart should succeed
      const result1 = await restartHandler.handleRestartTool(request);
      expect((result1.result as any)?.isError).not.toBe(true);
      expect(restartHandler.isRestartInProgress()).toBe(false);

      // Wait for rate limit interval
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second restart should also succeed (flag properly reset)
      const result2 = await restartHandler.handleRestartTool(request);
      expect((result2.result as any)?.isError).not.toBe(true);
      expect(restartHandler.isRestartInProgress()).toBe(false);
    });

    it('should reset restart flag on validation error', async () => {
      const invalidRequest = {
        jsonrpc: '2.0' as const,
        id: 'req1',
        method: 'tools/call',
        params: {
          name: 'restart_server',
          arguments: { force: 'invalid' } // Invalid boolean value
        }
      };

      const result = await restartHandler.handleRestartTool(invalidRequest);
      
      // Should get validation error
      expect((result.result as any)?.isError).toBe(true);
      
      // Flag should be reset after validation failure
      expect(restartHandler.isRestartInProgress()).toBe(false);
    });

    it('should reset restart flag on execution error', async () => {
      // Make ProcessManager.restart throw an error
      mockProcessManager.restart.mockRejectedValueOnce(new Error('Process restart failed'));

      const request = {
        jsonrpc: '2.0' as const,
        id: 'req1',
        method: 'tools/call',
        params: {
          name: 'restart_server',
          arguments: { force: true }
        }
      };

      const result = await restartHandler.handleRestartTool(request);
      
      // Should get error result
      expect((result.result as any)?.isError).toBe(true);
      expect((result.result as any).content[0].text).toContain('Process restart failed');
      
      // Flag should be reset after execution failure
      expect(restartHandler.isRestartInProgress()).toBe(false);
    });
  });

  describe('rapid concurrent requests', () => {
    it('should handle rapid fire concurrent requests correctly', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        jsonrpc: '2.0' as const,
        id: `req${i}`,
        method: 'tools/call',
        params: {
          name: 'restart_server',
          arguments: { force: true }
        }
      }));

      // Fire all requests simultaneously
      const results = await Promise.all(
        requests.map(req => restartHandler.handleRestartTool(req))
      );

      // Only one should succeed
      const successCount = results.filter(r => (r.result as any)?.isError !== true).length;
      const errorCount = results.filter(r => (r.result as any)?.isError === true).length;

      expect(successCount).toBe(1);
      expect(errorCount).toBe(4);
      
      // Restart flag should be properly reset
      expect(restartHandler.isRestartInProgress()).toBe(false);
    });

    it('should handle requests with mixed valid and invalid parameters', async () => {
      const validRequest = {
        jsonrpc: '2.0' as const,
        id: 'valid',
        method: 'tools/call',
        params: {
          name: 'restart_server',
          arguments: { force: true }
        }
      };

      const invalidRequest = {
        jsonrpc: '2.0' as const,
        id: 'invalid',
        method: 'tools/call',
        params: {
          name: 'restart_server',
          arguments: { force: 'not-boolean' }
        }
      };

      // Fire both simultaneously
      const [validResult, invalidResult] = await Promise.all([
        restartHandler.handleRestartTool(validRequest),
        restartHandler.handleRestartTool(invalidRequest)
      ]);

      // Valid request should win or invalid should fail with validation error
      if ((validResult.result as any)?.isError !== true) {
        // Valid request succeeded
        expect((invalidResult.result as any)?.isError).toBe(true);
        expect((invalidResult.result as any).content[0].text).toContain('restart operation is already in progress');
      } else {
        // Invalid request got through first and failed validation
        expect((validResult.result as any)?.isError).toBe(true);
        expect((invalidResult.result as any)?.isError).toBe(true);
        expect((invalidResult.result as any).content[0].text).toContain('Force parameter must be a boolean');
      }

      // Flag should be reset in all cases
      expect(restartHandler.isRestartInProgress()).toBe(false);
    });
  });

  describe('state consistency', () => {
    it('should maintain consistent state across restart operations', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: 'req1',
        method: 'tools/call',
        params: {
          name: 'restart_server',
          arguments: { force: true }
        }
      };

      // Initial state
      expect(restartHandler.isRestartInProgress()).toBe(false);

      // During restart (need to capture this in a more sophisticated way)
      const promise = restartHandler.handleRestartTool(request);
      
      // Wait for the request to be processed
      const result = await promise;
      
      // After restart
      expect((result.result as any)?.isError).not.toBe(true);
      expect(restartHandler.isRestartInProgress()).toBe(false);
    });

    it('should track concurrent requests correctly', async () => {
      const state = restartHandler.getState();
      expect(state.concurrentRequests.size).toBe(0);
      expect(state.isRestartInProgress).toBe(false);
    });
  });
});