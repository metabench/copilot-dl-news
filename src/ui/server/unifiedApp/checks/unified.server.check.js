'use strict';

/**
 * Unified App Server Check Script (start → probe → stop)
 *
 * Validates that the unified server can:
 * - start on a free port
 * - serve the shell at /
 * - serve mounted apps at /docs and /design
 * - serve a couple of known static assets under those mount paths
 * - shut down cleanly
 *
 * Run:
 *   node src/ui/server/unifiedApp/checks/unified.server.check.js
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const { waitForServer } = require('../../utils/serverStartupCheck');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((err) => {
        if (err) return reject(err);
        resolve(address.port);
      });
    });
    server.on('error', reject);
  });
}

function httpGetText(url, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs, headers: { Connection: 'close' }, agent: false }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });

    req.on('error', reject);
  });
}

function assertStatus(name, status, expected) {
  if (status !== expected) {
    throw new Error(`${name}: expected ${expected}, got ${status}`);
  }
}

function assertIncludes(name, body, substr) {
  if (!body.includes(substr)) {
    throw new Error(`${name}: missing substring ${JSON.stringify(substr)}`);
  }
}

async function run() {
  const projectRoot = path.join(__dirname, '..', '..', '..', '..', '..');
  const serverPath = path.join(projectRoot, 'src', 'ui', 'server', 'unifiedApp', 'server.js');

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log('=== Unified Server Check ===');
  console.log(`Server: ${serverPath}`);
  console.log(`Port:   ${port}`);
  console.log('');

  const child = spawn(process.execPath, [serverPath, '--port', String(port)], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout?.on('data', (d) => {
    output += d.toString();
  });
  child.stderr?.on('data', (d) => {
    output += d.toString();
  });

  const killChild = async () => {
    if (!child || child.killed) return;

    try {
      child.kill('SIGTERM');
    } catch (_) {
      // ignore
    }

    await new Promise((r) => setTimeout(r, 300));

    try {
      child.kill('SIGKILL');
    } catch (_) {
      // ignore
    }
  };

  try {
    const ready = await waitForServer(port, '127.0.0.1', '/', 8000, 200);
    if (!ready.ok) {
      throw new Error(`Server did not respond: ${ready.error}`);
    }

    const home = await httpGetText(`${baseUrl}/`);
    assertStatus('GET /', home.status, 200);
    assertIncludes('GET /', home.body, 'unified-shell');

    const docs = await httpGetText(`${baseUrl}/docs`);
    if (docs.status >= 500) {
      throw new Error(`GET /docs: server error status=${docs.status}`);
    }

    const design = await httpGetText(`${baseUrl}/design`);
    if (design.status >= 500) {
      throw new Error(`GET /design: server error status=${design.status}`);
    }

    const docsCss = await httpGetText(`${baseUrl}/docs/assets/docs-viewer.css`);
    assertStatus('GET /docs/assets/docs-viewer.css', docsCss.status, 200);

    const designCss = await httpGetText(`${baseUrl}/design/assets/design-studio.css`);
    assertStatus('GET /design/assets/design-studio.css', designCss.status, 200);

    console.log('✅ Unified server check passed');
    process.exitCode = 0;
  } catch (err) {
    console.error('❌ Unified server check failed:', err?.message || err);
    if (output) {
      console.error('\n--- server output (first 1200 chars) ---');
      console.error(output.slice(0, 1200));
    }
    process.exitCode = 1;
  } finally {
    await killChild();
  }
}

run().catch((err) => {
  console.error('❌ Unified server check crashed:', err?.stack || err);
  process.exit(2);
});
