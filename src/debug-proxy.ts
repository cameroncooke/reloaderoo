/**
 * Debug Proxy for Reloaderoo
 * 
 * When running with --debug-mode, Reloaderoo becomes an MCP inspection server
 * that exposes tools for debugging and testing other MCP servers.
 * Each tool maps directly to an MCP protocol method.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  CallToolResult,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './mcp-logger.js';
import type { ProxyConfig } from './types.js';

/**
 * Debug proxy that exposes MCP protocol methods as inspection tools
 */
export class DebugProxy {
  private readonly config: ProxyConfig;
  private readonly server: Server;
  private childClient: Client | null = null;
  private childTransport: StdioClientTransport | null = null;
  private isShuttingDown = false;
  private childServerInfo: any = null;

  constructor(config: ProxyConfig) {
    this.config = config;
    
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

    // Start child server first
    await this.startChildServer();

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
      await this.stopChildServer();
      await this.server.close();
    } catch (error) {
      logger.error('Error during shutdown', { error });
    }
  }

  /**
   * Start the child MCP server
   */
  private async startChildServer(): Promise<void> {
    await this.stopChildServer();

    logger.info('Starting child MCP server for inspection', {
      command: this.config.childCommand,
      args: this.config.childArgs
    });

    // Create transport and client for child communication
    // This will spawn the child process automatically
    this.childTransport = new StdioClientTransport({
      command: this.config.childCommand,
      args: this.config.childArgs,
      env: this.config.environment
    });

    this.childClient = new Client(
      {
        name: 'reloaderoo-inspector',
        version: '1.0.0'
      },
      {
        capabilities: {}
      }
    );

    // Connect to child via stdio
    await this.childClient.connect(this.childTransport);

    // Store server info for later inspection
    // The client doesn't expose server info directly, we'll get it from tools/resources/prompts
    this.childServerInfo = {
      protocolVersion: '2024-11-05',
      capabilities: {},
      serverInfo: { name: 'unknown', version: 'unknown' }
    };
    
    // Try to get capabilities by querying available features
    try {
      const tools = await this.childClient.listTools();
      this.childServerInfo.capabilities.tools = {};
      logger.debug('Child server supports tools', { count: tools.tools?.length || 0 });
    } catch (error) {
      logger.debug('Child server does not support tools');
    }

    logger.info('Connected to child MCP server for inspection', {
      serverName: this.childServerInfo?.serverInfo?.name,
      serverVersion: this.childServerInfo?.serverInfo?.version
    });
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

      // Check if child server supports resources and send notification if so
      if (this.childClient) {
        try {
          await this.childClient.listResources();
          await this.server.notification({
            method: 'notifications/resources/list_changed'
          });
          logger.debug('Sent resources list changed notification');
        } catch (error) {
          // Child server doesn't support resources, no notification needed
        }

        // Check if child server supports prompts and send notification if so  
        try {
          await this.childClient.listPrompts();
          await this.server.notification({
            method: 'notifications/prompts/list_changed'
          });
          logger.debug('Sent prompts list changed notification');
        } catch (error) {
          // Child server doesn't support prompts, no notification needed
        }
      }
    } catch (error) {
      logger.debug('Error sending capability notifications', { error });
    }
  }

  /**
   * Stop the child MCP server
   */
  private async stopChildServer(): Promise<void> {
    if (this.childClient) {
      try {
        await this.childClient.close();
      } catch (error) {
        logger.debug('Error closing child client', { error });
      }
      this.childClient = null;
    }

    if (this.childTransport) {
      try {
        await this.childTransport.close();
      } catch (error) {
        logger.debug('Error closing child transport', { error });
      }
      this.childTransport = null;
    }

    this.childServerInfo = null;
  }

  /**
   * Setup debug tool handlers
   */
  private setupDebugTools(): void {
    // List tools - expose all debug inspection tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
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
        ]
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
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown debug tool: ${name}`
          );
      }
    });
  }

  /**
   * Handle list_tools debug tool
   */
  private async handleListTools(): Promise<CallToolResult> {
    if (!this.childClient) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Child server not connected'
        }],
        isError: true
      };
    }

    try {
      const result = await this.childClient.listTools();
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
    if (!this.childClient) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Child server not connected'
        }],
        isError: true
      };
    }

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
      const result = await this.childClient.callTool({
        name: toolName,
        arguments: args.arguments || {}
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
    if (!this.childClient) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Child server not connected'
        }],
        isError: true
      };
    }

    try {
      const result = await this.childClient.listResources();
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
    if (!this.childClient) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Child server not connected'
        }],
        isError: true
      };
    }

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
      const result = await this.childClient.readResource({ uri });
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
    if (!this.childClient) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Child server not connected'
        }],
        isError: true
      };
    }

    try {
      const result = await this.childClient.listPrompts();
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
    if (!this.childClient) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Child server not connected'
        }],
        isError: true
      };
    }

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
      const result = await this.childClient.getPrompt({
        name: promptName,
        arguments: args.arguments || {}
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
    if (!this.childServerInfo) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Server info not available. Child server may not be connected.'
        }],
        isError: true
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(this.childServerInfo, null, 2)
      }]
    };
  }

  /**
   * Handle ping debug tool
   */
  private async handlePing(): Promise<CallToolResult> {
    if (!this.childClient) {
      return {
        content: [{
          type: 'text',
          text: 'Error: Child server not connected'
        }],
        isError: true
      };
    }

    try {
      const startTime = Date.now();
      await this.childClient.ping();
      const latency = Date.now() - startTime;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
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