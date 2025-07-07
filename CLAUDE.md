# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Reloaderoo** is a transparent MCP (Model Context Protocol) development wrapper that acts as a proxy between MCP clients (like Claude Code CLI) and MCP servers. It enables hot-reloading/restarting of MCP servers during development without losing client session state.

**Current Status:** Fully implemented and working. The project includes both proxy functionality and inspection tools.

## Project Architecture

Reloaderoo operates in two distinct modes:

### 1. Proxy Mode (`reloaderoo proxy` or `reloaderoo`)
```
MCP Client ↔ Reloaderoo Proxy ↔ Child MCP Server
(e.g., Claude)  (transparent proxy)  (your-server)
```
**Tools Exposed:** All child server tools + `restart_server` tool
**Purpose:** Hot-reloading with transparent forwarding

### 2. Inspection Mode (`reloaderoo inspect mcp`)
```
MCP Client ↔ Reloaderoo Inspector ↔ Child MCP Server
(e.g., Claude)  (8 debug tools only)    (not directly exposed)
```
**Tools Exposed:** 8 inspection tools only (child tools accessed via `call_tool`)
**Purpose:** MCP protocol debugging and inspection

### Key Architectural Principles:
- **Transparent forwarding (Proxy mode):** All MCP JSON-RPC messages are forwarded between client and child server
- **Capability augmentation (Proxy mode):** Intercepts `initialize` handshake to add `restart_server` tool to child's capabilities
- **Protocol introspection (Inspection mode):** Exposes MCP protocol operations as tools for debugging
- **Process lifecycle management:** Manages spawning, restarting, and terminating child MCP server processes
- **Session persistence:** Client session state persists through server restarts

## Technical Specifications

**Current Stack:**
- **Language:** Node.js (published to npm as `reloaderoo`)
- **Protocol:** Model Context Protocol v2024-11-05 over stdio
- **Transport:** JSON-RPC over stdio
- **Platform:** Primary macOS support, POSIX-compatible for Linux

**Core Components:**
- `MCPProxy` - Main proxy implementation for hot-reloading
- `DebugProxy` - MCP server that exposes inspection tools
- `SimpleClient` - Lightweight MCP client for CLI and debugging
- `ProcessManager` - Handles child server lifecycle
- `MessageRouter` - Forwards JSON-RPC messages
- `CapabilityAugmenter` - Modifies `InitializeResult` to add proxy capabilities
- `RestartHandler` - Implements the `restart_server` tool functionality

## Key Features

1. **Hot-Reloading Proxy Mode**
   - Transparent proxy between MCP client and server
   - Adds `restart_server` tool to any MCP server
   - Preserves client session during server restarts
   - Auto-restart on child process crashes

2. **Inspection Mode**
   - MCP server that exposes debugging tools
   - 8 inspection tools: list_tools, call_tool, list_resources, read_resource, list_prompts, get_prompt, get_server_info, ping
   - Can inspect any MCP server via CLI or MCP protocol

3. **CLI Interface**
   - Direct inspection commands for debugging
   - Consistent API design across all modes

## Usage Patterns

### Proxy Mode (Hot-Reloading)
```bash
# Basic proxy usage
reloaderoo -- node /path/to/my-mcp-server.js

# With options
reloaderoo --log-level debug --max-restarts 5 -- node server.js
```

### Inspection Mode (MCP Server)
```bash
# Start MCP inspection server
reloaderoo inspect mcp -- node /path/to/my-mcp-server.js
```

### CLI Inspection
```bash
# Direct CLI inspection (runs once and exits)
reloaderoo inspect list-tools -- node server.js
reloaderoo inspect call-tool echo --params '{"message":"hello"}' -- node server.js
```

## Configuration

Configuration via environment variables:
- `MCPDEV_PROXY_LOG_LEVEL` - Set log level
- `MCPDEV_PROXY_LOG_FILE` - Custom log file path
- `MCPDEV_PROXY_RESTART_LIMIT` - Max restart attempts
- `MCPDEV_PROXY_AUTO_RESTART` - Enable/disable auto-restart
- `MCPDEV_PROXY_TIMEOUT` - Operation timeout
- `MCPDEV_PROXY_DEBUG_MODE` - Enable debug mode

## Performance

- **Latency:** <10ms overhead per request
- **Memory:** <100MB for proxy process
- **Restart time:** <5 seconds + child initialization time
- **Crash recovery:** Auto-restart with crash-loop protection

## Architecture Notes

### Unified Client Implementation
The project uses a single `SimpleClient` implementation for both:
- CLI inspection commands (`reloaderoo inspect list-tools`)
- MCP inspection server (`reloaderoo inspect mcp`)

This ensures consistency and eliminates code duplication.

### Message Flow
- `initialize` handshake interception and modification
- `tools/call` interception for `restart_server`
- Notification sending after restarts (`tools/list_changed`, etc.)
- Error responses during child unavailability
- Request queuing/rejection during restart operations

## Testing

### MCP Inspector Integration
Use the MCP Inspector for real-world testing:

```bash
# Start MCP Inspector
npm run inspector

# Test proxy mode
npm run inspector:test

# Test inspection mode
npm run inspector:inspect
```

### Testing Configuration
- **Workspace Path:** `/Volumes/Developer/Reloaderoo`
- **Server Command:** `node dist/bin/reloaderoo.js`
- **Build Requirement:** Always run `npm run build` before testing

### MCP Inspector Setup
- **Authentication:** Use `DANGEROUSLY_OMIT_AUTH=true` for development
- **URL:** http://127.0.0.1:6274
- **Tool Testing:** Focus on tools without required parameters for quick validation

## Development Workflow

1. **Make changes to source code**
2. **Build:** `npm run build`
3. **Test CLI:** `reloaderoo inspect list-tools -- node test-server-sdk.js`
4. **Test MCP:** `reloaderoo inspect mcp -- node test-server-sdk.js`
5. **Test with Inspector:** `npm run inspector:inspect`

## Important Notes

### MCP Client Integration
When using with MCP clients like Claude Code:
- The MCP server lifecycle is managed by the client application
- Use the correct binary path: `dist/bin/reloaderoo.js`
- For inspection mode, use: `reloaderoo inspect mcp -- <child-command>`
- For proxy mode, use: `reloaderoo -- <child-command>`

### Configuration for Claude Code
```json
{
  "mcpServers": {
    "myServer": {
      "command": "node",
      "args": [
        "/path/to/reloaderoo/dist/bin/reloaderoo.js",
        "--",
        "node",
        "/path/to/my-server.js"
      ]
    }
  }
}
```

### For Inspection Mode
```json
{
  "mcpServers": {
    "reloaderooInspector": {
      "command": "node",
      "args": [
        "/path/to/reloaderoo/dist/bin/reloaderoo.js",
        "inspect",
        "mcp",
        "--",
        "node",
        "/path/to/my-server.js"
      ]
    }
  }
}
```