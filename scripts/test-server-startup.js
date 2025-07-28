#!/usr/bin/env node

/**
 * Test MCP Server startup functionality
 * Verifies that the server starts correctly and outputs expected messages
 */

import { spawn } from 'child_process';

/**
 * Run server startup test with timeout
 */
function testServerStartup(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn('reloaderoo', [
      '--',
      'node',
      '-e',
      'console.log("test-server-ready"); setTimeout(() => {}, 10000)'
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    // Set timeout to kill process
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ output, timedOut: true });
    }, timeoutMs);
    
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ output, code, timedOut: false });
    });
    
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Check for expected message in output
 */
function checkMessage(output, expectedMessage, description) {
  if (output.includes(expectedMessage)) {
    console.log(`✅ ${description} - FOUND`);
    return true;
  } else {
    console.log(`❌ ${description} - NOT FOUND`);
    return false;
  }
}

/**
 * Main test suite
 */
async function runTests() {
  console.log('🚀 Testing MCP Server Startup...\n');
  
  try {
    console.log('Starting server with 5-second timeout...');
    const result = await testServerStartup(5000);
    
    if (result.timedOut) {
      console.log('✅ Server timed out as expected (5s)');
    } else {
      console.log(`ℹ️  Server exited with code: ${result.code}`);
    }
    
    console.log('\n📋 Checking for expected startup messages...\n');
    
    const checks = [
      {
        message: 'Starting reloaderoo MCP proxy server',
        description: 'Server startup message'
      },
      {
        message: 'Starting Reloaderoo',
        description: 'Reloaderoo initialization message'
      },
      {
        message: 'Starting child MCP server',
        description: 'Child server startup message'
      }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const check of checks) {
      const success = checkMessage(result.output, check.message, check.description);
      if (success) {
        passed++;
      } else {
        failed++;
      }
    }
    
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
      console.log('\n❌ Server startup test failed');
      console.log('\n=== Server Output ===');
      console.log(result.output);
      console.log('====================');
      process.exit(1);
    } else {
      console.log('\n✅ All server startup tests passed');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Error running server startup test:', error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}