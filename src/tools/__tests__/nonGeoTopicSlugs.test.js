const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureDb } = require('../../db/sqlite/ensureDb');
const { loadNonGeoTopicSlugs, ensureNonGeoTopicTable } = require('../nonGeoTopicSlugs');

function createTempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'non-geo-topics-'));
  return { dir, dbPath: path.join(dir, 'news.db') };
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
    // ignore
  }
}

describe('nonGeoTopicSlugs helper', () => {
  let temp;

  beforeEach(() => {
    temp = createTempDbPath();
  });

  afterEach(() => {
    if (temp) {
      cleanupTempDb(temp);
      temp = null;
    }
  });

  test('bootstraps default English non-geo slugs when table empty', () => {
    const db = ensureDb(temp.dbPath);
    try {
      ensureNonGeoTopicTable(db);
      const { slugs, entries } = loadNonGeoTopicSlugs(db);

      expect(slugs.has('culture')).toBe(true);
      expect(slugs.has('film')).toBe(true);
      expect(entries.find((entry) => entry.slug === 'tv-and-radio')).toBeTruthy();
    } finally {
      db.close();
    }
  });

  test('does not duplicate bootstrap entries on subsequent loads', () => {
    const db = ensureDb(temp.dbPath);
    try {
      const { slugs } = loadNonGeoTopicSlugs(db);
      expect(slugs.size).toBeGreaterThan(0);

      const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM non_geo_topic_slugs').get();
      loadNonGeoTopicSlugs(db);
      const countRowAfter = db.prepare('SELECT COUNT(*) AS cnt FROM non_geo_topic_slugs').get();

      expect(countRowAfter.cnt).toBe(countRow.cnt);
    } finally {
      db.close();
    }
  });
});