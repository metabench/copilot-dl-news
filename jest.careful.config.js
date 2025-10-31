'use strict'
/** @type {import('jest').Config} */
module.exports = {
  testMatch: [
    '**/__tests__/**/*.@(js|cjs|mjs|ts|cts|mts|jsx|tsx)',
    '**/?(*.)+(spec|test).@(js|cjs|mjs|ts|cts|mts|jsx|tsx)'
  ],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/(e2e|acceptance)/'],
}