/**
 * End-to-End tests for MCP Proxy Mode
 * Tests the complete proxy functionality including tool forwarding and restart
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReloaderooProcess, TestMCPClient, TestHelpers } from '../utils/index.js';

describe('Proxy Mode E2E', () => {
  let reloaderoo: ReloaderooProcess;
  let mcpClient: TestMCPClient;

  beforeEach(() => {
    reloaderoo = new ReloaderooProcess({
      args: ['--', 'node', 'test-server-sdk.js'],
      timeout: 15000
    });
    mcpClient = new TestMCPClient();
  });

  afterEach(async () => {
    await TestHelpers.cleanupResources(() => reloaderoo.kill());
  });

  describe('Basic Proxy Functionality', () => {
    it('should start proxy and connect to child server', async () => {
      await reloaderoo.start();
      
      // Wait for startup logs indicating successful connection
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('Reloaderoo started successfully')
        ),
        10000
      );

      expect(reloaderoo.isRunning()).toBe(true);
    });

    it('should handle MCP initialize request', async () => {
      await reloaderoo.start();
      
      // Wait for startup to complete
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Send initialize request
      const initRequest = mcpClient.createInitializeRequest();
      await reloaderoo.sendMessage(initRequest);
      
      // Wait for response
      const response = await reloaderoo.waitForResponse(initRequest.id);
      
      TestHelpers.assertMCPSuccess(response);
      TestHelpers.assertServerInfoResponse(response);
      
      // Should have capabilities indicating tool support
      expect(response.result.capabilities).toHaveProperty('tools');
    });
  });

  describe('Tool Forwarding', () => {
    it('should list both child tools and restart_server tool', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Send tools/list request
      const toolsRequest = mcpClient.createListToolsRequest();
      await reloaderoo.sendMessage(toolsRequest);
      
      // Wait for response
      const response = await reloaderoo.waitForResponse(toolsRequest.id);
      
      TestHelpers.assertToolsListResponse(response);
      TestHelpers.assertHasRestartServerTool(response);
      
      // Should have child server tools (echo, add, greet, plus random tools)
      const toolNames = mcpClient.getToolNames(response);
      expect(toolNames).toContain('restart_server');
      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('add');
      expect(toolNames).toContain('greet');
      
      // Should have at least 6 tools (3 base + restart_server + 2+ random)
      expect(toolNames.length).toBeGreaterThanOrEqual(6);
    });

    it('should forward tool calls to child server correctly', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Call echo tool with test message
      const echoRequest = mcpClient.createCallToolRequest('echo', {
        message: 'test-proxy-forwarding'
      });
      await reloaderoo.sendMessage(echoRequest);
      
      // Wait for response
      const response = await reloaderoo.waitForResponse(echoRequest.id);
      
      TestHelpers.assertToolCallResponse(response);
      expect(response.result.content[0].text).toContain('test-proxy-forwarding');
    });

    it('should forward mathematical tool calls correctly', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Call add tool
      const addRequest = mcpClient.createCallToolRequest('add', {
        a: 25,
        b: 17
      });
      await reloaderoo.sendMessage(addRequest);
      
      // Wait for response
      const response = await reloaderoo.waitForResponse(addRequest.id);
      
      TestHelpers.assertToolCallResponse(response);
      expect(response.result.content[0].text).toContain('42'); // 25 + 17 = 42
    });

    it('should handle tool call errors gracefully', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Call non-existent tool
      const invalidRequest = mcpClient.createCallToolRequest('nonexistent-tool', {});
      await reloaderoo.sendMessage(invalidRequest);
      
      // Wait for response
      const response = await reloaderoo.waitForResponse(invalidRequest.id);
      
      TestHelpers.assertMCPError(response, 'Unknown tool');
    });
  });

  describe('restart_server Tool', () => {
    it('should restart when restart_server tool is called', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Call restart_server tool
      const restartRequest = mcpClient.createCallToolRequest('restart_server', {
        force: false
      });
      await reloaderoo.sendMessage(restartRequest);
      
      // Wait for restart response
      const restartResponse = await reloaderoo.waitForResponse(restartRequest.id, 10000);
      TestHelpers.assertToolCallResponse(restartResponse);
      
      // Wait for restart to complete
      await TestHelpers.waitForRestartSuccess(reloaderoo);
      
      // Verify restart success message
      expect(restartResponse.result.content[0].text).toContain('restarted successfully');
    });

    it('should have different tools after restart', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Get initial tools list
      const initialToolsRequest = mcpClient.createListToolsRequest();
      await reloaderoo.sendMessage(initialToolsRequest);
      const initialResponse = await reloaderoo.waitForResponse(initialToolsRequest.id);
      TestHelpers.assertToolsListResponse(initialResponse);
      const initialTools = mcpClient.getToolNames(initialResponse);
      
      // Restart server
      const restartRequest = mcpClient.createCallToolRequest('restart_server', {
        force: false
      });
      await reloaderoo.sendMessage(restartRequest);
      await reloaderoo.waitForResponse(restartRequest.id, 10000);
      await TestHelpers.waitForRestartSuccess(reloaderoo);
      
      // Get tools list after restart
      const finalToolsRequest = mcpClient.createListToolsRequest();
      await reloaderoo.sendMessage(finalToolsRequest);
      const finalResponse = await reloaderoo.waitForResponse(finalToolsRequest.id);
      TestHelpers.assertToolsListResponse(finalResponse);
      const finalTools = mcpClient.getToolNames(finalResponse);
      
      // Verify restart occurred (tools should be different)
      TestHelpers.assertToolsChangedAfterRestart(initialTools, finalTools);
    });

    it('should remain functional after restart', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Restart server
      const restartRequest = mcpClient.createCallToolRequest('restart_server', {
        force: false
      });
      await reloaderoo.sendMessage(restartRequest);
      await reloaderoo.waitForResponse(restartRequest.id, 10000);
      await TestHelpers.waitForRestartSuccess(reloaderoo);
      
      // Verify proxy is still functional after restart
      const echoAfterRestart = mcpClient.createCallToolRequest('echo', {
        message: 'after-restart-test'
      });
      await reloaderoo.sendMessage(echoAfterRestart);
      const echoResponse = await reloaderoo.waitForResponse(echoAfterRestart.id);
      TestHelpers.assertToolCallResponse(echoResponse);
      expect(echoResponse.result.content[0].text).toContain('after-restart-test');
    });

    it('should handle restart with force parameter', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Call restart_server with force=true
      const restartRequest = mcpClient.createCallToolRequest('restart_server', {
        force: true
      });
      await reloaderoo.sendMessage(restartRequest);
      
      // Wait for restart response
      const restartResponse = await reloaderoo.waitForResponse(restartRequest.id, 10000);
      TestHelpers.assertToolCallResponse(restartResponse);
      
      // Should contain success indication
      expect(restartResponse.result.content[0].text).toContain('restarted successfully');
    });

    it('should prevent concurrent restarts', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Send two restart requests rapidly
      const restart1 = mcpClient.createCallToolRequest('restart_server', { force: false });
      const restart2 = mcpClient.createCallToolRequest('restart_server', { force: false });
      
      await reloaderoo.sendMessage(restart1);
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('restart in progress') || log.includes('restart started')
        ),
        5000, 50
      );
      await reloaderoo.sendMessage(restart2);
      
      // Wait for both responses
      const response1 = await reloaderoo.waitForResponse(restart1.id, 10000);
      const response2 = await reloaderoo.waitForResponse(restart2.id, 10000);
      
      // One should succeed, one should fail with "in progress" message
      const responses = [response1, response2];
      const successCount = responses.filter(r => mcpClient.isSuccessResponse(r)).length;
      const errorCount = responses.filter(r => mcpClient.isErrorResponse(r)).length;
      
      expect(successCount).toBe(1);
      expect(errorCount).toBe(1);
      
      // The error should mention restart in progress
      const errorResponse = responses.find(r => mcpClient.isErrorResponse(r));
      expect(mcpClient.getErrorMessage(errorResponse!)).toContain('restart');
    });
  });

  describe('MCP Protocol Compliance', () => {
    it('should handle resources/list requests', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForChildServerReady(reloaderoo);
      
      const resourcesRequest = mcpClient.createListResourcesRequest();
      await reloaderoo.sendMessage(resourcesRequest);
      
      const response = await reloaderoo.waitForResponse(resourcesRequest.id);
      
      // Should succeed (even if empty)
      TestHelpers.assertMCPSuccess(response);
      expect(response.result).toHaveProperty('resources');
      expect(Array.isArray(response.result.resources)).toBe(true);
    });

    it('should handle prompts/list requests', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForChildServerReady(reloaderoo);
      
      const promptsRequest = mcpClient.createListPromptsRequest();
      await reloaderoo.sendMessage(promptsRequest);
      
      const response = await reloaderoo.waitForResponse(promptsRequest.id);
      
      // Should succeed (even if empty)
      TestHelpers.assertMCPSuccess(response);
      expect(response.result).toHaveProperty('prompts');
      expect(Array.isArray(response.result.prompts)).toBe(true);
    });

    it('should handle ping requests', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      const pingRequest = mcpClient.createPingRequest();
      await reloaderoo.sendMessage(pingRequest);
      
      const response = await reloaderoo.waitForResponse(pingRequest.id);
      
      TestHelpers.assertMCPSuccess(response);
    });
  });

  describe('Error Recovery', () => {
    it('should handle child server failures gracefully', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['--', 'node', 'nonexistent-server.js'],
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
      
      // Proxy should still be running and responsive to some degree
      expect(reloaderoo.isRunning()).toBe(true);
    });
  });
});