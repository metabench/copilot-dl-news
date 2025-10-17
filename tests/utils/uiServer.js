const { spawn } = require('child_process');
const path = require('path');

async function startServerWithEnv(env = {}) {
  return new Promise((resolve, reject) => {
    const node = process.execPath;
    const repoRoot = path.join(__dirname, '..', '..');
    const envAll = { ...process.env, ...env, PORT: '0' };
    const cp = spawn(node, ['server.js'], { cwd: repoRoot, env: envAll, stdio: ['ignore', 'pipe', 'pipe'] });

    const onData = (data) => {
      const s = data.toString();
      // Look for server message with port
      const m = s.match(/listening on (http:\/\/localhost:\d+)|GUI server listening on http:\/\/localhost:(\d+)/i);
      if (m) {
        const port = m[2] || (m[1] ? m[1].split(':').pop() : null);
        if (port) {
          cp.stdout.off('data', onData);
          resolve({ cp, port: parseInt(port, 10) });
        }
      }
    };

    cp.stdout.on('data', onData);
    cp.stderr.on('data', (d) => { /* ignore */ });
    cp.once('exit', (code) => reject(new Error(`server exited early: code=${code}`)));
  });
}

module.exports = { startServerWithEnv };
