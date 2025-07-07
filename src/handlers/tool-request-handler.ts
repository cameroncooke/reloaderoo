/**
 * Tool Request Handler
 * 
 * Handles MCP tool-related requests including list tools and call tool operations.
 * Manages the restart_server tool locally and forwards other tool calls to the child server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { 
  Tool, 
  CallToolResult, 
  ErrorCode, 
  McpError,
  ListToolsRequest,
  CallToolRequest
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../mcp-logger.js';
import { PROXY_TOOLS } from '../constants.js';

export class ToolRequestHandler {
  private childTools: Tool[] = [];
  private childClient: Client | null = null;
  private handleRestartServer: (args: unknown) => Promise<CallToolResult>;

  constructor(
    childClient: Client | null,
    childTools: Tool[],
    handleRestartServer: (args: unknown) => Promise<CallToolResult>
  ) {
    this.childClient = childClient;
    this.childTools = childTools;
    this.handleRestartServer = handleRestartServer;
  }

  /**
   * Update the child client reference
   */
  updateChildClient(client: Client | null): void {
    this.childClient = client;
  }

  /**
   * Update the child tools list
   */
  updateChildTools(tools: Tool[]): void {
    this.childTools = tools;
  }

  /**
   * Handle list tools request
   */
  async handleListTools(_request: ListToolsRequest): Promise<{ tools: Tool[] }> {
    const allTools = [
      ...this.childTools,
      this.getRestartServerTool()
    ];

    return { tools: allTools };
  }

  /**
   * Handle call tool request
   */
  async handleCallTool(request: CallToolRequest): Promise<CallToolResult> {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    logger.debug(`Proxying tool call: ${name}`, { arguments: args }, 'PROXY-TOOL');

    if (name === PROXY_TOOLS.RESTART_SERVER) {
      const result = await this.handleRestartServer(args);
      logger.debug(`Tool call completed: ${name}`, { 
        duration_ms: Date.now() - startTime,
        success: !result.isError 
      }, 'PROXY-TOOL');
      return result;
    }

    // Forward to child
    if (!this.childClient) {
      throw new McpError(
        ErrorCode.InternalError,
        'Child server not available'
      );
    }

    try {
      const result = await this.childClient.callTool(request.params);
      logger.debug(`Tool call completed: ${name}`, { 
        duration_ms: Date.now() - startTime,
        success: true 
      }, 'PROXY-TOOL');
      return result as CallToolResult;
    } catch (error) {
      logger.debug(`Tool call failed: ${name}`, { 
        duration_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'PROXY-TOOL');
      throw error;
    }
  }

  /**
   * Get the restart_server tool definition
   */
  private getRestartServerTool(): Tool {
    return {
      name: PROXY_TOOLS.RESTART_SERVER,
      description: 'Restart the MCP server with optional configuration updates',
      inputSchema: {
        type: 'object',
        properties: {
          force: {
            type: 'boolean',
            description: 'Force restart even if one is already in progress',
            default: false
          },
          childCommand: {
            type: 'string',
            description: 'New command to run (optional)'
          },
          childArgs: {
            type: 'array',
            items: { type: 'string' },
            description: 'New command arguments (optional)'
          }
        },
        additionalProperties: false
      }
    };
  }
}