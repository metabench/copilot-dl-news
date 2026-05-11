'use strict';

const path = require('path');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const { analyzePage } = require('../../src/intelligence/analysis/page-analyzer');
const { buildGazetteerMatchers } = require('../../src/intelligence/analysis/place-extraction');

const { getLatestAnalyzablePageDebugSnapshot } = resolveNewsCrawlerDbModule();

async function main() {
  const projectRoot = findProjectRoot(path.join(__dirname, '..', '..'));
  const dbPath = path.join(projectRoot, 'data', 'news.db');
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });

  try {
    const { row, fetchStats } = getLatestAnalyzablePageDebugSnapshot(db);
    if (!row) {
      console.log('No analyzable page found.');
      return;
    }

    const gazetteer = buildGazetteerMatchers(db);
    const result = await analyzePage({
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
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  console.error(error.stack);
  process.exitCode = 1;
});
