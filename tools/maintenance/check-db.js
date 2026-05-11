#!/usr/bin/env node
'use strict';

const path = require('path');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'news.db');

async function main(argv = process.argv.slice(2)) {
  const dbPath = argv[0] || DEFAULT_DB_PATH;
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });

  try {
    const snapshot = await db.maintenance.getBasicDatabaseCheckSnapshot();
    const countByTable = new Map(snapshot.counts.map((entry) => [entry.table, entry]));

    console.log('Tables:', snapshot.tables);
    console.log('HTTP Response count:', countByTable.get('http_responses')?.count ?? 0);
    console.log('Content Analysis count:', countByTable.get('content_analysis')?.count ?? 0);
    console.log('Place count:', countByTable.get('places')?.count ?? 0);

    if (snapshot.sampleArticle) {
      console.log('Sample article:', snapshot.sampleArticle);
    } else {
      console.log('No articles with titles found');
    }
  } finally {
    if (db && typeof db.close === 'function') {
      db.close();
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { main };
