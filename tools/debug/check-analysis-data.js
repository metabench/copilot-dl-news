#!/usr/bin/env node

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const { getAnalysisDataDebugSnapshot } = resolveNewsCrawlerDbModule();

async function main() {
  const db = openNewsCrawlerDb(path.join('.', 'data', 'news.db'), {
    readonly: true,
    fileMustExist: true
  });
  const snapshot = getAnalysisDataDebugSnapshot(db);

  // First check table schemas
  console.log('=== http_responses columns ===');
  console.log(snapshot.httpResponseColumns.join(', '));

  console.log('\n=== content_analysis columns ===');
  console.log(snapshot.contentAnalysisColumns.join(', '));

  console.log('\n=== fetches table (if exists) ===');
  if (snapshot.fetchesColumns.length > 0) {
    console.log(snapshot.fetchesColumns.join(', '));
  } else {
    console.log('(fetches table does not exist)');
  }

  console.log('\n=== Query attempt ===');
  const result = snapshot.latestAnalysis;

  console.log('Result:');
  console.log(JSON.stringify(result, null, 2));

  if (result && result.analysis_json) {
    try {
      const analysis = JSON.parse(result.analysis_json);
      console.log('\nAnalysis JSON:');
      console.log(JSON.stringify(analysis, null, 2));
    } catch (e) {
      console.log('Could not parse analysis_json:', e.message);
    }
  }

  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
