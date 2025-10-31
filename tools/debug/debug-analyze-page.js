const path = require('path');
const { findProjectRoot } = require('../../src/utils/project-root');
const { ensureDb } = require('../../src/db/sqlite/ensureDb');
const { analyzePage } = require('../../src/analysis/page-analyzer');
const { buildGazetteerMatchers } = require('../../src/analysis/place-extraction');

const projectRoot = findProjectRoot(path.join(__dirname, '..', '..'));
const dbPath = path.join(projectRoot, 'data', 'news.db');

const db = ensureDb(dbPath);

const row = db.prepare(`
  SELECT u.url,
         ca.title,
         ca.section,
         ca.word_count,
         ca.article_xpath,
         ca.analysis_json as analysis,
         ca.classification
    FROM urls u
    JOIN http_responses hr ON hr.url_id = u.id
    JOIN content_storage cs ON cs.http_response_id = hr.id
    JOIN content_analysis ca ON ca.content_id = cs.id
   WHERE u.url LIKE 'http%'
   ORDER BY hr.fetched_at DESC
   LIMIT 1
`).get();

// Get fetch stats from normalized schema
const fetchStats = db.prepare(`
  SELECT ca.classification, ca.word_count
  FROM urls u
  JOIN http_responses hr ON hr.url_id = u.id
  JOIN content_storage cs ON cs.http_response_id = hr.id
  JOIN content_analysis ca ON ca.content_id = cs.id
  WHERE u.url = ?
  ORDER BY hr.fetched_at DESC
  LIMIT 1
`).get(row.url);

const gazetteer = buildGazetteerMatchers(db);

const result = analyzePage({
  url: row.url,
  title: row.title,
  section: row.section,
  articleRow: {
    word_count: row.word_count,
    article_xpath: row.article_xpath
  },
  fetchRow: {
    classification: row.classification,
    word_count: row.word_count
  },
  gazetteer,
  db,
  targetVersion: 1
});

console.log('classification:', row.classification);
console.log('fetch stats:', fetchStats);
console.log('analysis kind:', result.analysis.kind);
console.log('places:', result.places?.length);
console.log('hubCandidate:', result.hubCandidate);

db.close();
