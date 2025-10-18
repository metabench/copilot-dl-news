/**
 * Fast test to verify database module exports
 * TIMEOUT: 500ms per test (module loading should be instant)
 */

const { describe, test, expect } = require('@jest/globals');

describe('Database Module Exports', () => {
  test('should export all required functions', () => {
    let dbModule;
    try {
      dbModule = require('../index.js');
    } catch (e) {
      throw new Error(`Module load failed: ${e.message}`);
    }
    
    // Check all exports exist with concise errors
    const required = [
      'ensureDb', 'ensureDatabase', 'openDatabase', 
      'wrapWithTelemetry', 'createInstrumentedDb', 'openDbReadOnly',
      'initializeSchema', 'NewsDatabase'
    ];
    
    for (const name of required) {
      if (!dbModule[name]) {
        throw new Error(`Missing export: ${name}`);
      }
      if (name !== 'NewsDatabase' && typeof dbModule[name] !== 'function') {
        throw new Error(`${name} is not a function (got ${typeof dbModule[name]})`);
      }
    }
  }, 500);

  test('should not throw when requiring module', () => {
    try {
      require('../index.js');
    } catch (e) {
      throw new Error(`Require failed: ${e.message}`);
    }
  }, 500);

  test('createInstrumentedDb should be available', () => {
    const { createInstrumentedDb } = require('../index.js');
    if (!createInstrumentedDb) {
      throw new Error('createInstrumentedDb is undefined');
    }
    if (typeof createInstrumentedDb !== 'function') {
      throw new Error(`createInstrumentedDb is ${typeof createInstrumentedDb}, expected function`);
    }
  }, 500);
});
