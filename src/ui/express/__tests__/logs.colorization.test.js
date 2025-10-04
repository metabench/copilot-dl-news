const http = require('http');
const { startServer } = require('../server');

describe('logs colorization CSS', () => {
  let server;
  let port;
  beforeAll(async () => {
    const prev = process.env.PORT;
    process.env.PORT = '0';
    server = startServer();
    await new Promise((r) => setTimeout(r, 100));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : prev || 3000;
  });
  afterAll(async () => { if (server) await new Promise((r) => server.close(r)); });

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

  test('dashboard links stylesheet and defines .log-error with red color', async () => {
    const res = await getText('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<link[^>]+href="\/crawler\.css"/i);

    const cssRes = await getText('/crawler.css');
    expect(cssRes.status).toBe(200);
    // Ensure the style rule exists and specifies our red color in the bundled stylesheet
  expect(cssRes.text).toMatch(/\.log-error\s*\{[^}]*color:\s*#ff6b6b/i);
  });
});
