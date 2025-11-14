#!/usr/bin/env node
"use strict";

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const snapshot = process.argv[2] || 'mini';
  const dbPath = path.join(repoRoot, 'data', 'perf-snapshots', snapshot, 'news.db');
  if (!fs.existsSync(dbPath)) {
    console.error('Snapshot DB not found:', dbPath);
    process.exit(2);
  }
  const db = new Database(dbPath, { readonly: true });
  try {
    const required = ['urls', 'errors', 'crawl_jobs', 'articles'];
    const missing = [];
    for (const t of required) {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
      if (!row) missing.push(t);
    }
    if (missing.length) {
      console.error('Missing required tables:', missing.join(','));
      process.exit(3);
    }
    console.log('Snapshot verification passed for', snapshot);
  } finally {
    db.close();
  }
}

if (require.main === module) main();
