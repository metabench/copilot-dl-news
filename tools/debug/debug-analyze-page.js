const path = require('path');
const { findProjectRoot } = require('../../src/utils/project-root');
const { ensureDb } = require('../../src/db/sqlite/ensureDb');
const { analyzePage } = require('../../src/analysis/page-analyzer');
const { buildGazetteerMatchers } = require('../../src/analysis/place-extraction');

const projectRoot = findProjectRoot(path.join(__dirname, '..', '..'));
const dbPath = path.join(projectRoot, 'data', 'news.db');

const db = ensureDb(dbPath);

const row = db.prepare(`
  SELECT a.url,
         a.title,
         a.section,
         a.text,
         a.word_count,
         a.article_xpath,
         a.analysis,
         lf.classification
    FROM articles a
    LEFT JOIN latest_fetch lf ON lf.url = a.url
   WHERE a.url LIKE 'http%'
   ORDER BY COALESCE(lf.ts, a.crawled_at) DESC
   LIMIT 1
`).get();

const fetchStats = db.prepare(`SELECT nav_links_count, article_links_count, word_count FROM fetches WHERE url = ? ORDER BY COALESCE(fetched_at, request_started_at) DESC LIMIT 1`).get(row.url);

const gazetteer = buildGazetteerMatchers(db);

const result = analyzePage({
  url: row.url,
  title: row.title,
  section: row.section,
  articleRow: {
    text: row.text,
    word_count: row.word_count,
    article_xpath: row.article_xpath
  },
  fetchRow: {
    classification: row.classification,
    nav_links_count: fetchStats?.nav_links_count ?? null,
    article_links_count: fetchStats?.article_links_count ?? null,
    word_count: fetchStats?.word_count ?? row.word_count
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
