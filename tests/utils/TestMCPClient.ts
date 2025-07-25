/**
 * Test MCP Client for E2E testing
 * Provides utilities for sending MCP requests and validating responses
 */

import { MCPMessage } from './ReloaderooProcess.js';

export interface MCPRequest extends MCPMessage {
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse extends MCPMessage {
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class TestMCPClient {
  private requestId = 1;

  /**
   * Create an MCP request message
   */
  createRequest(method: string, params?: any): MCPRequest {
    return {
      jsonrpc: '2.0',
      id: this.requestId++,
      method,
      params
    };
  }

  /**
   * Create an initialize request
   */
  createInitializeRequest(): MCPRequest {
    return this.createRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    });
  }

  /**
   * Create a tools/list request
   */
  createListToolsRequest(): MCPRequest {
    return this.createRequest('tools/list');
  }

  /**
   * Create a tools/call request
   */
  createCallToolRequest(name: string, args?: any): MCPRequest {
    return this.createRequest('tools/call', {
      name,
      arguments: args || {}
    });
  }

  /**
   * Create a resources/list request
   */
  createListResourcesRequest(): MCPRequest {
    return this.createRequest('resources/list');
  }

  /**
   * Create a resources/read request
   */
  createReadResourceRequest(uri: string): MCPRequest {
    return this.createRequest('resources/read', { uri });
  }

  /**
   * Create a prompts/list request
   */
  createListPromptsRequest(): MCPRequest {
    return this.createRequest('prompts/list');
  }

  /**
   * Create a prompts/get request
   */
  createGetPromptRequest(name: string, args?: Record<string, string>): MCPRequest {
    return this.createRequest('prompts/get', {
      name,
      arguments: args || {}
    });
  }

  /**
   * Create a ping request
   */
  createPingRequest(): MCPRequest {
    return this.createRequest('ping');
  }

  /**
   * Validate that a message is a valid MCP response
   */
  isValidResponse(message: MCPMessage): message is MCPResponse {
    return (
      message.jsonrpc === '2.0' &&
      typeof message.id !== 'undefined' &&
      (message.result !== undefined || message.error !== undefined)
    );
  }

  /**
   * Validate that a response is successful (has result, no error)
   */
  isSuccessResponse(message: MCPMessage): boolean {
    return this.isValidResponse(message) && message.result !== undefined && !message.error;
  }

  /**
   * Validate that a response is an error (has error, no result)
   */
  isErrorResponse(message: MCPMessage): boolean {
    return this.isValidResponse(message) && message.error !== undefined;
  }

  /**
   * Extract error message from error response
   */
  getErrorMessage(message: MCPMessage): string {
    if (this.isErrorResponse(message)) {
      return (message as MCPResponse).error!.message;
    }
    return '';
  }

  /**
   * Validate tools/list response structure
   */
  validateToolsListResponse(response: MCPResponse): boolean {
    return (
      this.isSuccessResponse(response) &&
      response.result &&
      Array.isArray(response.result.tools) &&
      response.result.tools.every((tool: any) =>
        typeof tool.name === 'string' &&
        typeof tool.description === 'string' &&
        tool.inputSchema &&
        typeof tool.inputSchema === 'object'
      )
    );
  }

  /**
   * Validate tools/call response structure
   */
  validateToolCallResponse(response: MCPResponse): boolean {
    return (
      this.isSuccessResponse(response) &&
      response.result &&
      Array.isArray(response.result.content)
    );
  }

  /**
   * Validate server info response structure
   */
  validateServerInfoResponse(response: MCPResponse): boolean {
    return (
      this.isSuccessResponse(response) &&
      response.result &&
      typeof response.result.protocolVersion === 'string' &&
      typeof response.result.capabilities === 'object' &&
      response.result.serverInfo &&
      typeof response.result.serverInfo.name === 'string'
    );
  }

  /**
   * Find a tool by name in tools/list response
   */
  findToolInResponse(response: MCPResponse, toolName: string): any {
    if (!this.validateToolsListResponse(response)) {
      return null;
    }
    return response.result.tools.find((tool: any) => tool.name === toolName);
  }

  /**
   * Check if restart_server tool exists in tools/list response
   */
  hasRestartServerTool(response: MCPResponse): boolean {
    return this.findToolInResponse(response, 'restart_server') !== null;
  }

  /**
   * Get tool names from tools/list response
   */
  getToolNames(response: MCPResponse): string[] {
    if (!this.validateToolsListResponse(response)) {
      return [];
    }
    return response.result.tools.map((tool: any) => tool.name);
  }

  /**
   * Reset request ID counter (for test isolation)
   */
  resetRequestId(): void {
    this.requestId = 1;
  }
}