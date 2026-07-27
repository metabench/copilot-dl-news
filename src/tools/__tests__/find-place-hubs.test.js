const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureDb } = require('../../data/db/sqlite/ensureDb');
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

// Seed a hub-like page through the NORMALIZED schema the tool actually reads:
// urls -> http_responses -> content_storage -> content_analysis
// (the ncdb candidate join dedups content_analysis by per-content_id MAX version).
function seedHubPage(db, { url, host, title, navLinks, articleLinks, wordCount, places }) {
  const now = '2025-01-01T00:00:00Z';

  const urlId = db.prepare(
    `INSERT INTO urls(url, host, created_at, last_seen_at) VALUES (?, ?, ?, ?)`
  ).run(url, host, now, now).lastInsertRowid;

  const httpResponseId = db.prepare(
    `INSERT INTO http_responses(url_id, request_started_at, fetched_at, http_status, content_type, bytes_downloaded)
     VALUES (?, ?, ?, 200, 'text/html', 1000)`
  ).run(urlId, now, now).lastInsertRowid;

  const contentId = db.prepare(
    `INSERT INTO content_storage(http_response_id, storage_type, content_blob, uncompressed_size, created_at)
     VALUES (?, 'db_inline', ?, ?, ?)`
  ).run(httpResponseId, `${title} content placeholder`, wordCount, now).lastInsertRowid;

  db.prepare(
    `INSERT INTO content_analysis(content_id, analysis_version, classification, title, word_count,
                                  nav_links_count, article_links_count, analysis_json, analyzed_at, language)
     VALUES (?, 1, 'nav', ?, ?, ?, ?, ?, ?, 'en')`
  ).run(
    contentId,
    title,
    wordCount,
    navLinks,
    articleLinks,
    JSON.stringify({
      analysis_version: 1,
      findings: { places }
    }),
    now
  );

  return { urlId, httpResponseId, contentId };
}

describe('find-place-hubs (normalized schema)', () => {
  let temp;
  const HUB_URL = 'https://example.com/world/canada/';

  beforeEach(() => {
    temp = createTempDb();
    const db = ensureDb(temp.dbPath);
    try {
      // The live news.db carries this unique index (migration 41); the writer's
      // INSERT OR IGNORE keys dedup on it, so mirror it here to reflect prod.
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_place_hubs_url_id
                 ON place_hubs(url_id) WHERE url_id IS NOT NULL`);
      seedGazetteer(db, { placeName: 'Canada', countryCode: 'CA' });
      seedHubPage(db, {
        url: HUB_URL,
        host: 'example.com',
        title: 'Canada | Example News',
        navLinks: 24,
        articleLinks: 8,
        wordCount: 150,
        places: [{ place: 'Canada', place_kind: 'country', country_code: 'CA' }]
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

  test('dry-run reports the hub without writing to place_hubs', () => {
    const { summary, hubs } = findPlaceHubs({
      db: temp.dbPath,
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
      url: HUB_URL,
      host: 'example.com',
      place_slug: 'canada',
      action: 'insert'
    });

    // Assert the REAL table state, not the tool's counters: dry-run writes nothing.
    const db = ensureDb(temp.dbPath);
    try {
      const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM place_hubs').get();
      expect(countRow.cnt).toBe(0);
    } finally {
      db.close();
    }
  });

  test('apply persists a place_hubs row keyed by url_id', () => {
    const result = findPlaceHubs({
      db: temp.dbPath,
      limit: 10,
      dryRun: false,
      list: false
    });

    expect(result.summary.dryRun).toBe(false);
    expect(result.summary.validated).toBe(1);
    expect(result.summary.inserted).toBe(1);

    // Independent verification against the DB (the tool's counters can't be trusted
    // for this bug): a real row exists, resolved back to the hub URL via url_id.
    const db = ensureDb(temp.dbPath);
    try {
      const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM place_hubs').get();
      expect(countRow.cnt).toBe(1);

      const hubRow = db.prepare(`
        SELECT ph.host, ph.place_slug, u.url
          FROM place_hubs ph
          JOIN urls u ON u.id = ph.url_id
      `).get();
      expect(hubRow).toMatchObject({
        host: 'example.com',
        place_slug: 'canada',
        url: HUB_URL
      });
    } finally {
      db.close();
    }
  });

  test('apply is idempotent — a second run updates in place (no duplicate row)', () => {
    findPlaceHubs({ db: temp.dbPath, dryRun: false, list: false });
    const second = findPlaceHubs({ db: temp.dbPath, dryRun: false, list: false });

    // The uq_place_hubs_url_id unique index makes the re-run an UPDATE, not an INSERT.
    expect(second.summary.inserted).toBe(0);
    expect(second.summary.updated).toBe(1);

    const db = ensureDb(temp.dbPath);
    try {
      const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM place_hubs').get();
      expect(countRow.cnt).toBe(1);
    } finally {
      db.close();
    }
  });
});
