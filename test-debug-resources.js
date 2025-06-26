#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testDebugResources() {
  console.log('Testing Reloaderoo debug mode resources/prompts...\n');
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/bin/reloaderoo.js', '--debug-mode', '--', 'node', 'test-server.js'],
    env: process.env
  });

  const client = new Client(
    {
      name: 'test-debug-client',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  );

  try {
    await client.connect(transport);
    console.log('✓ Connected to Reloaderoo debug server\n');

    // Test list_resources (expecting error since test-server doesn't support resources)
    console.log('1. Testing list_resources (expecting error):');
    const resources = await client.callTool({
      name: 'list_resources',
      arguments: {}
    });
    console.log('Resources result:', resources.content[0].text);
    console.log('');

    // Test list_prompts (expecting error since test-server doesn't support prompts)
    console.log('2. Testing list_prompts (expecting error):');
    const prompts = await client.callTool({
      name: 'list_prompts',
      arguments: {}
    });
    console.log('Prompts result:', prompts.content[0].text);
    console.log('');

    // Test call_tool with discover_tools
    console.log('3. Testing call_tool with discover_tools:');
    const discover = await client.callTool({
      name: 'call_tool',
      arguments: {
        name: 'discover_tools',
        arguments: {}
      }
    });
    console.log('Discover result:', JSON.parse(discover.content[0].text));
    
    await client.close();
    await transport.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testDebugResources();