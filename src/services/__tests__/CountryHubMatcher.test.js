'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const { ensureDb } = require('../../db/sqlite/v1/ensureDb');
const { CountryHubMatcher } = require('../CountryHubMatcher');

function createTempDbPath(prefix = 'country-hub-matcher') {
  const dir = path.join(os.tmpdir(), 'copilot-dl-news-matcher-tests');
  fs.mkdirSync(dir, { recursive: true });
  const unique = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return path.join(dir, `${prefix}-${unique}.db`);
}

function seedCountry(db, { name, code, importance = 100 }) {
  const columns = db.prepare("PRAGMA table_info('places')").all().map((row) => row.name);
  const hasStatus = columns.includes('status');

  const insertResult = db.prepare(`
    INSERT INTO places (kind, country_code, priority_score${hasStatus ? ', status' : ''}, source)
    VALUES ('country', @code, @importance${hasStatus ? ", 'current'" : ''}, 'test')
  `).run({ code, importance });

  const placeId = insertResult.lastInsertRowid;
  const normalized = name.toLowerCase();
  const nameResult = db.prepare(`
    INSERT INTO place_names (place_id, name, normalized, is_preferred, lang)
    VALUES (?, ?, ?, 1, 'en')
  `).run(placeId, name, normalized);

  db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(nameResult.lastInsertRowid, placeId);
  return placeId;
}

function seedPlaceHub(db, {
  host,
  url,
  placeSlug,
  navLinksCount = 20,
  articleLinksCount = 5
}) {
  db.prepare(`
    INSERT INTO place_hubs (
      host,
      url,
      place_slug,
      place_kind,
      title,
      nav_links_count,
      article_links_count,
      first_seen_at,
      last_seen_at
    ) VALUES (?, ?, ?, 'country', ?, ?, ?, datetime('now'), datetime('now'))
  `).run(host, url, placeSlug, `Hub for ${placeSlug}`, navLinksCount, articleLinksCount);

  db.prepare(`
    INSERT OR IGNORE INTO urls (url, created_at, last_seen_at)
    VALUES (?, datetime('now'), datetime('now'))
  `).run(url);

  db.prepare(`
    INSERT OR REPLACE INTO latest_fetch (url, ts, http_status, classification, word_count)
    VALUES (?, datetime('now'), 200, 'hub', 0)
  `).run(url);
}

describe('CountryHubMatcher', () => {
  let db;
  let dbPath;

  beforeEach(() => {
    dbPath = createTempDbPath();
    db = ensureDb(dbPath);
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (dbPath && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  test('links missing country hubs using place_page_mappings', () => {
    const host = 'theguardian.com';
    const canadaId = seedCountry(db, { name: 'Canada', code: 'CA', importance: 500 });
    seedCountry(db, { name: 'United Kingdom', code: 'GB', importance: 800 });

    seedPlaceHub(db, {
      host: 'www.theguardian.com',
      url: 'https://www.theguardian.com/world/canada',
      placeSlug: 'canada',
      navLinksCount: 18
    });

    const matcher = new CountryHubMatcher({ db, minNavLinks: 10 });

    const result = matcher.matchDomain(host, { dryRun: false });

    expect(result.linkedCount).toBe(1);
    expect(result.analysisBefore.missing).toBeGreaterThan(result.analysisAfter.missing);

    const mapping = db.prepare(`
      SELECT place_id AS placeId, host, url, status
      FROM place_page_mappings
      WHERE host = ? AND place_id = ?
    `).get(host, canadaId);

    expect(mapping).toBeTruthy();
    expect(mapping.placeId).toBe(canadaId);
    expect(mapping.status).toBe('verified');
    expect(mapping.url).toBe('https://www.theguardian.com/world/canada');
  });

  test('skips candidates without sufficient evidence', () => {
    const host = 'theguardian.com';
    seedCountry(db, { name: 'Canada', code: 'CA', importance: 500 });

    seedPlaceHub(db, {
      host: 'www.theguardian.com',
      url: 'https://www.theguardian.com/world/canada',
      placeSlug: 'canada',
      navLinksCount: 4,
      articleLinksCount: 1
    });

    const matcher = new CountryHubMatcher({ db, minNavLinks: 10 });
    const result = matcher.matchDomain(host, { dryRun: false });

    expect(result.linkedCount).toBe(0);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'insufficient-evidence' })
      ])
    );

    const mapping = db.prepare('SELECT COUNT(*) AS c FROM place_page_mappings').get();
    expect(mapping.c).toBe(0);
  });
});
