'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { analyzeFile, RULES } = require('../../tools/dev/test-hang-analyzer');

function withTempFile(name, content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hang-analyzer-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf8');
  try { return fn(file); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

describe('test-hang-analyzer', () => {
  test('exposes the expected rules', () => {
    const ids = RULES.map((r) => r.id).sort();
    expect(ids).toEqual([
      'missing-test-timeout',
      'puppeteer-without-close',
      'server-listen-without-close',
      'spawn-without-kill',
      'sqlite-open-without-close',
      'sse-without-close',
      'setinterval-without-cleanup',
      'unbounded-loop',
    ].sort());
  });

  test('flags child_process spawn without kill', () => {
    const src = `
const { spawn } = require('child_process');
test('boom', () => {
  const child = spawn('node', ['-e', 'console.log(1)']);
}, 5000);
`;
    withTempFile('a.test.js', src, (file) => {
      const findings = analyzeFile(file);
      expect(findings.some((f) => f.rule === 'spawn-without-kill' && f.severity === 'error')).toBe(true);
    });
  });

  test('does NOT flag method-call .spawn() like controller.spawn()', () => {
    const src = `
test('controller', () => {
  const c = { spawn: () => {} };
  c.spawn(() => {});
}, 5000);
`;
    withTempFile('b.test.js', src, (file) => {
      const findings = analyzeFile(file);
      expect(findings.some((f) => f.rule === 'spawn-without-kill')).toBe(false);
    });
  });

  test('does NOT flag method-call tracker.setInterval()', () => {
    const src = `
test('rate', () => {
  const tracker = { setInterval: () => {} };
  tracker.setInterval('host', 1000);
}, 5000);
`;
    withTempFile('c.test.js', src, (file) => {
      const findings = analyzeFile(file);
      expect(findings.some((f) => f.rule === 'setinterval-without-cleanup')).toBe(false);
    });
  });

  test('flags bare setInterval without clearInterval/unref', () => {
    const src = `
test('poll', () => {
  setInterval(() => {}, 100);
}, 5000);
`;
    withTempFile('d.test.js', src, (file) => {
      const findings = analyzeFile(file);
      expect(findings.some((f) => f.rule === 'setinterval-without-cleanup' && f.severity === 'error')).toBe(true);
    });
  });

  test('accepts setInterval with .unref() as warn-only', () => {
    const src = `
test('poll', () => {
  const t = setInterval(() => {}, 100);
  t.unref();
}, 5000);
`;
    withTempFile('e.test.js', src, (file) => {
      const findings = analyzeFile(file);
      const hits = findings.filter((f) => f.rule === 'setinterval-without-cleanup');
      expect(hits.every((f) => f.severity === 'warn')).toBe(true);
    });
  });

  test('detects multiline per-test timeout', () => {
    const src = `
const http = require('http');
test(
  'big',
  async () => {
    await new Promise((r) => http.request('http://example.com', () => r()).end());
  },
  60000
);
`;
    withTempFile('f.test.js', src, (file) => {
      const findings = analyzeFile(file);
      expect(findings.some((f) => f.rule === 'missing-test-timeout')).toBe(false);
    });
  });

  test('flags missing per-test timeout when doing real http I/O', () => {
    const src = `
const http = require('http');
test('io', async () => {
  await new Promise((r) => http.request('http://example.com', () => r()).end());
});
`;
    withTempFile('g.test.js', src, (file) => {
      const findings = analyzeFile(file);
      expect(findings.some((f) => f.rule === 'missing-test-timeout')).toBe(true);
    });
  });

  test('skips node:test files for missing-test-timeout', () => {
    const src = `
const { describe, it } = require('node:test');
const http = require('http');
it('io', async () => {
  await new Promise((r) => http.request('http://x').end());
});
`;
    withTempFile('h.test.js', src, (file) => {
      const findings = analyzeFile(file);
      expect(findings.some((f) => f.rule === 'missing-test-timeout')).toBe(false);
    });
  });

  test('flags unbounded loop', () => {
    const src = `
test('loop', () => {
  while (true) { /* nope */ }
}, 5000);
`;
    withTempFile('i.test.js', src, (file) => {
      const findings = analyzeFile(file);
      expect(findings.some((f) => f.rule === 'unbounded-loop')).toBe(true);
    });
  });

  test('flags puppeteer.launch without close', () => {
    const src = `
const puppeteer = require('puppeteer');
test('p', async () => {
  const b = await puppeteer.launch();
}, 30000);
`;
    withTempFile('j.test.js', src, (file) => {
      const findings = analyzeFile(file);
      expect(findings.some((f) => f.rule === 'puppeteer-without-close')).toBe(true);
    });
  });

  test('flags EventSource without close', () => {
    const src = `
test('sse', () => {
  const es = new EventSource('http://x');
}, 5000);
`;
    withTempFile('k.test.js', src, (file) => {
      const findings = analyzeFile(file);
      expect(findings.some((f) => f.rule === 'sse-without-close')).toBe(true);
    });
  });

  test('flags better-sqlite3 Database open without close', () => {
    const src = `
const Database = require('better-sqlite3');
test('db', () => {
  const db = new Database(':memory:');
});
`;
    withTempFile('l.test.js', src, (file) => {
      const findings = analyzeFile(file);
      expect(findings.some((f) => f.rule === 'sqlite-open-without-close')).toBe(true);
    });
  });
});
