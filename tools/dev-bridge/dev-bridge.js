#!/usr/bin/env node
'use strict';
/**
 * Dev Bridge — zero-dependency file-RPC between the Cowork sandbox and this
 * Windows machine, over the shared repo folder.
 *
 * The sandbox drops `{ "action": "...", "params": {...} }` JSON files into
 * tools/dev-bridge/inbox/. This bridge polls the inbox, executes ONLY the
 * allowlisted actions below (never arbitrary shell), writes a
 * <name>.result.json to outbox/, and streams app output to logs/.
 *
 * Start it by double-clicking start-dev-bridge.cmd (keeps a console window;
 * Ctrl+C to stop). Everything it can do is listed in ACTIONS.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const VERSION = 4; // v4: merged tools/dev/agent-bridge (2026-07-11) — .cmd spawn
                   // fix (Node>=18 EINVAL), start-electron readiness probe +
                   // --allow-multi-jobs, ui-screenshot isolated user-data-dir,
                   // kill-pid guard widened to the repos workspace, checks/.
const BASE = __dirname;
const ROOT = path.resolve(BASE, '..', '..'); // repo root
const INBOX = path.join(BASE, 'inbox');
const OUTBOX = path.join(BASE, 'outbox');
const LOGS = path.join(BASE, 'logs');
const STATE = path.join(BASE, 'state');
for (const d of [INBOX, OUTBOX, LOGS, STATE]) fs.mkdirSync(d, { recursive: true });

// Single-instance lock: two pollers racing the inbox would double-execute
// actions. A dead pid in the lock is stale and gets taken over.
const LOCK = path.join(STATE, 'bridge.pid');
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
(function acquireLock() {
  try {
    const existing = Number(fs.readFileSync(LOCK, 'utf8'));
    if (existing && existing !== process.pid && pidAlive(existing)) {
      console.log(`dev-bridge already running (pid ${existing}); exiting.`);
      process.exit(0);
    }
  } catch { /* no lock */ }
  fs.writeFileSync(LOCK, String(process.pid));
})();

const bridgeLog = fs.createWriteStream(path.join(LOGS, 'bridge.log'), { flags: 'a' });
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  bridgeLog.write(line + '\n');
}

// Managed processes are DETACHED and tracked in state/procs.json so they
// survive bridge restarts (Windows kills a dying parent's job tree otherwise
// — this took the UI down twice on 2026-07-07). Any bridge generation can
// re-adopt or stop them via the registry.
const PROCS = path.join(STATE, 'procs.json');
function readProcs() {
  try { return JSON.parse(fs.readFileSync(PROCS, 'utf8')); } catch { return {}; }
}
function writeProcs(obj) { fs.writeFileSync(PROCS, JSON.stringify(obj, null, 2)); }
function liveProcs() {
  const all = readProcs();
  const live = {};
  for (const [name, rec] of Object.entries(all)) {
    if (rec && rec.pid && pidAlive(rec.pid)) live[name] = rec;
  }
  if (Object.keys(live).length !== Object.keys(all).length) writeProcs(live);
  return live;
}

// Node >=18 refuses spawn() of .cmd/.bat without a shell (CVE-2024-27980);
// electron.cmd hits this. Quote and go through the shell only in that case.
function needsShell(cmd) {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(String(cmd));
}
function quoteArg(a) {
  const s = String(a);
  return /[\s"^&|<>()%!]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function startManaged(name, cmd, args, { env = {}, cwd = ROOT } = {}) {
  const existing = liveProcs()[name];
  if (existing) return { ok: false, error: `${name} already running`, pid: existing.pid };
  const logPath = path.join(LOGS, `${name}.log`);
  const out = fs.openSync(logPath, 'a');
  const spawnOpts = {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', out, out],
    windowsHide: false,
    detached: true
  };
  const child = needsShell(cmd)
    ? spawn([cmd, ...args].map(quoteArg).join(' '), { ...spawnOpts, shell: true })
    : spawn(cmd, args, spawnOpts);
  child.unref();
  const procs = readProcs();
  procs[name] = { pid: child.pid, cmd, args, startedAt: new Date().toISOString() };
  writeProcs(procs);
  return { ok: true, pid: child.pid, log: `tools/dev-bridge/logs/${name}.log` };
}

function stopManaged(name) {
  const rec = liveProcs()[name];
  if (!rec) return { ok: false, error: `${name} not running` };
  try { process.kill(rec.pid); } catch {}
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/PID', String(rec.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  }
  const procs = readProcs();
  delete procs[name];
  writeProcs(procs);
  return { ok: true, stopped: rec.pid };
}

const UI_SERVER = path.join(ROOT, 'src', 'ui', 'server', 'unifiedApp', 'server.js');
const ELECTRON_BIN = process.platform === 'win32'
  ? path.join(ROOT, 'node_modules', '.bin', 'electron.cmd')
  : path.join(ROOT, 'node_modules', '.bin', 'electron');

const ACTIONS = {
  // Liveness probe.
  ping: async () => ({ ok: true, pong: true, version: VERSION, bridgePid: process.pid, platform: process.platform, node: process.version, root: ROOT }),

  // Self-restart. Under the supervisor .cmd (BRIDGE_SUPERVISED=1) just exit —
  // the loop respawns with fresh code and a visible console. Otherwise spawn a
  // detached replacement first.
  'restart-bridge': async () => {
    try { fs.unlinkSync(LOCK); } catch {}
    let newPid = null;
    if (process.env.BRIDGE_SUPERVISED !== '1') {
      const child = spawn(process.execPath, [path.join(BASE, 'dev-bridge.js')], {
        detached: true, stdio: 'ignore', cwd: BASE
      });
      child.unref();
      newPid = child.pid;
    }
    setTimeout(() => process.exit(0), 800);
    return { ok: true, restarting: true, supervised: process.env.BRIDGE_SUPERVISED === '1', oldPid: process.pid, newPid };
  },

  // Kill a process by pid — ONLY if its command line is under the repos
  // workspace (parent of this repo, e.g. ...\Documents\repos). Recovers
  // orphans from any repo's previous sessions; never a general kill.
  'kill-pid': async (p = {}) => {
    const pid = Number(p.pid);
    if (!Number.isInteger(pid) || pid <= 0) return { ok: false, error: 'pid required' };
    if (pid === process.pid) return { ok: false, error: 'refusing to kill self (use restart-bridge)' };
    const WORKSPACE = path.resolve(ROOT, '..');
    try {
      const out = require('child_process').execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
        { timeout: 15000 }
      ).toString();
      if (!out.toLowerCase().includes(WORKSPACE.toLowerCase())) {
        return { ok: false, error: 'pid command line is not under the repos workspace; refusing' };
      }
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      return { ok: true, killed: pid, cmdline: out.trim().slice(0, 200) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  // Managed process inventory (registry-based; survives bridge restarts).
  status: async () => ({
    ok: true,
    running: Object.entries(liveProcs()).map(([name, r]) => ({ name, ...r }))
  }),

  // Unified UI web server (browse at http://localhost:<port>). params:
  //   port (default 3000), dbPath (relative to repo root; default data/news.db)
  'start-ui': async (p = {}) => {
    const port = Number(p.port) || 3000;
    const dbPath = path.resolve(ROOT, p.dbPath || path.join('data', 'news.db'));
    const env = { PORT: String(port), UI_ALLOW_MULTI_JOBS: 'true', DB_PATH: dbPath };
    if (p.workerMode) env.UI_CRAWL_WORKER = '1'; // crawl jobs in forked children
    const r = startManaged('unified-ui', process.execPath, [UI_SERVER, '--port', String(port)], { env });
    return r.ok ? { ...r, url: `http://localhost:${port}/`, dbPath, workerMode: Boolean(p.workerMode) } : r;
  },
  'stop-ui': async () => stopManaged('unified-ui'),
  'restart-ui': async (p = {}) => { stopManaged('unified-ui'); await sleep(1200); return ACTIONS['start-ui'](p); },

  // Electron desktop app (spawns its own server unless port already serves).
  //   params: port (default 3170), app (default crawl-status), dbPath,
  //           allowMultiJobs (default true), readyTimeoutMs (default 45000;
  //           0 = don't wait). Waits for the app's HTTP server and reports
  //           httpOk so the caller knows the UI actually came up.
  'start-electron': async (p = {}) => {
    if (!fs.existsSync(ELECTRON_BIN)) return { ok: false, error: 'electron binary not found in node_modules' };
    const port = Number(p.port) || 3170;
    const appId = p.app === undefined ? 'crawl-status' : p.app;
    const args = [path.join(ROOT, 'src', 'ui', 'electron', 'unifiedApp', 'main.js'), '--port', String(port)];
    if (appId) args.push('--app', String(appId));
    if (p.allowMultiJobs !== false) args.push('--allow-multi-jobs');
    const env = {};
    if (p.dbPath) env.DB_PATH = path.resolve(ROOT, p.dbPath);
    const r = startManaged('electron-app', ELECTRON_BIN, args, { env });
    if (!r.ok) return r;
    const readyTimeoutMs = p.readyTimeoutMs === undefined ? 45000 : Number(p.readyTimeoutMs);
    let httpOk = null;
    if (readyTimeoutMs > 0) {
      httpOk = false;
      const deadline = Date.now() + readyTimeoutMs;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
          if (res.status < 500) { httpOk = true; break; }
        } catch { /* not up yet */ }
        await sleep(500);
      }
    }
    return { ...r, url: `http://localhost:${port}/`, port, httpOk };
  },
  'stop-electron': async () => stopManaged('electron-app'),

  // Bounded test run. params: testPath (repo-relative, required)
  'run-tests': async (p = {}) => {
    if (!p.testPath) return { ok: false, error: 'testPath required' };
    const safe = path.resolve(ROOT, p.testPath);
    if (!safe.startsWith(ROOT)) return { ok: false, error: 'testPath escapes repo' };
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js'), safe], {
        cwd: ROOT, windowsHide: true
      });
      let out = '';
      const cap = (c) => { out += c.toString(); if (out.length > 20000) out = out.slice(-20000); };
      child.stdout.on('data', cap); child.stderr.on('data', cap);
      const timer = setTimeout(() => { try { child.kill(); } catch {} }, 180000);
      child.on('exit', (code) => { clearTimeout(timer); resolve({ ok: code === 0, exitCode: code, tail: out.slice(-4000) }); });
    });
  },

  // Capture the REAL UI on this machine via Electron's --screenshot smoke mode
  // (brief visible window, ~5-15s). PNG lands in state/ui-shots/ where the
  // sandbox can Read and visually verify. params: { port?, app?, delayMs? }
  'ui-screenshot': async (p = {}) => {
    const port = Number(p.port) || 3000;
    const app = p.app ? String(p.app).replace(/[^\w-]/g, '') : 'crawl-status';
    const name = `ui-${Date.now()}.png`;
    const outPath = path.join(STATE, 'ui-shots', name);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const ELECTRON = path.join(ROOT, 'node_modules', '.bin', 'electron.cmd');
    if (!fs.existsSync(ELECTRON)) return { ok: false, error: 'electron.cmd not found in node_modules' };
    // Isolated user-data-dir: a second Electron instance sharing the main
    // app's profile fights over the GPU/disk cache ("Access is denied",
    // empty capturePage output). See main.js --user-data-dir support.
    const userDataDir = path.join(STATE, 'ui-shot-profile');
    return new Promise((resolve) => {
      const child = spawn(`"${ELECTRON}"`, [
        path.join(ROOT, 'src', 'ui', 'electron', 'unifiedApp', 'main.js'),
        '--port', String(port), '--use-existing-server',
        '--app', app, '--smoke', '--screenshot', outPath,
        '--screenshot-delay-ms', String(Number(p.delayMs) || 2000),
        '--user-data-dir', userDataDir
      ], { cwd: ROOT, windowsHide: false, shell: true });
      const timer = setTimeout(() => { try { child.kill(); } catch {} }, 60000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ ok: fs.existsSync(outPath), exitCode: code, path: `tools/dev-bridge/state/ui-shots/${name}` });
      });
      child.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, error: err.message }); });
    });
  },

  // Multi-hour crawl campaign (managed detached process; UI shows legs live).
  // params: { durationMs, urls: 'a|b|c', maxDownloads?, legBudgetMs?, port? }
  'start-campaign': async (p = {}) => {
    if (!p.urls) return { ok: false, error: 'urls required (pipe-separated)' };
    const args = [
      path.join(ROOT, 'tools', 'crawl', 'campaign-runner.js'),
      '--duration-ms', String(Number(p.durationMs) || 4 * 3600 * 1000),
      '--urls', String(p.urls),
      '--max-downloads', String(Number(p.maxDownloads) || 25),
      '--leg-budget-ms', String(Number(p.legBudgetMs) || 20 * 60 * 1000),
      '--port', String(Number(p.port) || 3000),
      '--operation', String(p.operation || 'basicArticleCrawl'),
      '--screenshot-every-ms', String(Number(p.screenshotEveryMs) || 0)
    ];
    return startManaged('campaign', process.execPath, args);
  },
  'stop-campaign': async () => {
    try { fs.writeFileSync(path.join(STATE, 'campaign-stop'), new Date().toISOString()); } catch (err) {
      return { ok: false, error: err.message };
    }
    return { ok: true, note: 'stop-file written; runner stops current job and exits within ~10s' };
  },
  'campaign-status': async () => {
    try { return { ok: true, ...JSON.parse(fs.readFileSync(path.join(STATE, 'campaign-status.json'), 'utf8')) }; }
    catch (_e) { return { ok: false, error: 'no campaign status yet' }; }
  },

  // Local-only HTTP relay: lets the sandbox drive UIs running on THIS machine.
  // params: { method: 'GET'|'POST', url: 'http://127.0.0.1:3000/...', body?: object }
  'http': async (p = {}) => {
    let u;
    try { u = new URL(String(p.url || '')); } catch { return { ok: false, error: 'bad url' }; }
    if (!['127.0.0.1', 'localhost', '::1'].includes(u.hostname)) {
      return { ok: false, error: 'localhost targets only' };
    }
    const method = (p.method || 'GET').toUpperCase();
    if (!['GET', 'POST'].includes(method)) return { ok: false, error: 'GET/POST only' };
    try {
      const res = await fetch(u, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: p.body ? JSON.stringify(p.body) : undefined,
        signal: AbortSignal.timeout(20000) // a hung endpoint must not wedge the bridge
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, body: text.slice(0, 20000) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  // Run a repo-checked-in node script (same trust boundary as run-tests: the
  // script must live under the repo). params: { scriptPath, args?: string[] }
  'run-node': async (p = {}) => {
    if (!p.scriptPath) return { ok: false, error: 'scriptPath required' };
    const safe = path.resolve(ROOT, p.scriptPath);
    if (!safe.startsWith(ROOT)) return { ok: false, error: 'scriptPath escapes repo' };
    if (!fs.existsSync(safe)) return { ok: false, error: 'script not found: ' + p.scriptPath };
    const args = Array.isArray(p.args) ? p.args.map(String) : [];
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [safe, ...args], { cwd: ROOT, windowsHide: true });
      let out = '';
      const cap = (c) => { out += c.toString(); if (out.length > 40000) out = out.slice(-40000); };
      child.stdout.on('data', cap); child.stderr.on('data', cap);
      const budget = Math.min(Number(p.timeoutMs) || 120000, 2000000); // L4 crawls need ~30min reps
      const timer = setTimeout(() => { try { child.kill(); } catch {} }, budget);
      child.on('exit', (code) => { clearTimeout(timer); resolve({ ok: code === 0, exitCode: code, output: out.slice(-8000) }); });
    });
  },

  // Tail a managed log. params: name (default unified-ui), lines (default 40)
  'tail-log': async (p = {}) => {
    const f = path.join(LOGS, `${(p.name || 'unified-ui').replace(/[^\w-]/g, '')}.log`);
    if (!fs.existsSync(f)) return { ok: false, error: 'no such log' };
    const text = fs.readFileSync(f, 'utf8');
    return { ok: true, tail: text.split('\n').slice(-(Number(p.lines) || 40)).join('\n') };
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ACTION_WATCHDOG_MS = 150000;

async function processFile(file) {
  const full = path.join(INBOX, file);
  const processing = full + '.processing';
  try { fs.renameSync(full, processing); } catch { return; } // raced/gone
  const resultPath = path.join(OUTBOX, file.replace(/\.json$/, '') + '.result.json');
  let result;
  try {
    const req = JSON.parse(fs.readFileSync(processing, 'utf8'));
    const handler = ACTIONS[req.action];
    if (!handler) {
      result = { ok: false, error: `unknown action '${req.action}'`, allowed: Object.keys(ACTIONS) };
    } else {
      log(`action ${req.action} ${JSON.stringify(req.params || {})}`);
      // Watchdog: a stuck handler must never wedge the bridge — always answer.
      // Long-budget actions (run-node timeoutMs) get watchdog >= their budget.
      const wd = Math.max(ACTION_WATCHDOG_MS, (Number(req.params && req.params.timeoutMs) || 0) + 10000);
      result = await Promise.race([
        handler(req.params || {}),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: `watchdog: action exceeded ${wd}ms` }), wd))
      ]);
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }
  try {
    fs.writeFileSync(resultPath, JSON.stringify({ ...result, action: file, finishedAt: new Date().toISOString() }, null, 2));
  } catch (err) { log('result write failed:', err.message); }
  try { fs.unlinkSync(processing); } catch {}
  log(`done ${file} -> ${path.basename(resultPath)}`);
}

// Heartbeat as FRESH-NAMED files (the shared mount shows new files reliably
// but lies about appends), so the sandbox can detect liveness.
let lastHb = null;
function heartbeat() {
  try {
    const name = path.join(STATE, `hb-${Math.floor(Date.now() / 30000)}.json`);
    if (name === lastHb) return;
    fs.writeFileSync(name, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    if (lastHb) { try { fs.unlinkSync(lastHb); } catch {} }
    lastHb = name;
  } catch { /* best-effort */ }
}

const inFlight = new Set();
const MAX_CONCURRENT = 4;

async function main() {
  log(`dev-bridge up (v${VERSION}). repo=${ROOT} platform=${process.platform} node=${process.version} supervised=${process.env.BRIDGE_SUPERVISED === '1'}`);
  log(`watching ${INBOX} (actions: ${Object.keys(ACTIONS).join(', ')})`);
  for (;;) {
    heartbeat();
    try {
      const files = fs.readdirSync(INBOX).filter((f) => f.endsWith('.json') && !inFlight.has(f));
      for (const f of files) {
        if (inFlight.size >= MAX_CONCURRENT) break;
        inFlight.add(f);
        processFile(f).catch((err) => log('processFile error:', err.message)).finally(() => inFlight.delete(f));
      }
    } catch (err) {
      log('poll error:', err.message);
    }
    await sleep(1000);
  }
}

process.on('uncaughtException', (err) => log('UNCAUGHT:', err.stack || err.message));
process.on('unhandledRejection', (err) => log('UNHANDLED REJECTION:', (err && err.stack) || String(err)));

main();
