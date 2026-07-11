'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const {
  buildFixturePlan,
  parseArgs,
  startFixtureServers,
} = require('../../../tools/crawl/lib/local-fixture-server');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}

function getText(url, requestHeaders = undefined) {
  return new Promise((resolve, reject) => {
    http.get(url, requestHeaders ? { headers: requestHeaders } : {}, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

describe('local fixture server helper', () => {
  test('builds no-contact small and medium fixture plans', () => {
    const small = buildFixturePlan({ preset: 'small', port: 41901 });
    expect(small).toMatchObject({
      mode: 'local-crawl-fixture-plan',
      preset: 'small',
      crawlClass: 'small-local',
      hosts: ['127.0.0.1'],
      actionPolicy: {
        contactsInternetTargets: false,
        contactsRemoteCrawler: false,
        mutatesRemoteQueue: false,
      },
    });
    expect(small.urls).toEqual(['http://127.0.0.1:41901/news/fixture-article.html']);
    expect(small.commands.start.display).toContain('tools/crawl/local-fixture-server.js --preset small --port 41901');

    const medium = buildFixturePlan({ preset: 'medium', port: 41902 });
    expect(medium.crawlClass).toBe('medium-local');
    expect(medium.hosts).toEqual(['127.0.0.1', '127.0.0.2', '127.0.0.3']);
    expect(medium.urls).toHaveLength(3);

    const tokenized = buildFixturePlan({ preset: 'small', port: 41903, targetToken: 'proof-001' });
    expect(tokenized.targetToken).toBe('proof-001');
    expect(tokenized.urls).toEqual(['http://127.0.0.1:41903/news/fixture-article-proof-001.html']);
    expect(tokenized.commands.start.display).toContain('--target-token proof-001');
  });

  test('parseArgs normalizes aliases and bounds ports', () => {
    expect(parseArgs(['--preset', 'medium', '--port', '41902', '--plan', '--json'])).toMatchObject({
      preset: 'medium',
      port: 41902,
      plan: true,
      json: true,
    });
    expect(() => parseArgs(['--port', '80'])).toThrow('fixture port must be between');
    expect(() => parseArgs(['--target-token', 'bad/token'])).toThrow('fixture target token');
  });

  test('serves deterministic article and readiness artifacts on loopback', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-fixture-'));
    const reserved = await reservePort();
    const port = reserved.port;
    await reserved.close();
    const readyFile = path.join(tmp, 'ready.json');
    const pidFile = path.join(tmp, 'server.pid');
    const plan = buildFixturePlan({ preset: 'small', port, readyFile, pidFile });
    const runtime = await startFixtureServers(plan);
    try {
      const article = await getText(plan.urls[0]);
      expect(article.statusCode).toBe(200);
      expect(article.body).toContain('Small Fixture Article on 127.0.0.1');
      expect(article.body).toContain('article-like markup');

      const robots = await getText(`http://127.0.0.1:${port}/robots.txt`);
      expect(robots.statusCode).toBe(200);
      expect(robots.body).toContain('Allow: /');

      const ready = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
      expect(ready).toMatchObject({
        mode: 'local-crawl-fixture-ready',
        preset: 'small',
        port,
      });
      expect(fs.readFileSync(pidFile, 'utf8').trim()).toBe(String(process.pid));
    } finally {
      await runtime.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('emits deterministic validators and answers conditional GETs with 304', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-fixture-304-'));
    const reserved = await reservePort();
    const port = reserved.port;
    await reserved.close();
    const plan = buildFixturePlan({
      preset: 'small',
      port,
      readyFile: path.join(tmp, 'ready.json'),
      pidFile: path.join(tmp, 'server.pid'),
    });
    const runtime = await startFixtureServers(plan);
    try {
      const first = await getText(plan.urls[0]);
      expect(first.statusCode).toBe(200);
      expect(first.headers.etag).toMatch(/^"fx-small-/);
      expect(first.headers['last-modified']).toBe('Fri, 29 May 2026 12:00:00 GMT');

      const revalidated = await getText(plan.urls[0], { 'If-None-Match': first.headers.etag });
      expect(revalidated.statusCode).toBe(304);
      expect(revalidated.body).toBe('');
      expect(revalidated.headers.etag).toBe(first.headers.etag);

      const staleEtag = await getText(plan.urls[0], { 'If-None-Match': '"fx-other"' });
      expect(staleEtag.statusCode).toBe(200);

      const modifiedSince = await getText(plan.urls[0], { 'If-Modified-Since': 'Sat, 30 May 2026 00:00:00 GMT' });
      expect(modifiedSince.statusCode).toBe(304);
    } finally {
      await runtime.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('writes a request ledger (ground truth for fetch-visibility diffs)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'local-fixture-ledger-'));
    const reserved = await reservePort();
    const port = reserved.port;
    await reserved.close();
    const requestLog = path.join(tmp, 'requests.jsonl');
    const plan = buildFixturePlan({
      preset: 'small',
      port,
      readyFile: path.join(tmp, 'ready.json'),
      pidFile: path.join(tmp, 'server.pid'),
      requestLog,
    });
    const runtime = await startFixtureServers(plan);
    try {
      const first = await getText(plan.urls[0]);
      await getText(`http://127.0.0.1:${port}/robots.txt`);
      await getText(plan.urls[0], { 'If-None-Match': first.headers.etag });

      const lines = fs.readFileSync(requestLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatchObject({ path: plan.targets[0].path, status: 200, conditional: false });
      expect(lines[1]).toMatchObject({ path: '/robots.txt', status: 200 });
      expect(lines[2]).toMatchObject({ path: plan.targets[0].path, status: 304, conditional: true });
    } finally {
      await runtime.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('fails clearly when the fixture port is already in use', async () => {
    const reserved = await reservePort();
    const plan = buildFixturePlan({ preset: 'small', port: reserved.port });
    try {
      await expect(startFixtureServers(plan)).rejects.toThrow(/EADDRINUSE|listen/i);
    } finally {
      await reserved.close();
    }
  });
});
