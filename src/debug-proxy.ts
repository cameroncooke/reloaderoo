/**
 * Debug Proxy for Reloaderoo
 * 
 * When running with --debug-mode, Reloaderoo becomes an MCP inspection server
 * that exposes tools for debugging and testing other MCP servers.
 * Each tool maps directly to an MCP protocol method.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SimpleClient } from './cli/simple-client.js';
import type { SimpleClientConfig } from './cli/simple-client.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  CallToolResult
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './mcp-logger.js';
import type { ProxyConfig } from './types.js';

/**
 * Debug proxy that exposes MCP protocol methods as inspection tools
 */
export class DebugProxy {
  private readonly config: ProxyConfig;
  private readonly server: Server;
  private readonly clientConfig: SimpleClientConfig;
  private isShuttingDown = false;

  constructor(config: ProxyConfig) {
    this.config = config;
    
    // Create SimpleClient config for child server
    this.clientConfig = {
      command: config.childCommand,
      args: config.childArgs,
      workingDirectory: config.workingDirectory,
      environment: config.environment,
      timeout: config.operationTimeout
    };
    
    // Create debug server with inspection tools
    this.server = new Server(
      {
        name: 'reloaderoo-inspector',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupDebugTools();
    this.setupErrorHandling();
  }

  /**
   * Start the debug proxy and connect to child server
   */
  async start(): Promise<void> {
    logger.info('Starting Reloaderoo in debug mode', {
      childCommand: this.config.childCommand,
      childArgs: this.config.childArgs
    });

    // Connect debug server to stdio
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Configure logger for MCP server mode
    logger.setMCPServer(this.server);
    
    // Send notifications after server is fully connected
    await this.sendCapabilityNotifications();
    
    logger.info('Reloaderoo debug mode started successfully');
  }

  /**
   * Stop the debug proxy and cleanup resources
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('Stopping Reloaderoo debug mode');

    try {
      await this.server.close();
    } catch (error) {
      logger.error('Error during shutdown', { error });
    }
  }


  /**
   * Send notifications about available capabilities
   */
  private async sendCapabilityNotifications(): Promise<void> {
    try {
      // Notify that tools are available (debug tools are always available)
      await this.server.notification({
        method: 'notifications/tools/list_changed'
      });
      
      logger.debug('Sent tools list changed notification');
    } catch (error) {
      logger.debug('Error sending capability notifications', { error });
    }
  }


  /**
   * Setup debug tool handlers
   */
  private setupDebugTools(): void {
    // List tools - expose debug inspection tools AND child server tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Start with debug inspection tools
      const debugTools = [
          {
            name: 'list_tools',
            description: 'List all tools available in the target MCP server',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'call_tool',
            description: 'Call a tool on the target MCP server and return the raw response',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Name of the tool to call'
                },
                arguments: {
                  type: 'object',
                  description: 'Arguments to pass to the tool',
                  additionalProperties: true
                }
              },
              required: ['name']
            }
          },
          {
            name: 'list_resources',
            description: 'List all resources available in the target MCP server',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'read_resource',
            description: 'Read a specific resource from the target MCP server',
            inputSchema: {
              type: 'object',
              properties: {
                uri: {
                  type: 'string',
                  description: 'URI of the resource to read'
                }
              },
              required: ['uri']
            }
          },
          {
            name: 'list_prompts',
            description: 'List all prompts available in the target MCP server',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'get_prompt',
            description: 'Get a specific prompt from the target MCP server',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Name of the prompt to get'
                },
                arguments: {
                  type: 'object',
                  description: 'Arguments to pass to the prompt',
                  additionalProperties: true
                }
              },
              required: ['name']
            }
          },
          {
            name: 'get_server_info',
            description: 'Get comprehensive information about the target MCP server including capabilities',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'ping',
            description: 'Ping the target MCP server to check connectivity',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          }
        ];

      // Only return debug/inspection tools
      return {
        tools: debugTools
      };
    });

    // Call tool handler - route to appropriate debug tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'list_tools':
          return this.handleListTools();
        case 'call_tool':
          return this.handleCallTool(args);
        case 'list_resources':
          return this.handleListResources();
        case 'read_resource':
          return this.handleReadResource(args);
        case 'list_prompts':
          return this.handleListPrompts();
        case 'get_prompt':
          return this.handleGetPrompt(args);
        case 'get_server_info':
          return this.handleGetServerInfo();
        case 'ping':
          return this.handlePing();
        default:
          // Unknown debug tool
          return {
            content: [{
              type: 'text',
              text: `Unknown debug tool: ${name}. Available tools: list_tools, call_tool, list_resources, read_resource, list_prompts, get_prompt, get_server_info, ping`
            }],
            isError: true
          };
      }
    });
  }


  /**
   * Handle list_tools debug tool
   */
  private async handleListTools(): Promise<CallToolResult> {
    try {
      const result = await SimpleClient.executeOperation(this.clientConfig, async (client) => {
        const tools = await client.listTools();
        return { tools };
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error listing tools: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }

  /**
   * Handle call_tool debug tool
   */
  private async handleCallTool(args: any): Promise<CallToolResult> {
    const toolName = args?.name;
    if (!toolName) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Tool name is required'
        }],
        isError: true
      };
    }

    try {
      const startTime = Date.now();
      const result = await SimpleClient.executeOperation(this.clientConfig, async (client) => {
        return await client.callTool(toolName, args.arguments || {});
      });
      const duration = Date.now() - startTime;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            result,
            metadata: {
              duration_ms: duration,
              tool_name: toolName
            }
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error calling tool '${toolName}': ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }

  /**
   * Handle list_resources debug tool
   */
  private async handleListResources(): Promise<CallToolResult> {
    try {
      const result = await SimpleClient.executeOperation(this.clientConfig, async (client) => {
        const resources = await client.listResources();
        return { resources };
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      // Resources might not be supported
      return {
        content: [{
          type: 'text',
          text: `Error listing resources: ${error instanceof Error ? error.message : 'Unknown error'}\n\nNote: The target server may not support resources.`
        }],
        isError: true
      };
    }
  }

  /**
   * Handle read_resource debug tool
   */
  private async handleReadResource(args: any): Promise<CallToolResult> {
    const uri = args?.uri;
    if (!uri) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Resource URI is required'
        }],
        isError: true
      };
    }

    try {
      const result = await SimpleClient.executeOperation(this.clientConfig, async (client) => {
        return await client.readResource(uri);
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error reading resource '${uri}': ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }

  /**
   * Handle list_prompts debug tool
   */
  private async handleListPrompts(): Promise<CallToolResult> {
    try {
      const result = await SimpleClient.executeOperation(this.clientConfig, async (client) => {
        const prompts = await client.listPrompts();
        return { prompts };
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      // Prompts might not be supported
      return {
        content: [{
          type: 'text',
          text: `Error listing prompts: ${error instanceof Error ? error.message : 'Unknown error'}\n\nNote: The target server may not support prompts.`
        }],
        isError: true
      };
    }
  }

  /**
   * Handle get_prompt debug tool
   */
  private async handleGetPrompt(args: any): Promise<CallToolResult> {
    const promptName = args?.name;
    if (!promptName) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Prompt name is required'
        }],
        isError: true
      };
    }

    try {
      const result = await SimpleClient.executeOperation(this.clientConfig, async (client) => {
        return await client.getPrompt(promptName, args.arguments || {});
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting prompt '${promptName}': ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }

  /**
   * Handle get_server_info debug tool
   */
  private async handleGetServerInfo(): Promise<CallToolResult> {
    try {
      const result = await SimpleClient.executeOperation(this.clientConfig, async (client) => {
        return await client.getServerInfo();
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error getting server info: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }

  /**
   * Handle ping debug tool
   */
  private async handlePing(): Promise<CallToolResult> {
    try {
      const startTime = Date.now();
      const result = await SimpleClient.executeOperation(this.clientConfig, async (client) => {
        return await client.ping();
      });
      const latency = Date.now() - startTime;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result,
            latency_ms: latency
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error pinging server: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }

  /**
   * Setup error handling for the debug proxy
   */
  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      logger.error('Debug proxy server error', { error });
    };

    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
  }

  /**
   * Handle process shutdown signals
   */
  private async handleShutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, shutting down debug mode gracefully`);
    await this.stop();
    process.exit(0);
  }
}