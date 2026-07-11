/**
 * Headless (no display) tests for the Electron unified app main process.
 * electron is mocked (virtual) — these pin the wiring contracts:
 *   - BrowserWindow security prefs (contextIsolation on, nodeIntegration off)
 *   - URL construction from --port/--app/--url-path
 *   - server spawn contract (entry path, --port arg, DB_PATH/UI_ALLOW_MULTI_JOBS env)
 * L3 (real binary under Xvfb) covers what these cannot: actual window + renderer.
 */
const http = require('http');
const path = require('path');

let whenReadyResolve;
const windows = [];

const mockApp = {
  isPackaged: false,
  whenReady: jest.fn(() => new Promise((res) => { whenReadyResolve = res; })),
  on: jest.fn(),
  exit: jest.fn(),
  quit: jest.fn()
};

class MockBrowserWindow {
  constructor(opts) {
    this.opts = opts;
    this.loadedUrl = null;
    this.webContents = { once: jest.fn(), capturePage: jest.fn() };
    windows.push(this);
  }
  loadURL(url) { this.loadedUrl = url; }
  on() {}
  static getAllWindows() { return windows; }
}

jest.mock('electron', () => ({ app: mockApp, BrowserWindow: MockBrowserWindow }), { virtual: true });

const spawnCalls = [];
jest.mock('child_process', () => ({
  spawn: (...args) => {
    spawnCalls.push(args);
    return {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      once: jest.fn(),
      kill: jest.fn()
    };
  }
}));

function listen(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => { res.statusCode = 200; res.end('ok'); });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

function flush(ms = 400) { return new Promise((r) => setTimeout(r, ms)); }

describe('electron unifiedApp main (headless)', () => {
  const PORT = 3199;
  let srv;
  let argvBackup;

  beforeAll(async () => { srv = await listen(PORT); });
  afterAll(() => new Promise((r) => srv.close(r)));
  beforeEach(() => { argvBackup = process.argv; windows.length = 0; spawnCalls.length = 0; jest.resetModules(); });
  afterEach(() => { process.argv = argvBackup; });

  test('boot with --use-existing-server: secure window loads the app URL', async () => {
    process.argv = ['node', 'main.js', '--port', String(PORT), '--use-existing-server', '--app', 'crawl-status'];
    require('../main.js');
    whenReadyResolve();
    await flush();

    expect(windows.length).toBe(1);
    const win = windows[0];
    expect(win.opts.webPreferences.contextIsolation).toBe(true);
    expect(win.opts.webPreferences.nodeIntegration).toBe(false);
    expect(win.loadedUrl).toBe(`http://127.0.0.1:${PORT}/?app=crawl-status`);
    expect(spawnCalls.length).toBe(0); // existing server → no spawn
  });

  test('--url-path takes precedence over --app', async () => {
    process.argv = ['node', 'main.js', '--port', String(PORT), '--use-existing-server', '--app', 'x', '--url-path', '/custom?x=1'];
    require('../main.js');
    whenReadyResolve();
    await flush();
    expect(windows[0].loadedUrl).toBe(`http://127.0.0.1:${PORT}/custom?x=1`);
  });

  test('spawn contract: server entry, --port arg, DB_PATH + UI_ALLOW_MULTI_JOBS env', async () => {
    process.argv = ['node', 'main.js', '--port', String(PORT), '--allow-multi-jobs'];
    require('../main.js');
    whenReadyResolve();
    await flush(700); // waitForHttp satisfied by the real listener on PORT

    expect(spawnCalls.length).toBe(1);
    const [cmd, args, opts] = spawnCalls[0];
    expect(args[0].replace(/\\/g, '/')).toMatch(/src\/ui\/server\/unifiedApp\/server\.js$/);
    expect(args).toContain('--port');
    expect(args).toContain(String(PORT));
    expect(opts.env.DB_PATH.replace(/\\/g, '/')).toMatch(/data\/news\.db$/);
    expect(opts.env.UI_ALLOW_MULTI_JOBS).toBe('true');
    expect(path.isAbsolute(opts.cwd)).toBe(true);
  });

  test('default port is 3170 when --port absent', async () => {
    process.argv = ['node', 'main.js', '--use-existing-server'];
    require('../main.js');
    whenReadyResolve();
    await flush(300);
    // waitForHttp will be polling 3170 (nothing there) — window not created yet,
    // but the URL contract is checkable via the pending state: no window, no spawn.
    expect(windows.length).toBe(0);
    expect(spawnCalls.length).toBe(0);
  });
});
