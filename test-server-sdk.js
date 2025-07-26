#!/usr/bin/env node

/**
 * Test MCP server using the official @modelcontextprotocol/sdk
 * This provides a proper reference implementation for testing the proxy
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  PingRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

class TestMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'test-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.randomTools = this.generateRandomTools();
    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupPingHandler();
    this.setupErrorHandlers();
  }

  generateRandomTools() {
    const toolTemplates = [
      {
        name: 'fortune',
        description: 'Get a random fortune cookie message',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: () => {
          const fortunes = [
            "The best time to plant a tree was 20 years ago. The second best time is now.",
            "A journey of a thousand miles begins with a single step.",
            "The only way to do great work is to love what you do.",
            "Innovation distinguishes between a leader and a follower.",
            "Your limitation—it's only your imagination."
          ];
          return fortunes[Math.floor(Math.random() * fortunes.length)];
        }
      },
      {
        name: 'dice',
        description: 'Roll a dice and get a random number between 1 and 6',
        inputSchema: {
          type: 'object',
          properties: {
            sides: { type: 'number', description: 'Number of sides on the dice (default: 6)' }
          },
          required: []
        },
        handler: (args) => {
          const sides = args.sides || 6;
          const result = Math.floor(Math.random() * sides) + 1;
          return `🎲 Rolled a ${sides}-sided dice: ${result}`;
        }
      },
      {
        name: 'timestamp',
        description: 'Get the current timestamp',
        inputSchema: {
          type: 'object',
          properties: {
            format: { type: 'string', description: 'Format: "iso" or "unix" (default: iso)' }
          },
          required: []
        },
        handler: (args) => {
          const now = new Date();
          if (args.format === 'unix') {
            return `Unix timestamp: ${Math.floor(now.getTime() / 1000)}`;
          }
          return `ISO timestamp: ${now.toISOString()}`;
        }
      },
      {
        name: 'color',
        description: 'Generate a random color',
        inputSchema: {
          type: 'object',
          properties: {
            format: { type: 'string', description: 'Format: "hex", "rgb", or "name" (default: hex)' }
          },
          required: []
        },
        handler: (args) => {
          const r = Math.floor(Math.random() * 256);
          const g = Math.floor(Math.random() * 256);
          const b = Math.floor(Math.random() * 256);
          
          if (args.format === 'rgb') {
            return `RGB color: rgb(${r}, ${g}, ${b})`;
          } else if (args.format === 'name') {
            const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
            return `Random color: ${colors[Math.floor(Math.random() * colors.length)]}`;
          }
          return `Hex color: #${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
      },
      {
        name: 'quote',
        description: 'Get an inspirational quote',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: () => {
          const quotes = [
            "Be yourself; everyone else is already taken. - Oscar Wilde",
            "Two things are infinite: the universe and human stupidity. - Albert Einstein",
            "Be the change you wish to see in the world. - Mahatma Gandhi",
            "In the middle of difficulty lies opportunity. - Albert Einstein",
            "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt"
          ];
          return quotes[Math.floor(Math.random() * quotes.length)];
        }
      }
    ];

    // Randomly select 1-3 tools to add each time
    const numberOfTools = Math.floor(Math.random() * 3) + 1;
    const selectedTools = [];
    const shuffled = [...toolTemplates].sort(() => 0.5 - Math.random());
    
    for (let i = 0; i < numberOfTools && i < shuffled.length; i++) {
      const tool = shuffled[i];
      // Add a timestamp to make the tool name unique each restart
      const timestamp = Date.now().toString().slice(-4);
      selectedTools.push({
        name: `${tool.name}_${timestamp}`,
        description: `${tool.description} (Added at restart)`,
        inputSchema: tool.inputSchema,
        handler: tool.handler
      });
    }

    console.error(`[TestMCPServer] Generated ${numberOfTools} random tools: ${selectedTools.map(t => t.name).join(', ')}`);
    return selectedTools;
  }

  setupToolHandlers() {
    // List available tools (base tools + random tools)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const baseTools = [
        {
          name: 'echo',
          description: 'Echo back the input message',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Message to echo back'
              }
            },
            required: ['message']
          }
        },
        {
          name: 'add',
          description: 'Add two numbers together',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number', description: 'First number' },
              b: { type: 'number', description: 'Second number' }
            },
            required: ['a', 'b']
          }
        },
        {
          name: 'greet',
          description: 'Greet a person by name',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the person to greet'
              }
            },
            required: ['name']
          }
        }
      ];

      const randomToolSchemas = this.randomTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));

      return {
        tools: [...baseTools, ...randomToolSchemas]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Check base tools first
      switch (name) {
        case 'echo':
          if (!args.message) {
            return {
              content: [{
                type: 'text',
                text: 'Missing required parameter: message'
              }],
              isError: true
            };
          }
          return {
            content: [{
              type: 'text',
              text: `Echo: ${args.message}`
            }]
          };

        case 'add':
          if (args.a === undefined || args.b === undefined) {
            return {
              content: [{
                type: 'text',
                text: 'Missing required parameters: a and b are both required'
              }],
              isError: true
            };
          }
          const sum = args.a + args.b;
          return {
            content: [{
              type: 'text',
              text: `${args.a} + ${args.b} = ${sum}`
            }]
          };

        case 'greet':
          if (!args.name) {
            return {
              content: [{
                type: 'text',
                text: 'Missing required parameter: name'
              }],
              isError: true
            };
          }
          return {
            content: [{
              type: 'text',
              text: `Hello, ${args.name}! Welcome to the test MCP server.`
            }]
          };
      }

      // Check random tools
      const randomTool = this.randomTools.find(tool => tool.name === name);
      if (randomTool) {
        const result = randomTool.handler(args || {});
        return {
          content: [{
            type: 'text',
            text: result
          }]
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  setupResourceHandlers() {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'file://config.json',
            name: 'Configuration File',
            description: 'Server configuration in JSON format',
            mimeType: 'application/json'
          },
          {
            uri: 'file://logs/server.log',
            name: 'Server Log',
            description: 'Latest server log entries',
            mimeType: 'text/plain'
          },
          {
            uri: 'memory://stats',
            name: 'Server Statistics',
            description: 'Real-time server performance statistics',
            mimeType: 'application/json'
          },
          {
            uri: 'api://weather/current',
            name: 'Current Weather',
            description: 'Current weather data from API',
            mimeType: 'application/json'
          }
        ]
      };
    });

    // Read specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      switch (uri) {
        case 'file://config.json':
          return {
            contents: [
              {
                uri: 'file://config.json',
                mimeType: 'application/json',
                text: JSON.stringify({
                  server: {
                    name: 'test-mcp-server',
                    version: '1.0.0',
                    port: 3000,
                    debug: true
                  },
                  features: {
                    tools: true,
                    resources: true,
                    prompts: false
                  }
                }, null, 2)
              }
            ]
          };

        case 'file://logs/server.log':
          return {
            contents: [
              {
                uri: 'file://logs/server.log',
                mimeType: 'text/plain',
                text: [
                  `[${new Date().toISOString()}] INFO: Server started successfully`,
                  `[${new Date(Date.now() - 60000).toISOString()}] DEBUG: Processing request`,
                  `[${new Date(Date.now() - 120000).toISOString()}] INFO: Configuration loaded`,
                  `[${new Date(Date.now() - 180000).toISOString()}] INFO: Resources initialized`
                ].join('\n')
              }
            ]
          };

        case 'memory://stats':
          return {
            contents: [
              {
                uri: 'memory://stats',
                mimeType: 'application/json',
                text: JSON.stringify({
                  uptime: process.uptime(),
                  memory: process.memoryUsage(),
                  cpu: process.cpuUsage(),
                  timestamp: new Date().toISOString(),
                  requests: Math.floor(Math.random() * 1000),
                  errors: Math.floor(Math.random() * 10)
                }, null, 2)
              }
            ]
          };

        case 'api://weather/current':
          return {
            contents: [
              {
                uri: 'api://weather/current',
                mimeType: 'application/json',
                text: JSON.stringify({
                  location: 'San Francisco, CA',
                  temperature: Math.round(15 + Math.random() * 10),
                  humidity: Math.round(60 + Math.random() * 20),
                  condition: ['sunny', 'cloudy', 'partly cloudy', 'foggy'][Math.floor(Math.random() * 4)],
                  timestamp: new Date().toISOString()
                }, null, 2)
              }
            ]
          };

        default:
          throw new Error(`Resource not found: ${uri}`);
      }
    });
  }

  setupPingHandler() {
    // Handle ping requests - MCP ping should return empty object
    this.server.setRequestHandler(PingRequestSchema, async () => {
      return {};
    });
  }

  setupErrorHandlers() {
    this.server.onerror = (error) => {
      console.error('[TestMCPServer] Error:', error);
    };

    process.on('SIGINT', async () => {
      console.error('[TestMCPServer] Received SIGINT, shutting down...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('[TestMCPServer] Received SIGTERM, shutting down...');
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    console.error('[TestMCPServer] Starting test MCP server...');
    await this.server.connect(transport);
    console.error('[TestMCPServer] Test MCP server started successfully');
  }
}

// Start the server
const server = new TestMCPServer();
server.run().catch((error) => {
  console.error('[TestMCPServer] Failed to start server:', error);
  process.exit(1);
});