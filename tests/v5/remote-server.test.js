'use strict';

const request = require('supertest');

const { createBootstrapRuntime, loadDomainConfigs, normalizeDomainConfigs } = require('../../src/v5/remote/runtime');
const { createApp, parseCliArgs } = require('../../src/v5/remote/server');

describe('v5 remote bootstrap runtime', () => {
  test('normalizes domains from strings and objects', () => {
    const normalized = normalizeDomainConfigs(
      ['bbc.com', { domain: 'reuters.com', maxPages: 12 }, { host: 'bbc.com', maxPages: 4 }],
      50
    );

    expect(normalized).toEqual([
      { domain: 'bbc.com', maxPages: 50, seedUrls: [] },
      { domain: 'reuters.com', maxPages: 12, seedUrls: [] },
    ]);
  });

  test('loadDomainConfigs parses comma-separated domains', () => {
    const configs = loadDomainConfigs({ domains: 'bbc.com, reuters.com', maxPagesDefault: 25 });
    expect(configs).toEqual([
      { domain: 'bbc.com', maxPages: 25, seedUrls: [] },
      { domain: 'reuters.com', maxPages: 25, seedUrls: [] },
    ]);
  });

  test('start respects maxConcurrent and stop updates state', () => {
    const runtime = createBootstrapRuntime({
      domainConfigs: ['bbc.com', 'reuters.com', 'apnews.com'],
      maxConcurrent: 2,
      now: (() => {
        let tick = 0;
        return () => new Date(1_700_000_000_000 + tick++ * 1000);
      })(),
    });

    const started = runtime.start();
    expect(started.results).toEqual([
      { domain: 'bbc.com', status: 'started', maxPages: 50 },
      { domain: 'reuters.com', status: 'started', maxPages: 50 },
      { domain: 'apnews.com', status: 'deferred', reason: 'max_concurrent' },
    ]);

    const stopped = runtime.stop({ domain: 'bbc.com' });
    expect(stopped.results).toEqual([{ domain: 'bbc.com', status: 'stopped' }]);
    expect(runtime.getDomainStatus('bbc.com').state).toBe('stopped');
  });
});

describe('v5 remote bootstrap app', () => {
  function createTestApp() {
    const runtime = createBootstrapRuntime({
      domainConfigs: [
        { domain: 'bbc.com', maxPages: 50 },
        { domain: 'reuters.com', maxPages: 30 },
      ],
      maxConcurrent: 1,
      suggestionProvider: {
        async getSuggestions({ domain, kind }) {
          return {
            domain,
            kind,
            status: 'ok',
            suggestions: [
              {
                id: `${domain}:${kind}:0`,
                url: `https://${domain}/world`,
                confidence: 0.82,
                state: 'candidate',
              },
            ],
          };
        },
      },
    });

    return createApp({ runtime });
  }

  test('health endpoint returns v5 bootstrap metadata', async () => {
    const app = createTestApp();
    const response = await request(app).get('/api/v5/health');

    expect(response.statusCode).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe('remote-crawler-v5');
    expect(response.body.domains).toBe(2);
  });

  test('lists domains and per-domain state', async () => {
    const app = createTestApp();

    const listResponse = await request(app).get('/api/v5/domains');
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body.domains).toHaveLength(2);

    const domainResponse = await request(app).get('/api/v5/domains/bbc.com');
    expect(domainResponse.statusCode).toBe(200);
    expect(domainResponse.body.domain).toBe('bbc.com');
    expect(domainResponse.body.state).toBe('idle');
  });

  test('start and stop routes update runtime state', async () => {
    const app = createTestApp();

    const startResponse = await request(app)
      .post('/api/v5/crawl/start')
      .send({ domains: ['bbc.com', 'reuters.com'] });

    expect(startResponse.statusCode).toBe(200);
    expect(startResponse.body.results).toEqual([
      { domain: 'bbc.com', status: 'started', maxPages: 50 },
      { domain: 'reuters.com', status: 'deferred', reason: 'max_concurrent' },
    ]);

    const stopResponse = await request(app)
      .post('/api/v5/crawl/stop')
      .send({ domain: 'bbc.com' });

    expect(stopResponse.statusCode).toBe(200);
    expect(stopResponse.body.results).toEqual([{ domain: 'bbc.com', status: 'stopped' }]);
  });

  test('hub suggestion endpoint returns provider-backed suggestions', async () => {
    const app = createTestApp();

    const response = await request(app).get('/api/v5/hub-suggestions?domain=bbc.com&kind=place');
    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.suggestions[0].state).toBe('candidate');
  });

  test('hub suggestion endpoint validates missing and unknown domains', async () => {
    const app = createTestApp();

    const missing = await request(app).get('/api/v5/hub-suggestions');
    expect(missing.statusCode).toBe(400);

    const unknown = await request(app).get('/api/v5/hub-suggestions?domain=apnews.com');
    expect(unknown.statusCode).toBe(404);
  });
});

describe('v5 remote bootstrap cli parsing', () => {
  test('parseCliArgs supports inline and spaced args', () => {
    expect(parseCliArgs(['--domains=bbc.com,reuters.com', '--port', '3410', '--help'])).toEqual({
      domains: 'bbc.com,reuters.com',
      port: '3410',
      help: true,
    });
  });
});
