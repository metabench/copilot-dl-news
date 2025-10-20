const fs = require('fs');
const os = require('os');
const path = require('path');

const pathResolveDb = require('path').resolve(__dirname, '../../../db');
let NewsDatabase;

const {
  fetchPlaceDetails,
  fetchPlaceArticles,
  listPlaceHubsBySlug
} = require('../data/gazetteerPlace');

describe('gazetteerPlace data helpers', () => {
  let tmpDir;
  let dbPath;
  let db;
  let cityId;

  beforeAll(() => {
    jest.isolateModules(() => {
      NewsDatabase = require(pathResolveDb);
    });
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gazetteer-place-'));
    dbPath = path.join(tmpDir, 'news.db');
    db = new NewsDatabase(dbPath);
    seedFixture(db);
  });

  afterEach(() => {
    if (db) {
      try { db.close(); } catch (_) { /* noop */ }
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function seedFixture(database) {
    cityId = null;
    database.db.exec(`
      DELETE FROM places;
      DELETE FROM place_names;
      DELETE FROM place_external_ids;
      DELETE FROM place_hierarchy;
      DELETE FROM articles;
      DELETE FROM place_hubs;
    `);

    const insertPlace = database.db.prepare(`INSERT INTO places(kind, country_code, adm1_code, population, canonical_name_id) VALUES (?,?,?,?,NULL)`);
    const countryId = insertPlace.run('country', 'US', null, 100000000).lastInsertRowid;
  cityId = insertPlace.run('city', 'US', 'CA', 5000000).lastInsertRowid;
    const parkId = insertPlace.run('poi', 'US', 'CA', null).lastInsertRowid;

    const insertName = database.db.prepare(`INSERT INTO place_names(place_id, name, normalized, lang, name_kind, is_preferred, is_official) VALUES (?,?,?,?,?,?,?)`);
    const countryNameId = insertName.run(countryId, 'United States', 'united states', 'en', 'official', 1, 1).lastInsertRowid;
    const cityNameId = insertName.run(cityId, 'Metropolis', 'metropolis', 'en', 'common', 1, 1).lastInsertRowid;
    insertName.run(parkId, 'Metropolis Park', 'metropolis park', 'en', 'common', 1, 0);

    database.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(countryNameId, countryId);
    database.db.prepare('UPDATE places SET canonical_name_id=? WHERE id=?').run(cityNameId, cityId);

    database.db.prepare(`INSERT INTO place_external_ids(source, ext_id, place_id) VALUES (?,?,?)`).run('wikidata', 'Q42', cityId);

    const insertHierarchy = database.db.prepare(`INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth) VALUES (?,?,?,?)`);
    insertHierarchy.run(countryId, cityId, 'admin_parent', 1);
    insertHierarchy.run(cityId, parkId, 'contains', 1);

    const articleUrl = 'https://example.com/metropolis-news';
    const now = new Date().toISOString();
    database.db.prepare('INSERT INTO articles (url, title, date, section, html, crawled_at) VALUES (?,?,?,?,?,?)')
      .run(articleUrl, 'Metropolis headlines', now, 'news', '<html></html>', now);
    // Note: article_places table removed from schema
    // database.db.prepare(`INSERT OR IGNORE INTO article_places(article_url, place, place_kind, method, source, first_seen_at) VALUES (?,?,?,?,?,?)`)
    //   .run(articleUrl, 'Metropolis', 'city', 'gazetteer', 'title', now);

    database.db.prepare(`INSERT OR IGNORE INTO place_hubs(host, url, place_slug, place_kind, topic_slug, topic_label, topic_kind, title, first_seen_at, last_seen_at, nav_links_count, article_links_count, evidence) VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'),?,?,?)`)
      .run('news.example.com', 'https://news.example.com/metropolis', 'metropolis', 'city', null, null, null, 'Metropolis coverage', 3, 1, JSON.stringify({ sample: true }));
  }

  test('fetchPlaceDetails returns canonical metadata and relations', () => {
    const details = fetchPlaceDetails(db.db, cityId);
    expect(details).toBeTruthy();
    expect(details.place).toBeDefined();
    expect(details.place.id).toBe(cityId);
    expect(details.canonicalName).toBe('Metropolis');
    expect(details.canonicalSlug).toBe('metropolis');
    expect(details.externalIds).toHaveLength(1);
    expect(details.parents).toHaveLength(1);
    expect(details.children).toHaveLength(1);
    expect(typeof details.sizeBytes).toBe('number');
    expect(details.sizeMethod).toMatch(/dbstat|approx/);
  });

  test('fetchPlaceArticles and listPlaceHubsBySlug reuse canonical data', () => {
    const details = fetchPlaceDetails(db.db, cityId);
    const articles = fetchPlaceArticles(db.db, cityId, { limit: 5, canonicalName: details.canonicalName });
    // article_places table removed from schema - should return empty array
    expect(articles).toHaveLength(0);

    const hubs = listPlaceHubsBySlug(db.db, details.canonicalSlug, { limit: 5 });
    expect(hubs).toHaveLength(1);
    expect(hubs[0].host).toBe('news.example.com');
  });
});
