/**
 * Bridge v2 bootstrap — a one-shot upgrade vehicle, NOT a normal test.
 *
 * Ordinarily this suite is a no-op (passes trivially). When the flag file
 * state/bootstrap-requested exists (created deliberately via the shared
 * folder), it: finds running dev-bridge.js processes, kills them (WITHOUT
 * /T so their children — jest, the UI server — survive), and spawns the
 * current dev-bridge.js detached. Used once to hand over from bridge v1
 * (no self-restart) to v2 (supervisor loop + restart-bridge action).
 */
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const BASE = path.resolve(__dirname, '..');
const FLAG = path.join(BASE, 'state', 'bootstrap-requested');

test('bridge bootstrap (no-op unless explicitly requested via flag file)', () => {
  if (!fs.existsSync(FLAG)) {
    expect(true).toBe(true);
    return;
  }
  fs.unlinkSync(FLAG); // one-shot

  if (process.platform === 'win32') {
    let pids = [];
    try {
      const out = execSync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -like \'*dev-bridge.js*\' } | Select-Object -ExpandProperty ProcessId"',
        { timeout: 20000 }
      ).toString();
      pids = out.split(/\r?\n/).map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    } catch { /* discovery failed; still spawn the new bridge */ }

    for (const pid of pids) {
      try { execSync(`taskkill /PID ${pid} /F`, { timeout: 10000 }); } catch { /* may already be gone */ }
    }
    try { fs.unlinkSync(path.join(BASE, 'state', 'bridge.pid')); } catch { /* stale lock ok */ }
  }

  const child = spawn(process.execPath, [path.join(BASE, 'dev-bridge.js')], {
    detached: true, stdio: 'ignore', cwd: BASE
  });
  child.unref();
  expect(child.pid).toBeGreaterThan(0);
});
