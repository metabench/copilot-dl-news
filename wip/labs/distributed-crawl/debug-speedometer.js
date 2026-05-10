#!/usr/bin/env node
const { openNewsCrawlerDb } = require('../../../src/db/openNewsCrawlerDb');
/**
 * Debug wrapper to see what's happening with the speedometer app
 */

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Starting speedometer debug...');
console.log('Node version:', process.version);
console.log('Electron version:', process.versions.electron || 'N/A');
console.log('CWD:', process.cwd());

try {
  console.log('Opening database...');
  const db = openNewsCrawlerDb('data/news.db', { readonly: true });
  console.log('Database opened');
  
  console.log('Checking task event storage...');
  console.log('task_events exists:', db.taskEvents.taskEventsTableExists() ? 'yes' : 'no');
  
  db.close();
  console.log('Database closed');
  
  console.log('Now requiring speedometer-app...');
  require('./speedometer-app.js');
  
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
