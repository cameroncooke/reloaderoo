/**
 * Prompt Request Handler
 * 
 * Handles MCP prompt-related requests by forwarding them to the child server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { 
  ErrorCode, 
  McpError,
  ListPromptsRequest,
  GetPromptRequest,
  Prompt,
  GetPromptResult
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../mcp-logger.js';

export class PromptRequestHandler {
  private childClient: Client | null = null;

  constructor(childClient: Client | null) {
    this.childClient = childClient;
  }

  /**
   * Update the child client reference
   */
  updateChildClient(client: Client | null): void {
    this.childClient = client;
  }

  /**
   * Handle list prompts request
   */
  async handleListPrompts(_request: ListPromptsRequest): Promise<{ prompts: Prompt[] }> {
    if (!this.childClient) {
      throw new McpError(
        ErrorCode.InternalError,
        'Child server not available'
      );
    }

    try {
      const result = await this.childClient.listPrompts();
      logger.debug('Listed prompts', { count: result.prompts.length }, 'PROXY-PROMPT');
      return result;
    } catch (error) {
      logger.debug('Failed to list prompts', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'PROXY-PROMPT');
      throw error;
    }
  }

  /**
   * Handle get prompt request
   */
  async handleGetPrompt(request: GetPromptRequest): Promise<GetPromptResult> {
    if (!this.childClient) {
      throw new McpError(
        ErrorCode.InternalError,
        'Child server not available'
      );
    }

    try {
      const result = await this.childClient.getPrompt(request.params);
      logger.debug('Got prompt', { name: request.params.name }, 'PROXY-PROMPT');
      return result;
    } catch (error) {
      logger.debug('Failed to get prompt', { 
        name: request.params.name,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'PROXY-PROMPT');
      throw error;
    }
  }
}