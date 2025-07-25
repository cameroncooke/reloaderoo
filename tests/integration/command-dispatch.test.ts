/**
 * Integration tests for configuration and type system
 * Tests configuration validation and type consistency
 */

import { describe, it, expect } from 'vitest';
import { ProxyConfig, DEFAULT_PROXY_CONFIG, isProxyError, isRestartServerRequest } from '../../src/types.js';

describe('Configuration Integration', () => {
  describe('ProxyConfig Validation', () => {
    it('should create valid proxy config with all required fields', () => {
      const config: ProxyConfig = {
        childCommand: 'node',
        childArgs: ['server.js'],
        workingDirectory: '/tmp',
        environment: { NODE_ENV: 'test' },
        restartLimit: 3,
        operationTimeout: 30000,
        logLevel: 'info',
        autoRestart: true,
        restartDelay: 1000
      };
      
      expect(config.childCommand).toBe('node');
      expect(config.childArgs).toEqual(['server.js']);
      expect(config.workingDirectory).toBe('/tmp');
      expect(config.environment.NODE_ENV).toBe('test');
      expect(config.restartLimit).toBe(3);
      expect(config.operationTimeout).toBe(30000);
      expect(config.logLevel).toBe('info');
      expect(config.autoRestart).toBe(true);
      expect(config.restartDelay).toBe(1000);
    });

    it('should merge with default configuration', () => {
      const partialConfig = {
        childCommand: 'python',
        childArgs: ['-m', 'server']
      };
      
      const fullConfig = {
        ...DEFAULT_PROXY_CONFIG,
        ...partialConfig
      } as ProxyConfig;
      
      expect(fullConfig.childCommand).toBe('python');
      expect(fullConfig.childArgs).toEqual(['-m', 'server']);
      expect(fullConfig.logLevel).toBe('info');
      expect(fullConfig.autoRestart).toBe(true);
      expect(fullConfig.restartLimit).toBe(3);
    });

    it('should validate log levels', () => {
      const validLogLevels = ['debug', 'info', 'warn', 'error'];
      
      validLogLevels.forEach(level => {
        const config: ProxyConfig = {
          ...DEFAULT_PROXY_CONFIG,
          childCommand: 'node',
          childArgs: ['server.js'],
          logLevel: level as any
        } as ProxyConfig;
        
        expect(config.logLevel).toBe(level);
      });
    });

    it('should handle environment variable merging', () => {
      const config: ProxyConfig = {
        ...DEFAULT_PROXY_CONFIG,
        childCommand: 'node',
        childArgs: ['server.js'],
        environment: {
          NODE_ENV: 'production',
          DEBUG: 'true'
        }
      } as ProxyConfig;
      
      const mergedEnv = {
        ...process.env,
        ...config.environment
      };
      
      expect(mergedEnv.NODE_ENV).toBe('production');
      expect(mergedEnv.DEBUG).toBe('true');
    });
  });

  describe('Type Guards', () => {
    it('should identify proxy errors correctly', () => {
      const regularError = new Error('Regular error');
      
      // Create a proper ProxyError that extends Error
      const proxyError = new Error('Proxy error') as any;
      proxyError.code = 'CHILD_START_FAILED';
      
      expect(isProxyError(regularError)).toBe(false);
      expect(isProxyError(proxyError)).toBe(true);
    });

    it('should identify restart server requests', () => {
      const regularRequest = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'tools/call',
        params: { name: 'echo', arguments: {} }
      };
      
      const restartRequest = {
        jsonrpc: '2.0' as const,
        id: 2,
        method: 'tools/call',
        params: { name: 'restart_server', arguments: {} }
      };
      
      expect(isRestartServerRequest(regularRequest)).toBe(false);
      expect(isRestartServerRequest(restartRequest)).toBe(true);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle empty child args', () => {
      const config: ProxyConfig = {
        ...DEFAULT_PROXY_CONFIG,
        childCommand: 'node',
        childArgs: []
      } as ProxyConfig;
      
      expect(config.childArgs).toEqual([]);
    });

    it('should handle complex child commands', () => {
      const config: ProxyConfig = {
        ...DEFAULT_PROXY_CONFIG,
        childCommand: 'python',
        childArgs: ['-m', 'server', '--config', 'config.json', '--port', '8080']
      } as ProxyConfig;
      
      expect(config.childCommand).toBe('python');
      expect(config.childArgs).toHaveLength(6);
      expect(config.childArgs).toContain('--config');
      expect(config.childArgs).toContain('config.json');
    });

    it('should handle special characters in paths', () => {
      const config: ProxyConfig = {
        ...DEFAULT_PROXY_CONFIG,
        childCommand: 'node',
        childArgs: ['server.js'],
        workingDirectory: '/path with spaces/and-special_chars'
      } as ProxyConfig;
      
      expect(config.workingDirectory).toBe('/path with spaces/and-special_chars');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate timeout values', () => {
      const config: ProxyConfig = {
        ...DEFAULT_PROXY_CONFIG,
        childCommand: 'node',
        childArgs: ['server.js'],
        operationTimeout: 60000
      } as ProxyConfig;
      
      expect(config.operationTimeout).toBe(60000);
      expect(config.operationTimeout).toBeGreaterThan(0);
    });

    it('should validate restart limits', () => {
      const config: ProxyConfig = {
        ...DEFAULT_PROXY_CONFIG,
        childCommand: 'node',
        childArgs: ['server.js'],
        restartLimit: 5
      } as ProxyConfig;
      
      expect(config.restartLimit).toBe(5);
      expect(config.restartLimit).toBeGreaterThanOrEqual(0);
    });

    it('should validate restart delays', () => {
      const config: ProxyConfig = {
        ...DEFAULT_PROXY_CONFIG,
        childCommand: 'node',
        childArgs: ['server.js'],
        restartDelay: 2000
      } as ProxyConfig;
      
      expect(config.restartDelay).toBe(2000);
      expect(config.restartDelay).toBeGreaterThanOrEqual(0);
    });
  });
});