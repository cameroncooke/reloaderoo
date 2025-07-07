# Reloaderoo CLI Refactoring Design

## Overview

Transform Reloaderoo from a pure MCP server into a CLI tool that can operate in two distinct modes:
1. **CLI Mode**: Direct command-line interface for debugging and inspection
2. **Server Mode**: MCP server wrapper that delegates to the CLI tool

## Architecture Changes

### Current Architecture
```
MCP Client → Reloaderoo MCP Server → Child MCP Server
```

### New Architecture
```
# CLI Mode (Direct Usage)
User → Reloaderoo CLI → Child MCP Server

# Server Mode (MCP Wrapper)
MCP Client → Reloaderoo MCP Server → Reloaderoo CLI → Child MCP Server
```

## CLI Design

### Command Structure

```bash
# Standard proxy mode (existing behavior)
reloaderoo proxy -- node my-server.js

# New inspection commands (CLI mode)
reloaderoo inspect list-tools -- node my-server.js
reloaderoo inspect call-tool <tool-name> [--params '{"key": "value"}'] -- node my-server.js
reloaderoo inspect list-resources -- node my-server.js
reloaderoo inspect read-resource <uri> -- node my-server.js
reloaderoo inspect list-prompts -- node my-server.js
reloaderoo inspect get-prompt <name> [--args '{"key": "value"}'] -- node my-server.js
reloaderoo inspect server-info -- node my-server.js
reloaderoo inspect ping -- node my-server.js

# Info command (existing)
reloaderoo info
```

### CLI Mode Behavior

When running in CLI mode:
- Creates an MCP client connection to the child server
- Executes the requested command
- Outputs the raw JSON response to stdout
- Exits with appropriate status code

### Server Mode Behavior

When running as an MCP server wrapper:
- Spawns the CLI tool as a subprocess for each request
- Passes command and parameters via command-line arguments
- Captures stdout for the response
- Handles errors and timeouts appropriately

## Implementation Plan

### Phase 1: Core Refactoring

1. **Extract MCP Client Logic**
   - Create `src/mcp-client.ts` for client-side MCP communication
   - Implement connection management and request/response handling
   - Support all MCP protocol methods

2. **Refactor CLI Structure**
   - Add `inspect` command group to Commander.js setup
   - Implement subcommands for each inspection operation
   - Add JSON output formatting

3. **Create Unified Interface**
   - Define `InspectionResult` type for consistent output
   - Implement error handling and status codes
   - Add timeout management

### Phase 2: Server Wrapper

1. **Create Server Wrapper**
   - New file: `src/mcp-server-wrapper.ts`
   - Spawns CLI tool for each inspection request
   - Maps MCP tool calls to CLI commands

2. **Update Debug Proxy**
   - Refactor to use the server wrapper
   - Remove direct child process management
   - Delegate all operations to CLI

### Phase 3: Testing & Polish

1. **Add CLI Tests**
   - Test each inspection command
   - Verify JSON output format
   - Test error conditions

2. **Update Documentation**
   - CLI usage examples
   - Server mode configuration
   - Migration guide

## Technical Considerations

### Benefits
- **Debugging**: Easy to test and debug without MCP client
- **Flexibility**: Can be used in scripts and automation
- **Separation**: Clear boundary between CLI and server logic
- **Composability**: CLI output can be piped to other tools

### Challenges
- **Performance**: Spawning CLI for each request adds overhead
- **State Management**: CLI is stateless, server maintains connection
- **Error Propagation**: Need to properly map CLI errors to MCP errors

### Mitigation Strategies
- Cache child server connection in server mode
- Use process pooling for frequent requests
- Implement proper error mapping and logging

## File Structure Changes

```
src/
├── bin/
│   └── reloaderoo.ts          # Enhanced CLI entry point
├── cli/
│   ├── commands/
│   │   ├── proxy.ts           # Proxy command (existing behavior)
│   │   └── inspect.ts         # New inspection commands
│   ├── client.ts              # MCP client implementation
│   └── formatter.ts           # Output formatting utilities
├── server/
│   ├── wrapper.ts             # Server wrapper for CLI
│   └── debug-tools.ts         # Debug tool definitions
├── mcp-proxy.ts               # Standard proxy (unchanged)
├── debug-proxy.ts             # Updated to use CLI wrapper
└── index.ts                   # Main entry point
```

## Migration Path

1. **Backward Compatibility**
   - Existing `reloaderoo -- node server.js` continues to work
   - Debug mode (`--debug-mode`) still functions as before
   - No breaking changes to public API

2. **Gradual Adoption**
   - CLI mode is opt-in via `inspect` command
   - Server mode continues using existing logic initially
   - Can switch to CLI wrapper after validation

## Example Usage

### CLI Mode Examples

```bash
# List all tools available in the server
$ reloaderoo inspect list-tools -- node my-server.js
{
  "tools": [
    {
      "name": "get_weather",
      "description": "Get weather for a location",
      "inputSchema": { ... }
    }
  ]
}

# Call a specific tool
$ reloaderoo inspect call-tool get_weather --params '{"location": "London"}' -- node my-server.js
{
  "content": [
    {
      "type": "text",
      "text": "The weather in London is 15°C and cloudy"
    }
  ]
}

# Get server information
$ reloaderoo inspect server-info -- node my-server.js
{
  "protocolVersion": "2024-11-05",
  "capabilities": { ... },
  "serverInfo": {
    "name": "weather-server",
    "version": "1.0.0"
  }
}
```

### Server Mode (No Changes for Users)

```bash
# Start reloaderoo as MCP server
$ reloaderoo --debug-mode -- node my-server.js

# Claude/MCP client sees debug tools and can call them normally
```

## Success Criteria

1. All existing functionality preserved
2. CLI mode provides complete inspection capabilities
3. Performance overhead < 50ms per request in server mode
4. Clear error messages and proper exit codes
5. Comprehensive test coverage
6. Updated documentation with examples