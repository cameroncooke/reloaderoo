/**
 * Proxy command implementation
 * 
 * Maintains backward compatibility with existing MCP server functionality
 */

import { Command } from 'commander';
import { existsSync, accessSync, constants } from 'fs';
import { resolve, isAbsolute } from 'path';
import { MCPProxy } from '../../mcp-proxy.js';
import { Config, validateCommand, getEnvironmentConfig } from '../../config.js';
import { logger } from '../../mcp-logger.js';
import type { ProxyConfig, LoggingLevel } from '../../types.js';

/**
 * Validate directory path and check accessibility
 */
function validateDirectory(path: string, name: string): { valid: boolean; error?: string } {
  const absPath = isAbsolute(path) ? path : resolve(path);
  
  if (!existsSync(absPath)) {
    return { valid: false, error: `${name} does not exist: ${absPath}` };
  }
  
  try {
    accessSync(absPath, constants.R_OK | constants.W_OK);
    return { valid: true };
  } catch {
    return { valid: false, error: `${name} is not readable/writable: ${absPath}` };
  }
}

/**
 * Format duration for human-readable output
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Create the proxy command
 */
export function createProxyCommand(): Command {
  const proxy = new Command('proxy')
    .description('Run as MCP proxy server (default behavior)')
    .usage('[options] -- <child-command> [child-args...]')
    .addHelpText('after', `
Examples:
  $ reloaderoo proxy -- node server.js
  $ reloaderoo proxy --log-level debug -- python mcp_server.py --port 8080
    `)
    .option(
      '-w, --working-dir <directory>',
      'Working directory for the child process',
      process.cwd()
    )
    .option(
      '-l, --log-level <level>',
      'Log level (debug, info, notice, warning, error, critical)',
      'info'
    )
    .option(
      '-f, --log-file <path>',
      'Custom log file path (logs to stderr by default)'
    )
    .option(
      '-t, --restart-timeout <ms>',
      'Timeout for restart operations in milliseconds',
      '30000'
    )
    .option(
      '-m, --max-restarts <number>',
      'Maximum number of restart attempts (0-10)',
      '3'
    )
    .option(
      '-d, --restart-delay <ms>',
      'Delay between restart attempts in milliseconds',
      '1000'
    )
    .option(
      '-q, --quiet',
      'Suppress non-essential output'
    )
    .option(
      '--no-auto-restart',
      'Disable automatic restart on crashes'
    )
    .option(
      '--debug',
      'Enable debug mode with verbose logging'
    )
    .option(
      '--dry-run',
      'Validate configuration without starting proxy'
    )
    .action(async (options) => {
      try {
        // Handle debug mode
        if (options.debug) {
          options.logLevel = 'debug';
        }
        
        // Create configuration
        const config = new Config();
        
        // Load environment configuration first
        const envConfig = getEnvironmentConfig();
        if (Object.keys(envConfig).length > 0 && !options.quiet) {
          process.stderr.write('Loaded configuration from environment variables\n');
        }
        
        
        // Parse child command using pass-through syntax (-- child-command [args...])
        const dashIndex = process.argv.indexOf('--');
        if (dashIndex === -1 || dashIndex >= process.argv.length - 1) {
          process.stderr.write('Error: Child command is required\n');
          process.stderr.write('Use: reloaderoo proxy [options] -- <command> [args...]\n');
          process.stderr.write('Example: reloaderoo proxy -- node server.js\n');
          process.stderr.write('Try: reloaderoo proxy --help\n');
          process.exit(1);
        }
        
        const childCommand = process.argv[dashIndex + 1]!;
        const childArgs = process.argv.slice(dashIndex + 2);
        
        // Validate child command
        const cmdValidation = validateCommand(childCommand);
        if (!cmdValidation.valid) {
          process.stderr.write(`Error: ${cmdValidation.error}\n`);
          process.exit(1);
        }
        
        // Validate working directory
        const dirValidation = validateDirectory(options.workingDir, 'Working directory');
        if (!dirValidation.valid) {
          process.stderr.write(`Error: ${dirValidation.error}\n`);
          process.exit(1);
        }
        
        // Validate numeric options
        const restartTimeout = parseInt(options.restartTimeout);
        if (isNaN(restartTimeout) || restartTimeout < 1000 || restartTimeout > 300000) {
          process.stderr.write('Error: --restart-timeout must be between 1000 and 300000\n');
          process.exit(1);
        }
        
        const maxRestarts = parseInt(options.maxRestarts);
        if (isNaN(maxRestarts) || maxRestarts < 0 || maxRestarts > 10) {
          process.stderr.write('Error: --max-restarts must be between 0 and 10\n');
          process.exit(1);
        }
        
        const restartDelay = parseInt(options.restartDelay);
        if (isNaN(restartDelay) || restartDelay < 0 || restartDelay > 60000) {
          process.stderr.write('Error: --restart-delay must be between 0 and 60000\n');
          process.exit(1);
        }
        
        // Validate log level
        const validLogLevels: LoggingLevel[] = ['debug', 'info', 'notice', 'warning', 'error', 'critical'];
        if (!validLogLevels.includes(options.logLevel as LoggingLevel)) {
          process.stderr.write(`Error: Invalid log level '${options.logLevel}'\n`);
          process.stderr.write(`Valid levels: ${validLogLevels.join(', ')}\n`);
          process.exit(1);
        }
        
        // Build proxy configuration
        const proxyConfig: ProxyConfig = {
          childCommand: cmdValidation.path || childCommand,
          childArgs,
          workingDirectory: resolve(options.workingDir),
          environment: process.env as Record<string, string>,
          restartLimit: maxRestarts,
          operationTimeout: restartTimeout,
          logLevel: options.logLevel as LoggingLevel,
          autoRestart: options.autoRestart !== false,
          restartDelay
        };
        
        // Configure logging
        logger.setLevel(proxyConfig.logLevel as any);
        
        // Set custom log file if provided via CLI or environment
        const logFile = options.logFile || envConfig.logFile;
        if (logFile) {
          logger.setLogFile(logFile);
          if (!options.quiet) {
            process.stderr.write(`Logging to file: ${logFile}\n`);
          }
        }
        
        // Dry run mode - validate and exit
        if (options.dryRun) {
          const validation = config.validateConfig(proxyConfig);
          
          if (!options.quiet) {
            process.stderr.write('\n=== Configuration Validation ===\n');
            process.stderr.write(`Valid: ${validation.valid ? 'Yes' : 'No'}\n`);
            
            if (validation.errors.length > 0) {
              process.stderr.write('\nErrors:\n');
              validation.errors.forEach(err => process.stderr.write(`  - ${err}\n`));
            }
            
            if (validation.warnings.length > 0) {
              process.stderr.write('\nWarnings:\n');
              validation.warnings.forEach(warn => process.stderr.write(`  - ${warn}\n`));
            }
            
            if (validation.valid) {
              process.stderr.write('\nConfiguration:\n');
              process.stderr.write(`  Child Command: ${proxyConfig.childCommand}\n`);
              process.stderr.write(`  Child Args: ${proxyConfig.childArgs.join(' ') || '(none)'}\n`);
              process.stderr.write(`  Working Dir: ${proxyConfig.workingDirectory}\n`);
              process.stderr.write(`  Log Level: ${proxyConfig.logLevel}\n`);
              process.stderr.write(`  Auto Restart: ${proxyConfig.autoRestart}\n`);
              process.stderr.write(`  Max Restarts: ${proxyConfig.restartLimit}\n`);
              process.stderr.write(`  Restart Delay: ${formatDuration(proxyConfig.restartDelay)}\n`);
              process.stderr.write(`  Operation Timeout: ${formatDuration(proxyConfig.operationTimeout)}\n`);
            }
          }
          
          process.exit(validation.valid ? 0 : 1);
        }
        
        // Start the proxy
        if (!options.quiet) {
          process.stderr.write('Starting reloaderoo MCP proxy server...\n');
          process.stderr.write(`Child: ${childCommand} ${childArgs.join(' ')}\n`);
          process.stderr.write(`Working Directory: ${proxyConfig.workingDirectory}\n`);
          process.stderr.write('\n💡 For CLI tools and debugging, use: reloaderoo --help or reloaderoo inspect --help\n');
        }
        
        const proxyInstance = new MCPProxy(proxyConfig);
        
        // Handle graceful shutdown
        const shutdown = async (signal: string) => {
          if (!options.quiet) {
            process.stderr.write(`\nReceived ${signal}, shutting down gracefully...\n`);
          }
          await proxyInstance.stop();
          process.exit(0);
        };
        
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        
        // Start proxy
        await proxyInstance.start();
        
      } catch (error) {
        process.stderr.write(`Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        process.exit(1);
      }
    });

  return proxy;
}