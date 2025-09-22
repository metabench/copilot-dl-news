// Limit noisy console output during tests by capping lines per test and truncating long lines.
(() => {
  const MAX_LINES = parseInt(process.env.JEST_MAX_CONSOLE_LINES || '200', 10); // total lines per test
  const MAX_LINE_LEN = parseInt(process.env.JEST_MAX_CONSOLE_COLS || '400', 10);
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  let lineCount = 0;
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
        const parts = String(msg).split(/\r?\n/);
        for (let i = 0; i < parts.length; i++) {
          if (lineCount >= MAX_LINES) {
            if (!suppressed) {
              suppressed = true;
              origWarn(`[jest-truncate] further ${level} output suppressed after ${MAX_LINES} lines`);
            }
            return;
          }
          const line = parts[i];
          const out = line.length > MAX_LINE_LEN ? (line.slice(0, MAX_LINE_LEN) + ' … [truncated]') : line;
          lineCount++;
          fn(out);
        }
      } catch (e) {
        try { fn(...args); } catch { /* ignore */ }
      }
    };
  }

  beforeEach(() => {
    lineCount = 0;
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
