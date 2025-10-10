const http = require('http');
const { startServer } = require('../server');

describe('UI rate-limited badge presence', () => {
  let server;
  let port;
  beforeAll(async () => {
    const prev = process.env.PORT;
    process.env.PORT = '0';
    server = await startServer();
    await new Promise((r) => setTimeout(r, 100));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : prev || 3000;
  });
  afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  function getText(path) {
    return new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path }, (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (d) => buf += d);
        res.on('end', () => resolve({ status: res.statusCode, text: buf }));
      }).on('error', reject);
    });
  }

  test('index.html includes RATE LIMITED badge element', async () => {
    const res = await getText('/');
    expect(res.status).toBe(200);
    // Badge exists in markup; visibility is controlled by style/display
    expect(res.text).toMatch(/id="m_domrl"/);
    expect(res.text).toMatch(/RATE LIMITED/);
  });
});
