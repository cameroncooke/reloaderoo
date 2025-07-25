# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Reloaderoo** is a dual-purpose MCP (Model Context Protocol) tool that serves as both:

1. **MCP Server (Proxy Mode)** - A transparent development proxy for hot-reloading MCP servers
2. **MCP Client/CLI Tool (Inspection Mode)** - A debugging interface for inspecting MCP servers

## 🔄 Proxy Mode (Default Mode)

**Primary Purpose:** Hot-reloading MCP server development with transparent forwarding

### Architecture: Proxy Mode

```
MCP Client ↔ Reloaderoo Proxy (MCP Server) ↔ Child MCP Server
(e.g., Claude)   (transparent proxy + restart_server tool)   (your-server)
```

#### Key Characteristics:
- **IS an MCP Server** - Reloaderoo itself acts as an MCP server
- **Transparent Forwarding** - All MCP messages pass through seamlessly
- **Capability Augmentation** - Adds `restart_server` tool to child server's capabilities
- **Session Persistence** - Client connection remains active during server restarts
- **Default Mode** - Runs when using `reloaderoo` or `reloaderoo proxy`

#### Core Components (Proxy Mode):
- `MCPProxy` - Main proxy implementation
- `ProcessManager` - Child server lifecycle management
- `MessageRouter` - JSON-RPC message forwarding
- `CapabilityAugmenter` - Modifies `InitializeResult` to add proxy capabilities
- `RestartHandler` - Implements the `restart_server` tool

#### Message Flow (Proxy Mode):
1. Client sends MCP request → Reloaderoo Proxy
2. **If `restart_server` tool call:** Handle internally, restart child, notify client
3. **All other requests:** Forward to child server → return response to client
4. **Initialize handshake:** Intercept and add `restart_server` to capabilities
5. **Notifications:** Send `tools/list_changed` after restarts

#### Usage (Proxy Mode):
```bash
# Basic proxy usage (default mode)
reloaderoo -- node /path/to/my-mcp-server.js

# Explicit proxy mode with options  
reloaderoo proxy --log-level debug --max-restarts 5 -- node server.js
```

#### Configuration for MCP Clients (Proxy Mode):
```json
{
  "mcpServers": {
    "myDevelopmentServer": {
      "command": "node",
      "args": [
        "/path/to/reloaderoo/dist/bin/reloaderoo.js", 
        "proxy",
        "--log-level", "debug",
        "--",
        "node", 
        "/path/to/my-server.js"
      ]
    }
  }
}
```

## 🔍 Inspection Mode

**Primary Purpose:** MCP server debugging and development testing

### Dual Interface: CLI + MCP Server

Inspection mode serves **two different use cases**:

#### 1. CLI Interface (Primary Use Case)
**For AI agents that DON'T need direct MCP access** - Acts as an MCP client via CLI

```bash
# AI agents can use these commands directly without MCP configuration
reloaderoo inspect list-tools -- node my-server.js
reloaderoo inspect call-tool echo --params '{"message":"test"}' -- node my-server.js
reloaderoo inspect server-info -- node my-server.js
```

**Benefits for AI Agents:**
- ✅ No MCP server configuration required in AI session
- ✅ Direct CLI access to any MCP server for testing
- ✅ Perfect for development debugging workflows
- ✅ JSON formatted responses for easy parsing

#### 2. MCP Server Interface (Secondary Use Case)  
**For MCP clients that need protocol access** - Reloaderoo as inspection MCP server

```bash
# Start inspection MCP server
reloaderoo inspect mcp -- node /path/to/my-server.js
```

### Architecture: Inspection Mode

#### CLI Interface Architecture:
```
AI Agent ↔ CLI Commands ↔ Reloaderoo Inspector ↔ Child MCP Server
         (direct CLI calls)  (acts as MCP client)   (your-server)
```

#### MCP Server Interface Architecture:
```
MCP Client ↔ Reloaderoo Inspector (MCP Server) ↔ Child MCP Server  
(e.g., Claude)  (8 debug tools only)              (not directly exposed)
```

#### Key Characteristics:
- **CLI-First Design** - Primarily designed for command-line debugging
- **MCP Client Functionality** - Reloaderoo acts as a client to your MCP server
- **Debug Tools Only** - Exposes 8 inspection tools, child server tools accessed via `call_tool`
- **Development Focus** - Specifically for MCP server development and debugging

### Complete Inspection Tools List

#### Available Tools (8 total):

1. **`list_tools`** - List all available tools from child server
   ```bash
   reloaderoo inspect list-tools -- node server.js
   ```

2. **`call_tool`** - Call any tool on the child server
   ```bash
   reloaderoo inspect call-tool <tool-name> --params '{"param":"value"}' -- node server.js
   ```

3. **`list_resources`** - List all available resources from child server
   ```bash
   reloaderoo inspect list-resources -- node server.js
   ```

4. **`read_resource`** - Read a specific resource from child server
   ```bash
   reloaderoo inspect read-resource <resource-uri> -- node server.js
   ```

5. **`list_prompts`** - List all available prompts from child server
   ```bash
   reloaderoo inspect list-prompts -- node server.js
   ```

6. **`get_prompt`** - Get a specific prompt from child server
   ```bash
   reloaderoo inspect get-prompt <prompt-name> -- node server.js
   ```

7. **`get_server_info`** - Get comprehensive server information and capabilities
   ```bash
   reloaderoo inspect server-info -- node server.js
   ```

8. **`ping`** - Test connectivity and health of child server
   ```bash
   reloaderoo inspect ping -- node server.js
   ```

#### Core Components (Inspection Mode):
- `DebugProxy` - MCP server that exposes inspection tools
- `SimpleClient` - Lightweight MCP client for connecting to child servers
- `OutputFormatter` - Formats CLI responses with metadata and error handling

#### CLI Output Format:
```json
{
  "success": true,
  "data": {
    // Tool/resource/prompt data
  },
  "metadata": {
    "command": "list-tools", 
    "timestamp": "2025-07-25T12:00:00.000Z",
    "duration": 1200
  }
}
```

---

## 🏗️ SHARED ARCHITECTURE COMPONENTS

### Technical Specifications

**Current Stack:**
- **Language:** Node.js (published to npm as `reloaderoo`)
- **Protocol:** Model Context Protocol v2024-11-05 over stdio
- **Transport:** JSON-RPC over stdio
- **Platform:** Primary macOS support, POSIX-compatible for Linux

### Configuration

All modes support the same environment variables:

```bash
# Logging Configuration
MCPDEV_PROXY_LOG_LEVEL=debug           # Log level (debug, info, notice, warning, error, critical)
MCPDEV_PROXY_LOG_FILE=/path/to/log     # Custom log file path (default: stderr)
MCPDEV_PROXY_DEBUG_MODE=true           # Enable debug mode (true/false)

# Process Management
MCPDEV_PROXY_RESTART_LIMIT=5           # Maximum restart attempts (0-10, default: 3)
MCPDEV_PROXY_AUTO_RESTART=true         # Enable/disable auto-restart (true/false)
MCPDEV_PROXY_TIMEOUT=30000             # Operation timeout in milliseconds
MCPDEV_PROXY_RESTART_DELAY=1000        # Delay between restart attempts in milliseconds

# Child Process Configuration
MCPDEV_PROXY_CHILD_CMD=node            # Default child command
MCPDEV_PROXY_CHILD_ARGS="server.js"    # Default child arguments (space-separated)
MCPDEV_PROXY_CWD=/path/to/directory     # Default working directory
```

### Development Workflow

1. **Make changes to source code**
2. **Build:** `npm run build`
3. **Lint:** `npm run lint` 
4. **Test:** `npm test`
5. **Test CLI:** `reloaderoo inspect list-tools -- node test-server-sdk.js`
6. **Test MCP:** `reloaderoo inspect mcp -- node test-server-sdk.js`
7. **Test Proxy:** Configure MCP client to use proxy mode

### Task Completion Workflow

**After completing each implementation task:**
1. **Build:** `npm run build` - Verify TypeScript compilation
2. **Lint:** `npm run lint` - Check code quality and type safety  
3. **Test:** `npm test` - Run full test suite
4. **Manual Test:** Test relevant CLI commands
5. **Commit:** Create descriptive git commit
6. **Update Plan:** Mark task as completed in IMPLEMENTATION_PLAN.md

### Key Usage Distinctions

#### When to Use Proxy Mode:
- ✅ **Hot-reloading development** - When you want to develop MCP servers without client restarts
- ✅ **Production-like testing** - When you need full MCP protocol compatibility
- ✅ **Client integration** - When your AI client needs direct MCP server access

#### When to Use Inspection Mode (CLI):
- ✅ **MCP server debugging** - When you need to test MCP servers during development
- ✅ **AI agent debugging** - When AI agents need to inspect MCP servers without MCP config
- ✅ **Development workflow** - When you need quick CLI access to MCP functionality
- ✅ **Protocol testing** - When you need to validate MCP server implementations

#### When to Use Inspection Mode (MCP Server):
- ✅ **Protocol debugging** - When you need MCP client access to debug tools
- ✅ **Interactive inspection** - When you want to expose debug tools through MCP protocol
- ✅ **Development tooling** - When building MCP-based development tools