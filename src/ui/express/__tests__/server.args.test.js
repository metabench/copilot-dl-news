const { createApp } = require('../server');
const request = require('supertest');

describe('server buildArgs mapping', () => {
  test('maps refetchIfOlderThan, concurrency, sitemap toggles', async () => {
    const started = [];
    const fakeRunner = {
      start(args) {
        started.push(args);
        return { pid: 1234, stdout: { on(){} }, stderr: { on(){} }, on(){} };
      }
    };
  const app = createApp({ runner: fakeRunner });
  const body = {
      startUrl: 'https://example.com',
      depth: 1,
      maxPages: 5,
      refetchIfOlderThan: '0',
      concurrency: 3,
      maxQueue: 5000,
      useSitemap: false,
      sitemapOnly: true,
  // sitemapMaxUrls removed; we expect sitemap-max to mirror maxPages
      slow: false,
      
      preferCache: true
  };
  const res = await request(app).post('/api/crawl').send(body).set('Content-Type', 'application/json');
  expect(res.status).toBe(202);
    const args = started[0];
    expect(args).toEqual(expect.arrayContaining([
      'src/crawl.js',
      'https://example.com',
      '--depth=1',
      '--max-pages=5',
      '--refetch-if-older-than=0',
      '--concurrency=3',
      '--max-queue=5000',
      '--sitemap-only',
  '--sitemap-max=5',
      
    ]));
    // With sitemapOnly=true, we should not pass --no-sitemap
    expect(args).not.toContain('--no-sitemap');
  });

  test('allows query URLs when explicitly requested', async () => {
    const started = [];
    const fakeRunner = {
      start(args) {
        started.push(args);
        return { pid: 4321, stdout: { on(){} }, stderr: { on(){} }, on(){} };
      }
    };
    const app = createApp({ runner: fakeRunner });
    const body = {
      startUrl: 'https://example.com',
      allowQueryUrls: true
    };
    const res = await request(app).post('/api/crawl').send(body).set('Content-Type', 'application/json');
    expect(res.status).toBe(202);
    const args = started[0];
    expect(args).toEqual(expect.arrayContaining([
      '--allow-query-urls'
    ]));
  });

  test('maps intelligent crawl type to planner-friendly flags', async () => {
    const started = [];
    const fakeRunner = {
      start(args) {
        started.push(args);
        return { pid: 2468, stdout: { on(){} }, stderr: { on(){} }, on(){} };
      }
    };
    const app = createApp({ runner: fakeRunner });
    const body = {
      startUrl: 'https://example.com',
      crawlType: 'intelligent'
    };
    const res = await request(app).post('/api/crawl').send(body).set('Content-Type', 'application/json');
    expect(res.status).toBe(202);
    const args = started[0];
    expect(args).toEqual(expect.arrayContaining([
      '--crawl-type=intelligent'
    ]));
    expect(args).not.toContain('--no-sitemap');
    expect(args).not.toContain('--sitemap-only');
  });
});
