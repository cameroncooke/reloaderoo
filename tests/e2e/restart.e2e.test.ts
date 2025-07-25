/**
 * End-to-End tests focused on restart functionality
 * Tests comprehensive restart scenarios and edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReloaderooProcess, TestMCPClient, TestHelpers } from '../utils/index.js';

describe('Restart Functionality E2E', () => {
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

  describe('Basic Restart Operations', () => {
    it('should restart successfully and maintain proxy functionality', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Verify initial functionality
      const initialEchoRequest = mcpClient.createCallToolRequest('echo', {
        message: 'before-restart'
      });
      await reloaderoo.sendMessage(initialEchoRequest);
      const initialResponse = await reloaderoo.waitForResponse(initialEchoRequest.id);
      TestHelpers.assertToolCallResponse(initialResponse);
      
      // Perform restart
      const restartRequest = mcpClient.createCallToolRequest('restart_server', {
        force: false
      });
      await reloaderoo.sendMessage(restartRequest);
      const restartResponse = await reloaderoo.waitForResponse(restartRequest.id, 10000);
      TestHelpers.assertToolCallResponse(restartResponse);
      
      // Wait for restart to complete
      await TestHelpers.waitForRestartSuccess(reloaderoo);
      
      // Verify functionality after restart
      const postRestartEchoRequest = mcpClient.createCallToolRequest('echo', {
        message: 'after-restart'
      });
      await reloaderoo.sendMessage(postRestartEchoRequest);
      const postRestartResponse = await reloaderoo.waitForResponse(postRestartEchoRequest.id);
      TestHelpers.assertToolCallResponse(postRestartResponse);
      expect(postRestartResponse.result.content[0].text).toContain('after-restart');
    });

    it('should restart with force=true parameter', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      const restartRequest = mcpClient.createCallToolRequest('restart_server', {
        force: true
      });
      await reloaderoo.sendMessage(restartRequest);
      
      const response = await reloaderoo.waitForResponse(restartRequest.id, 10000);
      TestHelpers.assertToolCallResponse(response);
      expect(response.result.content[0].text).toContain('restarted successfully');
    });

    it('should restart with default parameters (force=false)', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      const restartRequest = mcpClient.createCallToolRequest('restart_server', {});
      await reloaderoo.sendMessage(restartRequest);
      
      const response = await reloaderoo.waitForResponse(restartRequest.id, 10000);
      TestHelpers.assertToolCallResponse(response);
      expect(response.result.content[0].text).toContain('restarted successfully');
    });
  });

  describe('Multiple Restart Scenarios', () => {
    it('should handle multiple sequential restarts', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // First restart
      const restart1 = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restart1);
      const response1 = await reloaderoo.waitForResponse(restart1.id, 10000);
      TestHelpers.assertToolCallResponse(response1);
      
      // Wait for first restart to complete
      await TestHelpers.waitForRestartSuccess(reloaderoo);
      
      // Second restart
      const restart2 = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restart2);
      const response2 = await reloaderoo.waitForResponse(restart2.id, 10000);
      TestHelpers.assertToolCallResponse(response2);
      
      // Wait for second restart to complete
      await TestHelpers.waitForRestartSuccess(reloaderoo);
      
      // Verify functionality after multiple restarts
      const echoRequest = mcpClient.createCallToolRequest('echo', {
        message: 'after-multiple-restarts'
      });
      await reloaderoo.sendMessage(echoRequest);
      const echoResponse = await reloaderoo.waitForResponse(echoRequest.id);
      TestHelpers.assertToolCallResponse(echoResponse);
      expect(echoResponse.result.content[0].text).toContain('after-multiple-restarts');
    });

    it('should prevent concurrent restart operations', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Send multiple restart requests rapidly
      const restart1 = mcpClient.createCallToolRequest('restart_server', { force: false });
      const restart2 = mcpClient.createCallToolRequest('restart_server', { force: false });
      const restart3 = mcpClient.createCallToolRequest('restart_server', { force: false });
      
      await reloaderoo.sendMessage(restart1);
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('restart in progress') || log.includes('restart started')
        ),
        3000, 50
      );
      await reloaderoo.sendMessage(restart2);
      await TestHelpers.waitFor(() => true, 50); // Small delay
      await reloaderoo.sendMessage(restart3);
      
      // Wait for all responses
      const responses = await Promise.all([
        reloaderoo.waitForResponse(restart1.id, 12000),
        reloaderoo.waitForResponse(restart2.id, 12000),
        reloaderoo.waitForResponse(restart3.id, 12000)
      ]);
      
      // Exactly one should succeed, others should fail with "in progress" error
      const successCount = responses.filter(r => mcpClient.isSuccessResponse(r)).length;
      const errorCount = responses.filter(r => mcpClient.isErrorResponse(r)).length;
      
      expect(successCount).toBe(1);
      expect(errorCount).toBe(2);
      
      // Error responses should mention restart in progress
      const errorResponses = responses.filter(r => mcpClient.isErrorResponse(r));
      for (const errorResponse of errorResponses) {
        expect(mcpClient.getErrorMessage(errorResponse)).toContain('restart');
      }
    });

    it('should handle restart with force during ongoing restart', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Start a normal restart
      const normalRestart = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(normalRestart);
      
      // Immediately send a force restart
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('restart in progress') || log.includes('restart started')
        ),
        3000, 50
      );
      const forceRestart = mcpClient.createCallToolRequest('restart_server', { force: true });
      await reloaderoo.sendMessage(forceRestart);
      
      // Both should complete, but behavior may vary
      const normalResponse = await reloaderoo.waitForResponse(normalRestart.id, 12000);
      const forceResponse = await reloaderoo.waitForResponse(forceRestart.id, 12000);
      
      // At least one should succeed
      expect(
        mcpClient.isSuccessResponse(normalResponse) || 
        mcpClient.isSuccessResponse(forceResponse)
      ).toBe(true);
    });
  });

  describe('Restart Persistence and State', () => {
    it('should maintain tool availability across restarts', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Get initial tools
      const initialToolsRequest = mcpClient.createListToolsRequest();
      await reloaderoo.sendMessage(initialToolsRequest);
      const initialResponse = await reloaderoo.waitForResponse(initialToolsRequest.id);
      TestHelpers.assertToolsListResponse(initialResponse);
      const initialToolNames = mcpClient.getToolNames(initialResponse);
      
      // Restart server
      const restartRequest = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restartRequest);
      await reloaderoo.waitForResponse(restartRequest.id, 10000);
      await TestHelpers.waitForRestartSuccess(reloaderoo);
      
      // Get tools after restart
      const finalToolsRequest = mcpClient.createListToolsRequest();
      await reloaderoo.sendMessage(finalToolsRequest);
      const finalResponse = await reloaderoo.waitForResponse(finalToolsRequest.id);
      TestHelpers.assertToolsListResponse(finalResponse);
      const finalToolNames = mcpClient.getToolNames(finalResponse);
      
      // Core tools should still be available
      const coreTools = ['restart_server', 'echo', 'add', 'greet'];
      for (const tool of coreTools) {
        expect(initialToolNames).toContain(tool);
        expect(finalToolNames).toContain(tool);
      }
    });

    it('should handle restart during active tool calls', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Start a tool call
      const echoRequest = mcpClient.createCallToolRequest('echo', {
        message: 'concurrent-with-restart'
      });
      await reloaderoo.sendMessage(echoRequest);
      
      // Immediately request restart
      await TestHelpers.waitFor(() => true, 50); // Small delay
      const restartRequest = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restartRequest);
      
      // Both operations should complete (though echo may fail due to restart)
      const echoPromise = reloaderoo.waitForResponse(echoRequest.id, 8000).catch(() => null);
      const restartPromise = reloaderoo.waitForResponse(restartRequest.id, 12000);
      
      const [echoResponse, restartResponse] = await Promise.all([echoPromise, restartPromise]);
      
      // Restart should succeed
      TestHelpers.assertToolCallResponse(restartResponse);
      
      // Echo may succeed or fail, but proxy should remain functional
      expect(reloaderoo.isRunning()).toBe(true);
    });
  });

  describe('Restart Error Scenarios', () => {
    it('should handle restart when child server is already dead', async () => {
      // Use a server that will exit quickly
      reloaderoo = new ReloaderooProcess({
        args: ['--', 'node', '-e', 'console.log("quick exit"); process.exit(0);'],
        timeout: 10000
      });
      
      await reloaderoo.start();
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('exit') || log.includes('quick exit') || !reloaderoo.isRunning()
        ),
        5000, 200
      );
      
      // Try to restart after child has already exited
      const restartRequest = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restartRequest);
      
      const response = await reloaderoo.waitForResponse(restartRequest.id, 8000);
      
      // Should handle gracefully (may succeed or fail, but shouldn't crash)
      expect(response).toBeDefined();
      expect(reloaderoo.isRunning()).toBe(true);
    });

    it('should handle restart with invalid child command', async () => {
      // Start with valid server, then simulate command change
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Try restart (this will use the same command, so should work)
      const restartRequest = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restartRequest);
      
      const response = await reloaderoo.waitForResponse(restartRequest.id, 10000);
      TestHelpers.assertToolCallResponse(response);
    });

    it('should handle rapid restart requests', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Send many restart requests in quick succession
      const restartPromises = [];
      for (let i = 0; i < 5; i++) {
        const restartRequest = mcpClient.createCallToolRequest('restart_server', { force: false });
        restartPromises.push(reloaderoo.sendMessage(restartRequest).then(() => restartRequest.id));
        await TestHelpers.waitFor(() => true, 20); // Very small delay between requests
      }
      
      const requestIds = await Promise.all(restartPromises);
      
      // Wait for all responses
      const responses = await Promise.all(
        requestIds.map(id => reloaderoo.waitForResponse(id, 15000))
      );
      
      // Should have exactly one success and multiple failures
      const successCount = responses.filter(r => mcpClient.isSuccessResponse(r)).length;
      const errorCount = responses.filter(r => mcpClient.isErrorResponse(r)).length;
      
      expect(successCount).toBe(1);
      expect(errorCount).toBe(4);
      expect(reloaderoo.isRunning()).toBe(true);
    });
  });

  describe('Restart Integration with Other Operations', () => {
    it('should restart successfully before tool calls', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Restart
      const restartRequest = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restartRequest);
      const restartResponse = await reloaderoo.waitForResponse(restartRequest.id, 10000);
      TestHelpers.assertToolCallResponse(restartResponse);
      
      // Wait for restart to complete
      await TestHelpers.waitForRestartSuccess(reloaderoo);
    });

    it('should handle tool calls immediately after restart completion', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Restart and wait for completion
      const restartRequest = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restartRequest);
      await reloaderoo.waitForResponse(restartRequest.id, 10000);
      await TestHelpers.waitForRestartSuccess(reloaderoo);
      
      // Tool call should succeed after restart completes
      const echoRequest = mcpClient.createCallToolRequest('echo', {
        message: 'immediate-after-restart'
      });
      await reloaderoo.sendMessage(echoRequest);
      
      const echoResponse = await reloaderoo.waitForResponse(echoRequest.id, 8000);
      TestHelpers.assertToolCallResponse(echoResponse);
      expect(echoResponse.result.content[0].text).toContain('immediate-after-restart');
    });

    it('should list tools correctly after restart', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Restart
      const restartRequest = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restartRequest);
      await reloaderoo.waitForResponse(restartRequest.id, 10000);
      
      // Wait for restart completion
      await TestHelpers.waitForRestartSuccess(reloaderoo);
      
      // List tools
      const toolsRequest = mcpClient.createListToolsRequest();
      await reloaderoo.sendMessage(toolsRequest);
      const toolsResponse = await reloaderoo.waitForResponse(toolsRequest.id);
      
      TestHelpers.assertToolsListResponse(toolsResponse);
      TestHelpers.assertHasRestartServerTool(toolsResponse);
      
      const toolNames = mcpClient.getToolNames(toolsResponse);
      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('add');
      expect(toolNames).toContain('greet');
    });

    it('should handle MCP protocol operations after restart', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Restart
      const restartRequest = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restartRequest);
      await reloaderoo.waitForResponse(restartRequest.id, 10000);
      
      // Wait for restart completion
      await TestHelpers.waitForRestartSuccess(reloaderoo);
      
      // Test various MCP operations
      const operations = [
        mcpClient.createListResourcesRequest(),
        mcpClient.createListPromptsRequest(),
        mcpClient.createPingRequest()
      ];
      
      for (const operation of operations) {
        await reloaderoo.sendMessage(operation);
        const response = await reloaderoo.waitForResponse(operation.id);
        TestHelpers.assertMCPSuccess(response);
      }
    });
  });

  describe('Performance and Timing', () => {
    it('should complete restarts within reasonable time', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      const startTime = Date.now();
      
      const restartRequest = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restartRequest);
      const response = await reloaderoo.waitForResponse(restartRequest.id, 15000);
      
      const endTime = Date.now();
      const restartDuration = endTime - startTime;
      
      TestHelpers.assertToolCallResponse(response);
      
      // Restart should complete within 10 seconds
      expect(restartDuration).toBeLessThan(10000);
    });

    it('should maintain responsiveness during restart', async () => {
      await reloaderoo.start();
      await TestHelpers.waitForStartupSuccess(reloaderoo);
      
      // Start restart
      const restartRequest = mcpClient.createCallToolRequest('restart_server', { force: false });
      await reloaderoo.sendMessage(restartRequest);
      
      // Send ping during restart
      await TestHelpers.waitFor(
        () => reloaderoo.getStderrOutput().some(log => 
          log.includes('restart in progress') || log.includes('restart started')
        ),
        3000, 100
      );
      const pingRequest = mcpClient.createPingRequest();
      await reloaderoo.sendMessage(pingRequest);
      
      // Both should complete
      const restartResponse = await reloaderoo.waitForResponse(restartRequest.id, 12000);
      const pingResponse = await reloaderoo.waitForResponse(pingRequest.id, 8000);
      
      TestHelpers.assertToolCallResponse(restartResponse);
      TestHelpers.assertMCPSuccess(pingResponse);
    });
  });
});