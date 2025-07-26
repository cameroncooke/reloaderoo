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
  const timeout = parseInt(options.timeout);
  if (isNaN(timeout) || timeout <= 0) {
    throw new Error(`Invalid timeout value: ${options.timeout}`);
  }

  return {
    command,
    args,
    workingDirectory: options.workingDir || process.cwd(),
    timeout: timeout || 30000
  };
}

/**
 * Create a standard inspection action handler that eliminates code duplication
 */
function createInspectionAction<T>(
  commandName: string | ((args: any[]) => string),
  operation: (client: SimpleClient, ...args: any[]) => Promise<T>
) {
  return async (...args: any[]) => {
    // Extract options (always the last argument from commander)
    const options = args[args.length - 1];
    const commandArgs = args.slice(0, -1); // Remove options from args
    
    // Parse child command from process.argv
    const child = parseChildCommand(process.argv);
    if (!child) {
      OutputFormatter.outputError(new Error('Child command required after --'));
      return;
    }

    // Create client configuration
    const config = createClientConfig(child.command, child.args, options);
    
    // Determine command name for timing
    const timingName = typeof commandName === 'function' 
      ? commandName(commandArgs) 
      : commandName;
    
    // Execute operation with timing
    await OutputFormatter.executeWithTiming(
      timingName,
      async () => {
        return await SimpleClient.executeOperation(config, async (client) => {
          return await operation(client, ...commandArgs);
        });
      },
      options.raw
    );
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
      .action(createInspectionAction('server-info', async (client) => {
        return await client.getServerInfo();
      }))
  );

  // List tools command
  addCommonOptions(
    inspect.command('list-tools')
      .description('List all available tools')
      .action(createInspectionAction('list-tools', async (client) => {
        const tools = await client.listTools();
        return { tools };
      }))
  );

  // Call tool command
  addCommonOptions(
    inspect.command('call-tool <name>')
      .description('Call a specific tool')
      .option('-p, --params <json>', 'Tool parameters as JSON string')
      .action(createInspectionAction(
        (args) => `call-tool:${args[0]}`, 
        async (client, name: string, options) => {
          let params: unknown = undefined;
          if (options.params) {
            try {
              params = JSON.parse(options.params);
            } catch (error) {
              throw new Error(`Invalid JSON parameters: ${error}`);
            }
          }
          return await client.callTool(name, params);
        }
      ))
  );

  // List resources command
  addCommonOptions(
    inspect.command('list-resources')
      .description('List all available resources')
      .action(createInspectionAction('list-resources', async (client) => {
        const resources = await client.listResources();
        return { resources };
      }))
  );

  // Read resource command
  addCommonOptions(
    inspect.command('read-resource <uri>')
      .description('Read a specific resource')
      .action(createInspectionAction(
        (args) => `read-resource:${args[0]}`,
        async (client, uri: string) => {
          return await client.readResource(uri);
        }
      ))
  );

  // List prompts command
  addCommonOptions(
    inspect.command('list-prompts')
      .description('List all available prompts')
      .action(createInspectionAction('list-prompts', async (client) => {
        const prompts = await client.listPrompts();
        return { prompts };
      }))
  );

  // Get prompt command
  addCommonOptions(
    inspect.command('get-prompt <name>')
      .description('Get a specific prompt')
      .option('-a, --args <json>', 'Prompt arguments as JSON string')
      .action(createInspectionAction(
        (args) => `get-prompt:${args[0]}`,
        async (client, name: string, options) => {
          let args: Record<string, string> | undefined = undefined;
          if (options.args) {
            try {
              args = JSON.parse(options.args);
            } catch (error) {
              throw new Error(`Invalid JSON arguments: ${error}`);
            }
          }
          return await client.getPrompt(name, args);
        }
      ))
  );

  // Ping command
  addCommonOptions(
    inspect.command('ping')
      .description('Check server connectivity')
      .action(createInspectionAction('ping', async (client) => {
        const alive = await client.ping();
        return { alive, timestamp: new Date().toISOString() };
      }))
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
        const timeout = parseInt(options.timeout);
        if (isNaN(timeout) || timeout <= 0) {
          throw new Error(`Invalid timeout value: ${options.timeout}`);
        }

        const restartLimit = 3;
        if (restartLimit < 0 || restartLimit > 10) {
          throw new Error(`Invalid restart limit: ${restartLimit}`);
        }

        const proxyConfig: ProxyConfig = {
          childCommand: child.command,
          childArgs: child.args,
          workingDirectory: options.workingDir || process.cwd(),
          environment: process.env as Record<string, string>,
          restartLimit,
          operationTimeout: timeout || 30000,
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