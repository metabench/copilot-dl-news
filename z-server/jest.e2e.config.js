/**
 * Jest Configuration for E2E Tests (Playwright + Electron)
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
  clearMocks: true
};
