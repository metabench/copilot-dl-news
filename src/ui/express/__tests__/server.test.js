const request = require('supertest');
const { EventEmitter } = require('events');
const { createApp } = require('../server');

function makeFakeRunner(lines = [], exitCode = 0, delayMs = 5) {
  return {
    start() {
      const ee = new EventEmitter();
      setTimeout(() => {
        for (const l of lines) {
          ee.stdout.emit('data', Buffer.from(l + '\n'));
        }
        ee.emit('exit', exitCode, null);
      }, delayMs);
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();
      ee.kill = () => ee.emit('exit', null, 'SIGTERM');
      return ee;
    }
  };
}

describe('GUI server API', () => {
  test('status returns not running initially', async () => {
    const app = createApp({ runner: makeFakeRunner() });
    const res = await request(app).get('/api/status');
    expect(res.statusCode).toBe(200);
    expect(res.body.running).toBe(false);
  });

  test('can start a crawl and then stop', async () => {
    const lines = [
      'Starting news crawler',
      'PROGRESS {"visited":1,"downloaded":1,"found":1,"saved":1}',
      'Final stats: 1 pages visited, 1 pages downloaded, 1 articles found, 1 articles saved'
    ];
    const app = createApp({ runner: makeFakeRunner(lines, 0, 100) });

    const start = await request(app).post('/api/crawl').send({ startUrl: 'https://example.com', depth: 0 });
    expect(start.statusCode).toBe(202);

    const status1 = await request(app).get('/api/status');
    expect(status1.body.running).toBe(true);

    const stop = await request(app).post('/api/stop');
    expect([200,202]).toContain(stop.statusCode);
  });

  test('prevents starting a second crawl while running', async () => {
    const app = createApp({ runner: makeFakeRunner(['Hello'], 0, 50) });
    const start1 = await request(app).post('/api/crawl').send({});
    expect(start1.statusCode).toBe(202);
    const start2 = await request(app).post('/api/crawl').send({});
    expect(start2.statusCode).toBe(409);
  });

  test('passes sitemap flags through to crawler args (sitemap-max mirrors maxPages)', async () => {
    const app = createApp({ runner: makeFakeRunner(['ok'], 0, 10) });
    const res = await request(app)
      .post('/api/crawl')
      .send({ startUrl: 'https://example.com', useSitemap: false, sitemapOnly: true, maxPages: 123 });
    expect(res.statusCode).toBe(202);
    const args = res.body.args || [];
    expect(args).toContain('src/crawl.js');
    expect(args).toContain('https://example.com');
    expect(args).toContain('--sitemap-only');
    expect(args).toContain('--sitemap-max=123');
    expect(args).not.toContain('--no-sitemap');
    await request(app).post('/api/stop');
  });

  test('forwards crawlType to crawler CLI', async () => {
    const app = createApp({ runner: makeFakeRunner(['ok'], 0, 10) });
    const res = await request(app)
      .post('/api/crawl')
      .send({ startUrl: 'https://example.com', crawlType: 'intelligent' });
    expect(res.statusCode).toBe(202);
    const args = res.body.args || [];
    expect(args).toContain('--crawl-type=intelligent');
    expect(args.some((a) => a.startsWith('--mode'))).toBe(false);
    await request(app).post('/api/stop');
  });
});
