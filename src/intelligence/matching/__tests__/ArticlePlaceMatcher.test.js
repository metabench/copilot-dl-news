'use strict';

const fs = require('fs');

// The real HtmlArticleExtractor pulls in jsdom, whose nested parse5 ships ESM
// that this repo's Jest transform chain cannot compile (see the pre-existing
// failure in HtmlArticleExtractor.articlePlus.test.js). The subject here is
// the SQL join, so a tag-stripping stub keeps the text path honest without jsdom.
jest.mock('../../../shared/utils/HtmlArticleExtractor', () => ({
  HtmlArticleExtractor: class {
    extractForPlaceMatching(html) {
      return String(html).replace(/<[^>]*>/g, ' ');
    }
    extractPlus(html) {
      if (!html || typeof html !== 'string') {
        return { success: false, text: '', wordCount: 0, metadata: {}, error: 'Invalid HTML input' };
      }
      return { success: true, text: html.replace(/<[^>]*>/g, ' '), wordCount: 20, metadata: {} };
    }
  }
}));

const { createTempDbPath } = require('../../../test-utils/db-helpers');
const { ensureDb } = require('../../../db/ensureNewsDb');
const { compress } = require('../../../shared/utils/CompressionFacade');
const { ArticlePlaceMatcher } = require('../ArticlePlaceMatcher');

// Fixture ids are deliberately misaligned: in the live DB content_storage.id
// rarely equals http_response_id (178k of 193k rows differ), and
// content_analysis.content_id references content_storage.id. A decoy
// content_storage row takes the id that EQUALS the target's http_response_id,
// so any join of content_analysis directly against http_responses.id surfaces
// the decoy's title instead of the target's. Aligned-id fixtures mask that.
const TARGET_HR_ID = 2;
const DECOY_HR_ID = 7;
const COMPRESSED_HR_ID = 8;

const MOCK_PLACES = [
  { id: 1, canonicalName: 'London', names: [{ name: 'London' }] },
  { id: 2, canonicalName: 'Paris', names: [{ name: 'Paris' }] },
  { id: 3, canonicalName: 'Berlin', names: [{ name: 'Berlin' }] },
  { id: 4, canonicalName: 'Madrid', names: [{ name: 'Madrid' }] }
];

describe('ArticlePlaceMatcher.getArticleData join correctness', () => {
  let dbPath;
  let db;
  let matcher;

  beforeAll(() => {
    dbPath = createTempDbPath('article-place-matcher');
    db = ensureDb(dbPath);

    const insertUrl = db.prepare(`
      INSERT INTO urls (id, url, created_at) VALUES (?, ?, datetime('now'))
    `);
    insertUrl.run(1, 'https://example.test/london');
    insertUrl.run(2, 'https://example.test/paris');
    insertUrl.run(3, 'https://example.test/madrid');

    const insertResponse = db.prepare(`
      INSERT INTO http_responses (id, url_id, request_started_at, fetched_at, http_status, content_type, bytes_downloaded)
      VALUES (?, ?, datetime('now'), datetime('now'), 200, 'text/html', 1000)
    `);
    insertResponse.run(TARGET_HR_ID, 1);
    insertResponse.run(DECOY_HR_ID, 2);
    insertResponse.run(COMPRESSED_HR_ID, 3);

    const targetHtml = '<html><body><p>Crowds gathered in London today as the bridge across the river reopened to traffic in London after repairs.</p></body></html>';
    const decoyHtml = '<html><body><p>Designers from around the world arrived in Paris this week for the spring shows in Paris.</p></body></html>';
    const madridHtml = '<html><body><p>Fans in Madrid are preparing for the derby this weekend as Madrid hosts its biggest match of the season.</p></body></html>';

    const insertStorage = db.prepare(`
      INSERT INTO content_storage (id, http_response_id, storage_type, compression_type_id, content_blob, uncompressed_size, created_at)
      VALUES (?, ?, 'db_inline', ?, ?, ?, datetime('now'))
    `);
    // Target content lands at cs.id 1; decoy content takes cs.id 2 = TARGET_HR_ID.
    insertStorage.run(1, TARGET_HR_ID, null, targetHtml, targetHtml.length);
    insertStorage.run(2, DECOY_HR_ID, null, decoyHtml, decoyHtml.length);

    const gzipType = db.prepare(`SELECT id FROM compression_types WHERE algorithm = 'gzip' ORDER BY level LIMIT 1`).get();
    const compressedBlob = compress(madridHtml, { algorithm: 'gzip', level: 1 }).compressed;
    insertStorage.run(3, COMPRESSED_HR_ID, gzipType.id, compressedBlob, madridHtml.length);

    const insertAnalysis = db.prepare(`
      INSERT INTO content_analysis (content_id, analysis_version, title, word_count, language, analyzed_at)
      VALUES (?, ?, ?, 20, 'en', datetime('now'))
    `);
    insertAnalysis.run(1, 1, 'Berlin Summit Archive');
    insertAnalysis.run(1, 2, 'London Landmarks Guide');
    insertAnalysis.run(2, 1, 'Paris Fashion Week');
    insertAnalysis.run(3, 1, 'Madrid Derby Preview');

    matcher = new ArticlePlaceMatcher({
      db,
      gazetteerApi: { baseUrl: 'http://localhost:3000', mockPlaces: MOCK_PLACES }
    });
  });

  afterAll(() => {
    if (db) {
      try { db.close(); } catch (_) {}
    }
    if (dbPath && fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch (_) {}
    }
  });

  test('joins content_analysis through content_storage, not http_responses.id', async () => {
    const relations = await matcher.matchArticleToPlaces(TARGET_HR_ID, 1);
    const placeIds = relations.map((r) => r.place_id);

    expect(placeIds).toContain(1); // London: the target article's own content
    expect(placeIds).not.toContain(2); // Paris: the decoy whose cs.id collides with the target hr.id
    for (const relation of relations) {
      expect(relation.article_id).toBe(TARGET_HR_ID);
    }
  });

  test('uses the latest analysis_version for the title', async () => {
    const relations = await matcher.matchArticleToPlaces(TARGET_HR_ID, 1);
    const placeIds = relations.map((r) => r.place_id);

    expect(placeIds).not.toContain(3); // Berlin appears only in the stale v1 title
  });

  test('decompresses compressed content_blob before matching', async () => {
    const relations = await matcher.matchArticleToPlaces(COMPRESSED_HR_ID, 1);
    const placeIds = relations.map((r) => r.place_id);

    expect(placeIds).toContain(4); // Madrid, readable only after gzip decode
  });

  test('matchArticleToPlacesPlus uses the corrected join as well', async () => {
    const relations = await matcher.matchArticleToPlacesPlus(TARGET_HR_ID, 1, 'https://example.test/london');
    const placeIds = relations.map((r) => r.place_id);

    expect(placeIds).toContain(1);
    expect(placeIds).not.toContain(2);
  });

  test('returns [] for an unknown article id', async () => {
    await expect(matcher.matchArticleToPlaces(424242, 1)).resolves.toEqual([]);
  });
});
