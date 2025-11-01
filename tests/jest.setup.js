// Limit noisy console output during tests by capping lines per test and truncating long lines.
(() => {
  console.log('[jest-setup] loaded');
  // Suppress ALL console output during E2E tests to keep output clean
  if (process.env.GEOGRAPHY_FULL_E2E === '1') {
    console.log = () => {};
    console.warn = () => {};
    console.info = () => {};
    console.error = () => {};
    return; // Skip all the truncation logic
  }
  
  const MAX_LINES = parseInt(process.env.JEST_MAX_CONSOLE_LINES || '15', 10); // total lines per test (reduced from 40)
  const MAX_LINE_LEN = parseInt(process.env.JEST_MAX_CONSOLE_COLS || '150', 10); // reduced from 200
  const MAX_TOTAL_CHARS = parseInt(process.env.JEST_MAX_CONSOLE_CHARS || '800', 10); // reduced from 2000
  const ALLOW_NOISY_LOGS = process.env.JEST_ALLOW_NOISY_LOGS === '1';
  const DROP_PATTERNS = ALLOW_NOISY_LOGS ? [] : [
    /^\[req\]/i,
    /^\[api\]/i,
    /^\[sse\]/i,
    /^\[analysis-run\]/i,
    /^\[AnalysisTask\]/i,  // Drop AnalysisTask logs
    /^\[BackgroundTaskManager\]/i,  // Drop task manager logs
    /^\[server\]/i,
    /^\[auto-build\]/i,
    /^GUI server listening/i,
    /^Priority config loaded/i,
    /^Priority scorer configuration updated/i,
    /^Starting crawler/i,
    /^Data will be saved/i,
    /^QUEUE /,
    /^PROGRESS /,
    /^MILESTONE /,
    /^CACHE /,
    /^Using cached page/i,
    /^Saved article/i,
    /^Found \d+ navigation links/i,
    /^FOUND \d+ NAVIGATION LINKS/i,
    /Could not count articles/i,  // Drop AnalysisTask error logs
    /Page analysis failed/i,  // Drop analysis error logs
    /at .* \(.*:\d+:\d+\)$/,  // Drop stack trace lines
    /at async /,  // Drop async stack traces
    /at Object\./,  // Drop test framework traces
    /at Layer\.handleRequest/,  // Drop Express router traces
    /at processParams/,  // Drop Express internal traces
    /at next \(/,  // Drop Express middleware traces
    /at Function\.handle/,  // Drop Express handler traces
    /at trimPrefix/,  // Drop Express path handling
    /at Route\.dispatch/,  // Drop Express route dispatch
    /at IncomingMessage\./,  // Drop HTTP message traces
    /at invokeCallback/,  // Drop callback traces
    /at done \(/  // Drop completion handler traces
  ];
  const shouldDrop = (msg) => DROP_PATTERNS.some((re) => re.test(msg));
  
  // Skip truncation if disabled by environment variable
  if (process.env.JEST_DISABLE_TRUNCATE === '1') {
    return; // Don't wrap console methods
  }
  
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const shouldWarnOnSuppress = process.env.JEST_TRUNCATE_WARNINGS === '1';
  const emitSuppressionNotice = (message) => {
    if (!shouldWarnOnSuppress) {
      return;
    }
    try {
      origWarn(message);
    } catch (_) {
      // ignore errors raising suppression notices
    }
  };

  let lineCount = 0;
  let charCount = 0;
  let suppressed = false;

  function wrap(fn, level) {
    return (...args) => {
      try {
        if (suppressed) return;
        // Render to string similarly to console
        const msg = args.map((a) => {
          try {
            if (typeof a === 'string') return a;
            if (a instanceof Error) return a.stack || a.message;
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }).join(' ');
        if (!ALLOW_NOISY_LOGS && shouldDrop(msg)) return;
        const parts = String(msg).split(/\r?\n/);
        for (let i = 0; i < parts.length; i++) {
          if (suppressed) return;
          if (charCount >= MAX_TOTAL_CHARS) {
            suppressed = true;
            emitSuppressionNotice(`[jest-truncate] further ${level} output suppressed after ${MAX_TOTAL_CHARS} chars`);
            return;
          }
          if (lineCount >= MAX_LINES) {
            if (!suppressed) {
              suppressed = true;
              emitSuppressionNotice(`[jest-truncate] further ${level} output suppressed after ${MAX_LINES} lines`);
            }
            return;
          }
          const line = parts[i];
          let out = line.length > MAX_LINE_LEN ? (line.slice(0, MAX_LINE_LEN) + ' … [truncated]') : line;
          if (charCount + out.length > MAX_TOTAL_CHARS) {
            const truncatedSuffix = ' … [truncated]';
            const remaining = MAX_TOTAL_CHARS - charCount;
            if (remaining <= truncatedSuffix.length) {
              suppressed = true;
              emitSuppressionNotice(`[jest-truncate] further ${level} output suppressed after ${MAX_TOTAL_CHARS} chars`);
              return;
            }
            const allowed = remaining - truncatedSuffix.length;
            out = out.slice(0, Math.max(0, allowed)) + truncatedSuffix;
            charCount = MAX_TOTAL_CHARS; // will trigger suppression after emit
            suppressed = true;
            lineCount++;
            fn(out);
            emitSuppressionNotice(`[jest-truncate] further ${level} output suppressed after ${MAX_TOTAL_CHARS} chars`);
            return;
          }
          lineCount++;
          charCount += out.length;
          fn(out);
        }
      } catch (e) {
        try { fn(...args); } catch { /* ignore */ }
      }
    };
  }

  beforeEach(() => {
    lineCount = 0;
    charCount = 0;
    suppressed = false;
    console.log = wrap(origLog, 'console');
    console.warn = wrap(origWarn, 'console');
    console.error = wrap(origError, 'console');
  });

  afterEach(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  });
})();

// Set default timeout for all tests to 10 seconds
// Individual tests can override with jest.setTimeout() or test(..., timeout)
jest.setTimeout(10000);

// Helper function for fast unit tests to opt into shorter timeouts (1 second)
// Usage: describe('my fast tests', fastTest(() => { ... }));
global.fastTest = (callback) => {
  return () => {
    jest.setTimeout(1000);
    callback();
  };
};

// Alternative: decorator pattern for individual tests
// Usage: test('my fast test', fastTestTimeout(() => { ... }));
global.fastTestTimeout = (testFn, timeout = 1000) => {
  return async (...args) => {
    const originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL || 10000;
    jest.setTimeout(timeout);
    try {
      return await testFn(...args);
    } finally {
      jest.setTimeout(originalTimeout);
    }
  };
};

function logActiveResources(label) {
  const handles = process._getActiveHandles()
    .filter((handle) => handle !== process.stdout && handle !== process.stderr && handle !== process.stdin);
  const requests = process._getActiveRequests ? process._getActiveRequests() : [];
  const serializeHandle = (handle) => {
    if (!handle) {
      return { type: typeof handle };
    }
    const type = (handle && handle.constructor) ? handle.constructor.name : typeof handle;
    const info = { type };
    if (typeof handle.fd === 'number') {
      info.fd = handle.fd;
    }
    if (typeof handle.destroyed === 'boolean') {
      info.destroyed = handle.destroyed;
    }
    if (typeof handle.pending === 'number') {
      info.pending = handle.pending;
    }
    if (typeof handle.readyState === 'string') {
      info.readyState = handle.readyState;
    }
    if (typeof handle.shell === 'object' && handle.shell) {
      info.shell = handle.shell;
    }
    if (typeof handle._handle === 'object' && handle._handle) {
      info.innerType = handle._handle.constructor ? handle._handle.constructor.name : typeof handle._handle;
    }
    return info;
  };
  const handleSummary = handles.map((h) => (h && h.constructor) ? h.constructor.name : typeof h);
  const handleDetails = handles.map(serializeHandle);
  const requestSummary = (requests || []).map((r) => (r && r.constructor) ? r.constructor.name : typeof r);
  const state = typeof expect !== 'undefined' && expect.getState ? expect.getState() : null;
  const context = state && state.testPath ? state.testPath : 'unknown-test-file';
  const payload = {
    label,
    file: context,
    handles: handleSummary,
    handleDetails,
    handleCount: handleSummary.length,
    requests: requestSummary,
    requestCount: requestSummary.length,
  };
  console.log('[jest-handles]', JSON.stringify(payload));
}

if (process.env.JEST_LOG_HANDLES === '1') {
  afterAll(() => logActiveResources('afterAll'));
  process.on('beforeExit', () => logActiveResources('beforeExit'));
}
