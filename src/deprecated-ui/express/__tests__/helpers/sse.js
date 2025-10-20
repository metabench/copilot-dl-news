const http = require('http');

// Collect SSE until predicate returns true, or idle/overall timeout elapses
function collectSseUntil(hostname, port, path, {
  overallTimeoutMs = 5000,
  idleTimeoutMs = 1000,
  predicate = () => false,
} = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname, port, path }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      let ended = false;
      const finish = () => {
        if (ended) return; ended = true;
        try { res.destroy(); } catch(_) {}
        resolve({ status: res.statusCode, text: buf });
      };
      let idleTimer = setTimeout(finish, idleTimeoutMs);
      const resetIdle = () => { try { clearTimeout(idleTimer); } catch(_) {}; idleTimer = setTimeout(finish, idleTimeoutMs); };
      const overallTimer = setTimeout(() => {
        if (ended) return; ended = true;
        try { res.destroy(); } catch(_) {}
        resolve({ status: res.statusCode, text: buf });
      }, overallTimeoutMs);
      res.on('data', (d) => {
        buf += d;
        resetIdle();
        try { if (predicate && predicate(buf)) { clearTimeout(overallTimer); clearTimeout(idleTimer); finish(); } } catch(_) {}
      });
      res.on('end', () => { if (!ended) { clearTimeout(overallTimer); clearTimeout(idleTimer); finish(); } });
      res.on('error', (e) => { try { clearTimeout(overallTimer); clearTimeout(idleTimer); } catch(_) {}; reject(e); });
    });
    req.on('error', reject);
  });
}

module.exports = { collectSseUntil };

// Trivial test to satisfy Jest's requirement that each test file defines at least one test
test('helpers/sse exports functions', () => {
  expect(typeof collectSseUntil).toBe('function');
});
