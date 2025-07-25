# Pull Request

## Description
Brief description of what this PR does and why.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Test improvements

## Testing Checklist

### Test Quality ✅
- [ ] Tests focus on behavior, not implementation
- [ ] No over-mocking of core MCP SDK components
- [ ] No testing of private methods via spies
- [ ] No fixed `sleep()` calls in E2E tests (use `TestHelpers.waitFor*()`)
- [ ] Tests have single, clear purpose
- [ ] Data-driven tests used for similar scenarios (`it.each()`)

### Test Reliability ✅
- [ ] Tests pass consistently in CI
- [ ] Proper cleanup in `afterEach` hooks
- [ ] Appropriate timeouts for operations
- [ ] Condition-based waiting for async operations
- [ ] No flaky intermittent failures

### Test Maintainability ✅
- [ ] Clear, descriptive test names
- [ ] Minimal code duplication
- [ ] Shared utilities for common operations
- [ ] Tests remain valid during safe refactoring
- [ ] Easy to understand test intent

### Code Quality
- [ ] Code follows project style guidelines
- [ ] All TypeScript compilation passes
- [ ] No console.log or debug statements left in code
- [ ] Error handling is appropriate
- [ ] Documentation updated if needed

## How to Test
Instructions for reviewers on how to test this change:

1. 
2. 
3. 

## Breaking Changes
List any breaking changes and migration instructions:

## Additional Notes
Any additional context, concerns, or areas for reviewer attention.

---

**Testing Guidelines:** See [docs/TESTING_GUIDELINES.md](docs/TESTING_GUIDELINES.md) for comprehensive testing standards.