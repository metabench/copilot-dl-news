const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureDb } = require('../../db/sqlite/ensureDb');
const { findPlaceHubs } = require('../find-place-hubs');

function createTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-place-hubs-'));
  const dbPath = path.join(dir, 'news.db');
  return { dir, dbPath };
}

function cleanupTempDb(temp) {
  const targets = [temp.dbPath, `${temp.dbPath}-wal`, `${temp.dbPath}-shm`];
  for (const file of targets) {
    try {
      fs.unlinkSync(file);
    } catch (_) {
      // ignore missing files
    }
  }
  try {
    fs.rmSync(temp.dir, { recursive: true, force: true });
  } catch (_) {
    // ignore residual files
  }
}

function seedGazetteer(db, { placeName, countryCode }) {
  const placeId = db.prepare(
    `INSERT INTO places(kind, country_code, status) VALUES ('country', ?, 'current')`
  ).run(countryCode).lastInsertRowid;

  db.prepare(
    `INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official, source)
     VALUES (?, ?, LOWER(?), 'en', 'official', 1, 1, 'test')`
  ).run(placeId, placeName, placeName);

  return placeId;
}

function seedArticle(db, { url, host, title, section, navLinks, articleLinks, wordCount }) {
  const now = '2025-01-01T00:00:00Z';

  db.prepare(
    `INSERT INTO fetches(url, request_started_at, fetched_at, http_status, classification, nav_links_count, article_links_count, word_count, host)
     VALUES (?, ?, ?, 200, 'nav', ?, ?, ?, ?)`
  ).run(url, now, now, navLinks, articleLinks, wordCount, host);

  db.prepare(
    `INSERT INTO articles(url, host, title, section, crawled_at, fetched_at, http_status, text, word_count, analysis)
     VALUES (?, ?, ?, ?, ?, ?, 200, ?, ?, ?)`
  ).run(
    url,
    host,
    title,
    section,
    now,
    now,
    `${title} content placeholder`,
    wordCount,
    JSON.stringify({
      analysis_version: 1,
      findings: {
        places: [
          { place: 'Canada', place_kind: 'country', country_code: 'CA' }
        ]
      }
    })
  );
}

describe('find-place-hubs', () => {
  let temp;

  beforeEach(() => {
    temp = createTempDb();
    const db = ensureDb(temp.dbPath);
    try {
      seedGazetteer(db, { placeName: 'Canada', countryCode: 'CA' });
      seedArticle(db, {
        url: 'https://example.com/world/canada/',
        host: 'example.com',
        title: 'Canada | Example News',
        section: 'World',
        navLinks: 24,
        articleLinks: 8,
        wordCount: 150
      });
    } finally {
      db.close();
    }
  });

  afterEach(() => {
    if (temp) {
      cleanupTempDb(temp);
      temp = null;
    }
  });

  test('dry-run reports hub without writing to database', () => {
    const { summary, hubs } = findPlaceHubs({
      dbPath: temp.dbPath,
      limit: 50,
      dryRun: true,
      list: true,
      includeEvidence: true
    });

    expect(summary.processed).toBeGreaterThan(0);
  expect(summary.matched).toBe(1);
  expect(summary.validated).toBe(1);
  expect(summary.rejected).toBe(0);
  expect(summary.inserted).toBe(1);
    expect(summary.dryRun).toBe(true);
    expect(hubs).toHaveLength(1);
    expect(hubs[0]).toMatchObject({
      url: 'https://example.com/world/canada/',
      host: 'example.com',
      place_slug: 'canada',
      action: 'insert'
    });

    const db = ensureDb(temp.dbPath);
    const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM place_hubs').get();
    expect(countRow.cnt).toBe(0);
    db.close();
  });

  test('apply persists hubs into place_hubs table', () => {
    const result = findPlaceHubs({
      dbPath: temp.dbPath,
      limit: 10,
      dryRun: false,
      list: false
    });

    expect(result.summary.dryRun).toBe(false);
  expect(result.summary.validated).toBe(1);
  expect(result.summary.rejected).toBe(0);
  expect(result.summary.inserted).toBe(1);

    const db = ensureDb(temp.dbPath);
    const hubRow = db.prepare('SELECT host, place_slug, url FROM place_hubs').get();
    expect(hubRow).toMatchObject({
      host: 'example.com',
      place_slug: 'canada',
      url: 'https://example.com/world/canada/'
    });
    db.close();
  });
});
