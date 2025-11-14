'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { CountryHubGapAnalyzer } = require('../CountryHubGapAnalyzer');
const { RegionHubGapAnalyzer } = require('../RegionHubGapAnalyzer');
const { CityHubGapAnalyzer } = require('../CityHubGapAnalyzer');

function createSilentLogger() {
  return {
    log: () => {},
    warn: () => {},
    error: () => {}
  };
}

describe('HubGapAnalyzer DSPL integration', () => {
  let tempDir;
  let db;
  const logger = createSilentLogger();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dspl-test-'));
    const dsplPayload = {
      'theguardian.com': {
        domain: 'theguardian.com',
        generated: new Date().toISOString(),
        countryHubPatterns: [
          { pattern: '/{slug}/culture', confidence: 1, verified: true, examples: 5 },
          { pattern: '/world/{slug}', confidence: 1, verified: false, examples: 10 }
        ],
        regionHubPatterns: [
          { pattern: '/regional/{regionSlug}', confidence: 1, verified: true, examples: 4 }
        ],
        cityHubPatterns: [
          { pattern: '/spotlight/{countryCode}/{citySlug}', confidence: 1, verified: true, examples: 3 },
          { pattern: '/events/{citySlug}', confidence: 1, verified: false, examples: 7 }
        ],
        stats: {
          totalPatterns: 1,
          verifiedPatterns: 1,
          totalExamples: 5
        }
      }
    };
    fs.writeFileSync(path.join(tempDir, 'guardian.json'), JSON.stringify(dsplPayload, null, 2), 'utf8');
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE urls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE,
        canonical_url TEXT,
        host TEXT
      );
      CREATE TABLE http_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url_id INTEGER NOT NULL,
        request_started_at TEXT,
        fetched_at TEXT,
        http_status INTEGER,
        content_type TEXT,
        content_encoding TEXT,
        etag TEXT,
        last_modified TEXT,
        redirect_chain TEXT,
        ttfb_ms INTEGER,
        download_ms INTEGER,
        total_ms INTEGER,
        bytes_downloaded INTEGER,
        transfer_kbps REAL,
        FOREIGN KEY(url_id) REFERENCES urls(id)
      );
      CREATE TABLE content_storage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        http_response_id INTEGER,
        content_blob BLOB
      );
      CREATE TABLE content_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_id INTEGER,
        title TEXT,
        date TEXT,
        section TEXT
      );
      CREATE TABLE discovery_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url_id INTEGER
      );
    `);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('country analyzer prioritises verified DSPL patterns', () => {
    const analyzer = new CountryHubGapAnalyzer({ db, dsplDir: tempDir, logger });
    const urls = analyzer.predictCountryHubUrls('www.theguardian.com', 'Brazil', 'BR');

    expect(urls).toContain('https://www.theguardian.com/brazil/culture');
    expect(urls).not.toContain('https://www.theguardian.com/world/brazil');
  });

  test('region analyzer surfaces DSPL-backed URLs', () => {
    const analyzer = new RegionHubGapAnalyzer({ db, dsplDir: tempDir, logger });
    const urls = analyzer.predictRegionHubUrls('www.theguardian.com', {
      name: 'Bavaria',
      code: 'DE-BY',
      countryCode: 'DE'
    });

    expect(urls).toContain('https://www.theguardian.com/regional/bavaria');
  });

  test('city analyzer honours DSPL patterns and filters unverified entries', () => {
    const analyzer = new CityHubGapAnalyzer({ db, dsplDir: tempDir, logger });
    const urls = analyzer.predictCityHubUrls('www.theguardian.com', {
      name: 'Munich',
      countryCode: 'DE'
    });

  expect(urls).toContain('https://www.theguardian.com/spotlight/de/munich');
  expect(urls).not.toContain('https://www.theguardian.com/events/munich');
  });

  test('country analyzer skips URLs with recent known 404 responses', () => {
    const dsplPayload = {
      'theguardian.com': {
        domain: 'theguardian.com',
        generated: new Date().toISOString(),
        countryHubPatterns: [],
        stats: { totalPatterns: 0 }
      }
    };
    fs.writeFileSync(path.join(tempDir, 'guardian.json'), JSON.stringify(dsplPayload, null, 2), 'utf8');

    const url = 'https://www.theguardian.com/world/andorra';
    db.prepare('INSERT INTO urls (url, canonical_url, host) VALUES (?, NULL, ?)').run(url, 'theguardian.com');
    const urlId = db.prepare('SELECT id FROM urls WHERE url = ?').get(url).id;
    db.prepare(`
      INSERT INTO http_responses (
        url_id, request_started_at, fetched_at, http_status,
        content_type, content_encoding, etag, last_modified,
        redirect_chain, ttfb_ms, download_ms, total_ms, bytes_downloaded, transfer_kbps
      ) VALUES (?, datetime('now'), datetime('now'), 404, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
    `).run(urlId);

    const analyzer = new CountryHubGapAnalyzer({ db, dsplDir: tempDir, logger });
    const urls = analyzer.predictCountryHubUrls('www.theguardian.com', 'Andorra', 'AD');

    expect(urls.length).toBeGreaterThan(0);
    expect(urls).not.toContain('https://www.theguardian.com/world/andorra');
  });
});
