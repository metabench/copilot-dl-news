/**
 * Jest Configuration for Z-Server Tests
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/'  // E2E tests run separately with Playwright
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/tmp-test/'
  ],
  collectCoverageFrom: [
    'lib/**/*.js',
    'main.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true,
  testTimeout: 30000,
  // Clean up after each test
  clearMocks: true,
  resetMocks: false,
  restoreMocks: true
};
