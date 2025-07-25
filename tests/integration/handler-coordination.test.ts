/**
 * Configuration and type system integration tests
 * Tests how configuration flows through the system components
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCPProxy } from '../../src/mcp-proxy.js';
import { ProxyConfig } from '../../src/types.js';

// Mock only external dependencies - let MCP SDK work normally
vi.mock('../../src/mcp-logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn()
  }
}));

// Mock child_process to prevent actual process spawning
vi.mock('child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    stdout: { on: vi.fn(), pipe: vi.fn() },
    stderr: { on: vi.fn(), pipe: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    pid: 12345
  })
}));

describe('MCPProxy Configuration Integration', () => {
  let proxy: MCPProxy;
  let config: ProxyConfig;
  
  beforeEach(() => {
    config = {
      childCommand: 'node',
      childArgs: ['test-server-sdk.js'],
      workingDirectory: process.cwd(),
      environment: {},
      restartLimit: 3,
      operationTimeout: 30000,
      logLevel: 'error' as const,
      autoRestart: false,
      restartDelay: 1000
    };
  });

  afterEach(async () => {
    if (proxy) {
      try {
        await proxy.stop();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    vi.clearAllMocks();
  });

  describe('Proxy Construction and Configuration', () => {
    it('should create proxy with valid configuration', () => {
      proxy = new MCPProxy(config);

      expect(proxy).toBeDefined();
      expect(proxy.config.childCommand).toBe('node');
      expect(proxy.config.childArgs).toEqual(['test-server-sdk.js']);
    });

    it('should store configuration correctly', () => {
      const customConfig = {
        ...config,
        logLevel: 'debug' as const,
        restartLimit: 10,
        operationTimeout: 60000,
        autoRestart: false
      };

      proxy = new MCPProxy(customConfig);

      expect(proxy.config.logLevel).toBe('debug');
      expect(proxy.config.restartLimit).toBe(10);
      expect(proxy.config.operationTimeout).toBe(60000);
      expect(proxy.config.autoRestart).toBe(false);
    });

    it('should have lifecycle methods available', () => {
      proxy = new MCPProxy(config);

      expect(typeof proxy.start).toBe('function');
      expect(typeof proxy.stop).toBe('function');
    });
  });

  describe('Server Name Extraction', () => {
    it('should handle various command formats for server naming', () => {
      const testCases = [
        { command: 'node server.js', expected: 'works' },
        { command: '/path/to/server.js', expected: 'works' },
        { command: 'python3 my-server.py', expected: 'works' },
        { command: 'test-server', expected: 'works' },
        { command: '', expected: 'works' } // fallback case
      ];

      testCases.forEach(({ command }) => {
        const testConfig = { ...config, childCommand: command };
        const testProxy = new MCPProxy(testConfig);
        
        // Should create successfully regardless of command format
        expect(testProxy).toBeDefined();
      });
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle different environment configurations', () => {
      const envConfigs = [
        {},
        { NODE_ENV: 'test' },
        { NODE_ENV: 'production', DEBUG: 'true' },
        { CUSTOM_VAR: 'value', ANOTHER: 'test' }
      ];

      envConfigs.forEach(environment => {
        const testConfig = { ...config, environment };
        const testProxy = new MCPProxy(testConfig);
        
        expect(testProxy).toBeDefined();
        expect(testProxy.config.environment).toEqual(environment);
      });
    });

    it('should handle various working directories', () => {
      const directories = [
        process.cwd(),
        '/tmp',
        '/home/user/project',
        '/path/with spaces',
        '.'
      ];

      directories.forEach(workingDirectory => {
        const testConfig = { ...config, workingDirectory };
        const testProxy = new MCPProxy(testConfig);
        
        expect(testProxy).toBeDefined();
        expect(testProxy.config.workingDirectory).toBe(workingDirectory);
      });
    });

    it('should handle different restart and timeout settings', () => {
      const settingsVariations = [
        { restartLimit: 0, operationTimeout: 5000 },
        { restartLimit: 1, operationTimeout: 10000 },
        { restartLimit: 5, operationTimeout: 30000 },
        { restartLimit: 10, operationTimeout: 60000 }
      ];

      settingsVariations.forEach(settings => {
        const testConfig = { ...config, ...settings };
        const testProxy = new MCPProxy(testConfig);
        
        expect(testProxy).toBeDefined();
        expect(testProxy.config.restartLimit).toBe(settings.restartLimit);
        expect(testProxy.config.operationTimeout).toBe(settings.operationTimeout);
      });
    });
  });

  // Note: Lifecycle integration testing is covered by E2E tests
  // These configuration tests focus on how config flows through components
});
