'use strict';

const path = require('path');
const { openNewsCrawlerDb } = require('../src/db/openNewsCrawlerDb');

const dbPath = path.join(__dirname, '../data/news.db');

console.log(`Ensuring task_events schema in: ${dbPath}`);

const db = openNewsCrawlerDb(dbPath);
try {
  db.taskEvents.ensureSchema();
  console.log(`task_events exists: ${db.taskEvents.taskEventsTableExists()}`);
  console.log(`${db.taskEvents.listTaskEventIndexNames().length} indexes available`);
} finally {
  db.close();
}
console.log('Done');
