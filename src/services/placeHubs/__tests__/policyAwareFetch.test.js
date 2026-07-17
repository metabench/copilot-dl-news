'use strict';

const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const ncdb = require('news-crawler-db');

// Mock PuppeteerFetcher so no real browser launches in the test.
const mockPuppeteerFetch = jest.fn();
jest.mock('../../../core/crawler/PuppeteerFetcher', () => ({
  PuppeteerFetcher: class {
    constructor() {}
    async fetch(url, opts) { return mockPuppeteerFetch(url, opts); }
    async close() {}
  }
}));

const { createPolicyAwareFetchFn } = require('../policyAwareFetch');

/**
 * policy-aware fetch routes by domain_fetch_policies (news.db bot-protection
 * model) and feeds blocked outcomes back as evidence. Verifies the strategy
 * routing (direct / puppeteer / skip) and the evidence loop.
 */

function makeDb() {
  const db = new Database(':memory:');
  ncdb.ensureDomainFetchPoliciesSchema(db);
  return db;
}

describe('createPolicyAwareFetchFn', () => {
  afterEach(() => mockPuppeteerFetch.mockReset());

  it('passes through to base fetch for hosts with no policy', async () => {
    const db = makeDb();
    const base = jest.fn(async () => ({ ok: true, status: 200, url: 'https://x.example/a', headers: { get: () => null }, text: async () => 'hi' }));
    const fetchFn = createPolicyAwareFetchFn({ db, baseFetchFn: base, logger: { warn: () => {} } });
    const res = await fetchFn('https://x.example/a', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(1);
    db.close();
  });

  it('routes puppeteer-strategy hosts through PuppeteerFetcher on GET', async () => {
    const db = makeDb();
    ncdb.upsertDomainFetchPolicy(db, { host: 'theguardian.com', protectionKind: 'tls-fingerprint', fetchStrategy: 'puppeteer' });
    mockPuppeteerFetch.mockResolvedValue({ success: true, httpStatus: 200, html: '<html>guardian</html>', finalUrl: 'https://www.theguardian.com/world/france' });
    const base = jest.fn();
    const fetchFn = createPolicyAwareFetchFn({ db, baseFetchFn: base, logger: { warn: () => {} } });
    const res = await fetchFn('https://www.theguardian.com/world/france', { method: 'GET' });
    expect(base).not.toHaveBeenCalled();
    expect(mockPuppeteerFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('guardian');
    db.close();
  });

  it('answers HEAD for puppeteer hosts synthetically (no browser)', async () => {
    const db = makeDb();
    ncdb.upsertDomainFetchPolicy(db, { host: 'theguardian.com', fetchStrategy: 'puppeteer' });
    const fetchFn = createPolicyAwareFetchFn({ db, baseFetchFn: jest.fn(), logger: { warn: () => {} } });
    const res = await fetchFn('https://www.theguardian.com/world/x', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(mockPuppeteerFetch).not.toHaveBeenCalled();
    db.close();
  });

  it('skip-strategy hosts get a synthetic 403 without touching the network', async () => {
    const db = makeDb();
    ncdb.upsertDomainFetchPolicy(db, { host: 'blocked.example', fetchStrategy: 'skip' });
    const base = jest.fn();
    const fetchFn = createPolicyAwareFetchFn({ db, baseFetchFn: base, logger: { warn: () => {} } });
    const res = await fetchFn('https://blocked.example/world/x', { method: 'GET' });
    expect(res.status).toBe(403);
    expect(base).not.toHaveBeenCalled();
    db.close();
  });

  it('feeds a direct 403 back into the policy evidence', async () => {
    const db = makeDb();
    const base = jest.fn(async () => ({ ok: false, status: 403, url: 'https://y.example/a', headers: { get: () => null }, text: async () => '' }));
    const fetchFn = createPolicyAwareFetchFn({ db, baseFetchFn: base, logger: { warn: () => {} } });
    await fetchFn('https://y.example/a', { method: 'GET' });
    const policy = ncdb.getDomainFetchPolicy(db, 'y.example');
    expect(policy).toBeTruthy();
    expect(JSON.parse(policy.evidence)[0].httpStatus).toBe(403);
    db.close();
  });

  it('records ECONNRESET evidence and rethrows', async () => {
    const db = makeDb();
    const base = jest.fn(async () => { throw new Error('read ECONNRESET'); });
    const fetchFn = createPolicyAwareFetchFn({ db, baseFetchFn: base, logger: { warn: () => {} } });
    await expect(fetchFn('https://z.example/a', { method: 'GET' })).rejects.toThrow(/ECONNRESET/);
    const policy = ncdb.getDomainFetchPolicy(db, 'z.example');
    expect(policy).toBeTruthy();
    expect(JSON.parse(policy.evidence)[0].error).toMatch(/ECONNRESET/);
    db.close();
  });

  it('records puppeteer 403 as evidence too', async () => {
    const db = makeDb();
    ncdb.upsertDomainFetchPolicy(db, { host: 'reuters.com', fetchStrategy: 'puppeteer' });
    mockPuppeteerFetch.mockResolvedValue({ success: false, httpStatus: 403, html: '', finalUrl: 'https://www.reuters.com/world/' });
    const fetchFn = createPolicyAwareFetchFn({ db, baseFetchFn: jest.fn(), logger: { warn: () => {} } });
    const res = await fetchFn('https://www.reuters.com/world/', { method: 'GET' });
    expect(res.status).toBe(403);
    const policy = ncdb.getDomainFetchPolicy(db, 'reuters.com');
    const ev = JSON.parse(policy.evidence);
    expect(ev.some((e) => e.httpStatus === 403 && e.via === 'puppeteer')).toBe(true);
    db.close();
  });
});
