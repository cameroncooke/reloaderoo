/**
 * reloaderoo CLI entry point
 * 
 * A transparent MCP development wrapper that enables hot-reloading of MCP servers
 * without losing client session state. Acts as a proxy between MCP clients and servers.
 * 
 * Usage:
 *   reloaderoo [options] -- <command> [args...]
 *   reloaderoo info
 * 
 * Example:
 *   reloaderoo -- node /path/to/my-mcp-server.js
 *   reloaderoo --log-level debug -- python server.py --port 8080
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { getEnvironmentConfig } from '../config.js';
import { createProxyCommand } from '../cli/commands/proxy.js';
import { createInspectCommand } from '../cli/commands/inspect.js';

/**
 * Load version from package.json dynamically
 */
function getVersion(): string {
  try {
    // In ES modules, we need to use import.meta.url to get the current file path
    // For built files: dist/bin/reloaderoo.js -> need to go up 2 levels to reach package.json
    const currentDir = typeof __dirname !== 'undefined' 
      ? __dirname 
      : dirname(new URL(import.meta.url).pathname);
    
    // Try multiple potential package.json locations to be safe
    const possiblePaths = [
      resolve(currentDir, '../../package.json'),  // From dist/bin/ to root
      resolve(currentDir, '../package.json'),     // From dist/ to root  
      resolve(currentDir, './package.json'),      // Same directory
    ];
    
    for (const packagePath of possiblePaths) {
      try {
        const packageData = JSON.parse(readFileSync(packagePath, 'utf8'));
        if (packageData.version) {
          return packageData.version;
        }
      } catch {
        // Try next path
        continue;
      }
    }
    
    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}


// Create the main CLI program
const program = new Command();

program
  .name('reloaderoo')
  .description('A transparent MCP development wrapper for hot-reloading servers')
  .version(getVersion())
  .addHelpText('after', `
Examples:
  $ reloaderoo proxy -- node server.js                    # Run as MCP proxy server
  $ reloaderoo inspect list-tools -- node server.js       # List tools via CLI
  $ reloaderoo inspect mcp -- node server.js              # Run as MCP inspection server
  $ reloaderoo inspect call-tool get_weather --params '{"location": "London"}' -- node server.js
  $ reloaderoo info                                        # Show system info

Environment Variables:
  MCPDEV_PROXY_LOG_LEVEL      Set default log level
  MCPDEV_PROXY_LOG_FILE       Custom log file path
  MCPDEV_PROXY_RESTART_LIMIT  Default restart limit
  MCPDEV_PROXY_AUTO_RESTART   Enable/disable auto-restart (true/false)
  MCPDEV_PROXY_TIMEOUT        Operation timeout in milliseconds
  MCPDEV_PROXY_CWD            Default working directory
  MCPDEV_PROXY_DEBUG_MODE     Enable debug mode (true/false)

For backward compatibility, running without a subcommand defaults to 'proxy' mode.
`);

// Add subcommands
program.addCommand(createProxyCommand());
program.addCommand(createInspectCommand());

// Info subcommand for diagnostics
program
  .command('info')
  .description('Display version and configuration information')
  .option('-v, --verbose', 'Show detailed information')
  .action((options) => {
    const version = getVersion();
    
    process.stdout.write(`reloaderoo v${version}\n`);
    process.stdout.write('\n');
    
    // Basic info
    process.stdout.write('System Information:\n');
    process.stdout.write(`  Node Version: ${process.version}\n`);
    process.stdout.write(`  Platform: ${process.platform}\n`);
    process.stdout.write(`  Architecture: ${process.arch}\n`);
    process.stdout.write(`  Working Directory: ${process.cwd()}\n`);
    process.stdout.write('\n');
    
    // Environment configuration
    const envConfig = getEnvironmentConfig();
    if (Object.keys(envConfig).length > 0) {
      process.stdout.write('Environment Configuration:\n');
      Object.entries(envConfig).forEach(([key, value]) => {
        if (key === 'environment') return; // Skip child env vars
        process.stdout.write(`  ${key}: ${JSON.stringify(value)}\n`);
      });
      process.stdout.write('\n');
    }
    
    // Verbose mode - check common MCP servers
    if (options.verbose) {
      process.stdout.write('Common MCP Server Checks:\n');
      
      const commonCommands = ['node', 'python', 'python3', 'npm', 'npx', 'deno', 'bun'];
      commonCommands.forEach(cmd => {
        process.stdout.write(`  ${cmd}: (skipped - command validation removed in refactor)\n`);
      });
      process.stdout.write('\n');
      
      // Environment variables
      process.stdout.write('MCP-related Environment Variables:\n');
      Object.entries(process.env)
        .filter(([key]) => key.startsWith('MCP') || key.startsWith('MCPDEV'))
        .forEach(([key, value]) => {
          process.stdout.write(`  ${key}=${value}\n`);
        });
    }
    
    process.stdout.write('\nFor more information: https://github.com/your-org/reloaderoo\n');
  });

/**
 * Main CLI function - exported for use by index.ts
 */
export async function runCLI(): Promise<void> {
  try {
    // Handle backward compatibility: if no subcommand provided and -- exists, default to proxy
    const dashIndex = process.argv.indexOf('--');
    const hasValidSubcommand = process.argv.length > 2 && 
      ['proxy', 'inspect', 'info'].includes(process.argv[2]!);
    
    if (!hasValidSubcommand && dashIndex !== -1) {
      // Insert 'proxy' before parsing for backward compatibility
      process.argv.splice(2, 0, 'proxy');
    }
    
    program.parse(process.argv);
    
    // If no command was provided and no --, show help
    if (process.argv.length === 2) {
      program.help();
    }
  } catch (error) {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    process.exit(1);
  }
}

// If this file is run directly (not imported), execute CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI();
}