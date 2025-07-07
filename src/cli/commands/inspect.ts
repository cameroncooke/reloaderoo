/**
 * Inspect command implementation
 * 
 * Provides CLI commands for inspecting and debugging MCP servers
 */

import { Command } from 'commander';
import { SimpleClient } from '../simple-client.js';
import { OutputFormatter } from '../formatter.js';
import { DebugProxy } from '../../debug-proxy.js';
import type { ProxyConfig } from '../../types.js';
// import { logger } from '../../mcp-logger.js';
import type { SimpleClientConfig } from '../simple-client.js';

/**
 * Parse command and args from argv array after '--'
 */
function parseChildCommand(argv: string[]): { command: string; args: string[] } | null {
  const dashIndex = argv.indexOf('--');
  if (dashIndex === -1 || dashIndex >= argv.length - 1) {
    return null;
  }
  
  return {
    command: argv[dashIndex + 1]!,
    args: argv.slice(dashIndex + 2)
  };
}

/**
 * Create MCP client config from command options
 */
function createClientConfig(
  command: string,
  args: string[],
  options: any
): SimpleClientConfig {
  return {
    command,
    args,
    workingDirectory: options.workingDir || process.cwd(),
    timeout: parseInt(options.timeout) || 30000
  };
}

/**
 * Create the inspect command with all subcommands
 */
export function createInspectCommand(): Command {
  const inspect = new Command('inspect')
    .description('Inspect and debug MCP servers')
    .addHelpText('after', `
Examples:
  $ reloaderoo inspect list-tools -- node server.js
  $ reloaderoo inspect call-tool get_weather --params '{"location": "London"}' -- node server.js
  $ reloaderoo inspect server-info -- node server.js
  $ reloaderoo inspect mcp -- node server.js              # Start MCP inspection server
    `);

  // Common options for all inspect subcommands
  const addCommonOptions = (cmd: Command) => {
    return cmd
      .option('-w, --working-dir <dir>', 'Working directory for the child process')
      .option('-t, --timeout <ms>', 'Operation timeout in milliseconds', '30000')
      .option('--raw', 'Output raw JSON response without metadata wrapper');
  };

  // Server info command
  addCommonOptions(
    inspect.command('server-info')
      .description('Get server information and capabilities')
      .action(async (options) => {
        const child = parseChildCommand(process.argv);
        if (!child) {
          OutputFormatter.outputError(new Error('Child command required after --'));
          return;
        }

        const config = createClientConfig(child.command, child.args, options);
        
        await OutputFormatter.executeWithTiming(
          'server-info',
          async () => {
            return await SimpleClient.executeOperation(config, async (client) => {
              return await client.getServerInfo();
            });
          },
          options.raw
        );
      })
  );

  // List tools command
  addCommonOptions(
    inspect.command('list-tools')
      .description('List all available tools')
      .action(async (options) => {
        const child = parseChildCommand(process.argv);
        if (!child) {
          OutputFormatter.outputError(new Error('Child command required after --'));
          return;
        }

        const config = createClientConfig(child.command, child.args, options);
        
        await OutputFormatter.executeWithTiming(
          'list-tools',
          async () => {
            return await SimpleClient.executeOperation(config, async (client) => {
              const tools = await client.listTools();
              return { tools };
            });
          },
          options.raw
        );
      })
  );

  // Call tool command
  addCommonOptions(
    inspect.command('call-tool <name>')
      .description('Call a specific tool')
      .option('-p, --params <json>', 'Tool parameters as JSON string')
      .action(async (name: string, options) => {
        const child = parseChildCommand(process.argv);
        if (!child) {
          OutputFormatter.outputError(new Error('Child command required after --'));
          return;
        }

        let params: unknown = undefined;
        if (options.params) {
          try {
            params = JSON.parse(options.params);
          } catch (error) {
            OutputFormatter.outputError(new Error(`Invalid JSON parameters: ${error}`));
            return;
          }
        }

        const config = createClientConfig(child.command, child.args, options);
        
        await OutputFormatter.executeWithTiming(
          `call-tool:${name}`,
          async () => {
            return await SimpleClient.executeOperation(config, async (client) => {
              return await client.callTool(name, params);
            });
          },
          options.raw
        );
      })
  );

  // List resources command
  addCommonOptions(
    inspect.command('list-resources')
      .description('List all available resources')
      .action(async (options) => {
        const child = parseChildCommand(process.argv);
        if (!child) {
          OutputFormatter.outputError(new Error('Child command required after --'));
          return;
        }

        const config = createClientConfig(child.command, child.args, options);
        
        await OutputFormatter.executeWithTiming(
          'list-resources',
          async () => {
            return await SimpleClient.executeOperation(config, async (client) => {
              const resources = await client.listResources();
              return { resources };
            });
          },
          options.raw
        );
      })
  );

  // Read resource command
  addCommonOptions(
    inspect.command('read-resource <uri>')
      .description('Read a specific resource')
      .action(async (uri: string, options) => {
        const child = parseChildCommand(process.argv);
        if (!child) {
          OutputFormatter.outputError(new Error('Child command required after --'));
          return;
        }

        const config = createClientConfig(child.command, child.args, options);
        
        await OutputFormatter.executeWithTiming(
          `read-resource:${uri}`,
          async () => {
            return await SimpleClient.executeOperation(config, async (client) => {
              return await client.readResource(uri);
            });
          },
          options.raw
        );
      })
  );

  // List prompts command
  addCommonOptions(
    inspect.command('list-prompts')
      .description('List all available prompts')
      .action(async (options) => {
        const child = parseChildCommand(process.argv);
        if (!child) {
          OutputFormatter.outputError(new Error('Child command required after --'));
          return;
        }

        const config = createClientConfig(child.command, child.args, options);
        
        await OutputFormatter.executeWithTiming(
          'list-prompts',
          async () => {
            return await SimpleClient.executeOperation(config, async (client) => {
              const prompts = await client.listPrompts();
              return { prompts };
            });
          },
          options.raw
        );
      })
  );

  // Get prompt command
  addCommonOptions(
    inspect.command('get-prompt <name>')
      .description('Get a specific prompt')
      .option('-a, --args <json>', 'Prompt arguments as JSON string')
      .action(async (name: string, options) => {
        const child = parseChildCommand(process.argv);
        if (!child) {
          OutputFormatter.outputError(new Error('Child command required after --'));
          return;
        }

        let args: Record<string, string> | undefined = undefined;
        if (options.args) {
          try {
            args = JSON.parse(options.args);
          } catch (error) {
            OutputFormatter.outputError(new Error(`Invalid JSON arguments: ${error}`));
            return;
          }
        }

        const config = createClientConfig(child.command, child.args, options);
        
        await OutputFormatter.executeWithTiming(
          `get-prompt:${name}`,
          async () => {
            return await SimpleClient.executeOperation(config, async (client) => {
              return await client.getPrompt(name, args);
            });
          },
          options.raw
        );
      })
  );

  // Ping command
  addCommonOptions(
    inspect.command('ping')
      .description('Check server connectivity')
      .action(async (options) => {
        const child = parseChildCommand(process.argv);
        if (!child) {
          OutputFormatter.outputError(new Error('Child command required after --'));
          return;
        }

        const config = createClientConfig(child.command, child.args, options);
        
        await OutputFormatter.executeWithTiming(
          'ping',
          async () => {
            return await SimpleClient.executeOperation(config, async (client) => {
              const alive = await client.ping();
              return { alive, timestamp: new Date().toISOString() };
            });
          },
          options.raw
        );
      })
  );

  // MCP server command - starts debug proxy as MCP server
  addCommonOptions(
    inspect.command('mcp')
      .description('Start MCP inspection server (exposes debug tools as MCP server)')
      .option('-l, --log-level <level>', 'Log level (debug, info, notice, warning, error, critical)', 'info')
      .action(async (options) => {
        const child = parseChildCommand(process.argv);
        if (!child) {
          OutputFormatter.outputError(new Error('Child command required after --'));
          return;
        }

        // Create proxy configuration
        const proxyConfig: ProxyConfig = {
          childCommand: child.command,
          childArgs: child.args,
          workingDirectory: options.workingDir || process.cwd(),
          environment: process.env as Record<string, string>,
          restartLimit: 3,
          operationTimeout: parseInt(options.timeout) || 30000,
          logLevel: options.logLevel as any,
          autoRestart: true,
          restartDelay: 1000
        };

        // Start debug proxy as MCP server
        const debugProxy = new DebugProxy(proxyConfig);
        
        // Handle graceful shutdown
        const shutdown = async (signal: string) => {
          process.stderr.write(`\nReceived ${signal}, shutting down gracefully...\n`);
          await debugProxy.stop();
          process.exit(0);
        };
        
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        
        // Start the MCP inspection server
        await debugProxy.start();
      })
  );

  return inspect;
}