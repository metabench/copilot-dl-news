'use strict';

const path = require('path');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const { getNormalizedUrlDebugQuerySnapshot } = resolveNewsCrawlerDbModule();

async function main() {
  const projectRoot = findProjectRoot(path.join(__dirname, '..', '..'));
  const dbPath = path.join(projectRoot, 'data', 'news.db');
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });

  try {
    const snapshot = getNormalizedUrlDebugQuerySnapshot(db, { limit: 10 });
    console.log('Simple count (urls):', snapshot.simpleCount);
    console.log('With LIMIT 10 (http_responses):', snapshot.httpResponseCountRows);
    console.log('Actual query result count:', snapshot.actualRows.length);
    if (snapshot.actualRows.length > 0) {
      console.log('First row:', JSON.stringify(snapshot.actualRows[0], null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  console.error(error.stack);
  process.exitCode = 1;
});
