'use strict';

/**
 * Unit tests for place-articles.js read/compare functions. In-memory DB with a
 * minimal slice of the real join chain (article_place_mentions → content_analysis
 * → content_storage → http_responses → urls, + places/place_names). No live DB.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));
const { resolvePlaceIds, resolvePlaceById, listArticlesForPlace, coverageComparison } = require('../place-articles.js');

function fixture() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE places (id INTEGER PRIMARY KEY, kind TEXT, country_code TEXT, population INTEGER, canonical_name_id INTEGER);
    CREATE TABLE place_names (id INTEGER PRIMARY KEY, place_id INTEGER, name TEXT, normalized TEXT, lang TEXT, is_official INTEGER, is_preferred INTEGER);
    CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT);
    CREATE TABLE http_responses (id INTEGER PRIMARY KEY, url_id INTEGER);
    CREATE TABLE content_storage (id INTEGER PRIMARY KEY, http_response_id INTEGER);
    CREATE TABLE content_analysis (id INTEGER PRIMARY KEY, content_id INTEGER, title TEXT);
    CREATE TABLE article_place_mentions (id INTEGER PRIMARY KEY, content_id INTEGER, place_id INTEGER, matched_name TEXT, canonical_name TEXT, confidence REAL);
    CREATE TABLE article_places (id INTEGER PRIMARY KEY, place TEXT);
  `);
  // London (21) with an English + a French name; one article mentioning it (via 2 surface forms).
  db.prepare('INSERT INTO places VALUES (21,?,?,?,?)').run('city', 'GB', 8900000, 1); // canonical_name_id → the English "London" row
  // is_preferred is NON-UNIQUE: London (en), Londres (fr) and 伦敦 (zh) are ALL preferred.
  db.prepare('INSERT INTO place_names VALUES (1,21,?,?,?,?,?)').run('London', 'london', 'en', 1, 1);
  db.prepare('INSERT INTO place_names VALUES (2,21,?,?,?,?,?)').run('Londres', 'londres', 'fr', 0, 1);
  db.prepare('INSERT INTO place_names VALUES (3,21,?,?,?,?,?)').run('伦敦', 'london-zh', 'zh', 0, 1);
  db.prepare('INSERT INTO urls VALUES (100,?)').run('https://bbc.com/news/london-story');
  db.prepare('INSERT INTO http_responses VALUES (500,100)').run();
  db.prepare('INSERT INTO content_storage VALUES (300,500)').run();
  db.prepare('INSERT INTO content_analysis VALUES (900,300,?)').run('Violence in London');
  db.prepare('INSERT INTO article_place_mentions VALUES (1,900,21,?,?,1.0)').run('London', 'London');
  db.prepare('INSERT INTO article_place_mentions VALUES (2,900,21,?,?,0.9)').run('Londres', 'London');
  db.prepare('INSERT INTO article_places VALUES (1,?)').run('London'); // legacy name-string row
  return db;
}

describe('place-articles read/compare', () => {
  test('resolvePlaceIds finds a place by any-language name', () => {
    const db = fixture();
    expect(resolvePlaceIds(db, 'London')[0].place_id).toBe(21);
    expect(resolvePlaceIds(db, 'Londres')[0].place_id).toBe(21); // French exonym folds to the same id
    expect(resolvePlaceIds(db, '')).toEqual([]);
    db.close();
  });

  test('the display name is ENGLISH even when non-English names are also is_preferred (the 加薩 bug)', () => {
    const db = fixture();
    // Resolve by the French OR Chinese name — display name must still be the English "London".
    // (Comes from the authoritative places.canonical_name_id → the English row.)
    expect(resolvePlaceIds(db, 'Londres')[0].name).toBe('London');
    expect(resolvePlaceIds(db, '伦敦')[0].name).toBe('London');
    db.close();
  });

  test('display name falls back to the English-ranked pick when canonical_name_id is NULL', () => {
    const db = fixture();
    db.prepare('UPDATE places SET canonical_name_id = NULL WHERE id = 21').run();
    // No canonical pointer → the fallback ORDER BY (English first) must still choose "London" over Londres/伦敦.
    expect(resolvePlaceIds(db, '伦敦')[0].name).toBe('London');
    db.close();
  });

  test('resolvePlaceById returns the place with its English display name (or null)', () => {
    const db = fixture();
    const p = resolvePlaceById(db, 21);
    expect(p.place_id).toBe(21);
    expect(p.name).toBe('London');       // via canonical_name_id, English
    expect(p.country_code).toBe('GB');
    expect(resolvePlaceById(db, 999)).toBeNull();
    db.close();
  });

  test('listArticlesForPlace returns DISTINCT articles (grouped), title + best confidence + mention count + url', () => {
    const db = fixture();
    const rows = listArticlesForPlace(db, 21, 15);
    expect(rows.length).toBe(1); // 2 mentions of London in 1 article → 1 distinct article row
    expect(rows[0].title).toBe('Violence in London');
    expect(rows[0].url).toBe('https://bbc.com/news/london-story');
    expect(rows[0].confidence).toBe(1.0);   // MAX of the two mention confidences
    expect(rows[0].mention_count).toBe(2);  // both mentions counted
    db.close();
  });

  test('url is NULL (not an error) when content_storage has no http_response_id', () => {
    const db = fixture();
    db.prepare('UPDATE content_storage SET http_response_id = NULL WHERE id = 300').run();
    const rows = listArticlesForPlace(db, 21, 15);
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('Violence in London'); // title still resolves
    expect(rows[0].url).toBeNull();                    // url gracefully NULL
    db.close();
  });

  test('coverageComparison reports FK-distinct articles + surface forms vs legacy name-string rows', () => {
    const db = fixture();
    const cov = coverageComparison(db, 21, 'London');
    expect(cov.mentions_articles).toBe(1);         // one distinct content_id
    expect(cov.distinct_surface_forms).toBe(2);    // London + Londres → same place (the multilingual win)
    expect(cov.legacy_article_places_rows).toBe(1);
    db.close();
  });

  test('a place with no mentions returns empty, not an error', () => {
    const db = fixture();
    expect(listArticlesForPlace(db, 999, 15)).toEqual([]);
    expect(coverageComparison(db, 999, 'Nowhere').mentions_articles).toBe(0);
    db.close();
  });
});
