#!/usr/bin/env node
'use strict';

/**
 * test-hang-analyzer.js
 *
 * Static analysis for Jest test files to flag patterns that commonly cause hangs:
 *   - spawn/fork without explicit kill in afterAll/finally
 *   - setInterval without clearInterval / unref
 *   - puppeteer.launch without browser.close
 *   - server.listen / http.createServer without close()
 *   - Missing per-test timeout when test does network/spawn I/O
 *   - Unbounded loops (while(true)/for(;;)) without break or deadline
 *   - SSE/EventSource without close()
 *   - better-sqlite3 / Database open without close()
 *
 * Usage:
 *   node tools/dev/test-hang-analyzer.js --dir tests [--json] [--out <file>] [--severity warn|error]
 *
 * Exit codes:
 *   0 — no high-severity findings
 *   1 — high-severity findings present (gate-able in CI)
 *   2 — usage / fatal error
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const opts = { dir: 'tests', json: false, out: null, severity: 'warn', glob: null };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--dir' && argv[i + 1]) { opts.dir = argv[i + 1]; i += 1; }
    else if (t === '--json') { opts.json = true; }
    else if (t === '--out' && argv[i + 1]) { opts.out = argv[i + 1]; i += 1; }
    else if (t === '--severity' && argv[i + 1]) { opts.severity = argv[i + 1]; i += 1; }
    else if (t === '--glob' && argv[i + 1]) { opts.glob = argv[i + 1]; i += 1; }
    else if (t === '--help' || t === '-h') { opts.help = true; }
  }
  return opts;
}

function printHelp() {
  console.log(`Usage: node tools/dev/test-hang-analyzer.js --dir <path> [options]

Options:
  --dir <path>          Directory to scan (default: tests)
  --glob <substring>    Only analyze files whose path includes this substring
  --json                Emit JSON report on stdout
  --out <file>          Write JSON report to file
  --severity <level>    Exit code 1 only when finding >= level (warn|error). Default: warn.
  --help                Show this help.
`);
}

function walk(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch { continue; }
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '__evidence__') continue;
        stack.push(full);
      } else if (ent.isFile() && /\.test\.js$/.test(ent.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

const RULES = [
  {
    id: 'spawn-without-kill',
    severity: 'error',
    detect(src) {
      const findings = [];
      // Only consider spawn/fork from child_process (require/import) to avoid method-call false positives
      const importsCP = /require\s*\(\s*['"]child_process['"]\s*\)|from\s+['"]child_process['"]/.test(src);
      if (!importsCP) return findings;
      // Bare-name spawn(/fork( call — not preceded by . or word char
      const spawnHits = matchAll(src, /(?<![\w.])(?:spawn|fork)\s*\(/g);
      if (spawnHits.length === 0) return findings;
      const hasKill = /\.kill\s*\(/.test(src) || /stopChild\s*\(/.test(src);
      if (!hasKill) {
        findings.push({ rule: 'spawn-without-kill', message: `spawn/fork (child_process) present (${spawnHits.length}x) but no .kill() / stopChild() found in file`, severity: 'error', count: spawnHits.length });
      }
      const hasCleanup = /afterAll\s*\(/.test(src) || /finally\s*\{/.test(src);
      if (hasKill && !hasCleanup) {
        findings.push({ rule: 'spawn-without-kill', message: 'spawn + .kill() found but no afterAll/finally cleanup block', severity: 'warn', count: spawnHits.length });
      }
      return findings;
    },
  },
  {
    id: 'setinterval-without-cleanup',
    severity: 'error',
    detect(src) {
      const findings = [];
      // Bare-name setInterval — exclude method calls like tracker.setInterval(...)
      const intervals = matchAll(src, /(?<![\w.])setInterval\s*\(/g);
      if (intervals.length === 0) return findings;
      const cleared = /(?<![\w.])clearInterval\s*\(/.test(src);
      const unref = /\.unref\s*\(\s*\)/.test(src);
      const fakeTimers = /jest\.useFakeTimers\s*\(/.test(src);
      if (fakeTimers) return findings;
      if (!cleared && !unref) {
        findings.push({ rule: 'setinterval-without-cleanup', message: `setInterval (${intervals.length}x) without clearInterval or .unref()`, severity: 'error', count: intervals.length });
      } else if (!cleared) {
        findings.push({ rule: 'setinterval-without-cleanup', message: 'setInterval present without clearInterval (only .unref); risk of late callbacks during teardown', severity: 'warn', count: intervals.length });
      }
      return findings;
    },
  },
  {
    id: 'puppeteer-without-close',
    severity: 'error',
    detect(src) {
      const findings = [];
      if (!/puppeteer\.launch\s*\(/.test(src) && !/launch\s*\(\s*\{[^}]*headless/m.test(src)) return findings;
      const hasClose = /browser\.close\s*\(/.test(src) || /\.close\s*\(\s*\)\s*[;,)\]]/.test(src);
      if (!hasClose) {
        findings.push({ rule: 'puppeteer-without-close', message: 'puppeteer.launch without browser.close()', severity: 'error' });
      }
      return findings;
    },
  },
  {
    id: 'server-listen-without-close',
    severity: 'warn',
    detect(src) {
      const findings = [];
      const listens = matchAll(src, /\.listen\s*\(/g);
      if (listens.length === 0) return findings;
      // Allow getFreePort helpers (server.close called immediately)
      const closes = matchAll(src, /\.close\s*\(/g);
      if (closes.length === 0) {
        findings.push({ rule: 'server-listen-without-close', message: `.listen() (${listens.length}x) without any .close()`, severity: 'error', count: listens.length });
      } else if (closes.length < listens.length) {
        findings.push({ rule: 'server-listen-without-close', message: `.listen() count (${listens.length}) exceeds .close() count (${closes.length}); verify cleanup`, severity: 'warn' });
      }
      return findings;
    },
  },
  {
    id: 'missing-test-timeout',
    severity: 'warn',
    detect(src) {
      const findings = [];
      // Only Jest tests need jest.setTimeout — skip node:test files
      const isNodeTest = /require\s*\(\s*['"]node:test['"]\s*\)|from\s+['"]node:test['"]/.test(src);
      if (isNodeTest) return findings;
      // Real I/O markers (precise to avoid false positives like obj.fetch(url) on mocks)
      const importsCP = /require\s*\(\s*['"]child_process['"]\s*\)|from\s+['"]child_process['"]/.test(src);
      const usesSpawn = importsCP && /(?<![\w.])(?:spawn|fork)\s*\(/.test(src);
      const usesHttpRequest = /\bhttp\.request\s*\(|\bhttps\.request\s*\(/.test(src);
      const usesPuppeteer = /puppeteer\.launch\s*\(/.test(src);
      const usesAxios = /\baxios\.[a-z]+\s*\(/i.test(src);
      const usesEventSource = /new\s+EventSource\s*\(/.test(src);
      const usesUrlFetch = /(?<![\w.])fetch\s*\(\s*['"`]https?:\/\//.test(src);
      const doesIO = usesSpawn || usesHttpRequest || usesPuppeteer || usesAxios || usesEventSource || usesUrlFetch;
      if (!doesIO) return findings;
      const hasJestTimeout = /jest\.setTimeout\s*\(/.test(src);
      const perTestTimeout = /,\s*\d{4,7}\s*\n?\s*\)/.test(src) || /\b(?:test|it)\s*\([^)]*,[^)]*,\s*\d+\s*\)/s.test(src);
      if (!hasJestTimeout && !perTestTimeout) {
        findings.push({ rule: 'missing-test-timeout', message: 'Test does network/spawn I/O but no per-test timeout or jest.setTimeout()', severity: 'warn' });
      }
      return findings;
    },
  },
  {
    id: 'unbounded-loop',
    severity: 'error',
    detect(src) {
      const findings = [];
      const loops = matchAll(src, /while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/g);
      if (loops.length === 0) return findings;
      // Look for break or deadline check inside file
      const hasBreak = /\bbreak\b/.test(src);
      const hasDeadline = /Date\.now\s*\(\s*\)\s*[<>-]|deadline|timeoutMs|abort/i.test(src);
      if (!hasBreak && !hasDeadline) {
        findings.push({ rule: 'unbounded-loop', message: 'while(true)/for(;;) without break or deadline check', severity: 'error', count: loops.length });
      }
      return findings;
    },
  },
  {
    id: 'sse-without-close',
    severity: 'warn',
    detect(src) {
      const findings = [];
      const hasSSE = /new\s+EventSource\s*\(/.test(src);
      if (!hasSSE) return findings;
      const hasClose = /\.close\s*\(\s*\)/.test(src);
      if (!hasClose) {
        findings.push({ rule: 'sse-without-close', message: 'new EventSource() without .close()', severity: 'error' });
      }
      return findings;
    },
  },
  {
    id: 'sqlite-open-without-close',
    severity: 'warn',
    detect(src) {
      const findings = [];
      const opens = matchAll(src, /new\s+Database\s*\(|require\s*\(\s*['"]better-sqlite3['"]/g);
      if (opens.length === 0) return findings;
      const closes = matchAll(src, /\.close\s*\(\s*\)/g);
      if (closes.length === 0) {
        findings.push({ rule: 'sqlite-open-without-close', message: 'better-sqlite3 Database opened without .close() — leaks file handles, blocks Jest exit', severity: 'error' });
      }
      return findings;
    },
  },
];

function matchAll(src, regex) {
  const out = [];
  let m;
  while ((m = regex.exec(src))) out.push({ index: m.index });
  return out;
}

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i += 1) if (src.charCodeAt(i) === 10) line += 1;
  return line;
}

function analyzeFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const findings = [];
  for (const rule of RULES) {
    try {
      const hits = rule.detect(src) || [];
      for (const h of hits) findings.push({ file, ...h });
    } catch (e) {
      findings.push({ file, rule: rule.id, severity: 'warn', message: `analyzer error: ${e.message}` });
    }
  }
  return findings;
}

function severityRank(s) { return s === 'error' ? 2 : s === 'warn' ? 1 : 0; }

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { printHelp(); process.exit(0); }

  const root = path.resolve(opts.dir);
  if (!fs.existsSync(root)) { console.error(`Directory not found: ${root}`); process.exit(2); }

  let files = walk(root);
  if (opts.glob) files = files.filter((f) => f.includes(opts.glob));

  const all = [];
  for (const f of files) {
    const findings = analyzeFile(f);
    if (findings.length) all.push(...findings);
  }

  const groupedByFile = all.reduce((acc, f) => {
    const k = path.relative(process.cwd(), f.file);
    (acc[k] = acc[k] || []).push({ rule: f.rule, severity: f.severity, message: f.message, count: f.count });
    return acc;
  }, {});

  const counts = all.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});
  const report = {
    scannedDir: root,
    fileCount: files.length,
    findingCount: all.length,
    countsBySeverity: counts,
    files: groupedByFile,
  };

  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(report, null, 2), 'utf8');
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Scanned ${files.length} test file(s) under ${root}`);
    console.log(`Findings: ${all.length} (errors=${counts.error || 0}, warns=${counts.warn || 0})`);
    const fileNames = Object.keys(groupedByFile).sort();
    for (const name of fileNames) {
      console.log(`\n${name}`);
      for (const f of groupedByFile[name]) {
        const tag = f.severity === 'error' ? '[ERROR]' : '[WARN] ';
        console.log(`  ${tag} ${f.rule}: ${f.message}`);
      }
    }
    if (opts.out) console.log(`\nReport written to: ${opts.out}`);
  }

  const threshold = severityRank(opts.severity);
  const worst = Math.max(0, ...all.map((f) => severityRank(f.severity)));
  process.exit(worst >= threshold ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { RULES, analyzeFile, walk };
