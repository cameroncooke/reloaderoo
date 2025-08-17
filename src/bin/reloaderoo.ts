#!/usr/bin/env node

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
import { fileURLToPath } from 'url';
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
      : dirname(fileURLToPath(import.meta.url));

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

    // No package.json found in any location
    process.stderr.write('Warning: Could not find package.json in any expected location\n');
    return '0.0.0';
  } catch (error) {
    // Unexpected error during version lookup
    process.stderr.write(`Warning: Could not read package.json: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    return '0.0.0';
  }
}


// Create the main CLI program
const program = new Command();

program
  .name('reloaderoo')
  .description('Two modes, one tool:\n• Proxy MCP server that adds support for hot-reloading MCP servers.\n• CLI tool for inspecting MCP servers.')
  .version(getVersion())
  .addHelpText('after', `
Examples:
  # MCP Server Mode:
  $ reloaderoo -- node my-server.js                       # Hot-reloadable MCP proxy server
  $ reloaderoo proxy -- python server.py                 # Explicit proxy mode
  
  # CLI Tools Mode:
  $ reloaderoo inspect list-tools -- node server.js      # Debug server tools
  $ reloaderoo inspect call-tool weather --params '{"location": "NYC"}' -- node server.js
  $ reloaderoo info                                       # System information

Mode Selection:
  • No arguments or just '--' → MCP server mode
  • CLI arguments/flags        → CLI tools mode  

Environment Variables:
  MCPDEV_PROXY_LOG_LEVEL      Set default log level
  MCPDEV_PROXY_LOG_FILE       Custom log file path  
  MCPDEV_PROXY_RESTART_LIMIT  Default restart limit
  MCPDEV_PROXY_AUTO_RESTART   Enable/disable auto-restart (true/false)
  MCPDEV_PROXY_TIMEOUT        Operation timeout in milliseconds
  MCPDEV_PROXY_CWD            Default working directory
  MCPDEV_PROXY_DEBUG_MODE     Enable debug mode (true/false)
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

    // Verbose mode - show environment variables
    if (options.verbose) {
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
 * Determine if we should run in CLI mode based on arguments
 */
function shouldRunCLI(): boolean {
  // If we have CLI-specific arguments, run CLI mode
  const args = process.argv.slice(2);

  // No arguments = MCP server mode (proxy mode)
  if (args.length === 0) {
    return false;
  }

  // Explicit subcommands = CLI mode
  if (['proxy', 'inspect', 'info', 'help'].includes(args[0]!)) {
    return true;
  }

  // Standard CLI flags = CLI mode
  if (args.some(arg => ['--help', '-h', '--version', '-V'].includes(arg))) {
    return true;
  }

  // If we have -- separator, treat as proxy mode (backward compatibility)
  if (args.includes('--')) {
    return false;
  }

  // Default: if we have any arguments, assume CLI mode
  return args.length > 0;
}

/**
 * Run in MCP server mode (proxy mode with default behavior)
 */
async function runMCPServer(): Promise<void> {
  // Check if child command is provided via --
  const dashIndex = process.argv.indexOf('--');

  if (dashIndex === -1 || dashIndex >= process.argv.length - 1) {
    // No child command provided - show helpful message
    process.stderr.write('reloaderoo: MCP development proxy server\n');
    process.stderr.write('\n');
    process.stderr.write('Error: Child MCP server command is required\n');
    process.stderr.write('Usage: reloaderoo -- <child-command> [args...]\n');
    process.stderr.write('\n');
    process.stderr.write('Examples:\n');
    process.stderr.write('  reloaderoo -- node my-mcp-server.js\n');
    process.stderr.write('  reloaderoo -- python server.py --port 8080\n');
    process.stderr.write('\n');
    process.stderr.write('💡 For CLI tools and debugging, use:\n');
    process.stderr.write('  reloaderoo --help              # Show all available commands\n');
    process.stderr.write('  reloaderoo inspect --help      # Show inspection tools\n');
    process.stderr.write('  reloaderoo info                # Show system information\n');
    process.stderr.write('\n');
    process.exit(1);
  }

  // Insert 'proxy' command and run CLI
  process.argv.splice(2, 0, 'proxy');
  return runCLI();
}

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

/**
 * Main entry point - decide between MCP server mode and CLI mode
 */
async function main(): Promise<void> {
  if (shouldRunCLI()) {
    await runCLI();
  } else {
    await runMCPServer();
  }
}

// If this file is run directly (not imported), execute main entry point
// Always run main when this is the main module (since it's in bin/)
main();