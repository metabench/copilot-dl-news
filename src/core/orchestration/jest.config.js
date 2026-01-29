'use strict';

/**
 * Jest configuration for orchestration layer tests only
 * 
 * Run with: node --experimental-vm-modules node_modules/jest/bin/jest.js --config src/orchestration/jest.config.js
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/src/orchestration/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/src/(?!orchestration)'
  ],
  verbose: true,
  forceExit: true,
  detectOpenHandles: false,
  collectCoverage: false
};
