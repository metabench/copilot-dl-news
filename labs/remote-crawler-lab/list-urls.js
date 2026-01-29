#!/usr/bin/env node
const db = require('better-sqlite3')('crawler.db');
const urls = db.prepare('SELECT id, url, status FROM urls ORDER BY id').all();
urls.forEach(r => console.log(`${r.id}: ${r.url} [${r.status}]`));
console.log(`\nTotal: ${urls.length} URLs`);
