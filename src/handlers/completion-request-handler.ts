/**
 * Completion and Sampling Request Handler
 * 
 * Handles MCP completion and sampling requests by forwarding them to the child server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { 
  ErrorCode, 
  McpError,
  CompleteRequest,
  CreateMessageRequest,
  CompleteResult,
  CreateMessageResult
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../mcp-logger.js';

export class CompletionRequestHandler {
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
   * Handle completion request
   */
  async handleComplete(request: CompleteRequest): Promise<CompleteResult> {
    if (!this.childClient) {
      throw new McpError(
        ErrorCode.InternalError,
        'Child server not available'
      );
    }

    try {
      const result = await this.childClient.complete(request.params);
      logger.debug('Completion request processed', { 
        ref: request.params.ref 
      }, 'PROXY-COMPLETION');
      return result;
    } catch (error) {
      logger.debug('Failed to process completion', { 
        ref: request.params.ref,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'PROXY-COMPLETION');
      throw error;
    }
  }

  /**
   * Handle sampling request (create message)
   */
  async handleCreateMessage(_request: CreateMessageRequest): Promise<CreateMessageResult> {
    if (!this.childClient) {
      throw new McpError(
        ErrorCode.InternalError,
        'Child server not available'
      );
    }

    try {
      // Note: Simplified forwarding - in a full implementation, 
      // this would use proper MCP client sampling methods
      throw new McpError(
        ErrorCode.MethodNotFound,
        'Sampling not yet supported'
      );
    } catch (error) {
      logger.debug('Failed to process sampling request', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'PROXY-SAMPLING');
      throw error;
    }
  }
}