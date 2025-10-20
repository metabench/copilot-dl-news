const http = require('http');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../server');

function startHttp(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function get(hostname, port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname, port, path }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (buf += d));
      res.on('end', () => resolve({ status: res.statusCode, text: buf, headers: res.headers }));
    });
    req.on('error', reject);
  });
}

describe('Unified top navigation', () => {
  const tmpDb = path.join(__dirname, 'tmp_nav.db');

  beforeEach(() => {
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    process.env.DB_PATH = tmpDb;
  });

  afterEach(async () => {
    try { delete process.env.DB_PATH; } catch (_) {}
    try { fs.unlinkSync(tmpDb); } catch (_) {}
  });

  test('static and SSR pages expose global nav placeholder and enhancer script', async () => {
    const app = createApp({});
    const { server, port } = await startHttp(app);
    try {
  const paths = ['/'];
      for (const p of paths) {
        const res = await get('127.0.0.1', port, p);
        expect(res.status).toBe(200);
        expect(res.text).toMatch(/data-global-nav/i);
        expect(res.text).toMatch(/global-nav\.js/i);
      }
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
