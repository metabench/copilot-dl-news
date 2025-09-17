const http = require('http');
const { startServer } = require('../server');

function getText(hostname, port, path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname, port, path }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: buf }));
    }).on('error', reject);
  });
}

describe('UI smoke over real HTTP', () => {
  let server;
  let port;
  beforeAll(async () => {
    const prev = process.env.PORT;
    process.env.PORT = '0';
    server = startServer();
    // wait a tick for address
    await new Promise((r) => setTimeout(r, 100));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : prev || 3000;
  });
  afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  test('serves index and basic pages', async () => {
    const root = await getText('127.0.0.1', port, '/');
    expect(root.status).toBe(200);
    expect(root.text).toMatch(/<html/i);

    const index = await getText('127.0.0.1', port, '/index.html');
    expect(index.status).toBe(200);
    expect(index.text).toMatch(/Use sitemap|Start crawl/i);

    const domain = await getText('127.0.0.1', port, '/domain');
    expect(domain.status).toBe(200);
    expect(domain.text).toMatch(/Domain Summary|Recent Articles/i);

    const url = await getText('127.0.0.1', port, '/url');
    expect(url.status).toBe(200);
    expect(url.text).toMatch(/URL Details|Fetches/i);
  });

  test('SSE emits seed message', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/events' }, (r) => {
        let buf = '';
        r.setEncoding('utf8');
        const timeout = setTimeout(() => {
          try { r.destroy(); } catch (_) {}
          resolve({ status: r.statusCode, text: buf });
        }, 1000);
        r.on('data', (d) => { buf += d; });
        r.on('end', () => { clearTimeout(timeout); resolve({ status: r.statusCode, text: buf }); });
      });
      req.on('error', reject);
    });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/event: log/);
    expect(res.text).toMatch(/\[sse\] log stream enabled/);
  });
});
