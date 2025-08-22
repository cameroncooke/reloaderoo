/**
 * Inspect command implementation
 * 
 * Provides CLI commands for inspecting and debugging MCP servers
 */

import { Command } from 'commander';
// Child process spawning is handled by StdioClientTransport
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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
 * Create a standard inspection action handler
 */
function createInspectionAction<T>(
  operation: (client: Client, ...args: any[]) => Promise<T>
) {
  return async (...args: any[]) => {
    // Extract options (second-to-last argument) and command args from commander
    const options = args[args.length - 2];
    const commandArgs = args.slice(0, -2); // Remove options and command from args
    
    // Parse child command from process.argv
    const childInfo = parseChildCommand(process.argv);
    if (!childInfo) {
      console.error(JSON.stringify({ error: 'Child command required after --' }, null, 2));
      process.exit(1);
    }

    let client: Client | undefined;

    // Set a timeout for the entire operation
    const timeout = parseInt(options.timeout || '30000', 10);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
    );

    try {
      const operationPromise = (async () => {
        // Create MCP client transport with stdio
        const transport = new StdioClientTransport({
          command: childInfo.command,
          args: childInfo.args,
          cwd: options.workingDir || process.cwd(),
          env: process.env as Record<string, string>,
          stderr: options.quiet ? 'ignore' : 'inherit'
        });
        
        client = new Client({
          name: 'reloaderoo-inspector',
          version: '1.0.0'
        }, {
          capabilities: {}
        });

        // Connect the client
        await client.connect(transport);

        // Execute the operation
        const result = await operation(client, ...commandArgs, options);
        
        // Output the raw result
        console.log(JSON.stringify(result, null, 2));
      })();

      await Promise.race([operationPromise, timeoutPromise]);

    } catch (error) {
      const errorOutput = {
        error: error instanceof Error ? error.message : String(error)
      };
      console.error(JSON.stringify(errorOutput, null, 2));
      process.exit(1);
    } finally {
      // Cleanup
      if (client) {
        try {
          await client.close();
        } catch {
          // Ignore cleanup errors
        }
      }
      // Transport cleanup is handled by client.close()
      process.exit(0);
    }
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
    `);

  // Common options for all inspect subcommands
  const addCommonOptions = (cmd: Command) => {
    return cmd
      .option('-w, --working-dir <dir>', 'Working directory for the child process')
      .option('-t, --timeout <ms>', 'Operation timeout in milliseconds', '30000')
      .option('-q, --quiet', 'Suppress child process stderr output');
  };

  // Server info command
  addCommonOptions(
    inspect.command('server-info')
      .description('Get server information and capabilities')
      .action(createInspectionAction(async (client) => {
        // Get server capabilities
        const capabilities = client.getServerCapabilities();
        // Return basic server info
        return {
          protocolVersion: '2024-11-05',
          capabilities
        };
      }))
  );

  // List tools command
  addCommonOptions(
    inspect.command('list-tools')
      .description('List all available tools')
      .action(createInspectionAction(async (client) => {
        const result = await client.listTools();
        return result;
      }))
  );

  // Call tool command
  addCommonOptions(
    inspect.command('call-tool <name>')
      .description('Call a specific tool')
      .option('-p, --params <json>', 'Tool parameters as JSON string')
      .action(createInspectionAction(async (client, name: string, options) => {
        let params: unknown = undefined;
        if (options.params) {
          try {
            params = JSON.parse(options.params);
          } catch (error) {
            throw new Error(`Invalid JSON parameters: ${error}`);
          }
        }
        const result = await client.callTool({
          name,
          arguments: params as Record<string, unknown> | undefined
        });
        return result;
      }))
  );

  // List resources command
  addCommonOptions(
    inspect.command('list-resources')
      .description('List all available resources')
      .action(createInspectionAction(async (client) => {
        const result = await client.listResources();
        return result;
      }))
  );

  // Read resource command
  addCommonOptions(
    inspect.command('read-resource <uri>')
      .description('Read a specific resource')
      .action(createInspectionAction(async (client, uri: string) => {
        const result = await client.readResource({
          uri
        });
        return result;
      }))
  );

  // List prompts command
  addCommonOptions(
    inspect.command('list-prompts')
      .description('List all available prompts')
      .action(createInspectionAction(async (client) => {
        const result = await client.listPrompts();
        return result;
      }))
  );

  // Get prompt command
  addCommonOptions(
    inspect.command('get-prompt <name>')
      .description('Get a specific prompt')
      .option('-a, --args <json>', 'Prompt arguments as JSON string')
      .action(createInspectionAction(async (client, name: string, options) => {
        let args: Record<string, string> | undefined = undefined;
        if (options.args) {
          try {
            args = JSON.parse(options.args);
          } catch (error) {
            throw new Error(`Invalid JSON arguments: ${error}`);
          }
        }
        const result = await client.getPrompt({
          name,
          arguments: args as Record<string, string> | undefined
        });
        return result;
      }))
  );

  // Ping command - Use proper MCP ping
  addCommonOptions(
    inspect.command('ping')
      .description('Check server connectivity')
      .action(createInspectionAction(async (client) => {
        const result = await client.ping();
        return result;
      }))
  );

  return inspect;
}