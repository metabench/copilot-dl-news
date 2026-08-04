const fs = require('fs');
const os = require('os');
const path = require('path');

const { ensureDb } = require('../../data/db/sqlite');
const { analysePages } = require('../analyse-pages-core');

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analyse-pages-'));
  return {
    dir,
    dbPath: path.join(dir, 'news.db')
  };
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
    fs.rmdirSync(temp.dir);
  } catch (_) {
    // directory may not be empty, ignore
  }
}

function seedSampleData(dbPath, { url, host, placeName, section }) {
  // c195: ensureDb stopped creating the full schema when ownership moved to
  // news-crawler-db — NewsDatabase builds the live-mirroring schema
  // (articles/fetches/places/place_names included), the placeHubs precedent.
  const NewsDatabase = require('../../db');
  const ndb = new NewsDatabase(dbPath);
  const db = ndb.db;
  try {
    const placeId = db.prepare(
      `INSERT INTO places(kind, country_code, status) VALUES ('country', 'CA', 'current')`
    ).run().lastInsertRowid;

    db.prepare(
      `INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official, source)
       VALUES (?, ?, ?, 'en', 'official', 1, 1, 'test')`
    ).run(placeId, placeName, placeName.toLowerCase());

    const now = '2025-01-01T00:00:00Z';

    db.prepare(
      `INSERT INTO fetches(url, request_started_at, fetched_at, http_status, classification, nav_links_count, article_links_count, word_count, host)
       VALUES (?, ?, ?, 200, 'nav', 18, 6, 150, ?)`
    ).run(url, now, now, host);

    // c195: there is no legacy `articles` table in the current schema (nor in
    // the LIVE db — measured); article content lives in the normalized store.
    // Seed through the API the crawler itself uses.
    ndb.upsertArticle({
      url,
      host,
      title: `${placeName} | Example News`,
      section,
      // html is what feeds content_storage — without it the cascade stops
      // before content_analysis and the page can never be "pending".
      html: `<html><body><nav>${section}</nav><h1>${placeName} | Example News</h1><p>${placeName} latest updates and headlines. ${'More coverage. '.repeat(20)}</p></body></html>`,
      request_started_at: now,
      fetched_at: now,
      http_status: 200,
      content_type: 'text/html',
      word_count: 150,
      article_xpath: null
    });

    // The cascade hardcodes classification 'article' with null link counts —
    // model the real scenario (a v1 NAV analysis pending re-analysis) by
    // stamping the prior-analysis state the hub detector reads.
    db.prepare(
      `UPDATE content_analysis SET classification='nav', nav_links_count=18, article_links_count=6`
    ).run();
  } finally {
    try { ndb.close(); } catch (_) { /* temp db teardown */ }
  }
}

describe('analysePages hub assignment', () => {
  const sampleUrl = 'https://example.com/world/canada/';
  const sampleHost = 'example.com';
  const placeName = 'Canada';
  const section = 'World';

  let temp;

  beforeEach(() => {
    temp = createTempDbPath();
    seedSampleData(temp.dbPath, { url: sampleUrl, host: sampleHost, placeName, section });
  });

  afterEach(() => {
    if (temp) {
      cleanupTempDb(temp);
      temp = null;
    }
  });

  test('dry-run reports hub assignments without writing to database', async () => {
    const summary = await analysePages({
      dbPath: temp.dbPath,
      // c195: the API seed's cascade writes analysis_version 1, and pending
      // means version < requested — so the first analysis pass asks for 2.
      analysisVersion: 2,
      limit: 10,
      dryRun: true,
      collectHubSummary: true,
      hubSummaryLimit: 10
    });

    expect(summary.dryRun).toBe(true);
    expect(summary.hubsInserted).toBe(1);
    expect(summary.hubsUpdated).toBe(0);
    expect(Array.isArray(summary.hubAssignments)).toBe(true);
    expect(summary.hubAssignments[0]).toMatchObject({
      url: sampleUrl,
      host: sampleHost,
      action: 'insert',
      place_slug: 'canada'
    });

    const db = ensureDb(temp.dbPath);
    const row = db.prepare('SELECT COUNT(*) AS count FROM place_hubs').get();
    expect(row.count).toBe(0);
    db.close();
  });

  test('real run upserts hubs into database', async () => {
    const summary = await analysePages({
      dbPath: temp.dbPath,
      // c195: the API seed's cascade writes analysis_version 1, and pending
      // means version < requested — so the first analysis pass asks for 2.
      analysisVersion: 2,
      limit: 10
    });

    expect(summary.dryRun).toBe(false);
    expect(summary.hubsInserted).toBe(1);
    expect(summary.hubsUpdated).toBe(0);
    expect(summary.hubAssignments).toBeUndefined();

    const db = ensureDb(temp.dbPath);
    // place_hubs keys pages by url_id (c196 modernization, the placeHubs
    // precedent).
    const hubRows = db.prepare('SELECT ph.place_slug, ph.topic_slug, u.url AS url FROM place_hubs ph JOIN urls u ON u.id = ph.url_id').all();
    expect(hubRows).toHaveLength(1);
    expect(hubRows[0]).toMatchObject({
      place_slug: 'canada',
      url: sampleUrl
    });
    db.close();
  });

  test('subsequent higher-version run updates existing hubs', async () => {
    await analysePages({
      dbPath: temp.dbPath,
      // c195: the API seed's cascade writes analysis_version 1, and pending
      // means version < requested — so the first analysis pass asks for 2.
      analysisVersion: 2,
      limit: 10
    });

    const summary = await analysePages({
      dbPath: temp.dbPath,
      analysisVersion: 3,
      limit: 10,
      collectHubSummary: true,
      hubSummaryLimit: 5
    });

    expect(summary.hubsInserted).toBe(0);
    expect(summary.hubsUpdated).toBe(1);
    expect(Array.isArray(summary.hubAssignments)).toBe(true);
    expect(summary.hubAssignments[0]).toMatchObject({
      action: 'update',
      url: sampleUrl
    });
  });
});
