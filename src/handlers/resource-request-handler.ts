/**
 * Resource Request Handler
 * 
 * Handles MCP resource-related requests by forwarding them to the child server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { 
  ErrorCode, 
  McpError,
  ListResourcesRequest,
  ReadResourceRequest,
  Resource
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../mcp-logger.js';

export class ResourceRequestHandler {
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
   * Handle list resources request
   */
  async handleListResources(_request: ListResourcesRequest): Promise<{ resources: Resource[] }> {
    if (!this.childClient) {
      throw new McpError(
        ErrorCode.InternalError,
        'Child server not available'
      );
    }

    try {
      const result = await this.childClient.listResources();
      logger.debug('Listed resources', { count: result.resources.length }, 'PROXY-RESOURCE');
      return result;
    } catch (error) {
      logger.debug('Failed to list resources', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'PROXY-RESOURCE');
      throw error;
    }
  }

  /**
   * Handle read resource request
   */
  async handleReadResource(request: ReadResourceRequest): Promise<{ contents: any[] }> {
    if (!this.childClient) {
      throw new McpError(
        ErrorCode.InternalError,
        'Child server not available'
      );
    }

    try {
      const result = await this.childClient.readResource(request.params);
      logger.debug('Read resource', { uri: request.params.uri }, 'PROXY-RESOURCE');
      return result;
    } catch (error) {
      logger.debug('Failed to read resource', { 
        uri: request.params.uri,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'PROXY-RESOURCE');
      throw error;
    }
  }
}