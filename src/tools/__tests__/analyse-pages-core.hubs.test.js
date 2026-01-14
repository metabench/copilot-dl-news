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
  const db = ensureDb(dbPath);
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

    db.prepare(
      `INSERT INTO articles(url, host, title, section, crawled_at, fetched_at, http_status, text, word_count, article_xpath)
       VALUES (?, ?, ?, ?, ?, ?, 200, ?, 150, NULL)`
    ).run(
      url,
      host,
      `${placeName} | Example News`,
      section,
      now,
      now,
      `${placeName} latest updates and headlines.`,
    );
  } finally {
    db.close();
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
      analysisVersion: 1,
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
      analysisVersion: 1,
      limit: 10
    });

    expect(summary.dryRun).toBe(false);
    expect(summary.hubsInserted).toBe(1);
    expect(summary.hubsUpdated).toBe(0);
    expect(summary.hubAssignments).toBeUndefined();

    const db = ensureDb(temp.dbPath);
    const hubRows = db.prepare('SELECT place_slug, topic_slug, url FROM place_hubs').all();
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
      analysisVersion: 1,
      limit: 10
    });

    const summary = await analysePages({
      dbPath: temp.dbPath,
      analysisVersion: 2,
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
