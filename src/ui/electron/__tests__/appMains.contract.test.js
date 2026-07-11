/**
 * Static contract tests for ALL Electron app mains (L2, electron-ui-loop c3).
 * Complements unifiedApp/__tests__/main.headless.test.js (dynamic).
 *
 * Pins across every src/ui/electron/<app>/main.js:
 *  1. Window security: contextIsolation true, nodeIntegration false — always.
 *  2. Referenced preload scripts exist on disk.
 *  3. IPC contract: every channel the preload invokes/sends is handled in main.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const apps = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('__'))
  .map((e) => e.name)
  .filter((name) => fs.existsSync(path.join(ROOT, name, 'main.js')));

describe('electron app mains — security + preload contracts', () => {
  test('discovered the app set', () => {
    expect(apps.length).toBeGreaterThanOrEqual(6); // unifiedApp, crawlerApp, taskMonitor, backgroundTasksMonitor, placeHubGuessingApp, trayMonitor
  });

  describe.each(apps)('%s/main.js', (app) => {
    const mainPath = path.join(ROOT, app, 'main.js');
    const src = fs.readFileSync(mainPath, 'utf8');
    const makesWindows = /new BrowserWindow\s*\(/.test(src);

    (makesWindows ? test : test.skip)('window security prefs are locked down', () => {
      expect(src).toMatch(/contextIsolation:\s*true/);
      expect(src).toMatch(/nodeIntegration:\s*false/);
      expect(src).not.toMatch(/contextIsolation:\s*false/);
      expect(src).not.toMatch(/nodeIntegration:\s*true/);
      expect(src).not.toMatch(/webSecurity:\s*false/);
    });

    test('referenced preload scripts exist', () => {
      const preloadRefs = [...src.matchAll(/preload:\s*path\.join\(__dirname,\s*'([^']+)'\)/g)].map((m) => m[1]);
      for (const rel of preloadRefs) {
        expect(fs.existsSync(path.join(ROOT, app, rel))).toBe(true);
      }
    });

    test('preload IPC channels are all handled by main', () => {
      const preloadPath = path.join(ROOT, app, 'preload.js');
      if (!fs.existsSync(preloadPath)) return; // no preload → nothing to check
      const preload = fs.readFileSync(preloadPath, 'utf8');
      const invoked = [...preload.matchAll(/ipcRenderer\.(?:invoke|send)\(\s*'([^']+)'/g)].map((m) => m[1]);
      const handled = [...src.matchAll(/ipcMain\.(?:handle|on)\(\s*'([^']+)'/g)].map((m) => m[1]);
      const missing = [...new Set(invoked)].filter((ch) => !handled.includes(ch));
      expect(missing).toEqual([]);
    });
  });
});
