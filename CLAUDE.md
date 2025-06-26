# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`mcpdev-proxy` is a transparent MCP (Model Context Protocol) development wrapper that acts as a proxy between MCP clients (like Claude Code CLI) and MCP servers. It enables hot-reloading/restarting of MCP servers during development without losing client session state.

**Current Status:** Planning/design phase - only PRD documents exist, no implementation yet.

## Project Architecture

The proxy follows a simple flow:
```
MCP Client ↔ Proxy Wrapper ↔ Child MCP Server
(e.g., Claude)   (childName-dev)   (childName)
```

Key architectural principles:
- **Transparent forwarding:** All MCP JSON-RPC messages are forwarded between client and child server
- **Capability augmentation:** Intercepts `initialize` handshake to add `restart_server` tool to child's capabilities
- **Process lifecycle management:** Manages spawning, restarting, and terminating child MCP server processes
- **Session persistence:** Client session state persists through server restarts

## Technical Specifications

**Target Stack:**
- **Language:** Node.js (to be published to npm)
- **Protocol:** Model Context Protocol v2025-03-26 over stdio
- **Transport:** JSON-RPC over stdio
- **Platform:** Primary macOS support, POSIX-compatible for Linux

**Core Components to Implement:**
- `ProcessManager` - Handles child server lifecycle (spawn, restart, terminate)
- `MessageRouter` - Forwards JSON-RPC messages between client and child
- `CapabilityAugmenter` - Modifies `InitializeResult` to add proxy capabilities
- `RestartHandler` - Implements the `restart_server` tool functionality

## Key Features to Implement

1. **Child Server Lifecycle Management**
   - Spawn child MCP server on startup
   - Forward all JSON-RPC messages transparently
   - Intercept and handle `restart_server` tool calls
   - Auto-restart on child process crashes
   - Clean shutdown with graceful child termination

2. **Capability Forwarding**
   - Mirror all child server tools, resources, and prompts
   - Add `restart_server` tool to capabilities
   - Send appropriate notifications after restarts

3. **Dynamic Naming**
   - Append "-dev" suffix to child server name and version
   - Auto-detect child server info from `InitializeResult`

## Performance Requirements

- **Latency:** <10ms overhead per request
- **Memory:** <100MB for proxy process
- **Restart time:** <5 seconds + child initialization time
- **Crash recovery:** Auto-restart with crash-loop protection (max 3 retries)

## Error Handling Patterns

- Return proper `JSONRPCError` responses for failures
- Handle requests during child restart gracefully
- Provide clear error messages to stderr for diagnostics
- Implement timeout handling for child process operations

## Configuration Design

Expected configuration options:
- Child server command and arguments
- Working directory and environment variables
- Restart retry limits and timeouts
- Logging levels and output destinations

## Usage Pattern

When implemented, usage will be:
```bash
# Normal server command:
node /path/to/my-mcp-server.js

# Wrapped with proxy:
mcpdev-proxy --child-cmd "node /path/to/my-mcp-server.js"
```

## Development Workflow

When implementing:
1. Start with basic JSON-RPC message forwarding
2. Add process management and basic restart functionality  
3. Implement capability augmentation and `restart_server` tool
4. Add crash detection and auto-restart
5. Implement configuration system and CLI interface
6. Add comprehensive error handling and edge cases
7. Create tests covering all message forwarding scenarios

## Message Flow Patterns

Critical to implement proper handling of:
- `initialize` handshake interception and modification
- `tools/call` interception for `restart_server`
- Notification sending after restarts (`tools/list_changed`, etc.)
- Error responses during child unavailability
- Request queuing/rejection during restart operations
## Testing

### Learnings for Testing

- Always run comprehensive test scenarios that cover various edge cases
- Ensure Playwright tests simulate real-world usage patterns
- Validate tools with both default and custom parameters
- Monitor console logs and server logs for unexpected behaviors
- Consistently update test documentation as new tools or features are added

### Project Memories

- This project has multiple example projects in the @example_projects/ directory for different platforms and a comprehensive calculator app for iOS that has tests and can be used for UI testing and automation testing.

### MCP Inspector

Description: Debugging and verifying the `mcpdev-proxy` server via the MCP Inspector, using Playwright for UI automation and direct terminal commands for server management. This rule prioritizes stability and detailed verification through Playwright's introspection capabilities.

**Required Tools:**
- `Bash`
- `mcp__playwright__browser_navigate`
- `mcp__playwright__browser_type`
- `mcp__playwright__browser_click`
- `mcp__playwright__browser_snapshot`
- `mcp__playwright__browser_console_messages`
- `mcp__playwright__browser_wait_for`

**Project Configuration:**
- **Workspace Path:** `/Volumes/Developer/mcpdev-proxy`
- **Server Command:** `node dist/index.js`
- **Build Requirement:** Ensure `npm run build` has been run before starting the server

---

**Main Flow:**

**Phase 1: Start MCP Inspector Server**
1.  **Kill Existing Inspector Processes:**
    *   Action: Call `Bash`.
    *   `command`: `pkill -f 'npx @modelcontextprotocol/inspector' || true`
    *   Expected: Cleans up any lingering Inspector processes.
2.  **Start New Inspector Process:**
    *   Action: Call `Bash`.
    *   `command`: `nohup npx @modelcontextprotocol/inspector > /tmp/mcp-inspector.log 2>&1 &`
    *   Expected: MCP Inspector starts in the background without blocking.
3.  **Verify Inspector Started:**
    *   Action: Call `Bash`.
    *   `command`: `sleep 2 && curl -s http://127.0.0.1:6274 > /dev/null && echo "Inspector is running" || echo "Inspector failed to start"`
    *   Expected: Confirms the Inspector is accessible.

**Phase 2: Connect to Server via Playwright**
1.  **Navigate to Inspector URL:**
    *   Action: Call `mcp__playwright__browser_navigate`.
    *   `url`: `http://127.0.0.1:6274`
    *   Expected: Playwright opens the MCP Inspector web UI.
    *   Snapshot: Take a snapshot to confirm page load and identify initial form element references.
2.  **Fill Form (Command & Args only):**
    *   **Set Command:**
        *   Action: Call `mcp__playwright__browser_type`.
        *   `element`: "Command textbox" (Obtain `ref` from snapshot).
        *   `text`: `node`
    *   **Set Arguments:**
        *   Action: Call `mcp__playwright__browser_type`.
        *   `element`: "Arguments textbox" (Obtain `ref` from snapshot).
        *   `text`: `dist/index.js`
    *   *(Note: Environment Variables are skipped in this flow for simplicity and stability.)*
3.  **Click "Connect":**
    *   Action: Call `mcp__playwright__browser_click`.
    *   `element`: "Connect button" (Obtain `ref` from snapshot).
    *   Expected: Connection to the `mcpdev-proxy` server is established.
    *   Snapshot: Take a snapshot. Verify connection status and check for initial server logs in the UI.

**Phase 3: Interact with a Tool via Playwright**
1.  **List Tools:**
    *   Action: Call `mcp__playwright__browser_click`.
    *   `element`: "List Tools button" (Obtain `ref` from the latest snapshot).
    *   Expected: The list of available tools from the `mcpdev-proxy` server is displayed.
    *   Snapshot: Take a snapshot. Verify tools from the child MCP server are visible.
2.  **Select a Tool:**
    *   Action: Call `mcp__playwright__browser_click`.
    *   `element`: "discover_tools tool in list" (Obtain `ref` by identifying it in the snapshot's tool list).
    *   Expected: The parameters form for the selected tool is displayed in the right-hand panel.
    *   Snapshot: Take a snapshot. Verify the right panel shows details for the selected tool.
3.  **Execute the Tool:**
    *   Action: Call `mcp__playwright__browser_click`.
    *   `element`: "Run Tool button" (Obtain `ref` for the 'Run Tool' button in the right panel from the snapshot).
    *   Expected: The selected tool is executed with its default parameters.
    *   Snapshot: Take a snapshot.

**Phase 4: Verify Tool Execution and Logs in Playwright**
1.  **Check for Results in UI:**
    *   Action: Examine the latest snapshot.
    *   Look for: The results of the selected tool call in the 'Result from tool' section within the right-hand panel.
2.  **Check Console Logs (Optional but Recommended):**
    *   Action: Call `mcp__playwright__browser_console_messages`.
    *   Expected: Review for any errors or relevant messages from the Inspector or the tool interaction.
3.  **Check MCP Server Logs in UI:**
    *   Action: Examine the latest snapshot.
    *   Look for: Logs related to the selected tool execution in the main server log panel.

**Phase 5: Restart the child MCP Server**
1.  **List Tools:**
    *   Action: Call `mcp__playwright__browser_click`.
    *   `element`: "List Tools button" (Obtain `ref` from the latest snapshot).
    *   Expected: The list of available tools from the `mcpdev-proxy` server is displayed.
    *   Snapshot: Take a snapshot. Verify tools from the child MCP server are visible.
2.  **Select the restart_server Tool:**
    *   Action: Call `mcp__playwright__browser_click`.
    *   `element`: "restart_server tool in list" (Obtain `ref` by identifying it in the snapshot's tool list).
    *   Expected: The parameters form for the `restart_server` tool is displayed in the right-hand panel.
    *   Snapshot: Take a snapshot. Verify the right panel shows details for the `restart_server` tool.
3.  **Execute the restart_server Tool:**
    *   Action: Call `mcp__playwright__browser_click`.
    *   `element`: "Run Tool button" (Obtain `ref` for the 'Run Tool' button in the right panel from the snapshot).
    *   Expected: The `restart_server` tool is executed with its default parameters.
    *   Snapshot: Take a snapshot.
4.  **Check that child process is restarted:**
    *   Action: Call `Bash`.
    *   `command`: `ps aux | grep 'node test-server.js' | grep -v grep`
    *   Expected: The child process is restarted.
    *   Snapshot: Take a snapshot. Verify the child process is restarted.

**Troubleshooting Notes:**
- If connection fails, check the `Bash` command output for the Inspector to ensure it started correctly.
- Check Playwright console messages for clues using `mcp__playwright__browser_console_messages`.
- Ensure `npm run build` was run before starting the server.
- Element `ref` values can change. Always use the latest snapshot to get correct `ref` values before an interaction.
- Shadow DOM: The MCP Inspector UI uses Shadow DOM extensively. Playwright's default selectors should pierce Shadow DOM automatically.
- **Build Requirements:** The server must be built with `npm run build` before it can be started successfully.
- **Authentication**: MCP Inspector requires a proxy session token for connections. This token is displayed in the inspector logs when it starts. Add it to the "Proxy Session Token" field in the Configuration section before attempting to connect.
- **Tool Parameters**: The MCP Inspector doesn't show parameter input fields. It calls tools with empty parameter objects `{}`. Tools that require parameters will fail, while tools without required parameters will work correctly.
- **Scrolling**: Tools are displayed in a scrollable list. You may need to scroll to find specific tools in the left panel.

**Testing Methodology and Findings:**
- **Parameter Requirements**: Tools fall into two categories:
  - Tools with no required parameters: Can be tested successfully
  - Tools with required parameters: Will fail with proper validation messages
- **Validation Quality**: Parameter validation is working correctly - tools properly reject calls with missing required parameters
- **Testing Strategy**: Focus testing on tools without required parameters for functional verification; document parameter validation behavior for tools that require parameters
- **Expected Behavior**: Tools requiring parameters show clear error messages like "Required parameter 'workspacePath' is missing"
- **Schema vs Runtime Discrepancy**: Many tools marked as "optional parameters" actually require parameters at runtime

## Sub-Agent Testing Workflow

### Problem Statement
Browser automation snapshots consume excessive context (500-800+ lines per snapshot), making systematic tool testing unsustainable in a single session.

### Solution: Delegated Testing via Sub-Agents

**Main Session Role:**
- Manage overall testing strategy and track progress
- Create/Update TOOL_TEST_STATUS.md with results
- Coordinate testing phases and priorities
- Identify patterns and fix systematic issues

**Sub-Agent Role:**
- Handle browser automation with minimal context usage
- Test individual tools and report back concise results
- Report testing challenges and solutions for workflow improvement

### Sub-Agent Setup Requirements

**1. MCP Inspector Authentication Fix:**
- **Issue**: MCP Inspector requires proxy session tokens by default
- **Solution**: Use `DANGEROUSLY_OMIT_AUTH=true` environment variable
- **Command**: `DANGEROUSLY_OMIT_AUTH=true npx @modelcontextprotocol/inspector`

**2. Server Prerequisites:**
- Ensure mcpdev-proxy server is built: `npm run build`
- Start MCP Inspector without authentication
- Verify connection at http://127.0.0.1:6274

### Sub-Agent Prompt Templates

#### Phase 1: Zero Parameter Tools (Quick Wins)
```
**TASK**: Test mcpdev-proxy Phase 1 tool `[TOOL_NAME]` using MCP Inspector automation

**CONTEXT**: Testing Phase 1 (Zero Parameter Tools) to validate schema effectiveness. MCP Inspector should be running at http://127.0.0.1:6274 and connected to the schema-fixed mcpdev-proxy server.

**YOUR JOB**: Use Playwright browser automation to test this specific tool and report back essential results only.

**PHASE 1 EXPECTATIONS**:
- Tool should execute successfully with NO parameters required
- Should return actual data or success message (not parameter validation errors)

**INSTRUCTIONS**:
1. **Find a tool**: Scroll/search for `[TOOL_NAME]` in the left panel tool list
2. **Click the tool**: Click on `[TOOL_NAME]` to select it  
3. **Check parameters**: Note if any parameter fields are shown in the right panel
4. **Run the tool**: Click "Run Tool" button to execute with default/empty parameters
5. **Observe result**: Check for success output (NOT parameter validation error)

**SUCCESS CRITERIA**:
- Tool executes without parameter validation errors
- Returns meaningful data/output (device lists, success messages, etc.)
- No "Required parameter missing" errors

**EFFICIENT REPORT FORMAT**:
```
TOOL: [TOOL_NAME]
STATUS: [PASS/FAIL/PARTIAL]
RESULT: [Brief description - success output or validation error]
PARAMETER_FIELDS_SHOWN: [Yes/No - any parameter fields visible in UI]
ERROR: [Error message if any, or "None"]
SCHEMA_FIX_WORKING: [Yes/No - based on parameter visibility]
TIMESTAMP: [Current timestamp]
```

**CONTEXT EFFICIENCY**: This validates schema effectiveness across zero-parameter tools.
```

#### General Tool Testing (Phases 2-6)
```
**TASK**: Test mcpdev-proxy tool `[TOOL_NAME]` using MCP Inspector automation

**CONTEXT**: Testing [PHASE] tools after schema fix implementation. Focus on parameter validation behavior rather than functional success.

**YOUR JOB**: Use Playwright browser automation to test parameter validation and report back essential results only.

**INSTRUCTIONS**:
1. **Find a tool**: Scroll/search for `[TOOL_NAME]` in the left panel tool list
2. **Click the tool**: Click on `[TOOL_NAME]` to select it
3. **Check parameter display**: Note all parameter fields shown in the right panel
4. **Run the tool**: Click "Run Tool" button to execute with empty parameters  
5. **Observe validation**: Check for clear parameter validation messages

**VALIDATION FOCUS**:
- Are required parameters clearly displayed in MCP Inspector UI?
- Do validation error messages clearly identify missing parameters?
- Has schema fix resolved parameter visibility issues?

**EFFICIENT REPORT FORMAT**:
```
TOOL: [TOOL_NAME]
STATUS: [PASS/FAIL/VALIDATION_OK]
PARAMETER_FIELDS_SHOWN: [List of visible parameter fields]
ERROR: [Validation error message, or "None"]
SCHEMA_FIX_IMPACT: [Better/Same/Worse than before]
VALIDATION_QUALITY: [Clear/Unclear parameter error messages]
TIMESTAMP: [Current timestamp]
```

**CONTEXT EFFICIENCY**: Focus on parameter validation behavior, not functional testing.
```
```

### Project Memories

- **Testing Note**: So the test isn't a success unless you test via the inspector as that was a real world test and didn't work.

## MCP Testing Instructions

### Important Testing Considerations

When testing Reloaderoo with MCP:

1. **MCP Server Lifecycle**: Claude Code does not control the MCP server's lifecycle. The MCP server is managed by the Claude Code application.

2. **Testing Approach**: 
   - DO NOT run the server directly as a separate process for testing
   - Running a new process directly is NOT the same environment as running the MCP from a true client application like Claude Code
   - To test changes, you must restart Claude Code to force the MCP process to restart

3. **Logging**:
   - Currently, Reloaderoo logs to stderr only (no file logging implemented yet)
   - To inspect logs when running via MCP, we need to either:
     - Add file logging support to Reloaderoo
     - Access the Claude Code application's capture of stderr output

4. **MCP Configuration Location**: 
   - Configuration file: `/Users/cameroncooke/.claude.json`
   - Current test configuration:
   ```json
   "mcpServers": {
     "reloaderooTest": {
       "command": "node",
       "args": [
         "/Volumes/Developer/Reloaderoo/dist/bin/reloaderoo.js",
         "--debug-mode",
         "--log-level",
         "debug",
         "--",
         "node",
         "/Volumes/Developer/Reloaderoo/test-server-sdk.js"
       ],
       "env": {
         "MCPDEV_PROXY_DEBUG_MODE": "true"
       }
     }
   }
   ```

5. **Debug Mode**:
   - Can be enabled via `--debug-mode` CLI flag OR `MCPDEV_PROXY_DEBUG_MODE=true` environment variable
   - When properly configured, should expose 8 debug inspection tools
   - If only seeing child server tools, the MCP client is bypassing the proxy