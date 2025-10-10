/**
 * @fileoverview Test timeout guards and progress logging utilities
 * 
 * These utilities help tests follow the GOLDEN RULE: Tests must never hang silently.
 * 
 * @example
 * const { withTimeout, createWatchdog } = require('../test-utils/timeoutGuards');
 * 
 * test('should complete operation', async () => {
 *   const result = await withTimeout(
 *     longOperation(),
 *     10000,
 *     'Long operation timed out after 10s'
 *   );
 *   expect(result).toBeDefined();
 * }, 15000);
 */

'use strict';

/**
 * Wraps a promise with a timeout that logs context before rejecting
 * 
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} context - Descriptive message for debugging
 * @returns {Promise} Promise that rejects if timeout is exceeded
 * 
 * @example
 * const data = await withTimeout(
 *   fetch('https://api.example.com/data'),
 *   5000,
 *   'API call to /data'
 * );
 */
function withTimeout(promise, timeoutMs, context) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const msg = `[TEST TIMEOUT] ${context} exceeded ${timeoutMs}ms`;
      console.error(msg);
      reject(new Error(msg));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Creates a watchdog that logs progress periodically
 * 
 * @param {number} intervalMs - How often to log (default: 5000ms)
 * @returns {Object} Watchdog with update() and clear() methods
 * 
 * @example
 * const watchdog = createWatchdog(3000);
 * 
 * watchdog.update('Starting data fetch');
 * const data = await fetchData();
 * 
 * watchdog.update('Processing data');
 * await processData(data);
 * 
 * watchdog.clear();
 */
function createWatchdog(intervalMs = 5000) {
  let lastStep = 'initialization';
  let startTime = Date.now();
  
  const interval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[TEST WATCHDOG] ${elapsed}s - Last step: ${lastStep}`);
  }, intervalMs);

  return {
    update(step) {
      lastStep = step;
      console.log(`[TEST] ${step}`);
    },
    clear() {
      clearInterval(interval);
    }
  };
}

/**
 * Creates an AbortController with automatic timeout
 * 
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} context - Descriptive message for debugging
 * @returns {Object} { controller, signal, timeout }
 * 
 * @example
 * const { controller, signal, timeout } = createAbortTimeout(5000, 'API call');
 * try {
 *   const response = await fetch(url, { signal });
 *   // ... process response
 * } finally {
 *   clearTimeout(timeout);
 * }
 */
function createAbortTimeout(timeoutMs, context) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.error(`[TEST TIMEOUT] ${context} exceeded ${timeoutMs}ms, aborting`);
    controller.abort();
  }, timeoutMs);

  return {
    controller,
    signal: controller.signal,
    timeout
  };
}

/**
 * Wraps an async test function with progress logging and timeout
 * 
 * @param {Function} testFn - The async test function
 * @param {Object} options - Configuration
 * @param {number} options.timeout - Overall test timeout (default: 10000)
 * @param {number} options.watchdogInterval - Watchdog log interval (default: 3000)
 * @returns {Function} Wrapped test function
 * 
 * @example
 * test('complex operation', withTestGuards(async () => {
 *   const data = await fetchData();
 *   expect(data).toBeDefined();
 * }, { timeout: 15000 }), 15000);
 */
function withTestGuards(testFn, options = {}) {
  const { timeout = 10000, watchdogInterval = 3000 } = options;
  
  return async () => {
    const watchdog = createWatchdog(watchdogInterval);
    const startTime = Date.now();
    
    try {
      watchdog.update('Test started');
      const result = await withTimeout(
        testFn(),
        timeout,
        'Test execution'
      );
      watchdog.update('Test completed successfully');
      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[TEST] Failed after ${elapsed}ms: ${error.message}`);
      throw error;
    } finally {
      watchdog.clear();
    }
  };
}

module.exports = {
  withTimeout,
  createWatchdog,
  createAbortTimeout,
  withTestGuards
};
