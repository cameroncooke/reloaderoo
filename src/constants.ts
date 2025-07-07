/**
 * Application-wide constants for Reloaderoo
 * 
 * This file contains constants for strings that are repeated across multiple files
 * or are critical for protocol compliance and configuration consistency.
 */

/**
 * MCP (Model Context Protocol) related constants
 */
export const MCP_PROTOCOL = {
  VERSION: '2024-11-05',
  JSONRPC_VERSION: '2.0',
  METHODS: {
    INITIALIZE: 'initialize',
    TOOLS_LIST: 'tools/list',
    TOOLS_CALL: 'tools/call',
    RESOURCES_LIST: 'resources/list',
    RESOURCES_READ: 'resources/read',
    PROMPTS_LIST: 'prompts/list',
    PROMPTS_GET: 'prompts/get'
  },
  NOTIFICATIONS: {
    TOOLS_LIST_CHANGED: 'notifications/tools/list_changed',
    RESOURCES_LIST_CHANGED: 'notifications/resources/list_changed',
    PROMPTS_LIST_CHANGED: 'notifications/prompts/list_changed'
  }
} as const;

/**
 * Proxy-specific tool names
 */
export const PROXY_TOOLS = {
  RESTART_SERVER: 'restart_server'
} as const;

/**
 * Environment variable names for configuration
 */
export const ENV_VARS = {
  LOG_LEVEL: 'MCPDEV_PROXY_LOG_LEVEL',
  LOG_FILE: 'MCPDEV_PROXY_LOG_FILE',
  RESTART_LIMIT: 'MCPDEV_PROXY_RESTART_LIMIT',
  AUTO_RESTART: 'MCPDEV_PROXY_AUTO_RESTART',
  TIMEOUT: 'MCPDEV_PROXY_TIMEOUT',
  RESTART_DELAY: 'MCPDEV_PROXY_RESTART_DELAY',
  CHILD_CMD: 'MCPDEV_PROXY_CHILD_CMD',
  CHILD_ARGS: 'MCPDEV_PROXY_CHILD_ARGS',
  CWD: 'MCPDEV_PROXY_CWD',
  DEBUG_MODE: 'MCPDEV_PROXY_DEBUG_MODE'
} as const;

/**
 * Standard error messages
 */
export const ERROR_MESSAGES = {
  METHOD_NOT_FOUND: 'Method not found'
} as const;