'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { app: electronApp, BrowserWindow, Notification } = require('electron');
const { startCrawlCompletionNotifier } = require('./crawlNotifications');

// --user-data-dir <path>: isolate this instance's Chromium profile. Needed
// when a second instance runs beside the main app (e.g. smoke screenshots) —
// sharing the default profile causes GPU/disk-cache lock fights ("Access is
// denied") and can leave capturePage output empty. Must run before ready.
{
  const udIndex = process.argv.indexOf('--user-data-dir');
  if (udIndex >= 0 && process.argv[udIndex + 1]) {
    try {
      const dir = path.resolve(process.argv[udIndex + 1]);
      fs.mkdirSync(dir, { recursive: true });
      electronApp.setPath('userData', dir);
    } catch (_) { /* fall back to default profile */ }
  }
}

function getDevRepoRoot() {
  // __dirname = <repo>/src/ui/electron/unifiedApp
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function resolveAppRoot() {
  // In packaged apps, resources live under process.resourcesPath.
  // We also ship docs/design/data as extraResources in electron-builder config.
  if (electronApp.isPackaged) {
    return process.resourcesPath;
  }

  return getDevRepoRoot();
}

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: '#101113',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadURL(url);

  return win;
}

async function startUnifiedServer({ port, useExistingServer = false }) {
  const appRoot = resolveAppRoot();
  const serverPath = path.join(appRoot, 'src', 'ui', 'server', 'unifiedApp', 'server.js');
  const nodeExecutable = process.env.COPILOT_NODE_PATH || process.env.NODE_EXE || 'node';
  const output = { stdout: '', stderr: '' };

  if (useExistingServer) {
    await waitForHttp(`http://127.0.0.1:${port}/`, parseNumberArg('--server-wait-ms', 60_000), null, output);
    return { server: null, close: async () => {}, appRoot };
  }

  const server = spawn(nodeExecutable, [serverPath, '--port', String(port)], {
    cwd: appRoot,
    env: {
      ...process.env,
      DB_PATH: process.env.DB_PATH || path.join(appRoot, 'data', 'news.db'),
      UI_ALLOW_MULTI_JOBS: hasArg('--allow-multi-jobs') ? 'true' : process.env.UI_ALLOW_MULTI_JOBS,
      // Worker mode MUST default ON (2026-07-26). InProcessCrawlJobRegistry gates
      // forking on UI_CRAWL_WORKER === '1'; without it crawl jobs run INSIDE this
      // server child, so any crawl-side fault kills the server, wipes the in-memory
      // job registry and writes no per-job log. dev-bridge set it, a direct
      // `electron main.js` launch did not — that asymmetry cost four debugging
      // cycles chasing a phantom "sitemap wedge". Measured impact of enabling it:
      // server survived 360s instead of crashing at ~25s, and throughput went
      // ~0.5 -> ~1.45 MB/s. Still overridable: set UI_CRAWL_WORKER=0 explicitly.
      UI_CRAWL_WORKER: process.env.UI_CRAWL_WORKER || '1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  // Forward the child's stdio to THIS process's stdio so it lands in the
  // bridge's electron-app.log. Before (2026-07-20): child output was captured
  // to `output` only and surfaced ONLY on a startup-probe failure — a mid-life
  // server-child crash (e.g. under concurrent frontier reconciliation) left the
  // port dead with the crash reason INVISIBLE. Also cap the in-memory buffer:
  // the old unbounded `+=` was a slow leak over a long-lived server.
  const OUTPUT_CAP_BYTES = 64 * 1024;
  server.stdout?.on('data', (chunk) => {
    try { process.stdout.write(chunk); } catch (_) { /* ignore */ }
    output.stdout = (output.stdout + chunk.toString()).slice(-OUTPUT_CAP_BYTES);
  });

  server.stderr?.on('data', (chunk) => {
    try { process.stderr.write(chunk); } catch (_) { /* ignore */ }
    output.stderr = (output.stderr + chunk.toString()).slice(-OUTPUT_CAP_BYTES);
  });

  // Cold boots (first news.db open after a reboot, AV scans) can exceed 20s;
  // default to 60s and allow override via --server-wait-ms.
  await waitForHttp(`http://127.0.0.1:${port}/`, parseNumberArg('--server-wait-ms', 60_000), server, output);

  const close = async () => {
    try {
      server.kill('SIGTERM');
    } catch {
      // ignore
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      server.kill('SIGKILL');
    } catch {
      // ignore
    }
  };

  return { server, close, appRoot };
}

function waitForHttp(url, timeoutMs, child, output) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    let finished = false;

    const fail = (error) => {
      if (finished) return;
      finished = true;
      reject(error);
    };

    const check = () => {
      if (finished) return;
      if (Date.now() > deadline) {
        return fail(new Error([
          `Unified server did not respond at ${url}`,
          output.stdout ? `--- stdout ---\n${output.stdout.slice(0, 1200)}` : '',
          output.stderr ? `--- stderr ---\n${output.stderr.slice(0, 1200)}` : ''
        ].filter(Boolean).join('\n')));
      }

      const req = http.get(url, { timeout: 1000, headers: { Connection: 'close' }, agent: false }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          finished = true;
          resolve();
          return;
        }
        setTimeout(check, 250);
      });

      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', () => setTimeout(check, 250));
    };

    if (child && typeof child.once === 'function') {
      child.once('exit', (code, signal) => {
        fail(new Error([
          `Unified server exited before responding (code=${code}, signal=${signal || 'none'})`,
          output.stdout ? `--- stdout ---\n${output.stdout.slice(0, 1200)}` : '',
          output.stderr ? `--- stderr ---\n${output.stderr.slice(0, 1200)}` : ''
        ].filter(Boolean).join('\n')));
      });
    }

    check();
  });
}

function parsePortFromArgv() {
  const argv = process.argv;
  const index = argv.indexOf('--port');
  if (index >= 0 && argv[index + 1]) {
    const n = Number(argv[index + 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 3170;
}

function hasArg(flag) {
  return process.argv.includes(flag);
}

function parseNumberArg(flag, defaultValue) {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) {
    const n = Number(process.argv[index + 1]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return defaultValue;
}

function parseStringArg(flag, defaultValue = null) {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return defaultValue;
}

function normalizeUrlPath(urlPath, appId) {
  if (urlPath) return urlPath;
  if (appId) return `/?app=${encodeURIComponent(appId)}`;
  return '/';
}

async function captureScreenshot(win, screenshotPath, delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  // capturePage can return an empty image before the compositor has painted
  // (seen on Windows under GPU-cache contention). Retry until non-empty.
  let png = Buffer.alloc(0);
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      if (!win.isVisible()) win.show();
      const image = await win.webContents.capturePage();
      png = image.toPNG();
      if (png.length > 0) break;
    } catch (_) { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  fs.writeFileSync(screenshotPath, png);
  if (png.length === 0) {
    console.warn('[Electron Unified] screenshot captured empty after retries:', screenshotPath);
  }
}

electronApp.whenReady().then(async () => {
  const port = parsePortFromArgv();
  const smoke = hasArg('--smoke');
  const screenshotPath = parseStringArg('--screenshot');
  const appId = parseStringArg('--app', null);
  const urlPath = normalizeUrlPath(parseStringArg('--url-path', null), appId);
  const useExistingServer = hasArg('--use-existing-server');
  const smokeTimeoutMs = parseNumberArg('--smoke-timeout-ms', 12_000);
  const closeTimeoutMs = parseNumberArg('--smoke-close-timeout-ms', 3_000);
  const screenshotDelayMs = parseNumberArg('--screenshot-delay-ms', 1_200);
  const smokeReadyDelayMs = parseNumberArg('--smoke-ready-delay-ms', 1_000);

  // Keep a stable URL so cached assets work.
  const url = `http://127.0.0.1:${port}${urlPath}`;

  // ── Server-child supervision (2026-07-20) ───────────────────────────────
  // The Express server runs as a spawned child (startUnifiedServer). Before
  // this, the child's `exit` was watched ONLY during the startup probe; once
  // up, a later failure left the port dead with NO restart and NO log — a full
  // restart-electron was the only recovery. Two distinct failure modes were
  // diagnosed (2026-07-20, multi-agent):
  //   1. CRASH — the child process exits. Handled by the exit handler below.
  //   2. WEDGE — the child stays ALIVE but its single event loop is frozen by
  //      synchronous better-sqlite3 reconciliation blocking up to busy_timeout
  //      (5s) per contended write while forked workers hold the WAL write lock;
  //      concurrent run-multi fan-out sustains it, the accept backlog overflows
  //      and Windows RSTs new connections ("actively refused") — but the child
  //      never emits 'exit', so an exit-only supervisor CANNOT recover it. The
  //      liveness watchdog below detects sustained unresponsiveness and kills
  //      the wedged child, converting a wedge into an exit → respawn.
  // Both paths share one crash-loop guard (>3 restarts/60s → stop, leave it
  // down loudly so a genuinely broken build doesn't spin forever).
  let currentClose = async () => {};
  let currentServer = null;
  let serverReady = false;         // true only when the current child passed its startup probe
  let supervising = !useExistingServer;
  const RESTART_MAX = 3;
  const RESTART_WINDOW_MS = 60_000;
  const restartTimes = [];

  const respawnAfterExit = (why) => {
    serverReady = false;
    const now = Date.now();
    restartTimes.push(now);
    while (restartTimes.length && now - restartTimes[0] > RESTART_WINDOW_MS) restartTimes.shift();
    if (restartTimes.length > RESTART_MAX) {
      console.error(`[supervisor] crash-loop guard tripped (${restartTimes.length} restarts in ${RESTART_WINDOW_MS}ms) — NOT respawning; run the bridge restart-electron once the cause is fixed`);
      return;
    }
    console.error(`[supervisor] respawning server child after ${why} (${restartTimes.length}/${RESTART_MAX} within window)`);
    launchSupervisedServer().catch((e) => console.error('[supervisor] respawn failed:', e && e.message));
  };

  async function launchSupervisedServer() {
    serverReady = false;
    const { server, close } = await startUnifiedServer({ port, useExistingServer });
    currentClose = close;
    currentServer = server;
    if (!server || useExistingServer) { serverReady = true; return; }
    serverReady = true; // startUnifiedServer only resolves after the HTTP readiness probe passes
    server.once('exit', (code, signal) => {
      if (!supervising) return; // intentional shutdown — not a crash
      console.error(`[supervisor] server child exited unexpectedly (code=${code}, signal=${signal || 'none'})`);
      respawnAfterExit(`exit(code=${code},signal=${signal || 'none'})`);
    });
    // A post-startup ChildProcess 'error' (e.g. EPIPE writing to a dead pipe)
    // would otherwise throw uncaught on THIS electron main process — log it.
    server.on('error', (err) => console.error('[supervisor] server child error:', err && err.message));
  }

  await launchSupervisedServer();

  // Liveness watchdog: probe the child's HTTP every WATCHDOG_INTERVAL. A wedged
  // event loop can't service the accept loop, so probes fail; after
  // WATCHDOG_MAX_FAILS consecutive failures (≫ the 5s busy_timeout stall, so a
  // transient stall is never mistaken for a wedge) SIGKILL the child — its exit
  // handler then respawns it. Gated on serverReady so a still-booting child
  // (its own startup probe takes ~15-20s) is never counted as wedged.
  const WATCHDOG_INTERVAL_MS = parseNumberArg('--watchdog-interval-ms', 10_000);
  const WATCHDOG_MAX_FAILS = parseNumberArg('--watchdog-max-fails', 3);
  const WATCHDOG_PROBE_TIMEOUT_MS = 3_000;
  let watchdogFails = 0;
  const probeHealth = () => new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: WATCHDOG_PROBE_TIMEOUT_MS, headers: { Connection: 'close' }, agent: false }, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on('timeout', () => req.destroy(new Error('probe timeout')));
    req.on('error', () => resolve(false));
  });
  if (supervising) {
    const watchdog = setInterval(async () => {
      if (!supervising || shuttingDown || !serverReady || !currentServer) return;
      const ok = await probeHealth();
      if (ok) { watchdogFails = 0; return; }
      watchdogFails += 1;
      console.error(`[watchdog] server child unresponsive (${watchdogFails}/${WATCHDOG_MAX_FAILS})`);
      if (watchdogFails >= WATCHDOG_MAX_FAILS) {
        watchdogFails = 0;
        serverReady = false; // stop probing until the respawn re-arms it
        console.error('[watchdog] wedge detected — killing frozen server child so the supervisor respawns it');
        try { currentServer.kill('SIGKILL'); } catch (e) { console.error('[watchdog] kill failed:', e && e.message); }
      }
    }, WATCHDOG_INTERVAL_MS);
    if (typeof watchdog.unref === 'function') watchdog.unref();
  }

  const win = createWindow(url);

  // RB-010 residue (2026-07-20): OS notification when a crawl job finishes.
  // The watcher polls the jobs API from the MAIN process (the only place OS
  // toasts can be shown; the server child owns job state but not the
  // desktop). Skipped for smoke/screenshot runs — those close immediately.
  // --notify-test fires one toast on boot: the "[notify] shown:" log line in
  // the bridge's electron-app.log is the machine-checkable evidence; the
  // toast itself is owner-visible only.
  let notifier = null;
  if (!smoke && !screenshotPath) {
    const showToast = ({ title, body }) => {
      if (!Notification.isSupported()) {
        console.log('[notify] suppressed: Notification.isSupported() = false');
        return;
      }
      new Notification({ title, body, silent: true }).show();
    };
    notifier = startCrawlCompletionNotifier({
      fetchJobs: () => new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: '/api/v1/crawl/jobs', timeout: 5000 }, (res) => {
          let out = '';
          res.on('data', (c) => { out += c; });
          res.on('end', () => {
            try { resolve(JSON.parse(out).items || []); } catch (err) { reject(err); }
          });
        });
        req.on('timeout', () => { req.destroy(new Error('jobs poll timeout')); });
        req.on('error', reject);
      }),
      notify: showToast,
      intervalMs: 10_000,
      logger: console
    });
    if (hasArg('--notify-test')) {
      try {
        showToast({ title: 'Crawl notifications armed', body: 'test toast from --notify-test' });
        console.log('[notify] shown: Crawl notifications armed | test toast from --notify-test');
      } catch (err) {
        console.log('[notify] failed:', err.message);
      }
    }
  }

  let shuttingDown = false;
  const shutdown = async (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    supervising = false; // stop the watcher from respawning during an intentional shutdown
    if (notifier) { try { notifier.stop(); } catch (_) { /* ignore */ } }

    const closeDeadline = smoke ? closeTimeoutMs : 10_000;
    try {
      await Promise.race([
        currentClose(),
        new Promise((resolve) => setTimeout(resolve, closeDeadline))
      ]);
    } catch {
      // ignore
    }

    try {
      electronApp.exit(code);
    } catch {
      process.exit(code);
    }

    if (smoke) {
      setTimeout(() => {
        process.exit(code);
      }, 500);
    }
  };

  if (smoke || screenshotPath) {
    const timer = setTimeout(() => {
      shutdown(1);
    }, smokeTimeoutMs);

    win.webContents.once('did-finish-load', async () => {
      clearTimeout(timer);
      if (screenshotPath) {
        try {
          await captureScreenshot(win, path.resolve(screenshotPath), screenshotDelayMs);
        } catch (error) {
          console.error('[Electron Unified] screenshot failed:', error.message);
          await shutdown(1);
          return;
        }
      } else if (smokeReadyDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, smokeReadyDelayMs));
      }
      shutdown(0);
    });

    win.webContents.once('did-fail-load', () => {
      clearTimeout(timer);
      shutdown(1);
    });
  }

  win.on('closed', async () => {
    await shutdown(0);
  });

  electronApp.on('before-quit', async (e) => {
    // Ensure we close the server even if window closes quickly.
    if (shuttingDown) {
      return;
    }
    e.preventDefault();
    await shutdown(0);
  });

  electronApp.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(url);
    }
  });
}).catch((error) => {
  console.error('[Electron Unified] startup failed:', error && error.stack ? error.stack : String(error));
  try {
    electronApp.exit(1);
  } catch {
    process.exit(1);
  }
});

electronApp.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    electronApp.quit();
  }
});
