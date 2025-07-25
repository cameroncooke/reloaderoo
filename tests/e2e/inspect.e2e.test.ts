/**
 * End-to-End tests for Inspect Commands
 * Tests both CLI inspection commands and MCP inspection server mode
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReloaderooProcess, TestMCPClient, TestHelpers } from '../utils/index.js';

describe('Inspect Commands E2E', () => {
  let reloaderoo: ReloaderooProcess;
  let mcpClient: TestMCPClient;

  beforeEach(() => {
    mcpClient = new TestMCPClient();
  });

  afterEach(async () => {
    await TestHelpers.cleanupResources(() => reloaderoo?.kill());
  });

  describe('CLI Inspection Commands', () => {
    it('should list tools via CLI', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'list-tools', '--', 'node', 'test-server-sdk.js'],
        timeout: 10000
      });

      await reloaderoo.start();
      const output = await reloaderoo.waitForTextOutput('echo');
      const exitCode = await reloaderoo.waitForExit();

      const expectedTools = ['echo', 'add', 'greet'];
      TestHelpers.assertCliOutputContainsAll(output, expectedTools);
      TestHelpers.assertSuccessExitCode(exitCode);
    });

    it('should call tool via CLI', async () => {
      reloaderoo = new ReloaderooProcess({
        args: [
          'inspect', 'call-tool', 'echo',
          '--params', '{"message":"hello-from-cli"}',
          '--', 'node', 'test-server-sdk.js'
        ],
        timeout: 10000
      });

      await reloaderoo.start();
      const output = await reloaderoo.waitForTextOutput('hello-from-cli');
      const exitCode = await reloaderoo.waitForExit();

      expect(output).toContain('hello-from-cli');
      TestHelpers.assertSuccessExitCode(exitCode);
    });

    it('should get server info via CLI', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'server-info', '--', 'node', 'test-server-sdk.js'],
        timeout: 10000
      });

      await reloaderoo.start();
      const output = await reloaderoo.waitForTextOutput('protocolVersion');
      const exitCode = await reloaderoo.waitForExit();

      const expectedInfo = ['protocolVersion', 'capabilities', 'serverInfo'];
      TestHelpers.assertCliOutputContainsAll(output, expectedInfo);
      TestHelpers.assertSuccessExitCode(exitCode);
    });

    it('should list resources via CLI', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'list-resources', '--', 'node', 'test-server-sdk.js'],
        timeout: 10000
      });

      await reloaderoo.start();
      const output = await reloaderoo.waitForTextOutput('resources');
      const exitCode = await reloaderoo.waitForExit();

      expect(output).toContain('resources');
      TestHelpers.assertSuccessExitCode(exitCode);
    });

    it('should list prompts via CLI', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'list-prompts', '--', 'node', 'test-server-sdk.js'],
        timeout: 10000
      });

      await reloaderoo.start();
      const output = await reloaderoo.waitForTextOutput('prompts');
      const exitCode = await reloaderoo.waitForExit();

      expect(output).toContain('prompts');
      TestHelpers.assertSuccessExitCode(exitCode);
    });

    it('should ping server via CLI', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'ping', '--', 'node', 'test-server-sdk.js'],
        timeout: 10000
      });

      await reloaderoo.start();
      const output = await reloaderoo.waitForTextOutput('success');
      const exitCode = await reloaderoo.waitForExit();

      expect(output).toContain('success');
      TestHelpers.assertSuccessExitCode(exitCode);
    });

    it('should handle CLI tool call errors gracefully', async () => {
      reloaderoo = new ReloaderooProcess({
        args: [
          'inspect', 'call-tool', 'nonexistent-tool',
          '--params', '{}',
          '--', 'node', 'test-server-sdk.js'
        ],
        timeout: 8000
      });

      await reloaderoo.start();
      const exitCode = await reloaderoo.waitForExit();
      const stderrOutput = reloaderoo.getStderrOutput().join('');

      TestHelpers.assertFailureExitCode(exitCode);
      TestHelpers.assertHelpfulErrorMessage(stderrOutput);
    });

    it('should handle CLI with invalid parameters', async () => {
      reloaderoo = new ReloaderooProcess({
        args: [
          'inspect', 'call-tool', 'echo',
          '--params', 'invalid-json',
          '--', 'node', 'test-server-sdk.js'
        ],
        timeout: 8000
      });

      await reloaderoo.start();
      const exitCode = await reloaderoo.waitForExit();
      const stderrOutput = reloaderoo.getStderrOutput().join('');

      TestHelpers.assertFailureExitCode(exitCode);
      expect(stderrOutput.toLowerCase()).toContain('json');
    });

    it('should handle CLI with raw output option', async () => {
      reloaderoo = new ReloaderooProcess({
        args: [
          'inspect', 'server-info', '--raw',
          '--', 'node', 'test-server-sdk.js'
        ],
        timeout: 8000
      });

      await reloaderoo.start();
      const output = await reloaderoo.waitForTextOutput('{');
      const exitCode = await reloaderoo.waitForExit();

      // Raw output should be valid JSON
      expect(() => JSON.parse(output)).not.toThrow();
      TestHelpers.assertSuccessExitCode(exitCode);
    });
  });

  describe('MCP Inspection Server Mode', () => {
    beforeEach(() => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'mcp', '--', 'node', 'test-server-sdk.js'],
        timeout: 15000
      });
    });

    it('should start MCP inspection server successfully', async () => {
      await reloaderoo.start();
      
      // Wait for startup logs
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('MCP inspection server started')
        ),
        10000
      );

      expect(reloaderoo.isRunning()).toBe(true);
    });

    it('should handle MCP initialize in inspection mode', async () => {
      await reloaderoo.start();
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('MCP inspection server started') ||
          log.includes('started successfully')
        ),
        10000
      );
      
      // Send initialize request
      const initRequest = mcpClient.createInitializeRequest();
      await reloaderoo.sendMessage(initRequest);
      
      // Wait for response
      const response = await reloaderoo.waitForResponse(initRequest.id);
      
      TestHelpers.assertMCPSuccess(response);
      TestHelpers.assertServerInfoResponse(response);
      
      // Should have inspection capabilities
      expect(response.result.capabilities).toHaveProperty('tools');
      expect(response.result.serverInfo.name).toContain('Reloaderoo Debug Inspector');
    });

    it('should list inspection tools via MCP', async () => {
      await reloaderoo.start();
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('MCP inspection server started') ||
          log.includes('started successfully')
        ),
        10000
      );
      
      // Send tools/list request
      const toolsRequest = mcpClient.createListToolsRequest();
      await reloaderoo.sendMessage(toolsRequest);
      
      // Wait for response
      const response = await reloaderoo.waitForResponse(toolsRequest.id);
      
      TestHelpers.assertToolsListResponse(response);
      
      // Should have inspection tools
      const expectedInspectionTools = [
        'list_tools',
        'call_tool',
        'list_resources',
        'read_resource',
        'list_prompts',
        'get_prompt',
        'get_server_info',
        'ping'
      ];
      
      TestHelpers.assertHasTools(response, expectedInspectionTools);
    });

    it('should forward tool calls via call_tool inspection tool', async () => {
      await reloaderoo.start();
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('MCP inspection server started') ||
          log.includes('started successfully')
        ),
        10000
      );
      
      // Use call_tool inspection tool to call echo on child server
      const callToolRequest = mcpClient.createCallToolRequest('call_tool', {
        name: 'echo',
        arguments: { message: 'inspection-mode-test' }
      });
      await reloaderoo.sendMessage(callToolRequest);
      
      // Wait for response
      const response = await reloaderoo.waitForResponse(callToolRequest.id);
      
      TestHelpers.assertToolCallResponse(response);
      expect(response.result.content[0].text).toContain('inspection-mode-test');
    });

    it('should get child server info via get_server_info inspection tool', async () => {
      await reloaderoo.start();
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('MCP inspection server started') ||
          log.includes('started successfully')
        ),
        10000
      );
      
      // Use get_server_info inspection tool
      const serverInfoRequest = mcpClient.createCallToolRequest('get_server_info', {});
      await reloaderoo.sendMessage(serverInfoRequest);
      
      // Wait for response
      const response = await reloaderoo.waitForResponse(serverInfoRequest.id);
      
      TestHelpers.assertToolCallResponse(response);
      const responseText = response.result.content[0].text;
      expect(responseText).toContain('protocolVersion');
      expect(responseText).toContain('capabilities');
      expect(responseText).toContain('serverInfo');
    });

    it('should handle inspection tool errors gracefully', async () => {
      await reloaderoo.start();
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('MCP inspection server started') ||
          log.includes('started successfully')
        ),
        10000
      );
      
      // Use call_tool with invalid child tool
      const invalidCallRequest = mcpClient.createCallToolRequest('call_tool', {
        name: 'nonexistent-tool',
        arguments: {}
      });
      await reloaderoo.sendMessage(invalidCallRequest);
      
      // Wait for response
      const response = await reloaderoo.waitForResponse(invalidCallRequest.id);
      
      TestHelpers.assertMCPError(response);
    });

    it('should ping child server via ping inspection tool', async () => {
      await reloaderoo.start();
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('MCP inspection server started') ||
          log.includes('started successfully')
        ),
        10000
      );
      
      // Use ping inspection tool
      const pingRequest = mcpClient.createCallToolRequest('ping', {});
      await reloaderoo.sendMessage(pingRequest);
      
      // Wait for response
      const response = await reloaderoo.waitForResponse(pingRequest.id);
      
      TestHelpers.assertToolCallResponse(response);
      expect(response.result.content[0].text).toContain('success');
    });
  });

  describe('Error Handling in Inspection Mode', () => {
    it('should handle child server startup failures', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'mcp', '--', 'node', 'nonexistent-server.js'],
        timeout: 10000
      });
      
      await reloaderoo.start();
      
      // Should detect child server failure
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('ENOENT') || log.includes('spawn')
        ),
        8000
      );
      
      // Inspector should still be running
      expect(reloaderoo.isRunning()).toBe(true);
    });

    it('should handle invalid inspection commands gracefully', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'invalid-command', '--', 'node', 'test-server-sdk.js'],
        timeout: 8000
      });
      
      await reloaderoo.start();
      const exitCode = await reloaderoo.waitForExit();
      const stderrOutput = reloaderoo.getStderrOutput().join('');
      
      TestHelpers.assertFailureExitCode(exitCode);
      TestHelpers.assertHelpfulErrorMessage(stderrOutput);
    });

    it('should handle missing child server command', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'list-tools'],
        timeout: 5000
      });
      
      await reloaderoo.start();
      const exitCode = await reloaderoo.waitForExit();
      const stderrOutput = reloaderoo.getStderrOutput().join('');
      
      TestHelpers.assertFailureExitCode(exitCode);
      expect(stderrOutput).toContain('child command');
    });
  });

  describe('Configuration Options', () => {
    it('should respect timeout option in CLI inspection', async () => {
      reloaderoo = new ReloaderooProcess({
        args: [
          'inspect', 'list-tools', '--timeout', '2000',
          '--', 'node', 'test-server-sdk.js'
        ],
        timeout: 8000
      });

      await reloaderoo.start();
      
      // Should either succeed quickly or timeout, but not fail with invalid option
      try {
        await reloaderoo.waitForTextOutput('echo', 6000);
      } catch (error) {
        // Timeout is acceptable for this test
      }
      
      const stderrOutput = reloaderoo.getStderrOutput().join('');
      expect(stderrOutput).not.toContain('unknown option');
    });

    it('should respect environment variables in inspection mode', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'server-info', '--', 'node', 'test-server-sdk.js'],
        env: {
          ...process.env,
          MCPDEV_PROXY_LOG_LEVEL: 'debug'
        },
        timeout: 10000
      });

      await reloaderoo.start();
      
      // Should show debug logging in stderr
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.toLowerCase().includes('debug')
        ),
        8000
      );
      
      const stderrOutput = reloaderoo.getStderrOutput().join('');
      expect(stderrOutput.toLowerCase()).toContain('debug');
    });
  });
});