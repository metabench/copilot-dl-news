// Simple test utilities to avoid hangs
function withTimeout(promise, ms, label = 'timeout') {
  let t;
  const timer = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([
    promise.finally(() => { try { clearTimeout(t); } catch (_) {} }),
    timer
  ]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { withTimeout, sleep };

// Trivial test to satisfy Jest's requirement that each test file defines at least one test
test('helpers/time exports functions', () => {
  expect(typeof withTimeout).toBe('function');
  expect(typeof sleep).toBe('function');
});
