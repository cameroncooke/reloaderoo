#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testDebugMode() {
  console.log('Testing Reloaderoo debug mode...\n');
  
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

    // Test list_tools
    console.log('1. Testing list_tools debug tool:');
    const tools = await client.listTools();
    console.log('Available debug tools:', tools.tools.map(t => t.name).join(', '));
    console.log('');

    // Test get_server_info
    console.log('2. Testing get_server_info:');
    const serverInfo = await client.callTool({
      name: 'get_server_info',
      arguments: {}
    });
    console.log('Server info:', JSON.parse(serverInfo.content[0].text));
    console.log('');

    // Test list_tools on child server
    console.log('3. Testing list_tools on child server:');
    const childTools = await client.callTool({
      name: 'list_tools',
      arguments: {}
    });
    console.log('Child server tools:', JSON.parse(childTools.content[0].text));
    console.log('');

    // Test ping
    console.log('4. Testing ping:');
    const ping = await client.callTool({
      name: 'ping',
      arguments: {}
    });
    console.log('Ping result:', JSON.parse(ping.content[0].text));
    console.log('');

    // Test call_tool
    console.log('5. Testing call_tool (echo):');
    const echo = await client.callTool({
      name: 'call_tool',
      arguments: {
        name: 'echo',
        arguments: {
          message: 'Hello from debug mode!'
        }
      }
    });
    console.log('Echo result:', JSON.parse(echo.content[0].text));
    console.log('');

    console.log('✓ All tests passed!');
    
    await client.close();
    await transport.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testDebugMode();