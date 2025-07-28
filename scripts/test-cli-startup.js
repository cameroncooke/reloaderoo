#!/usr/bin/env node

/**
 * Test CLI functionality startup tests
 * Verifies that all CLI help commands work correctly
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
 * Test a CLI command and verify expected output
 */
async function testCommand(args, expectedPattern, description) {
  console.log(`Testing: ${description}...`);
  
  try {
    const result = await runCommand(args);
    const output = result.stdout + result.stderr;
    
    if (typeof expectedPattern === 'string' ? output.includes(expectedPattern) : output.match(expectedPattern)) {
      console.log(`✅ ${description} - PASSED`);
      return true;
    } else {
      console.log(`❌ ${description} - FAILED`);
      console.log(`Expected pattern: ${expectedPattern}`);
      console.log(`Got output: ${output.substring(0, 200)}...`);
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
  console.log('🚀 Testing CLI Startup Functionality...\n');
  
  const tests = [
    {
      args: ['--help'],
      expected: 'Two modes, one tool',
      description: 'Main help command'
    },
    {
      args: ['--version'],
      expected: /^\d+\.\d+\.\d+/,
      description: 'Version command'
    },
    {
      args: ['info'],
      expected: 'reloaderoo v',
      description: 'Info command'
    },
    {
      args: ['inspect', '--help'],
      expected: 'Inspect and debug MCP servers',
      description: 'Inspect help command'
    },
    {
      args: ['proxy', '--help'],
      expected: 'Run as MCP proxy server',
      description: 'Proxy help command'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const success = await testCommand(test.args, test.expected, test.description);
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('❌ CLI startup tests failed');
    process.exit(1);
  } else {
    console.log('✅ All CLI startup tests passed');
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