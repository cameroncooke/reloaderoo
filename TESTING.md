# Testing Guide for Reloaderoo

This guide provides comprehensive instructions for testing Reloaderoo using the included test MCP servers and various testing scenarios.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Test MCP Servers](#test-mcp-servers)
- [CLI Mode Testing](#cli-mode-testing)
- [Server Mode Testing](#server-mode-testing)
- [Advanced Testing Scenarios](#advanced-testing-scenarios)
- [Performance Testing](#performance-testing)
- [Troubleshooting](#troubleshooting)

## Prerequisites

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Verify installation:**
   ```bash
   node dist/bin/reloaderoo.js --version
   ```

## Test MCP Servers

The repository includes several test MCP servers for different testing scenarios:

### 1. `test-server-sdk.js` - Full-featured SDK Server
- **Description**: Uses official `@modelcontextprotocol/sdk`
- **Tools**: `echo`, `add`, `greet`, plus dynamically generated tools
- **Features**: Proper error handling, random tool generation, lifecycle logging
- **Best for**: Comprehensive testing, CLI inspection, server restart testing

### 2. `test-server.js` - Basic Test Server
- **Description**: Simple server with minimal tools
- **Tools**: `discover_tools`, `echo`
- **Features**: Basic functionality, error simulation
- **Best for**: Quick testing, basic functionality verification

### 3. Debug Test Clients
- **`test-debug-client.js`**: Tests debug mode with tool inspection
- **`test-debug-resources.js`**: Tests resource and prompt inspection

## CLI Mode Testing

### Basic Inspection Commands

#### 1. List Available Tools
```bash
# Using SDK server (recommended)
node dist/bin/reloaderoo.js inspect list-tools -- node test-server-sdk.js

# Using basic server
node dist/bin/reloaderoo.js inspect list-tools -- node test-server.js
```

**Expected Output:**
- JSON structure with `success: true`
- Array of tools with `name`, `description`, and `inputSchema`
- Metadata including timestamp and duration

#### 2. Get Server Information
```bash
node dist/bin/reloaderoo.js inspect server-info -- node test-server-sdk.js
```

**Expected Output:**
- Protocol version information
- Server capabilities
- Basic server metadata

#### 3. Test Server Connectivity
```bash
node dist/bin/reloaderoo.js inspect ping -- node test-server-sdk.js
```

**Expected Output:**
- `alive: true` if server is responsive
- Timestamp of the ping

### Tool Interaction Testing

#### 1. Call Simple Tools
```bash
# Echo tool test
node dist/bin/reloaderoo.js inspect call-tool echo \
  --params "{\"message\": \"Hello from CLI!\"}" \
  -- node test-server-sdk.js

# Add tool test (mathematical operation)
node dist/bin/reloaderoo.js inspect call-tool add \
  --params "{\"a\": 15, \"b\": 27}" \
  -- node test-server-sdk.js

# Greeting tool test
node dist/bin/reloaderoo.js inspect call-tool greet \
  --params "{\"name\": \"Alice\"}" \
  -- node test-server-sdk.js
```

#### 2. Call Dynamic Tools
The SDK server generates random tools that change each restart:
```bash
# First, list tools to see what's available
node dist/bin/reloaderoo.js inspect list-tools -- node test-server-sdk.js

# Then call a dynamic tool (replace 'dice_XXXX' with actual name)
node dist/bin/reloaderoo.js inspect call-tool dice_1234 \
  --params "{\"sides\": 20}" \
  -- node test-server-sdk.js
```

### Error Handling Testing

#### 1. Invalid Tool Names
```bash
node dist/bin/reloaderoo.js inspect call-tool nonexistent_tool \
  -- node test-server-sdk.js
```

**Expected:** Error response with clear message about unknown tool.

#### 2. Invalid Parameters
```bash
node dist/bin/reloaderoo.js inspect call-tool add \
  --params "{\"a\": \"not_a_number\", \"b\": 5}" \
  -- node test-server-sdk.js
```

**Expected:** Error response about invalid parameter types.

#### 3. Missing Required Parameters
```bash
node dist/bin/reloaderoo.js inspect call-tool echo \
  -- node test-server-sdk.js
```

**Expected:** Error response about missing required parameters.

### Raw Output Mode

For scripting and automation, use `--raw` flag:
```bash
node dist/bin/reloaderoo.js inspect list-tools --raw \
  -- node test-server-sdk.js
```

**Expected:** Direct JSON output without metadata wrapper.

## Server Mode Testing

### Standard Proxy Mode

#### 1. Basic Proxy Operation
```bash
# Start server (will run until terminated)
node dist/bin/reloaderoo.js proxy -- node test-server-sdk.js

# Or using backward compatibility
node dist/bin/reloaderoo.js -- node test-server-sdk.js
```

**Expected Output:**
- Server startup messages
- Child process connection confirmation
- Server runs indefinitely until SIGTERM/SIGINT

#### 2. Test with External MCP Client
```bash
# In one terminal - start proxy
node dist/bin/reloaderoo.js proxy -- node test-server-sdk.js

# In another terminal - test with debug client
node test-debug-client.js
```

### Debug Mode Testing

#### 1. Start Debug Inspector Server
```bash
node dist/bin/reloaderoo.js proxy --debug-mode -- node test-server-sdk.js
```

**Expected:** 
- Server starts in debug/inspection mode
- Exposes 8 debug tools for MCP inspection
- Can be connected to via MCP clients

#### 2. Test with Debug Clients
```bash
# Test basic debug functionality
node test-debug-client.js

# Test resources and prompts inspection
node test-debug-resources.js
```

### Restart Testing

#### 1. Manual Restart Testing
Start server and test restart functionality:
```bash
# Start proxy
node dist/bin/reloaderoo.js proxy -- node test-server-sdk.js

# From another terminal, connect with MCP client and call restart_server tool
# (This requires an MCP client that can call the restart_server tool)
```

#### 2. Crash Recovery Testing
Test automatic restart on child process crashes:
```bash
# Start proxy with verbose logging
node dist/bin/reloaderoo.js proxy --log-level debug -- node test-server-sdk.js

# Kill child process to test auto-restart
# pkill -f test-server-sdk.js
```

**Expected:** 
- Child process detected as crashed
- Automatic restart initiated
- New child process spawned
- Connection re-established

## Advanced Testing Scenarios

### 1. Configuration Testing

#### Environment Variables
```bash
# Test with environment configuration
MCPDEV_PROXY_LOG_LEVEL=debug \
MCPDEV_PROXY_MAX_RESTARTS=5 \
node dist/bin/reloaderoo.js proxy -- node test-server-sdk.js
```

#### Command Line Options
```bash
# Test with various CLI options
node dist/bin/reloaderoo.js proxy \
  --log-level debug \
  --max-restarts 2 \
  --restart-delay 2000 \
  --working-dir /tmp \
  -- node test-server-sdk.js
```

#### Dry Run Mode
```bash
# Test configuration validation
node dist/bin/reloaderoo.js proxy --dry-run \
  --log-level debug \
  --max-restarts 3 \
  -- node test-server-sdk.js
```

### 2. Different Child Servers

#### Python MCP Server (if available)
```bash
node dist/bin/reloaderoo.js inspect list-tools -- python my_server.py
```

#### Different Node.js Servers
```bash
# Test with different servers
node dist/bin/reloaderoo.js inspect list-tools -- node test-server.js
node dist/bin/reloaderoo.js inspect list-tools -- node test-server-sdk.js
```

### 3. Testing with Incomplete MCP Servers

Reloaderoo is designed to work with MCP servers that don't implement all protocol methods. When testing with servers that have incomplete implementations:

#### Expected Behavior
- **Missing `tools/list`**: Returns empty tools array, logs warning
- **Missing `resources/list`**: Returns empty resources array  
- **Missing `prompts/list`**: Returns empty prompts array
- **Server continues functioning**: Proxy mode works even with missing methods

#### Test with Incomplete Server
```bash
# These should all return empty arrays instead of errors
node dist/bin/reloaderoo.js inspect list-tools -- node incomplete-server.js
node dist/bin/reloaderoo.js inspect list-resources -- node incomplete-server.js  
node dist/bin/reloaderoo.js inspect list-prompts -- node incomplete-server.js

# Proxy mode should still start successfully
node dist/bin/reloaderoo.js proxy -- node incomplete-server.js
```

#### Example with Real Server
```bash
# Example with XcodeBuildMCP server (incomplete implementation)
node dist/bin/reloaderoo.js inspect list-tools --working-dir /path/to/server -- node server.js
node dist/bin/reloaderoo.js proxy --working-dir /path/to/server -- node server.js
```

#### Log Messages to Expect
- `Child server does not support tools/list - continuing with empty tool list`
- `Child does not support resources`
- `Child does not support prompts`

### 4. Edge Cases

#### Large Payloads
```bash
# Test with large message parameter
node dist/bin/reloaderoo.js inspect call-tool echo \
  --params "{\"message\": \"$(printf 'A%.0s' {1..1000})\"}" \
  -- node test-server-sdk.js
```

#### Special Characters
```bash
# Test with special characters
node dist/bin/reloaderoo.js inspect call-tool echo \
  --params "{\"message\": \"Hello 世界! 🌍 Special: \\\"quotes\\\" and \\\\backslashes\\\\\"}" \
  -- node test-server-sdk.js
```

#### Timeout Testing
```bash
# Test with short timeout
node dist/bin/reloaderoo.js inspect ping --timeout 1000 \
  -- node test-server-sdk.js
```

## Performance Testing

### 1. CLI Response Times
```bash
# Measure CLI command performance
time node dist/bin/reloaderoo.js inspect list-tools -- node test-server-sdk.js
time node dist/bin/reloaderoo.js inspect ping -- node test-server-sdk.js
```

### 2. Repeated Operations
```bash
# Test multiple rapid calls
for i in {1..5}; do
  echo "Call $i:"
  node dist/bin/reloaderoo.js inspect ping -- node test-server-sdk.js | jq '.data.timestamp'
  sleep 1
done
```

### 3. Concurrent Testing
```bash
# Test multiple concurrent CLI operations
node dist/bin/reloaderoo.js inspect ping -- node test-server-sdk.js &
node dist/bin/reloaderoo.js inspect list-tools -- node test-server-sdk.js &
node dist/bin/reloaderoo.js inspect server-info -- node test-server-sdk.js &
wait
```

## Browser-Based Testing with MCP Inspector

### 1. Start MCP Inspector
```bash
npm run inspector
```

### 2. Connect to Reloaderoo
1. Open browser to `http://127.0.0.1:6274`
2. Configure connection:
   - **Command**: `node`
   - **Arguments**: `dist/bin/reloaderoo.js --debug-mode -- node test-server-sdk.js`
3. Click "Connect"
4. Test debug tools through the web interface

### 3. Test Debug Tools via Inspector
- List tools from child server
- Call tools with parameters
- Test restart functionality
- Monitor server logs

## Troubleshooting

### Common Issues

#### 1. Build Errors
```bash
# Clean and rebuild
npm run clean
npm run build
```

#### 2. Permission Issues
```bash
# Make sure scripts are executable
chmod +x test-server-sdk.js test-server.js
```

#### 3. Port Conflicts
```bash
# Kill existing processes
pkill -f reloaderoo
pkill -f test-server
```

#### 4. JSON Parsing Errors
- Ensure proper escaping of quotes in `--params`
- Use single quotes around JSON strings
- Test JSON validity: `echo '{"test": "value"}' | jq .`

### Debug Information

#### Enable Verbose Logging
```bash
node dist/bin/reloaderoo.js inspect list-tools \
  --log-level debug \
  -- node test-server-sdk.js
```

#### Check Process Status
```bash
# View running processes
ps aux | grep -E "(reloaderoo|test-server)"

# Check system resources
top -p $(pgrep -f reloaderoo)
```

### Getting Help

#### Show Command Help
```bash
node dist/bin/reloaderoo.js --help
node dist/bin/reloaderoo.js inspect --help
node dist/bin/reloaderoo.js inspect call-tool --help
```

#### System Information
```bash
node dist/bin/reloaderoo.js info --verbose
```

## Test Results Validation

### Expected Success Indicators

#### CLI Mode
- ✅ All commands return `"success": true`
- ✅ Response times under 2 seconds
- ✅ Proper JSON structure in output
- ✅ Error responses include clear messages

#### Server Mode  
- ✅ Child server connects successfully
- ✅ Proxy forwards requests correctly
- ✅ Restart functionality works
- ✅ Debug tools are accessible

#### Integration
- ✅ MCP Inspector can connect
- ✅ All debug tools work through inspector
- ✅ Backward compatibility maintained
- ✅ No memory leaks during extended use

## Continuous Testing

For ongoing development, create automated test scripts:

```bash
#!/bin/bash
# test-suite.sh

echo "Running Reloaderoo Test Suite..."

# Test CLI commands
echo "1. Testing CLI commands..."
node dist/bin/reloaderoo.js inspect ping -- node test-server-sdk.js
node dist/bin/reloaderoo.js inspect list-tools -- node test-server-sdk.js

# Test server mode (short duration)
echo "2. Testing server mode..."
timeout 5s node dist/bin/reloaderoo.js proxy -- node test-server-sdk.js

echo "Test suite completed!"
```

Run with:
```bash
chmod +x test-suite.sh
./test-suite.sh
```

This comprehensive testing guide ensures all aspects of Reloaderoo functionality are properly validated across different usage scenarios and configurations.