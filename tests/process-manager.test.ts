/**
 * Tests for ProcessManager - Child MCP server lifecycle management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessManager } from '../src/process-manager.js';
import { ProcessState, ProxyConfig, ProxyErrorCode } from '../src/types.js';

// Mock cross-spawn module with factory function
vi.mock('cross-spawn', () => ({
  spawn: vi.fn()
}));

// Variables for controllable mocking
let mockSpawn: any;
let currentMockProcess: any = null;

// Helper to create a fully synchronous, controllable mock child process
function createMockChildProcess(pid = 12345) {
  const callbacks = new Map<string, Function[]>();
  
  const mockProcess = {
    pid,
    stdout: { on: vi.fn(), pipe: vi.fn(), removeAllListeners: vi.fn() },
    stderr: { on: vi.fn(), pipe: vi.fn(), removeAllListeners: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn() },
    kill: vi.fn(),
    removeAllListeners: vi.fn(),
    
    // Store event callbacks for manual triggering
    on: vi.fn((event: string, callback: Function) => {
      if (!callbacks.has(event)) {
        callbacks.set(event, []);
      }
      callbacks.get(event)!.push(callback);
    }),
    
    // Synchronous event triggering methods
    triggerSpawn: () => {
      const spawnCallbacks = callbacks.get('spawn') || [];
      spawnCallbacks.forEach(cb => cb());
    },
    
    triggerError: (error: Error) => {
      const errorCallbacks = callbacks.get('error') || [];
      errorCallbacks.forEach(cb => cb(error));
    },
    
    triggerExit: (code: number, signal?: string) => {
      const exitCallbacks = callbacks.get('exit') || [];
      exitCallbacks.forEach(cb => cb(code, signal));
    }
  };
  
  return mockProcess;
}

// Mock logger
vi.mock('../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn()
  }
}));

describe('ProcessManager', () => {
  let processManager: ProcessManager;
  let mockConfig: ProxyConfig;

  beforeEach(async () => {
    vi.useFakeTimers();
    
    // Import the mocked spawn function
    const { spawn } = await import('cross-spawn');
    mockSpawn = vi.mocked(spawn);
    
    mockConfig = {
      childCommand: 'node test-server.js',
      childArgs: ['--test'],
      workingDirectory: '/tmp',
      environment: { NODE_ENV: 'test' },
      restartLimit: 3,
      operationTimeout: 5000,
      logLevel: 'info',
      autoRestart: false, // Disable auto-restart for unit tests
      restartDelay: 100
    };

    processManager = new ProcessManager(mockConfig);
    currentMockProcess = null;
    
    // Setup default mock behavior - trigger spawn immediately to avoid timeout
    mockSpawn.mockImplementation(() => {
      currentMockProcess = createMockChildProcess();
      const processToTrigger = currentMockProcess;
      // Auto-trigger spawn success synchronously to avoid any timing issues
      process.nextTick(() => {
        if (processToTrigger) {
          processToTrigger.triggerSpawn();
        }
      });
      return currentMockProcess;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    currentMockProcess = null;
  });

  describe('constructor', () => {
    it('should initialize with correct default state', () => {
      expect(processManager.getState()).toBe(ProcessState.STOPPED);
      expect(processManager.getRestartCount()).toBe(0);
      expect(processManager.getChildProcess()).toBeNull();
    });

    it('should validate configuration', () => {
      expect(() => {
        new ProcessManager({
          ...mockConfig,
          childCommand: ''
        });
      }).toThrow();

      expect(() => {
        new ProcessManager({
          ...mockConfig,
          restartLimit: -1
        });
      }).toThrow();
    });
  });

  describe('getState', () => {
    it('should return current process state', () => {
      expect(processManager.getState()).toBe(ProcessState.STOPPED);
    });
  });

  describe('getRestartCount', () => {
    it('should return current restart count', () => {
      expect(processManager.getRestartCount()).toBe(0);
    });
  });

  describe('getChildProcess', () => {
    it('should return null when no process is running', () => {
      expect(processManager.getChildProcess()).toBeNull();
    });
  });

  describe('isHealthy', () => {
    it('should return false when process is not running', async () => {
      const healthy = await processManager.isHealthy();
      expect(healthy).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should emit error events', (done) => {
      processManager.on('error', (error) => {
        expect(error.code).toBeDefined();
        expect(error.message).toBeDefined();
        done();
      });

      // Trigger an error by trying to spawn with invalid state
      processManager.spawn().catch(() => {
        // Expected to fail in test environment
      });
    });
  });

  describe('configuration validation', () => {
    it('should reject invalid child command', () => {
      expect(() => {
        new ProcessManager({
          ...mockConfig,
          childCommand: ''
        });
      }).toThrow('childCommand is required');
    });

    it('should reject negative restart limit', () => {
      expect(() => {
        new ProcessManager({
          ...mockConfig,
          restartLimit: -1
        });
      }).toThrow('restartLimit must be >= 0');
    });

    it('should reject too short operation timeout', () => {
      expect(() => {
        new ProcessManager({
          ...mockConfig,
          operationTimeout: 500
        });
      }).toThrow('operationTimeout must be >= 1000ms');
    });
  });

  describe('event emission', () => {
    it('should be an EventEmitter', () => {
      expect(processManager.on).toBeDefined();
      expect(processManager.emit).toBeDefined();
      expect(processManager.removeListener).toBeDefined();
    });

    it('should support event listeners', () => {
      const listener = vi.fn();
      processManager.on('error', listener);
      processManager.removeListener('error', listener);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('spawn', () => {
    it('should successfully spawn child process', async () => {
      const startedListener = vi.fn();
      processManager.on('started', startedListener);
      
      const spawnPromise = processManager.spawn();
      
      // Trigger spawn success
      currentMockProcess.triggerSpawn();
      
      await spawnPromise;
      
      expect(mockSpawn).toHaveBeenCalledWith(
        'node',
        ['test-server.js', '--test'],
        expect.objectContaining({
          cwd: mockConfig.workingDirectory,
          env: expect.objectContaining(mockConfig.environment),
          stdio: ['pipe', 'pipe', 'pipe']
        })
      );
      
      expect(processManager.getState()).toBe(ProcessState.RUNNING);
      expect(processManager.getChildProcess()).toBe(currentMockProcess);
      expect(startedListener).toHaveBeenCalledWith(12345);
    });

    it('should handle spawn errors', async () => {
      const errorListener = vi.fn();
      processManager.on('error', errorListener);
      
      const spawnError = new Error('Spawn failed');
      const spawnPromise = processManager.spawn();
      
      // Trigger spawn error
      currentMockProcess.triggerError(spawnError);
      
      await expect(spawnPromise).rejects.toThrow();
      expect(processManager.getState()).toBe(ProcessState.UNAVAILABLE);
      expect(errorListener).toHaveBeenCalled();
    });

    it('should timeout if spawn takes too long', async () => {
      const spawnPromise = processManager.spawn();
      
      // Fast-forward past timeout without triggering spawn
      vi.advanceTimersByTime(6000);
      
      await expect(spawnPromise).rejects.toThrow('timed out');
      expect(processManager.getState()).toBe(ProcessState.UNAVAILABLE);
    });

    it('should reject spawn when already running', async () => {
      // First spawn
      const spawnPromise1 = processManager.spawn();
      currentMockProcess.triggerSpawn();
      await spawnPromise1;
      
      // Second spawn should fail
      await expect(processManager.spawn()).rejects.toThrow('Cannot spawn process in state');
    });
  });

  describe('terminate', () => {
    it('should gracefully terminate running process', async () => {
      // Start process first
      const spawnPromise = processManager.spawn();
      currentMockProcess.triggerSpawn();
      await spawnPromise;
      
      expect(processManager.getState()).toBe(ProcessState.RUNNING);
      
      // Now terminate with graceful exit
      const terminatePromise = processManager.terminate();
      
      // Simulate graceful exit after SIGTERM
      currentMockProcess.triggerExit(0, 'SIGTERM');
      
      await terminatePromise;
      
      expect(currentMockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(processManager.getState()).toBe(ProcessState.STOPPED);
    });

    it('should handle terminate when not running', async () => {
      await expect(processManager.terminate()).resolves.not.toThrow();
      expect(processManager.getState()).toBe(ProcessState.STOPPED);
    });

    it('should force kill if graceful termination fails', async () => {
      // Start process first
      const spawnPromise = processManager.spawn();
      currentMockProcess.triggerSpawn();
      await spawnPromise;
      
      const terminatePromise = processManager.terminate();
      
      // Don't trigger exit to simulate hanging process
      // Fast forward past graceful timeout to trigger force kill
      vi.advanceTimersByTime(6000);
      
      // Now simulate force kill succeeding
      currentMockProcess.triggerExit(0, 'SIGKILL');
      
      await terminatePromise;
      
      expect(currentMockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(currentMockProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(processManager.getState()).toBe(ProcessState.STOPPED);
    });
  });

  describe('restart', () => {
    it('should restart running process', async () => {
      // Start process first
      const spawnPromise1 = processManager.spawn();
      const oldProcess = currentMockProcess;
      oldProcess.triggerSpawn();
      await spawnPromise1;
      
      expect(processManager.getRestartCount()).toBe(0);
      expect(processManager.getState()).toBe(ProcessState.RUNNING);
      
      // Track new process for restart
      let newProcess: any = null;
      mockSpawn.mockImplementation(() => {
        newProcess = createMockChildProcess(54321);
        currentMockProcess = newProcess;
        const processToTrigger = newProcess;
        // Auto-trigger spawn for restart
        process.nextTick(() => {
          if (processToTrigger) {
            processToTrigger.triggerSpawn();
          }
        });
        return newProcess;
      });
      
      // Start restart - this will terminate old process then spawn new
      const restartPromise = processManager.restart();
      
      // Simulate old process exiting gracefully
      oldProcess.triggerExit(0, 'SIGTERM');
      
      // Run all timers to handle restart delay
      await vi.runAllTimersAsync();
      
      await restartPromise;
      
      // Verify restart completed successfully
      // Note: restart count resets to 0 when spawn succeeds (by design)
      expect(processManager.getRestartCount()).toBe(0);
      expect(processManager.getState()).toBe(ProcessState.RUNNING);
      expect(oldProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(newProcess?.pid).toBe(54321);
    });

    it('should restart stopped process', async () => {
      // Starting from stopped state - should just spawn new process
      expect(processManager.getState()).toBe(ProcessState.STOPPED);
      
      // Reset spawn call count and override spawn implementation for this test
      mockSpawn.mockClear();
      mockSpawn.mockImplementation(() => {
        currentMockProcess = createMockChildProcess();
        const processToTrigger = currentMockProcess;
        // Trigger spawn success asynchronously but immediately
        process.nextTick(() => {
          if (processToTrigger) {
            processToTrigger.triggerSpawn();
          }
        });
        return currentMockProcess;
      });
      
      // Start restart from stopped state
      const restartPromise = processManager.restart();
      
      // Run all timers to ensure async operations complete
      await vi.runAllTimersAsync();
      
      await restartPromise;
      
      // Verify restart spawned new process
      expect(processManager.getState()).toBe(ProcessState.RUNNING);
      // Note: restart count resets to 0 when spawn succeeds (by design)
      expect(processManager.getRestartCount()).toBe(0);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it('should respect restart limits', async () => {
      // Test restart limit enforcement
      const limitedConfig = { ...mockConfig, restartLimit: 0 };
      const limitedManager = new ProcessManager(limitedConfig);
      
      // Restart should be rejected immediately due to limit
      await expect(limitedManager.restart()).rejects.toThrow('Maximum restart attempts');
      expect(limitedManager.getRestartCount()).toBe(0);
    });
  });

  describe('isHealthy', () => {
    it('should return false when not running', async () => {
      const healthy = await processManager.isHealthy();
      expect(healthy).toBe(false);
    });

    it('should return true for running healthy process', async () => {
      // Start process first
      const spawnPromise = processManager.spawn();
      
      // Configure kill to return false (process exists and healthy)
      currentMockProcess.kill.mockReturnValue(false);
      currentMockProcess.triggerSpawn();
      
      await spawnPromise;
      
      // The healthy check should complete quickly since kill(0) returns false (process exists)
      const healthy = await processManager.isHealthy();
      expect(healthy).toBe(true);
    });
  });
});