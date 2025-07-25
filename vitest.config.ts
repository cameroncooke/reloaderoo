import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: {
      NODE_ENV: 'test'
    },
    testTimeout: 30000, // 30 second timeout for E2E tests
    hookTimeout: 10000, // 10 second timeout for setup/teardown
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/bin/**',
        'test-server-sdk.js'
      ]
    },
    // Test patterns for different test types
    include: [
      'src/**/*.{test,spec}.{js,ts}',
      'tests/**/*.{test,spec}.{js,ts}'
    ],
    // Separate configurations for different test types
    pool: 'forks', // Use separate processes for E2E tests
    poolOptions: {
      forks: {
        singleFork: false, // Allow parallel execution
        minForks: 1,
        maxForks: 4 // Limit concurrent processes
      }
    }
  }
});