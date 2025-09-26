const http = require('http');
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
  test('static and SSR pages include Queues link to /queues/ssr', async () => {
    const app = createApp({});
    const { server, port } = await startHttp(app);
    try {
      const paths = ['/', '/domains', '/errors', '/urls', '/gazetteer', '/queues/ssr'];
      for (const p of paths) {
        const res = await get('127.0.0.1', port, p);
        expect(res.status).toBe(200);
        expect(res.text).toContain('/queues/ssr');
      }
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
