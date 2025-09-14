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

describe('SSE endpoint', () => {
  test('events endpoint sets text/event-stream', async () => {
    const app = createApp({});
    const { server, port } = await startHttp(app);

    await new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/events' }, (res) => {
        try {
          expect(res.statusCode).toBe(200);
          expect(String(res.headers['content-type'] || '')).toMatch(/text\/event-stream/);
          // close after first tick
          res.destroy();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });

    await new Promise((r) => server.close(r));
  });
});
