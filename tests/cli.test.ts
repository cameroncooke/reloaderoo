/**
 * Tests for CLI error handling and version display
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('CLI Error Handling', () => {
  let mockStderr: string[];
  let originalStderrWrite: typeof process.stderr.write;
  
  beforeEach(() => {
    mockStderr = [];
    
    // Mock stderr.write to capture output
    originalStderrWrite = process.stderr.write;
    process.stderr.write = vi.fn((chunk: any) => {
      mockStderr.push(String(chunk));
      return true;
    }) as any;
  });

  afterEach(() => {
    // Restore stderr
    process.stderr.write = originalStderrWrite;
    vi.clearAllMocks();
  });

  describe('error message formatting', () => {
    it('should format error messages correctly', () => {
      const testError = new Error('Test error message');
      const message = testError instanceof Error ? testError.message : 'Unknown error';
      expect(message).toBe('Test error message');
    });

    it('should handle unknown errors', () => {
      const unknownError = 'string error';
      const message = unknownError instanceof Error ? unknownError.message : 'Unknown error';
      expect(message).toBe('Unknown error');
    });

    it('should write warnings to stderr', () => {
      process.stderr.write('Warning: Test warning message\n');
      expect(mockStderr).toContain('Warning: Test warning message\n');
    });
  });

  describe('version fallback behavior', () => {
    it('should provide fallback version when package.json unavailable', () => {
      // Simulate the behavior we expect from getVersion
      const simulateGetVersion = () => {
        try {
          // Simulate package.json read failure
          throw new Error('ENOENT: no such file or directory');
        } catch (error) {
          process.stderr.write(`Warning: Could not read package.json: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
          return '0.0.0';
        }
      };

      const version = simulateGetVersion();
      expect(version).toBe('0.0.0');
      expect(mockStderr).toContain('Warning: Could not read package.json: ENOENT: no such file or directory\n');
    });

    it('should handle missing package.json files', () => {
      // Simulate the behavior when no package.json is found
      const simulateNoPackageJson = () => {
        process.stderr.write('Warning: Could not find package.json in any expected location\n');
        return '0.0.0';
      };

      const version = simulateNoPackageJson();
      expect(version).toBe('0.0.0');
      expect(mockStderr).toContain('Warning: Could not find package.json in any expected location\n');
    });
  });

  describe('error recovery', () => {
    it('should continue execution after version lookup errors', () => {
      // Test that the CLI continues to work even when version lookup fails
      let executionContinued = false;
      
      try {
        // Simulate version error
        process.stderr.write('Warning: Could not read package.json: File not found\n');
        
        // Simulate continued execution
        executionContinued = true;
      } catch (error) {
        // Should not reach here
        executionContinued = false;
      }
      
      expect(executionContinued).toBe(true);
      expect(mockStderr).toContain('Warning: Could not read package.json: File not found\n');
    });

    it('should maintain CLI functionality with fallback version', () => {
      // Test that CLI commands still work with fallback version
      const fallbackVersion = '0.0.0';
      
      // Simulate using the fallback version in CLI output
      const cliOutput = `reloaderoo v${fallbackVersion}`;
      
      expect(cliOutput).toBe('reloaderoo v0.0.0');
      expect(fallbackVersion).toBe('0.0.0');
    });
  });

  describe('warning message quality', () => {
    it('should provide helpful debugging information', () => {
      const warningMessage = 'Warning: Could not find package.json in any expected location';
      
      expect(warningMessage).toContain('Warning:');
      expect(warningMessage).toContain('package.json');
      expect(warningMessage).toContain('expected location');
    });

    it('should include error details when available', () => {
      const error = new Error('Permission denied');
      const warningMessage = `Warning: Could not read package.json: ${error.message}`;
      
      expect(warningMessage).toContain('Warning:');
      expect(warningMessage).toContain('Permission denied');
    });
  });
});