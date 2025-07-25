# Testing Guidelines for Reloaderoo

This document provides comprehensive testing guidelines for the Reloaderoo project, based on lessons learned during our test suite improvement initiative completed in July 2025.

## Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Test Architecture](#test-architecture)
- [Test Types and When to Use Them](#test-types-and-when-to-use-them)
- [Best Practices](#best-practices)
- [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
- [Naming Conventions](#naming-conventions)
- [Data-Driven Testing](#data-driven-testing)
- [Asynchronous Testing](#asynchronous-testing)
- [Mocking Guidelines](#mocking-guidelines)
- [Test Utilities](#test-utilities)
- [Review Checklist](#review-checklist)

## Testing Philosophy

Our testing approach prioritizes:

1. **Behavior over Implementation** - Test what the code does, not how it does it
2. **Fast and Reliable** - Tests should run quickly and consistently
3. **Maintainable** - Tests should not break during safe refactoring
4. **Comprehensive** - Cover critical paths and edge cases
5. **Clear Intent** - Tests should clearly communicate what they're verifying

## Test Architecture

Reloaderoo uses a 3-tier testing strategy:

```
📁 tests/
├── 📁 e2e/           # End-to-End tests (complete workflows)
├── 📁 integration/   # Integration tests (component interaction)
├── 📁 unit/          # Unit tests (isolated component testing)
└── 📁 utils/         # Shared test utilities
```

### File Naming Convention

- `*.test.ts` - All test files
- `*.e2e.test.ts` - End-to-end tests specifically
- Test files mirror source structure: `src/config.ts` → `tests/config.test.ts`

## Test Types and When to Use Them

### End-to-End Tests (`tests/e2e/`)

**Purpose:** Test complete user workflows through the public API

**When to use:**
- Testing proxy functionality with real child servers
- Verifying restart operations work end-to-end
- Testing CLI commands and their output
- Validating MCP protocol compliance

**Example:**
```typescript
describe('Proxy Mode E2E', () => {
  it('should forward tool calls to child server correctly', async () => {
    await reloaderoo.start();
    await TestHelpers.waitForStartupSuccess(reloaderoo);
    
    const echoRequest = mcpClient.createCallToolRequest('echo', {
      message: 'test-proxy-forwarding'
    });
    await reloaderoo.sendMessage(echoRequest);
    
    const response = await reloaderoo.waitForResponse(echoRequest.id);
    TestHelpers.assertToolCallResponse(response);
    expect(response.result.content[0].text).toContain('test-proxy-forwarding');
  });
});
```

### Integration Tests (`tests/integration/`)

**Purpose:** Test how components work together

**When to use:**
- Testing MCPProxy with real MCP SDK components
- Verifying configuration loading and validation
- Testing process lifecycle management
- Validating error handling between components

**Example:**
```typescript
describe('MCPProxy Integration Tests', () => {
  it('should start successfully and initialize child client', async () => {
    const proxy = new MCPProxy(config);
    
    await expect(proxy.start()).resolves.not.toThrow();
    expect(proxy.config.childCommand).toBe('node');
  });
});
```

### Unit Tests (`tests/unit/`)

**Purpose:** Test individual functions/classes in isolation

**When to use:**
- Testing utility functions
- Testing error conditions
- Testing edge cases in algorithms
- Testing configuration parsing logic

## Best Practices

### ✅ DO: Test Public APIs

```typescript
// Good: Test through public interface
const proxy = new MCPProxy(config);
await proxy.start();
expect(proxy.isRunning()).toBe(true);
```

### ✅ DO: Use Descriptive Test Names

```typescript
// Good: Clear, specific, describes expected behavior
it('should restart when restart_server tool is called', async () => {
  // Test implementation
});

it('should handle boolean env var "true" as true', () => {
  // Test implementation  
});
```

### ✅ DO: Use Condition-Based Waiting

```typescript
// Good: Wait for specific conditions
await TestHelpers.waitForStartupSuccess(reloaderoo);
await TestHelpers.waitForRestartSuccess(reloaderoo);

// Good: Custom condition
await TestHelpers.waitFor(
  () => process.getStderrOutput().some(log => log.includes('Server ready')),
  10000,
  100
);
```

### ✅ DO: Use Data-Driven Tests for Similar Scenarios

```typescript
// Good: Parameterized test reduces duplication
it.each([
  { input: 'true', expected: true, description: 'string "true"' },
  { input: '1', expected: true, description: 'string "1"' },
  { input: 'false', expected: false, description: 'string "false"' }
])('should handle boolean env var $description as $expected', ({ input, expected }) => {
  process.env.TEST_VAR = input;
  const result = parseBoolean(process.env.TEST_VAR);
  expect(result).toBe(expected);
});
```

### ✅ DO: Create Focused, Single-Purpose Tests

```typescript
// Good: Each test has one clear responsibility
describe('Server Restart Functionality', () => {
  it('should restart when restart_server tool is called', async () => {
    // Only test the restart operation
  });
  
  it('should have different tools after restart', async () => {
    // Only test tool changes
  });
  
  it('should remain functional after restart', async () => {
    // Only test post-restart functionality
  });
});
```

## Anti-Patterns to Avoid

### ❌ DON'T: Test Implementation Details

```typescript
// Bad: Testing private methods
const handleSpy = vi.spyOn(proxy as any, 'handleToolsListRequest');
expect(handleSpy).toHaveBeenCalled();

// Good: Test public behavior
const request = mcpClient.createListToolsRequest();
await reloaderoo.sendMessage(request);
const response = await reloaderoo.waitForResponse(request.id);
TestHelpers.assertToolsListResponse(response);
```

### ❌ DON'T: Over-Mock Core Components

```typescript
// Bad: Mocking the entire MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js');
vi.mock('@modelcontextprotocol/sdk/client/index.js');

// Good: Mock only external dependencies
vi.mock('child_process');
vi.mock('fs');
// Use real MCP SDK components
```

### ❌ DON'T: Use Fixed Sleep Delays

```typescript
// Bad: Fixed delays are slow and unreliable
await TestHelpers.sleep(3000);

// Good: Condition-based waiting
await TestHelpers.waitForStartupSuccess(reloaderoo);
```

### ❌ DON'T: Create Complex, Multi-Purpose Tests

```typescript
// Bad: Testing multiple concerns in one test
it('should restart and handle tools and stay functional', async () => {
  // 50+ lines testing restart, tool changes, and functionality
});

// Good: Split into focused tests (see Best Practices above)
```

## Naming Conventions

### Test Suite Names
- Use descriptive suite names: `describe('Proxy Mode E2E', () => {})`
- Group related functionality: `describe('restart_server Tool', () => {})`
- Use nested describes for organization: `describe('Configuration', () => { describe('Validation', () => {}) })`

### Test Names
- Start with `should`: `it('should restart when restart_server tool is called')`
- Be specific about the scenario: `it('should handle boolean env var "true" as true')`
- Include expected outcome: `it('should return error for invalid log level')`

### Variable Names
- Use descriptive names: `const restartRequest` not `const req`
- Use consistent naming: `initialTools`, `finalTools`
- Prefix mock variables: `const mockServer`, `const mockClient`

## Data-Driven Testing

Use `it.each()` for testing similar scenarios with different inputs:

### When to Use Data-Driven Tests
- Multiple input variations for the same logic
- Boundary testing (min, max, invalid values)
- Boolean/string/enum validation
- Format parsing (arrays, objects, etc.)

### Structure
```typescript
it.each([
  { 
    input: 'test_value', 
    expected: 'expected_result', 
    description: 'human readable description' 
  },
  // More test cases...
])('should handle $description', ({ input, expected }) => {
  const result = functionUnderTest(input);
  expect(result).toBe(expected);
});
```

### Example from Config Tests
```typescript
it.each([
  { logLevel: 'debug', valid: true, description: 'debug level' },
  { logLevel: 'info', valid: true, description: 'info level' },
  { logLevel: 'invalid', valid: false, description: 'invalid level' }
])('should validate log level: $description', ({ logLevel, valid }) => {
  const result = config.validateConfig({ childCommand: 'node', logLevel });
  expect(result.valid).toBe(valid);
});
```

## Asynchronous Testing

### Waiting for Conditions
Always use condition-based waiting instead of fixed delays:

```typescript
// Available utilities in TestHelpers:
await TestHelpers.waitForStartupSuccess(process);
await TestHelpers.waitForRestartSuccess(process);
await TestHelpers.waitForLogMessage(process, 'Server ready');
await TestHelpers.waitFor(() => condition(), timeoutMs, intervalMs);
```

### Custom Waiting
```typescript
await TestHelpers.waitFor(
  () => reloaderoo.getStderrOutput().some(log => 
    log.includes('expected message')
  ),
  10000, // timeout
  100    // poll interval
);
```

### Timeout Handling
- Always provide reasonable timeouts
- Use longer timeouts for E2E tests (15s)
- Use shorter timeouts for unit tests (5s)
- Fail fast with helpful error messages

## Mocking Guidelines

### What to Mock
- ✅ External systems (file system, child processes, network)
- ✅ Non-deterministic functions (Date.now, Math.random)
- ✅ Expensive operations (database calls, large computations)

### What NOT to Mock
- ❌ Core business logic
- ❌ MCP SDK components (in integration tests)
- ❌ Simple utility functions
- ❌ Code under test

### Mock Implementation
```typescript
// Good: Mock external dependencies only
vi.mock('child_process', () => ({
  spawn: vi.fn().mockReturnValue(mockChildProcess)
}));

// Good: Use real MCP components
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
const server = new Server(/* real config */);
```

## Test Utilities

### TestHelpers Class
Located in `tests/utils/TestHelpers.ts`, provides:

- **Assertions**: `assertMCPSuccess()`, `assertToolsListResponse()`
- **Waiting**: `waitFor()`, `waitForStartupSuccess()`, `waitForRestartSuccess()`
- **Cleanup**: `cleanupResources()`
- **Utilities**: `generateTestId()`, `createTimeout()`

### Custom Utilities
When creating new test utilities:

1. Add to `TestHelpers` class
2. Use TypeScript for type safety
3. Include JSDoc documentation
4. Write tests for complex utilities
5. Make utilities reusable across test types

### Example Custom Utility
```typescript
/**
 * Wait for a specific MCP response type
 */
static async waitForMCPResponse(
  process: ReloaderooProcess,
  requestId: string,
  timeoutMs: number = 10000
): Promise<MCPResponse> {
  return this.waitFor(
    () => process.hasResponse(requestId),
    timeoutMs
  ).then(() => process.getResponse(requestId));
}
```

## Review Checklist

Before merging test changes, verify:

### Test Quality
- [ ] Tests focus on behavior, not implementation
- [ ] No over-mocking of core components
- [ ] No testing of private methods via spies
- [ ] No fixed `sleep()` calls in E2E tests
- [ ] Tests have single, clear purpose
- [ ] Data-driven tests used for similar scenarios

### Test Reliability
- [ ] Tests pass consistently in CI
- [ ] Proper cleanup in `afterEach` hooks
- [ ] Appropriate timeouts for operations
- [ ] Condition-based waiting for async operations
- [ ] No flaky intermittent failures

### Test Maintainability
- [ ] Clear, descriptive test names
- [ ] Minimal code duplication
- [ ] Shared utilities for common operations
- [ ] Tests remain valid during safe refactoring
- [ ] Easy to understand test intent

### Coverage and Completeness
- [ ] Critical paths covered
- [ ] Error conditions tested
- [ ] Edge cases included
- [ ] Integration between components verified
- [ ] Public API contracts validated

## Common Patterns

### Process Lifecycle Testing
```typescript
let reloaderoo: ReloaderooProcess;

beforeEach(() => {
  reloaderoo = new ReloaderooProcess({
    args: ['--', 'node', 'test-server-sdk.js'],
    timeout: 15000
  });
});

afterEach(async () => {
  await TestHelpers.cleanupResources(() => reloaderoo.kill());
});
```

### MCP Request/Response Testing
```typescript
const request = mcpClient.createListToolsRequest();
await reloaderoo.sendMessage(request);
const response = await reloaderoo.waitForResponse(request.id);
TestHelpers.assertToolsListResponse(response);
```

### Configuration Testing
```typescript
process.env.MCPDEV_PROXY_CHILD_CMD = 'node';
config.loadConfig();
expect(config.getCurrentConfig()?.childCommand).toBe('node');
```

## Getting Help

- Review existing tests for patterns
- Check `tests/utils/TestHelpers.ts` for available utilities
- Consult this document for best practices
- Ask questions in code reviews

---

**Document Version:** 1.0  
**Last Updated:** July 2025  
**Maintainer:** Development Team