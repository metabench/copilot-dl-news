'use strict';

const path = require('path');
const express = require('express');
const request = require('supertest');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const { ensureSqlitePlaceHubUrlPatternsSchema } = require('news-crawler-db');
const { registerPlaceHubReviewRoutes } = require('../registerPlaceHubReviewRoutes');

/**
 * The AI review loop, end to end against an in-memory news.db subset:
 * review-queue surfaces uncertain items → overrides settle them with
 * provenance → heuristics update the DB-resident rule base → audit rows
 * record every mutation. Anonymous writes are refused.
 */

function makeDb() {
  const db = new Database(':memory:');
  ensureSqlitePlaceHubUrlPatternsSchema(db);
  db.exec(`
    CREATE TABLE non_geo_topic_slugs (slug TEXT PRIMARY KEY, label TEXT, lang TEXT, source TEXT);
    CREATE TABLE place_hub_unknown_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT, term_slug TEXT, term_label TEXT, source TEXT, reason TEXT,
      confidence REAL, evidence TEXT, occurrences INTEGER DEFAULT 1,
      first_seen_at TEXT, last_seen_at TEXT, url_id INTEGER
    );
    CREATE TABLE place_hub_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT, candidate_url TEXT, place_kind TEXT, place_name TEXT,
      score REAL, confidence REAL, status TEXT, validation_status TEXT,
      last_seen_at TEXT
    );
    CREATE TABLE hub_validations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL, hub_url TEXT NOT NULL, hub_type TEXT NOT NULL,
      validation_status TEXT NOT NULL, classification_confidence REAL,
      last_fetch_status INTEGER, content_indicators TEXT, validation_method TEXT,
      validated_at TEXT NOT NULL, expires_at TEXT, revalidation_priority INTEGER DEFAULT 0,
      metadata TEXT, hub_url_id INTEGER
    );
    CREATE TABLE place_hub_determinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL, determination TEXT NOT NULL, reason TEXT,
      details_json TEXT, created_at TEXT
    );
    CREATE TABLE place_hub_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT, url TEXT, place_kind TEXT, place_name TEXT,
      decision TEXT, validation_metrics_json TEXT, run_id TEXT, created_at TEXT
    );
    CREATE TABLE place_page_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL, host TEXT, url TEXT, page_kind TEXT, status TEXT,
      first_seen_at TEXT, last_seen_at TEXT, verified_at TEXT, evidence TEXT, hub_id INTEGER,
      max_page_depth INTEGER, oldest_content_date TEXT, last_depth_check_at TEXT, depth_check_error TEXT
    );
    CREATE TABLE place_hubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT, place_slug TEXT, place_kind TEXT, title TEXT, url_id INTEGER
    );
    CREATE TABLE urls (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT);
    CREATE TABLE http_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, url_id INTEGER, http_status INTEGER, fetched_at TEXT);
    CREATE TABLE place_names (id INTEGER PRIMARY KEY AUTOINCREMENT, place_id INTEGER, name TEXT, normalized TEXT);
  `);
  return db;
}

function makeApp(db) {
  const app = express();
  app.use(express.json());
  registerPlaceHubReviewRoutes(app, { db, logger: { warn: () => {} } });
  return app;
}

describe('place-hub review API', () => {
  let db, app;

  beforeEach(() => {
    db = makeDb();
    db.prepare(`INSERT INTO place_hub_unknown_terms (host, term_slug, occurrences, last_seen_at)
                VALUES ('theguardian.com', 'climate-crisis', 60, '2026-07-15')`).run();
    db.prepare(`INSERT INTO place_hub_candidates (domain, candidate_url, place_kind, place_name, score, status, validation_status, last_seen_at)
                VALUES ('bbc.com', 'https://www.bbc.com/news/world/europe', 'region', 'Europe', 0.8, 'fetched-ok', NULL, '2026-07-15')`).run();
    app = makeApp(db);
  });
  afterEach(() => db.close());

  it('review-queue surfaces unknown terms and unverified candidates', async () => {
    const res = await request(app).get('/api/v1/place-hubs/review-queue');
    expect(res.status).toBe(200);
    const kinds = res.body.items.map((i) => i.kind);
    expect(kinds).toContain('unknown-term');
    expect(kinds).toContain('unverified-candidate');
    const term = res.body.items.find((i) => i.kind === 'unknown-term');
    expect(term.key).toBe('climate-crisis');
    expect(term.evidence.occurrences).toBe(60);
  });

  it('refuses mutations without agent + reason', async () => {
    const res = await request(app)
      .post('/api/v1/place-hubs/overrides')
      .send({ action: 'mark-non-geo', slug: 'climate-crisis' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/agent and reason/);
  });

  it('mark-non-geo settles the term, clears the queue, and audits', async () => {
    const res = await request(app).post('/api/v1/place-hubs/overrides').send({
      action: 'mark-non-geo', slug: 'climate-crisis',
      agent: 'claude-fable-5', reason: 'topic section, not a geographic place'
    });
    expect(res.status).toBe(200);
    expect(res.body.clearedUnknownTerms).toBe(1);
    expect(db.prepare("SELECT source FROM non_geo_topic_slugs WHERE slug='climate-crisis'").get().source)
      .toBe('ai-review:claude-fable-5');
    const queue = await request(app).get('/api/v1/place-hubs/review-queue?kinds=unknown-term');
    expect(queue.body.items).toHaveLength(0);
    const auditRow = db.prepare("SELECT * FROM place_hub_audit WHERE decision='ai:mark-non-geo'").get();
    expect(auditRow).toBeTruthy();
    expect(auditRow.validation_metrics_json).toContain('claude-fable-5');
  });

  it('confirm-place-hub writes the validation ledger, candidate verdict, mapping, and audit', async () => {
    const res = await request(app).post('/api/v1/place-hubs/overrides').send({
      action: 'confirm-place-hub',
      url: 'https://www.bbc.com/news/world/europe',
      host: 'bbc.com',
      placeId: 42, placeKind: 'region',
      agent: 'claude-fable-5', reason: 'verified against cached content: 60 article links to European stories'
    });
    expect(res.status).toBe(200);
    const hv = db.prepare("SELECT * FROM hub_validations WHERE hub_url = 'https://www.bbc.com/news/world/europe'").get();
    expect(hv.validation_status).toBe('valid');
    expect(hv.validation_method).toBe('ai-review');
    expect(db.prepare("SELECT validation_status FROM place_hub_candidates WHERE candidate_url LIKE '%europe'").get().validation_status).toBe('valid');
    expect(db.prepare('SELECT status FROM place_page_mappings WHERE place_id = 42').get().status).toBe('verified');
    // Verdict now visible through place search
    const search = await request(app).get('/api/v1/place-hubs/search?placeId=42');
    expect(search.body.count).toBe(1);
    expect(search.body.hubs[0].validationStatus).toBe('valid');
  });

  it('heuristics/patterns upserts an AI rule and the classifier uses it immediately', async () => {
    const res = await request(app).post('/api/v1/place-hubs/heuristics/patterns').send({
      op: 'upsert', domain: 'lemonde.fr',
      patternType: 'ai:path-afrique', patternRegex: '\\/afrique\\/[a-z0-9-]+\\/?$',
      placeKind: 'country', accuracy: 0.8,
      agent: 'claude-fable-5', reason: 'Le Monde uses /afrique/{country} for African country hubs'
    });
    expect(res.status).toBe(200);
    expect(res.body.pattern.provenance).toBe('ai-heuristic:claude-fable-5');
    const probe = await request(app).get('/api/v1/place-hubs/classify?url=' + encodeURIComponent('https://www.lemonde.fr/afrique/kenya'));
    expect(probe.body.result.isPlaceHubCandidate).toBe(true);
    expect(probe.body.result.pattern.type).toBe('ai:path-afrique');
  });

  it('heuristics demote zeroes a bad pattern', async () => {
    await request(app).post('/api/v1/place-hubs/heuristics/patterns').send({
      op: 'upsert', domain: 'x.com', patternType: 'bad', patternRegex: '\\/x\\/[a-z-]+$',
      agent: 'a', reason: 'r'
    });
    const res = await request(app).post('/api/v1/place-hubs/heuristics/patterns').send({
      op: 'demote', domain: 'x.com', patternType: 'bad', patternRegex: '\\/x\\/[a-z-]+$',
      agent: 'claude-fable-5', reason: 'matches article listicles, 80% false positives'
    });
    expect(res.status).toBe(200);
    expect(res.body.changes).toBe(1);
    expect(db.prepare("SELECT accuracy FROM place_hub_url_patterns WHERE domain='x.com'").get().accuracy).toBe(0);
  });

  it('rejects invalid regexes', async () => {
    const res = await request(app).post('/api/v1/place-hubs/heuristics/patterns').send({
      op: 'upsert', domain: 'x.com', patternType: 't', patternRegex: '([unclosed',
      agent: 'a', reason: 'r'
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid regex/);
  });

  it('resolve-unknown-term matches www-prefixed stored hosts (live-found bug)', async () => {
    // Real data stores host as seen by the crawler (www.theguardian.com);
    // callers pass canonical hosts. First live run cleared 0 rows.
    const res = await request(app).post('/api/v1/place-hubs/overrides').send({
      action: 'resolve-unknown-term', host: 'theguardian.com',
      termSlug: 'climate-crisis', resolution: 'non-geo',
      agent: 'claude-fable-5', reason: 'topic desk'
    });
    expect(res.status).toBe(200);
    expect(res.body.clearedUnknownTerms).toBe(1); // matched despite www. prefix in storage
  });

  it('fetch-policies: seeds are visible, upserts require agent, invalid strategy rejected', async () => {
    // Registration seeded the known-protection hosts (non-destructively).
    const list = await request(app).get('/api/v1/place-hubs/fetch-policies');
    expect(list.status).toBe(200);
    const hosts = list.body.policies.map((p) => p.host);
    expect(hosts).toEqual(expect.arrayContaining(['theguardian.com', 'lemonde.fr', 'reuters.com']));
    const guardian = list.body.policies.find((p) => p.host === 'theguardian.com');
    expect(guardian.fetch_strategy).toBe('puppeteer');
    expect(guardian.protection_kind).toBe('tls-fingerprint');

    // Anonymous mutation refused
    const anon = await request(app).post('/api/v1/place-hubs/fetch-policies')
      .send({ host: 'x.com', fetchStrategy: 'direct' });
    expect(anon.status).toBe(400);

    // Invalid strategy → 400 with the validator's message
    const bad = await request(app).post('/api/v1/place-hubs/fetch-policies')
      .send({ host: 'x.com', fetchStrategy: 'carrier-pigeon', agent: 'a', reason: 'r' });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/invalid fetch_strategy/);

    // Valid AI decision persists with provenance + audit
    const ok = await request(app).post('/api/v1/place-hubs/fetch-policies').send({
      host: 'www.nytimes.com', protectionKind: 'paywall', fetchStrategy: 'puppeteer',
      confidence: 0.6, agent: 'claude-fable-5', reason: 'metered paywall serves full HTML to browsers'
    });
    expect(ok.status).toBe(200);
    expect(ok.body.policy.host).toBe('nytimes.com'); // canonicalized
    expect(ok.body.policy.provenance).toBe('ai-review:claude-fable-5');
    expect(db.prepare("SELECT COUNT(*) c FROM place_hub_audit WHERE decision='ai:fetch-policy-upsert'").get().c).toBe(1);

    // Filter by strategy works
    const filtered = await request(app).get('/api/v1/place-hubs/fetch-policies?strategy=puppeteer');
    expect(filtered.body.policies.every((p) => p.fetch_strategy === 'puppeteer')).toBe(true);
  });

  it('fetch-policies: GET lists the seeded bot-protection model', async () => {
    const res = await request(app).get('/api/v1/place-hubs/fetch-policies');
    expect(res.status).toBe(200);
    const guardian = res.body.policies.find((p) => p.host === 'theguardian.com');
    expect(guardian.fetch_strategy).toBe('puppeteer');
    expect(guardian.protection_kind).toBe('tls-fingerprint');
    // strategy filter
    const puppeteerOnly = await request(app).get('/api/v1/place-hubs/fetch-policies?strategy=puppeteer');
    expect(puppeteerOnly.body.policies.every((p) => p.fetch_strategy === 'puppeteer')).toBe(true);
  });

  it('fetch-policies: POST upserts a policy (agent+reason), rejects bad strategy', async () => {
    const ok = await request(app).post('/api/v1/place-hubs/fetch-policies').send({
      host: 'newssite.example', protectionKind: 'bot-block', fetchStrategy: 'remote-worker',
      agent: 'claude-fable-5', reason: 'Cloudflare challenge on direct + puppeteer; route via residential worker'
    });
    expect(ok.status).toBe(200);
    expect(ok.body.policy.fetch_strategy).toBe('remote-worker');
    expect(ok.body.policy.provenance).toBe('ai-review:claude-fable-5');
    const bad = await request(app).post('/api/v1/place-hubs/fetch-policies').send({
      host: 'x.example', fetchStrategy: 'carrier-pigeon', agent: 'a', reason: 'r'
    });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/invalid fetch_strategy/);
    const anon = await request(app).post('/api/v1/place-hubs/fetch-policies').send({ host: 'x.example', fetchStrategy: 'direct' });
    expect(anon.status).toBe(400);
  });

  it('actions/learn and actions/assess-structure run and audit', async () => {
    db.prepare("INSERT INTO urls (url) VALUES ('https://n.example/world/france')").run();
    db.prepare("INSERT INTO urls (url) VALUES ('https://n.example/world/kenya')").run();
    db.prepare("INSERT INTO place_hubs (host, place_slug, place_kind, url_id) VALUES ('n.example','france','country',1)").run();
    db.prepare("INSERT INTO place_hubs (host, place_slug, place_kind, url_id) VALUES ('n.example','kenya','country',2)").run();
    const learn = await request(app).post('/api/v1/place-hubs/actions/learn').send({
      host: 'n.example', agent: 'claude-fable-5', reason: 'initial pattern mining'
    });
    expect(learn.status).toBe(200);
    expect(learn.body.report.patternsSaved).toHaveLength(1);
    const assess = await request(app).post('/api/v1/place-hubs/actions/assess-structure').send({
      host: 'n.example', agent: 'claude-fable-5', reason: 'routine drift check'
    });
    expect(assess.status).toBe(200);
    expect(assess.body.assessment.drifted).toBe(false);
    expect(db.prepare("SELECT COUNT(*) c FROM place_hub_audit WHERE decision IN ('ai:learn-patterns','ai:assess-structure')").get().c).toBe(2);
  });
});
