#!/usr/bin/env node
const { openNewsCrawlerDb } = require('../../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb('crawler.db');
const urls = db.prepare('SELECT id, url, status FROM urls ORDER BY id').all();
urls.forEach(r => console.log(`${r.id}: ${r.url} [${r.status}]`));
console.log(`\nTotal: ${urls.length} URLs`);
