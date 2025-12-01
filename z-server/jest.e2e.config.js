/**
 * Jest Configuration for E2E Tests (Playwright + Electron)
 * 
 * NOTE: Playwright + Electron has a known issue where teardown errors may occur.
 * These are internal Playwright errors during cleanup, not test failures.
 * The forceExit option ensures tests complete even with lingering handles.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/e2e/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  verbose: true,
  testTimeout: 60000,  // E2E tests need more time
  // Run serially - can't have multiple Electron instances
  maxWorkers: 1,
  // Clean up
  clearMocks: true,
  // Force exit after tests complete (handles orphaned async handles)
  forceExit: true,
  // Suppress known Playwright teardown errors
  silent: false,
  // Don't report individual test results as errors during suite teardown
  errorOnDeprecated: false
};
