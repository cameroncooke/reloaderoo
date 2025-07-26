/**
 * End-to-End tests for CLI commands
 * Tests the CLI interface as a black box from user perspective
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { ReloaderooProcess, TestHelpers } from '../utils/index.js';

// Read version from package.json to avoid hardcoding
const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
const expectedVersion = packageJson.version;

// Expected CLI output constants
const CLI_OUTPUT = {
  USAGE: 'Usage:',
  COMMANDS: 'Commands:',
  PROXY: 'proxy',
  INSPECT: 'inspect',
  INFO: 'info',
  OPTIONS: 'Options:',
  EXAMPLES: 'Examples:',
  ENV_VARS: 'Environment Variables:',
  RELOADEROO_V: 'reloaderoo v',
  LOG_LEVEL: 'logLevel:',
  SUCCESS: 'success',
  PROTOCOL_VERSION: 'protocolVersion',
  HELP_SECTIONS: [
    'Usage:',
    'Commands:',
    'proxy',
    'inspect', 
    'info',
    'Options:',
    'Examples:',
    'Environment Variables:'
  ],
  INSPECT_COMMANDS: [
    'list-tools',
    'call-tool',
    'list-resources',
    'read-resource',
    'list-prompts',
    'get-prompt',
    'server-info',
    'ping',
  ],
  INFO_SECTIONS: [
    `reloaderoo v${packageJson.version}`,
    'System Information:',
    'Node Version:',
    'Platform:',
    'Architecture:',
    'Working Directory:'
  ],
  VERBOSE_INFO_SECTIONS: [
    `reloaderoo v${packageJson.version}`,
    'System Information:',
    'MCP-related Environment Variables:'
  ]
} as const;

describe('CLI Commands E2E', () => {
  let reloaderoo: ReloaderooProcess;

  beforeEach(() => {
    reloaderoo = new ReloaderooProcess({
      timeout: 10000 // 10 seconds for CLI commands
    });
  });

  afterEach(async () => {
    await TestHelpers.cleanupResources(() => reloaderoo.kill());
  });

  describe('Version Command', () => {
    it('should display correct version with --version', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['--version'],
        timeout: 5000
      });

      await reloaderoo.start();
      const output = await reloaderoo.waitForTextOutput(expectedVersion);
      const exitCode = await reloaderoo.waitForExit();

      expect(output).toContain(expectedVersion);
      TestHelpers.assertSuccessExitCode(exitCode);
    });

    it('should display correct version with -V', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['-V'],
        timeout: 5000
      });

      await reloaderoo.start();
      const output = await reloaderoo.waitForTextOutput(expectedVersion);
      const exitCode = await reloaderoo.waitForExit();

      expect(output).toContain(expectedVersion);
      TestHelpers.assertSuccessExitCode(exitCode);
    });
  });

  describe('Help Command', () => {
    it('should display comprehensive help with --help', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['--help'],
        timeout: 5000
      });

      await reloaderoo.start();
      
      // Wait for a more complete help output pattern
      const helpOutput = await reloaderoo.waitForTextOutput('Environment Variables:');
      const exitCode = await reloaderoo.waitForExit();

      // Check for key sections in the help output
      expect(helpOutput).toContain('Usage:');
      expect(helpOutput).toContain('proxy');
      expect(helpOutput).toContain('inspect');
      expect(helpOutput).toContain('info');
      TestHelpers.assertSuccessExitCode(exitCode);
    });

    it('should display help for inspect subcommand', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', '--help'],
        timeout: 5000
      });

      await reloaderoo.start();
      
      // Wait for a more complete help output pattern
      const helpOutput = await reloaderoo.waitForTextOutput('Inspect and debug MCP servers');
      const exitCode = await reloaderoo.waitForExit();

      // Check for key inspect commands in the help output
      expect(helpOutput).toContain('list-tools');
      expect(helpOutput).toContain('call-tool');
      expect(helpOutput).toContain('server-info');
      expect(helpOutput).toContain('ping');
      expect(helpOutput).toContain('call-tool');
      TestHelpers.assertSuccessExitCode(exitCode);
    });
  });

  describe('Info Command', () => {
    it('should display system information', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['info'],
        timeout: 5000
      });

      await reloaderoo.start();
      
      // Wait for a more complete info output pattern
      const infoOutput = await reloaderoo.waitForTextOutput('Environment Configuration:');
      const exitCode = await reloaderoo.waitForExit();

      // Check for key info sections in the output
      expect(infoOutput).toContain(`reloaderoo v${packageJson.version}`);
      expect(infoOutput).toContain('System Information:');
      expect(infoOutput).toContain('Node Version:');
      expect(infoOutput).toContain('Platform:');
      expect(infoOutput).toContain('Architecture:');
      expect(infoOutput).toContain('Working Directory:');
      TestHelpers.assertSuccessExitCode(exitCode);
    });

    it('should display verbose information with --verbose', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['info', '--verbose'],
        timeout: 5000
      });

      await reloaderoo.start();
      
      // Wait for a more complete info output pattern  
      const infoOutput = await reloaderoo.waitForTextOutput('Environment Configuration:');
      const exitCode = await reloaderoo.waitForExit();

      // Check for key verbose info sections in the output
      expect(infoOutput).toContain(`reloaderoo v${packageJson.version}`);
      expect(infoOutput).toContain('System Information:');
      
      // Should NOT contain the old dead code message
      expect(infoOutput).not.toContain('skipped - command validation removed');
      
      TestHelpers.assertSuccessExitCode(exitCode);
    });

    it('should respect environment variables in info display', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['info'],
        env: {
          ...process.env,
          MCPDEV_PROXY_LOG_LEVEL: 'debug'
        },
        timeout: 5000
      });

      await reloaderoo.start();
      const output = await reloaderoo.waitForTextOutput(CLI_OUTPUT.LOG_LEVEL);
      const exitCode = await reloaderoo.waitForExit();

      expect(output).toContain('logLevel: "debug"');
      TestHelpers.assertSuccessExitCode(exitCode);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid commands gracefully', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['invalid-command'],
        timeout: 5000
      });

      await reloaderoo.start();
      const exitCode = await reloaderoo.waitForExit();
      const stderrOutput = reloaderoo.getStderrOutput().join('');

      TestHelpers.assertFailureExitCode(exitCode);
      expect(stderrOutput).toContain('unknown command');
    });

    it('should handle invalid options gracefully', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['--invalid-option'],
        timeout: 5000
      });

      await reloaderoo.start();
      const exitCode = await reloaderoo.waitForExit();
      const stderrOutput = reloaderoo.getStderrOutput().join('');

      TestHelpers.assertFailureExitCode(exitCode);
      expect(stderrOutput).toContain('unknown option');
    });

    it('should handle missing child command for inspect', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'list-tools'],
        timeout: 5000
      });

      await reloaderoo.start();
      const exitCode = await reloaderoo.waitForExit();
      const stderrOutput = reloaderoo.getStderrOutput().join('');

      TestHelpers.assertFailureExitCode(exitCode);
      TestHelpers.assertHelpfulErrorMessage(stderrOutput);
    });
  });

  describe('Configuration Options', () => {
    it('should accept timeout option for inspect commands', async () => {
      reloaderoo = new ReloaderooProcess({
        args: ['inspect', 'list-tools', '--timeout', '2000', '--', 'node', 'test-server-sdk.js'],
        timeout: 5000 // Shorter timeout for test
      });

      await reloaderoo.start();
      
      // Wait for process to exit or for some output
      const exitCode = await reloaderoo.waitForExit();
      const stderrOutput = reloaderoo.getStderrOutput().join('');
      
      // Main assertion: should not contain 'unknown option' error
      expect(stderrOutput).not.toContain('unknown option');
      // Process may exit with error due to test server issues, but option should be accepted
    }, 8000);

    // Removed test for --raw option as it's no longer needed
    // CLI now always outputs raw MCP responses
  });
});