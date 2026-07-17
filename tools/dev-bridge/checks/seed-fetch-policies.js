'use strict';
// Seed domain_fetch_policies with everything this project has LEARNED THE
// HARD WAY about bot protections (sources: FetchPipeline static TLS list,
// LOOP_STATE findings 2026-07-14..17, live crawl evidence).
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const { upsertDomainFetchPolicy, listDomainFetchPolicies } = require(
  require.resolve('news-crawler-db', { paths: [REPO_ROOT] })
);
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { timeout: 10000 });

const SEEDS = [
  {
    host: 'theguardian.com', protectionKind: 'tls-fingerprint', fetchStrategy: 'puppeteer', confidence: 0.95,
    evidence: [{ code: 'ECONNRESET', context: 'node-fetch first contact', jobs: ['0ff6f86d', '561d682e'], note: 'puppeteer fallback verified: 200-page crawl 0 errors 2026-07-16' }],
    notes: 'JA3/JA4 TLS fingerprinting; direct HTTP works from real browsers only.'
  },
  {
    host: 'bloomberg.com', protectionKind: 'tls-fingerprint', fetchStrategy: 'puppeteer', confidence: 0.8,
    evidence: [{ note: 'FetchPipeline static fallback list member since 2025-12-25 (config comment)' }],
    notes: 'Static TLS-fingerprint list member; also hard paywall — expect thin content.'
  },
  {
    host: 'wsj.com', protectionKind: 'tls-fingerprint', fetchStrategy: 'puppeteer', confidence: 0.8,
    evidence: [{ note: 'FetchPipeline static fallback list member since 2025-12-25' }],
    notes: 'TLS fingerprinting + hard paywall.'
  },
  {
    host: 'lemonde.fr', protectionKind: 'http-402', fetchStrategy: 'puppeteer', confidence: 0.7,
    evidence: [{ httpStatus: 402, context: 'every direct fetch', jobs: ['143fc616', 'ce78bfd3', '82cbcaf9'], date: '2026-07-15/16' }],
    notes: 'Answers 402 Payment Required to non-browser clients (Datadome-class). Puppeteer strategy is a TRIAL — verify before trusting.',
    recheckAfter: '2026-08-16T00:00:00Z'
  },
  {
    host: 'reuters.com', protectionKind: 'bot-block', fetchStrategy: 'puppeteer', confidence: 0.5,
    evidence: [{ note: 'start URL silently policy-blocked: crawl completed 0 pages 0 errors (2026-07-15); junk Andorra mapping suggests earlier partial access' }],
    notes: 'Suspected Datadome. Puppeteer strategy is a guess; consider remote-worker if it fails.',
    recheckAfter: '2026-08-01T00:00:00Z'
  }
];

for (const seed of SEEDS) {
  const r = upsertDomainFetchPolicy(db, { ...seed, provenance: 'static-seed:2026-07-17' });
  console.log(`[seed] ${seed.host}: ${seed.fetchStrategy} (${seed.protectionKind}) changes=${r.changes}`);
}
console.log('[policies]', JSON.stringify(listDomainFetchPolicies(db, {}).map((p) => `${p.host}:${p.fetch_strategy}`)));
db.close();
