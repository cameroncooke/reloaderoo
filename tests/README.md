# Reloaderoo Test Suite

This directory contains the comprehensive test suite for Reloaderoo, implementing a 3-tier testing strategy designed to validate functionality while enabling safe refactoring.

## Test Architecture

### 1. E2E Tests (`tests/e2e/`)
Primary validation layer that tests complete user workflows from external perspective.

- **`cli.e2e.test.ts`** - CLI interface testing (version, help, info, error handling)
- **`proxy.e2e.test.ts`** - Complete proxy mode functionality including tool forwarding and restart
- **`inspect.e2e.test.ts`** - Inspection commands and MCP inspection server mode
- **`restart.e2e.test.ts`** - Comprehensive restart functionality and edge cases

### 2. Integration Tests (`tests/integration/`)
Tests component interaction and system coordination.

- **`command-dispatch.test.ts`** - CLI argument parsing and command routing
- **`handler-coordination.test.ts`** - MCPProxy handler coordination and message routing

### 3. Unit Tests (`src/**/*.test.ts`)
Existing focused tests for individual components and utilities.

## Test Utilities (`tests/utils/`)

### Core Utilities
- **`ReloaderooProcess`** - Manages reloaderoo child processes for E2E testing
- **`TestMCPClient`** - MCP protocol utilities for creating requests and validating responses
- **`TestServer`** - Wrapper for test-server-sdk.js process management
- **`TestHelpers`** - Common assertions and test utilities

### Key Features
- Process lifecycle management with proper cleanup
- MCP protocol message creation and validation
- Timeout handling and error recovery
- Resource cleanup for test isolation

## Running Tests

### All Tests
```bash
npm test              # Run all tests (unit, integration, E2E)
npm run test:all      # Explicit all tests
```

### Test Categories
```bash
npm run test:unit        # Unit tests only (src/)
npm run test:integration # Integration tests only
npm run test:e2e         # E2E tests only
```

### Development
```bash
npm run test:watch      # Watch mode for development
npm run test:coverage   # Generate coverage report
```

## Test Strategy

### Focus on Behaviors
Tests validate external behaviors and contracts rather than implementation details:
- CLI command outputs and exit codes
- MCP protocol compliance and message structure
- Tool forwarding and proxy transparency
- Restart functionality and state persistence

### Safe Refactoring
Tests enable confident refactoring by:
- Testing through public interfaces
- Validating user-visible behaviors
- Avoiding tight coupling to internal structure
- Providing fast feedback on breaking changes

### Real-World Scenarios
Tests simulate actual usage patterns:
- Complete CLI workflows from user perspective
- MCP client-server communication patterns
- Process lifecycle and error recovery
- Configuration and environment variable handling

## Test Configuration

### Timeouts
- E2E tests: 30 second timeout (configurable in vitest.config.ts)
- Setup/teardown: 10 second timeout
- Individual operations: Varies by complexity

### Parallelization
- Tests run in separate processes (forks pool)
- Maximum 4 concurrent processes to balance speed and resource usage
- Proper isolation prevents test interference

### Coverage
- Targets src/ directory only
- Excludes test files, generated code, and configuration
- Generates text, JSON, and HTML reports

## Writing New Tests

### E2E Test Pattern
```typescript
describe('Feature E2E', () => {
  let reloaderoo: ReloaderooProcess;
  
  beforeEach(() => {
    reloaderoo = new ReloaderooProcess({ /* options */ });
  });
  
  afterEach(async () => {
    await TestHelpers.cleanupResources(() => reloaderoo.kill());
  });
  
  it('should handle specific scenario', async () => {
    await reloaderoo.start();
    // Test implementation
  });
});
```

### MCP Protocol Testing
```typescript
const mcpClient = new TestMCPClient();
const request = mcpClient.createToolsListRequest();
await reloaderoo.sendMessage(request);
const response = await reloaderoo.waitForResponse(request.id);
TestHelpers.assertToolsListResponse(response);
```

### Best Practices
1. Always clean up resources in afterEach hooks
2. Use TestHelpers for common assertions
3. Test error conditions and edge cases
4. Validate both success and failure scenarios
5. Use descriptive test names that explain the scenario

**📋 For comprehensive testing guidelines, see [docs/TESTING_GUIDELINES.md](../docs/TESTING_GUIDELINES.md)**

## CI/CD Integration

Tests run automatically on:
- All pushes to main/develop branches
- Pull requests to main branch
- Multiple Node.js versions (18.x, 20.x, 22.x)
- Multiple operating systems (Ubuntu, macOS)

Additional CI checks:
- Type checking with TypeScript
- Performance benchmarks
- Real MCP server integration tests
- Coverage reporting to Codecov

## Troubleshooting

### Common Issues
1. **Test timeouts** - Increase timeout in test or vitest.config.ts
2. **Process cleanup** - Ensure proper afterEach cleanup
3. **Port conflicts** - Tests use dynamic/available ports
4. **File permissions** - Check test-server-sdk.js is executable

### Debug Mode
Set environment variable for verbose logging:
```bash
MCPDEV_PROXY_LOG_LEVEL=debug npm run test:e2e
```

### Test Isolation
Each test should be completely independent:
- Clean process state
- No shared files or resources  
- Unique identifiers for parallel execution