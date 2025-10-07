const http = require('http');
const { startServer } = require('../server');

describe('logs colorization CSS', () => {
  let server;
  let port;
  
  beforeAll(async () => {
    const prev = process.env.PORT;
    process.env.PORT = '0';
    server = startServer();
    
    // Wait for server to be listening with timeout
    await Promise.race([
      new Promise((resolve) => {
        if (server.listening) {
          resolve();
        } else {
          server.once('listening', resolve);
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Server start timeout')), 5000))
    ]);
    
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : prev || 3000;
  }, 10000); // 10 second timeout for beforeAll
  
  afterAll(async () => { 
    if (server) {
      await Promise.race([
        new Promise((r) => server.close(r)),
        new Promise((r) => setTimeout(r, 2000)) // 2 second timeout for close
      ]);
    }
  });

  function getText(path) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout for ${path}`));
      }, 3000);
      
      http.get({ hostname: '127.0.0.1', port, path }, (res) => {
        clearTimeout(timeout);
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (d) => buf += d);
        res.on('end', () => resolve({ status: res.statusCode, text: buf }));
      }).on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  test('dashboard links stylesheet and defines .log-error with red color', async () => {
    const res = await getText('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<link[^>]+href="\/crawler\.css"/i);

    const cssRes = await getText('/crawler.css');
    expect(cssRes.status).toBe(200);
    // Ensure the style rule exists and specifies our red color in the bundled stylesheet
    // The actual color is #dc322f (solarized red), not #ff6b6b
    expect(cssRes.text).toMatch(/\.log-error\s*\{[^}]*color:\s*#dc322f/i);
  }, 10000); // 10 second timeout for test
});
