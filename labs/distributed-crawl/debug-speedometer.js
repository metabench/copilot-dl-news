#!/usr/bin/env node
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
  console.log('Loading better-sqlite3...');
  const Database = require('better-sqlite3');
  console.log('better-sqlite3 loaded');
  
  console.log('Opening database...');
  const db = Database('data/news.db');
  console.log('Database opened');
  
  console.log('Checking task_events table...');
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='task_events'`).get();
  console.log('task_events exists:', row ? 'yes' : 'no');
  
  db.close();
  console.log('Database closed');
  
  console.log('Now requiring speedometer-app...');
  require('./speedometer-app.js');
  
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
