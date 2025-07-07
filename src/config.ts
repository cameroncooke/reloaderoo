/**
 * Comprehensive configuration system for mcpdev-proxy
 * 
 * Provides robust configuration loading, validation, and management with support for:
 * - Environment variable mapping and type conversion
 * - Multi-source configuration merging with proper precedence
 * - Comprehensive validation with helpful error messages
 * - Runtime configuration updates with change tracking
 * - Type-safe configuration access and modification
 */

import { EventEmitter } from 'events';
import { existsSync, accessSync, constants } from 'fs';
import { resolve, isAbsolute, delimiter } from 'path';
import type { 
  ProxyConfig, 
  ProxyConfigUpdate, 
  ConfigValidationResult, 
  LoggingLevel
} from './types.js';
import { DEFAULT_PROXY_CONFIG } from './types.js';

// =============================================================================
// CONFIGURATION INTERFACES
// =============================================================================

/**
 * Configuration sources in priority order (highest to lowest)
 */
export enum ConfigSource {
  RUNTIME = 'runtime',
  ENVIRONMENT = 'environment', 
  DEFAULT = 'default'
}

/**
 * Configuration change event data
 */
export interface ConfigChangeEvent {
  source: ConfigSource;
  changes: Partial<ProxyConfig>;
  previousConfig: ProxyConfig;
  newConfig: ProxyConfig;
}

/**
 * Internal configuration state tracking
 */
interface ConfigState {
  sources: Map<ConfigSource, Partial<ProxyConfig>>;
  merged: ProxyConfig | null;
  lastValidation: ConfigValidationResult | null;
  changeCount: number;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Native implementation of 'which' command functionality
 * Finds the path of an executable command in the system PATH
 */
function which(command: string): string | null {
  if (isAbsolute(command)) {
    return existsSync(command) ? command : null;
  }

  const pathExt = process.platform === 'win32' 
    ? (process.env['PATHEXT'] || '.COM;.EXE;.BAT;.CMD').split(';')
    : [''];
  
  const paths = (process.env['PATH'] || '').split(delimiter);
  
  for (const dir of paths) {
    if (!dir || dir.trim() === '') continue;
    
    for (const ext of pathExt) {
      const fullPath = resolve(dir, command + ext);
      if (existsSync(fullPath)) {
        try {
          accessSync(fullPath, constants.X_OK);
          return fullPath;
        } catch {
          // Not executable, continue searching
        }
      }
    }
  }
  
  return null;
}

// =============================================================================
// ENVIRONMENT VARIABLE PROCESSING
// =============================================================================

/**
 * Environment variable mappings with type information
 */
const ENV_VAR_MAPPINGS: Record<string, {
  configKey: keyof ProxyConfig;
  type: 'string' | 'number' | 'boolean' | 'array';
  parser?: (value: string) => any;
}> = {
  MCPDEV_PROXY_LOG_LEVEL: { 
    configKey: 'logLevel', 
    type: 'string' 
  },
  MCPDEV_PROXY_LOG_FILE: { 
    configKey: 'logFile', 
    type: 'string' 
  },
  MCPDEV_PROXY_RESTART_LIMIT: { 
    configKey: 'restartLimit', 
    type: 'number' 
  },
  MCPDEV_PROXY_AUTO_RESTART: { 
    configKey: 'autoRestart', 
    type: 'boolean' 
  },
  MCPDEV_PROXY_TIMEOUT: { 
    configKey: 'operationTimeout', 
    type: 'number' 
  },
  MCPDEV_PROXY_RESTART_DELAY: { 
    configKey: 'restartDelay', 
    type: 'number' 
  },
  MCPDEV_PROXY_CHILD_CMD: { 
    configKey: 'childCommand', 
    type: 'string' 
  },
  MCPDEV_PROXY_CHILD_ARGS: { 
    configKey: 'childArgs', 
    type: 'array',
    parser: (value: string) => value.split(',').map(arg => arg.trim())
  },
  MCPDEV_PROXY_CWD: { 
    configKey: 'workingDirectory', 
    type: 'string' 
  },
  MCPDEV_PROXY_DEBUG_MODE: { 
    configKey: 'debugMode', 
    type: 'boolean' 
  }
};

/**
 * Convert environment variable string to appropriate type
 */
function convertEnvValue(value: string, type: string, parser?: (value: string) => any): any {
  if (parser) {
    return parser(value);
  }

  switch (type) {
    case 'boolean':
      return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
    case 'number':
      const num = parseInt(value, 10);
      if (isNaN(num)) {
        throw new Error(`Invalid number value: ${value}`);
      }
      return num;
    case 'array':
      return value.split(',').map(item => item.trim()).filter(Boolean);
    case 'string':
    default:
      return value;
  }
}

/**
 * Load configuration from environment variables
 */
function loadEnvironmentConfig(): Partial<ProxyConfig> {
  const config: Partial<ProxyConfig> = {};
  const environment: Record<string, string> = {};

  // Process known environment variables
  for (const [envVar, mapping] of Object.entries(ENV_VAR_MAPPINGS)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      try {
        (config as any)[mapping.configKey] = convertEnvValue(value, mapping.type, mapping.parser);
      } catch (error) {
        throw new Error(`Invalid environment variable ${envVar}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
  }

  // Collect environment variables for child process
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('MCPDEV_PROXY_')) {
      environment[key] = value;
    }
  }

  if (Object.keys(environment).length > 0) {
    config.environment = environment;
  }

  return config;
}

// =============================================================================
// CONFIGURATION CLASS
// =============================================================================

/**
 * Main configuration management class
 * 
 * Provides comprehensive configuration loading, validation, merging, and runtime updates
 * with proper event emission and error handling.
 */
export class Config extends EventEmitter {
  private state: ConfigState;

  constructor() {
    super();
    this.state = {
      sources: new Map(),
      merged: null,
      lastValidation: null,
      changeCount: 0
    };

    // Initialize with default configuration
    this.state.sources.set(ConfigSource.DEFAULT, { ...DEFAULT_PROXY_CONFIG });
  }

  /**
   * Load configuration from all sources with proper precedence
   * Priority: Runtime > Environment > Default
   */
  loadConfig(): ConfigValidationResult {
    try {
      // Load environment configuration
      const envConfig = loadEnvironmentConfig();
      this.state.sources.set(ConfigSource.ENVIRONMENT, envConfig);

      // Merge configurations
      const merged = this.mergeConfigs();
      
      // Validate merged configuration
      const validation = this.validateConfig(merged);
      
      if (validation.valid && validation.config) {
        this.state.merged = validation.config;
        this.state.lastValidation = validation;
        this.emit('configLoaded', validation.config);
      }

      return validation;
    } catch (error) {
      const validation: ConfigValidationResult = {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown configuration loading error'],
        warnings: []
      };
      this.state.lastValidation = validation;
      return validation;
    }
  }

  /**
   * Validate configuration with comprehensive checks
   */
  validateConfig(config: Partial<ProxyConfig>): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    if (!config.childCommand) {
      errors.push('childCommand is required');
    } else {
      // Check if command exists and is executable
      const cmdPath = isAbsolute(config.childCommand) ? config.childCommand : which(config.childCommand);
      if (!cmdPath) {
        errors.push(`Child command not found: ${config.childCommand}`);
      } else if (!existsSync(cmdPath)) {
        errors.push(`Child command path does not exist: ${cmdPath}`);
      } else {
        try {
          accessSync(cmdPath, constants.X_OK);
        } catch {
          warnings.push(`Child command may not be executable: ${cmdPath}`);
        }
      }
    }

    // Working directory validation
    if (config.workingDirectory) {
      const workDir = resolve(config.workingDirectory);
      if (!existsSync(workDir)) {
        errors.push(`Working directory does not exist: ${workDir}`);
      } else {
        try {
          accessSync(workDir, constants.R_OK | constants.W_OK);
        } catch {
          warnings.push(`Working directory may not be accessible: ${workDir}`);
        }
      }
    }

    // Log level validation
    if (config.logLevel) {
      const validLevels: LoggingLevel[] = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'];
      if (!validLevels.includes(config.logLevel)) {
        errors.push(`Invalid log level: ${config.logLevel}. Must be one of: ${validLevels.join(', ')}`);
      }
    }

    // Numeric range validations
    if (config.restartLimit !== undefined) {
      if (config.restartLimit < 0 || config.restartLimit > 10) {
        errors.push('restartLimit must be between 0 and 10');
      }
    }

    if (config.operationTimeout !== undefined) {
      if (config.operationTimeout < 1000 || config.operationTimeout > 300000) {
        errors.push('operationTimeout must be between 1000ms and 300000ms');
      }
    }

    if (config.restartDelay !== undefined) {
      if (config.restartDelay < 0 || config.restartDelay > 60000) {
        errors.push('restartDelay must be between 0ms and 60000ms');
      }
    }

    // Child args validation
    if (config.childArgs) {
      if (!Array.isArray(config.childArgs)) {
        errors.push('childArgs must be an array of strings');
      } else if (config.childArgs.some(arg => typeof arg !== 'string')) {
        errors.push('All childArgs must be strings');
      }
    }

    // Environment validation
    if (config.environment) {
      if (typeof config.environment !== 'object' || config.environment === null) {
        errors.push('environment must be an object');
      } else {
        for (const [key, value] of Object.entries(config.environment)) {
          if (typeof value !== 'string') {
            errors.push(`Environment variable ${key} must be a string`);
          }
        }
      }
    }

    // Create validated config if no errors
    let validatedConfig: ProxyConfig | undefined;
    if (errors.length === 0) {
      validatedConfig = {
        childCommand: config.childCommand!,
        childArgs: config.childArgs || [],
        workingDirectory: config.workingDirectory || process.cwd(),
        environment: config.environment || {},
        restartLimit: config.restartLimit ?? 3,
        operationTimeout: config.operationTimeout ?? 30000,
        logLevel: config.logLevel || 'info',
        autoRestart: config.autoRestart ?? true,
        restartDelay: config.restartDelay ?? 1000
      };
    }

    const result: ConfigValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings
    };

    if (validatedConfig) {
      result.config = validatedConfig;
    }

    return result;
  }

  /**
   * Merge configurations from all sources with proper precedence
   */
  mergeConfigs(): Partial<ProxyConfig> {
    const merged: Partial<ProxyConfig> = {};

    // Apply configurations in priority order (lowest to highest)
    for (const source of [ConfigSource.DEFAULT, ConfigSource.ENVIRONMENT, ConfigSource.RUNTIME]) {
      const sourceConfig = this.state.sources.get(source);
      if (sourceConfig) {
        Object.assign(merged, sourceConfig);
        
        // Special handling for environment variables (merge, don't replace)
        if (source !== ConfigSource.DEFAULT && sourceConfig.environment && merged.environment) {
          merged.environment = { ...merged.environment, ...sourceConfig.environment };
        }
      }
    }

    return merged;
  }

  /**
   * Generate configuration summary for diagnostics
   */
  getConfigSummary(): {
    sources: Record<ConfigSource, Partial<ProxyConfig>>;
    merged: ProxyConfig | null;
    validation: ConfigValidationResult | null;
    changeCount: number;
  } {
    return {
      sources: Object.fromEntries(this.state.sources.entries()) as Record<ConfigSource, Partial<ProxyConfig>>,
      merged: this.state.merged,
      validation: this.state.lastValidation,
      changeCount: this.state.changeCount
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: ProxyConfigUpdate, source: ConfigSource = ConfigSource.RUNTIME): ConfigValidationResult {
    const previousConfig = this.state.merged;
    if (!previousConfig) {
      return {
        valid: false,
        errors: ['No base configuration loaded. Call loadConfig() first.'],
        warnings: []
      };
    }

    // Apply updates to the specified source
    const currentSource = this.state.sources.get(source) || {};
    const updatedSource = { ...currentSource, ...updates };
    
    // Special handling for environment variables
    if (updates.environment && currentSource.environment) {
      updatedSource.environment = { ...currentSource.environment, ...updates.environment };
    }

    this.state.sources.set(source, updatedSource);

    // Re-merge and validate
    const merged = this.mergeConfigs();
    const validation = this.validateConfig(merged);

    if (validation.valid && validation.config) {
      this.state.merged = validation.config;
      this.state.lastValidation = validation;
      this.state.changeCount++;

      // Emit change event
      const changeEvent: ConfigChangeEvent = {
        source,
        changes: updates,
        previousConfig,
        newConfig: validation.config
      };
      this.emit('configChanged', changeEvent);
    }

    return validation;
  }

  /**
   * Get current merged configuration
   */
  getCurrentConfig(): ProxyConfig | null {
    return this.state.merged;
  }

  /**
   * Get configuration from specific source
   */
  getSourceConfig(source: ConfigSource): Partial<ProxyConfig> | undefined {
    return this.state.sources.get(source);
  }

  /**
   * Check if configuration has been loaded and is valid
   */
  isValid(): boolean {
    return this.state.lastValidation?.valid === true;
  }

  /**
   * Get last validation result
   */
  getLastValidation(): ConfigValidationResult | null {
    return this.state.lastValidation;
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.state.sources.clear();
    this.state.sources.set(ConfigSource.DEFAULT, { ...DEFAULT_PROXY_CONFIG });
    this.state.merged = null;
    this.state.lastValidation = null;
    this.state.changeCount = 0;
    this.emit('configReset');
  }

  /**
   * Serialize configuration for debugging/logging
   */
  toJSON(): object {
    return {
      ...this.getConfigSummary(),
      // Sanitize sensitive data
      sanitized: this.state.merged ? {
        ...this.state.merged,
        environment: Object.keys(this.state.merged.environment || {}).reduce((acc, key) => {
          const env = this.state.merged?.environment;
          acc[key] = key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') 
            ? '[REDACTED]' 
            : env?.[key] || '';
          return acc;
        }, {} as Record<string, string>)
      } : null
    };
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Create and load a new configuration instance
 */
export function createConfig(): { config: Config; result: ConfigValidationResult } {
  const config = new Config();
  const result = config.loadConfig();
  return { config, result };
}

/**
 * Validate a configuration object without creating a Config instance
 */
export function validateConfigObject(config: Partial<ProxyConfig>): ConfigValidationResult {
  const tempConfig = new Config();
  return tempConfig.validateConfig(config);
}

/**
 * Load environment configuration without creating a Config instance  
 */
export function getEnvironmentConfig(): Partial<ProxyConfig> {
  return loadEnvironmentConfig();
}

/**
 * Check if a command exists and is executable
 */
export function validateCommand(command: string): { valid: boolean; path?: string; error?: string } {
  try {
    const cmdPath = isAbsolute(command) ? command : which(command);
    if (!cmdPath) {
      return { valid: false, error: `Command not found: ${command}` };
    }
    
    if (!existsSync(cmdPath)) {
      return { valid: false, error: `Command path does not exist: ${cmdPath}` };
    }

    try {
      accessSync(cmdPath, constants.X_OK);
      return { valid: true, path: cmdPath };
    } catch {
      return { valid: false, error: `Command is not executable: ${cmdPath}` };
    }
  } catch (error) {
    return { 
      valid: false, 
      error: `Error validating command: ${error instanceof Error ? error.message : 'unknown error'}` 
    };
  }
}

// Export the configuration class as default
export default Config;