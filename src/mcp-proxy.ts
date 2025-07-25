/**
 * Reloaderoo - Production Implementation
 * 
 * A transparent proxy that enables hot-reloading of MCP servers during development
 * while maintaining client session state. Supports the full MCP protocol including
 * tools, resources, prompts, completion, sampling, and ping.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  // Tools
  ListToolsRequestSchema,
  CallToolRequestSchema,
  // Prompts  
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  // Resources
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  // Completion
  CompleteRequestSchema,
  // Sampling
  CreateMessageRequestSchema,
  // Core
  PingRequestSchema,
  // Types
  Tool,
  CallToolResult,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from './mcp-logger.js';
import { MCP_PROTOCOL, PROXY_TOOLS } from './constants.js';
import type { ProxyConfig } from './types.js';
import {
  ToolRequestHandler,
  ResourceRequestHandler,
  PromptRequestHandler,
  CompletionRequestHandler,
  CoreRequestHandler
} from './handlers/index.js';

/**
 * Production-ready Reloaderoo with full protocol support
 */
export class MCPProxy {
  private readonly config: ProxyConfig;
  private readonly server: Server;
  private childClient: Client | null = null;
  private childTransport: StdioClientTransport | null = null;
  private isShuttingDown = false;
  private restartInProgress = false;
  private childTools: Tool[] = [];
  
  // Request handlers
  private toolHandler: ToolRequestHandler;
  private resourceHandler: ResourceRequestHandler;
  private promptHandler: PromptRequestHandler;
  private completionHandler: CompletionRequestHandler;
  private coreHandler: CoreRequestHandler;

  constructor(config: ProxyConfig) {
    this.config = config;
    
    // Create proxy server with full capabilities
    this.server = new Server(
      {
        name: `${this.extractServerName()}-dev`,
        version: '1.0.0-dev'
      },
      {
        capabilities: {
          tools: { listChanged: true },
          prompts: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          completion: { argument: true },
          sampling: {}
        }
      }
    );

    // Initialize request handlers
    this.toolHandler = new ToolRequestHandler(
      this.childClient,
      this.childTools,
      this.handleRestartServer.bind(this)
    );
    this.resourceHandler = new ResourceRequestHandler(this.childClient);
    this.promptHandler = new PromptRequestHandler(this.childClient);
    this.completionHandler = new CompletionRequestHandler(this.childClient);
    this.coreHandler = new CoreRequestHandler(this.childClient);

    this.setupRequestHandlers();
    this.setupErrorHandling();
  }

  /**
   * Start the proxy and connect to child server
   */
  async start(): Promise<void> {
    logger.info('Starting Reloaderoo', {
      childCommand: this.config.childCommand,
      childArgs: this.config.childArgs
    });

    // Start child server first
    await this.startChildServer();

    // Connect proxy server to stdio
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    logger.info('Reloaderoo started successfully');
  }

  /**
   * Stop the proxy and cleanup resources
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('Stopping Reloaderoo');

    try {
      await this.stopChildServer();
      await this.server.close();
    } catch (error) {
      logger.error('Error during shutdown', { error });
    }
  }

  /**
   * Start or restart the child MCP server
   */
  private async startChildServer(): Promise<void> {
    await this.stopChildServer();

    logger.info('Starting child MCP server', {
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
        name: 'reloaderoo',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
          completion: {},
          sampling: {}
        }
      }
    );

    // Connect to child via stdio
    await this.childClient.connect(this.childTransport);

    // Try to access child process for stderr capture
    try {
      // Check if transport exposes stderr stream
      const transport = this.childTransport as any;
      if (transport._stderrStream) {
        logger.debug('Found child stderr stream, setting up capture', undefined, 'RELOADEROO');
        transport._stderrStream.on('data', (data: Buffer) => {
          const output = data.toString().trim();
          if (output) {
            logger.info(output, undefined, 'CHILD-MCP');
          }
        });
      } else if (transport._process && transport._process.stderr) {
        logger.debug('Found child process stderr, setting up capture', undefined, 'RELOADEROO');
        transport._process.stderr.on('data', (data: Buffer) => {
          const output = data.toString().trim();
          if (output) {
            logger.info(output, undefined, 'CHILD-MCP');
          }
        });
      } else if (transport._process) {
        logger.debug('Found _process property, setting up stderr capture', undefined, 'RELOADEROO');
        transport._process.stderr.on('data', (data: Buffer) => {
          const output = data.toString().trim();
          if (output) {
            logger.info(output, undefined, 'CHILD-MCP');
          }
        });
      } else {
        logger.debug('No stderr access available from transport', {
          hasStderrStream: !!transport._stderrStream,
          hasProcess: !!transport._process,
          transportKeys: Object.keys(transport)
        }, 'RELOADEROO');
      }
    } catch (error) {
      logger.debug('Error setting up stderr capture', { error }, 'RELOADEROO');
    }

    // Mirror child capabilities
    await this.mirrorChildCapabilities();

    logger.info('Connected to child MCP server successfully');
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
      this.childTools = [];
      this.updateHandlersWithChildClient();
    }

    if (this.childTransport) {
      try {
        await this.childTransport.close();
      } catch (error) {
        logger.debug('Error closing child transport', { error });
      }
      this.childTransport = null;
    }

    this.childTools = [];
  }

  /**
   * Mirror tools and other capabilities from child server
   */
  private async mirrorChildCapabilities(): Promise<void> {
    if (!this.childClient) {
      throw new Error('Child client not connected');
    }

    try {
      // Get tools from child
      const toolsResult = await this.childClient.listTools();

      this.childTools = toolsResult.tools || [];
      
      // Update handlers with new child client and tools
      this.updateHandlersWithChildClient();
      
      logger.debug('Mirrored child capabilities', {
        toolCount: this.childTools.length,
        toolNames: this.childTools.map(t => t.name)
      });

      // Notify about capability changes if this is a restart
      if (this.restartInProgress) {
        await this.notifyCapabilityChanges();
        this.restartInProgress = false;
      }

    } catch (error) {
      logger.error('Failed to mirror child capabilities', { error });
      
      // If the child server doesn't support tools/list, continue anyway
      // This makes Reloaderoo compatible with incomplete MCP implementations
      if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) {
        logger.warn('Child server does not support tools/list - continuing with empty tool list');
        this.childTools = [];
        this.updateHandlersWithChildClient();
        
        if (this.restartInProgress) {
          this.restartInProgress = false;
        }
        return;
      }
      
      // For other errors, still throw to prevent startup with broken child
      throw error;
    }
  }

  /**
   * Send notifications about capability changes after restart
   */
  private async notifyCapabilityChanges(): Promise<void> {
    try {
      // Notify tools changed
      await this.server.notification({
        method: MCP_PROTOCOL.NOTIFICATIONS.TOOLS_LIST_CHANGED
      });

      // Notify other capabilities if supported
      await this.server.notification({
        method: MCP_PROTOCOL.NOTIFICATIONS.PROMPTS_LIST_CHANGED
      });

      await this.server.notification({
        method: MCP_PROTOCOL.NOTIFICATIONS.RESOURCES_LIST_CHANGED
      });

      logger.debug('Sent capability change notifications');
    } catch (error) {
      logger.debug('Error sending notifications', { error });
    }
  }

  /**
   * Setup all MCP request handlers using dedicated handler classes
   */
  private setupRequestHandlers(): void {
    // Tools
    this.server.setRequestHandler(ListToolsRequestSchema, (request) => 
      this.toolHandler.handleListTools(request)
    );
    this.server.setRequestHandler(CallToolRequestSchema, (request) => 
      this.toolHandler.handleCallTool(request)
    );
    
    // Prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, (request) => 
      this.promptHandler.handleListPrompts(request)
    );
    this.server.setRequestHandler(GetPromptRequestSchema, (request) => 
      this.promptHandler.handleGetPrompt(request)
    );
    
    // Resources
    this.server.setRequestHandler(ListResourcesRequestSchema, (request) => 
      this.resourceHandler.handleListResources(request)
    );
    this.server.setRequestHandler(ReadResourceRequestSchema, (request) => 
      this.resourceHandler.handleReadResource(request)
    );
    
    // Completion
    this.server.setRequestHandler(CompleteRequestSchema, (request) => 
      this.completionHandler.handleComplete(request)
    );
    
    // Sampling
    this.server.setRequestHandler(CreateMessageRequestSchema, (request) => 
      this.completionHandler.handleCreateMessage(request)
    );
    
    // Core
    this.server.setRequestHandler(PingRequestSchema, (request) => 
      this.coreHandler.handlePing(request)
    );
  }

  /**
   * Setup tool-related request handlers
   */
  private updateHandlersWithChildClient(): void {
    this.toolHandler.updateChildClient(this.childClient);
    this.toolHandler.updateChildTools(this.childTools);
    this.resourceHandler.updateChildClient(this.childClient);
    this.promptHandler.updateChildClient(this.childClient);
    this.completionHandler.updateChildClient(this.childClient);
    this.coreHandler.updateChildClient(this.childClient);
  }







  /**
   * Handle restart_server tool call
   */
  private async handleRestartServer(args: any): Promise<CallToolResult> {
    const force = args?.force || false;

    try {
      logger.info(`Executing ${PROXY_TOOLS.RESTART_SERVER} tool`, { force });
      
      this.restartInProgress = true;
      await this.startChildServer();

      return {
        content: [{
          type: 'text',
          text: 'Child MCP server restarted successfully. New capabilities have been loaded.'
        }]
      };

    } catch (error) {
      this.restartInProgress = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to restart child server', { error: errorMessage });

      return {
        content: [{
          type: 'text', 
          text: `Failed to restart child server: ${errorMessage}`
        }],
        isError: true
      };
    }
  }


  /**
   * Setup error handling for the proxy
   */
  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      logger.error('Proxy server error', { error });
    };

    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
  }

  /**
   * Handle process shutdown signals
   */
  private async handleShutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, shutting down gracefully`);
    await this.stop();
    process.exit(0);
  }

  /**
   * Extract server name from child command for proxy naming
   */
  private extractServerName(): string {
    const command = this.config.childCommand;
    if (!command || typeof command !== 'string') {
      return 'mcp-server';
    }
    const parts = command.split(/[\\/]/);
    const filename = parts[parts.length - 1] || 'mcp-server';
    return filename.replace(/\.(js|ts|py|rb|go)$/, '') || 'mcp-server';
  }
}