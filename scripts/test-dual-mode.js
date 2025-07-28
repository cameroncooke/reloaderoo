#!/usr/bin/env node

/**
 * Test dual-mode behavior
 * Verifies that the executable correctly switches between MCP server and CLI modes
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);
const binPath = join(rootDir, 'dist', 'bin', 'reloaderoo.js');

/**
 * Run a command and return promise with result
 */
function runCommand(args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [binPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Test dual-mode behavior
 */
async function testModeDetection(args, expectedPattern, expectedMode, description) {
  console.log(`Testing: ${description}...`);
  
  try {
    const result = await runCommand(args);
    const output = result.stdout + result.stderr;
    
    const found = typeof expectedPattern === 'string' 
      ? output.includes(expectedPattern)
      : output.match(expectedPattern);
    
    if (found) {
      console.log(`✅ ${description} - PASSED (correctly detected ${expectedMode} mode)`);
      return true;
    } else {
      console.log(`❌ ${description} - FAILED`);
      console.log(`Expected ${expectedMode} mode with pattern: ${expectedPattern}`);
      console.log(`Got output: ${output.substring(0, 300)}...`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${description} - ERROR: ${error.message}`);
    return false;
  }
}

/**
 * Main test suite
 */
async function runTests() {
  console.log('🚀 Testing Dual-Mode Behavior...\n');
  
  const tests = [
    {
      args: [],
      expected: 'reloaderoo: MCP development proxy server',
      mode: 'MCP Server',
      description: 'No arguments should trigger MCP server mode'
    },
    {
      args: ['--help'],
      expected: 'Usage: reloaderoo [options] [command]',
      mode: 'CLI',
      description: '--help should trigger CLI mode'
    },
    {
      args: ['--version'],
      expected: /^\d+\.\d+\.\d+/,
      mode: 'CLI',
      description: '--version should trigger CLI mode'
    },
    {
      args: ['info'],
      expected: 'reloaderoo v',
      mode: 'CLI',
      description: 'info subcommand should trigger CLI mode'
    },
    {
      args: ['inspect', '--help'],
      expected: 'Inspect and debug MCP servers',
      mode: 'CLI',
      description: 'inspect subcommand should trigger CLI mode'
    },
    {
      args: ['proxy', '--help'],
      expected: 'Run as MCP proxy server',
      mode: 'CLI',
      description: 'proxy subcommand should trigger CLI mode'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const success = await testModeDetection(
      test.args, 
      test.expected, 
      test.mode, 
      test.description
    );
    
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('❌ Dual-mode behavior tests failed');
    process.exit(1);
  } else {
    console.log('✅ All dual-mode behavior tests passed');
    process.exit(0);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}