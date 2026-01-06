#!/usr/bin/env node
/**
 * Explore the database schema to find content-related tables
 */
'use strict';

const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite');

const db = ensureDatabase(path.join(__dirname, '../../data/news.db'), { readonly: true });

console.log('=== Tables with content ===\n');

const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' 
  ORDER BY name
`).all();

for (const t of tables) {
  console.log(t.name);
}

console.log('\n=== Looking for content storage ===\n');

// Check fetches table
try {
  const fetchCols = db.prepare('PRAGMA table_info(fetches)').all();
  console.log('fetches columns:', fetchCols.map(c => `${c.name}(${c.type})`).join(', '));
  const fetchCount = db.prepare('SELECT COUNT(*) as cnt FROM fetches').get();
  console.log('fetches count:', fetchCount.cnt);
} catch (e) {
  console.log('No fetches table');
}

// Check for downloads
try {
  const dlCols = db.prepare('PRAGMA table_info(downloads)').all();
  console.log('downloads columns:', dlCols.map(c => `${c.name}(${c.type})`).join(', '));
  const dlCount = db.prepare('SELECT COUNT(*) as cnt FROM downloads').get();
  console.log('downloads count:', dlCount.cnt);
} catch (e) {
  console.log('No downloads table');
}

// Check for page_content or similar
try {
  const pcCols = db.prepare('PRAGMA table_info(page_content)').all();
  console.log('page_content columns:', pcCols.map(c => `${c.name}(${c.type})`).join(', '));
} catch (e) {
  console.log('No page_content table');
}

// Check url_metadata
try {
  const umCols = db.prepare('PRAGMA table_info(url_metadata)').all();
  console.log('\nurl_metadata columns:', umCols.map(c => `${c.name}(${c.type})`).join(', '));
  const umCount = db.prepare('SELECT COUNT(*) as cnt FROM url_metadata').get();
  console.log('url_metadata count:', umCount.cnt);
} catch (e) {
  console.log('No url_metadata table');
}

// Check url_content
try {
  const ucCols = db.prepare('PRAGMA table_info(url_content)').all();
  console.log('\nurl_content columns:', ucCols.map(c => `${c.name}(${c.type})`).join(', '));
  const ucCount = db.prepare('SELECT COUNT(*) as cnt FROM url_content').get();
  console.log('url_content count:', ucCount.cnt);
} catch (e) {
  console.log('No url_content table');
}

// Check fetched_content
try {
  const fcCols = db.prepare('PRAGMA table_info(fetched_content)').all();
  console.log('\nfetched_content columns:', fcCols.map(c => `${c.name}(${c.type})`).join(', '));
  const fcCount = db.prepare('SELECT COUNT(*) as cnt FROM fetched_content').get();
  console.log('fetched_content count:', fcCount.cnt);
} catch (e) {
  console.log('No fetched_content table');
}

// Check articles
try {
  const artCols = db.prepare('PRAGMA table_info(articles)').all();
  console.log('\narticles columns:', artCols.map(c => `${c.name}(${c.type})`).join(', '));
  const artCount = db.prepare('SELECT COUNT(*) as cnt FROM articles').get();
  console.log('articles count:', artCount.cnt);
} catch (e) {
  console.log('No articles table');
}

// Check downloaded_content
try {
  const dcCols = db.prepare('PRAGMA table_info(downloaded_content)').all();
  console.log('\ndownloaded_content columns:', dcCols.map(c => `${c.name}(${c.type})`).join(', '));
  const dcCount = db.prepare('SELECT COUNT(*) as cnt FROM downloaded_content').get();
  console.log('downloaded_content count:', dcCount.cnt);
} catch (e) {
  console.log('No downloaded_content table');
}

db.close();
