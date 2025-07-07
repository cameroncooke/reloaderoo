#!/usr/bin/env node
/**
 * reloaderoo - A transparent MCP development wrapper
 * 
 * Main CLI entry point for the proxy functionality.
 */

// Re-export everything for library usage
export { MCPProxy } from './mcp-proxy.js';
export * from './types.js';
export { logger } from './mcp-logger.js';

// CLI functionality - only run if this file is executed directly
// Handle both direct execution and symlink execution (like npx)
import { fileURLToPath } from 'url';
import { realpath } from 'fs/promises';

const currentFile = fileURLToPath(import.meta.url);
const executablePath = process.argv[1] ? await realpath(process.argv[1]) : null;

if (executablePath && currentFile === executablePath) {
  const { runCLI } = await import('./bin/reloaderoo.js');
  await runCLI();
}