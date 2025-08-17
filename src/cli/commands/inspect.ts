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
 * Create a standard inspection action handler
 */
function createInspectionAction<T>(
  operation: (client: Client, ...args: any[]) => Promise<T>
) {
  return async (...actionArgs: any[]) => {
    // Commander passes args in order: [named_args..., variadic_array, options, command]
    // We can reliably pop them off the end of the arguments array.
    actionArgs.pop(); // Discard the commandObject, it's not needed.
    const options = actionArgs.pop();
    const childCommandArr = actionArgs.pop() as string[] | undefined;
    // Whatever remains are the named arguments for the specific operation (e.g., <name>, <uri>)
    const operationArgs = actionArgs;

    // --- Validation of the child command ---
    if (!Array.isArray(childCommandArr) || childCommandArr.length === 0) {
      console.error(JSON.stringify({ error: 'Child command is required. Example: node server.js' }, null, 2));
      process.exit(1);
    }

    const childInfo = {
      command: childCommandArr[0]!,
      args: childCommandArr.slice(1)
    };

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

        // Execute the operation, passing the client, its specific arguments, and the options object
        const result = await operation(client, ...operationArgs, options);
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

  // Common options and argument for all inspect subcommands
  const addCommonOptions = (cmd: Command) => {
    return cmd
      .option('-w, --working-dir <dir>', 'Working directory for the child process')
      .option('-t, --timeout <ms>', 'Operation timeout in milliseconds', '30000')
      .option('-q, --quiet', 'Suppress child process stderr output')
      .argument('[child-command...]', 'The child command and its arguments to execute');
  };

  // Server info command
  addCommonOptions(
    inspect.command('server-info')
      .description('Get server information and capabilities')
      .action(createInspectionAction(async (client: Client) => {
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
      .action(createInspectionAction(async (client: Client) => {
        return client.listTools();
      }))
  );

  // Call tool command
  addCommonOptions(
    inspect.command('call-tool <name>')
      .description('Call a specific tool')
      .option('-p, --params <json>', 'Tool parameters as JSON string')
      .action(createInspectionAction(async (client: Client, name: string, options: any) => {
        let params: unknown = undefined;
        if (options.params) {
          try {
            params = JSON.parse(options.params);
          } catch (error) {
            throw new Error(`Invalid JSON parameters: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        return client.callTool({
          name,
          arguments: params as Record<string, unknown> | undefined
        });
      }))
  );

  // List resources command
  addCommonOptions(
    inspect.command('list-resources')
      .description('List all available resources')
      .action(createInspectionAction(async (client: Client) => {
        return client.listResources();
      }))
  );

  // Read resource command
  addCommonOptions(
    inspect.command('read-resource <uri>')
      .description('Read a specific resource')
      .action(createInspectionAction(async (client: Client, uri: string) => {
        return client.readResource({
          uri
        });
      }))
  );

  // List prompts command
  addCommonOptions(
    inspect.command('list-prompts')
      .description('List all available prompts')
      .action(createInspectionAction(async (client: Client) => {
        return client.listPrompts();
      }))
  );

  // Get prompt command
  addCommonOptions(
    inspect.command('get-prompt <name>')
      .description('Get a specific prompt')
      .option('-a, --args <json>', 'Prompt arguments as JSON string')
      .action(createInspectionAction(async (client: Client, name: string, options: any) => {
        let args: Record<string, string> | undefined = undefined;
        if (options.args) {
          try {
            args = JSON.parse(options.args);
          } catch (error) {
            throw new Error(`Invalid JSON arguments: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        return client.getPrompt({
          name,
          arguments: args as Record<string, string> | undefined
        });
      }))
  );

  // Ping command - Use proper MCP ping
  addCommonOptions(
    inspect.command('ping')
      .description('Check server connectivity')
      .action(createInspectionAction(async (client: Client) => {
        return client.ping();
      }))
  );

  return inspect;
}