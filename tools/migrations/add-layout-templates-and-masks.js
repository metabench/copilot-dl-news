#!/usr/bin/env node
'use strict';

/**
 * Migration: add layout_templates + layout_masks
 *
 * Purpose:
 * - layout_signatures already exists and stores mined structural hashes.
 * - layout_templates adds a curated layer for template-level metadata.
 * - layout_masks stores dynamic-node masks (currently referenced by tooling).
 */

const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite');

function tableExists(db, name) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return !!row;
}

async function main() {
  const dbPath = path.join(__dirname, '../../data/news.db');
  const db = ensureDatabase(dbPath);

  console.log('=== Migration: add layout_templates + layout_masks ===');
  console.log('Database:', dbPath);

  if (!tableExists(db, 'layout_signatures')) {
    throw new Error('Missing required table layout_signatures (expected existing schema).');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS layout_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signature_hash TEXT NOT NULL,
      producer TEXT NOT NULL DEFAULT 'static-skeletonhash-v1',
      host TEXT,
      label TEXT,
      notes TEXT,
      example_url TEXT,
      extraction_config_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (signature_hash) REFERENCES layout_signatures(signature_hash) ON DELETE CASCADE,
      UNIQUE (producer, signature_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_layout_templates_host
      ON layout_templates(host);

    CREATE TABLE IF NOT EXISTS layout_masks (
      signature_hash TEXT PRIMARY KEY,
      mask_json TEXT NOT NULL,
      sample_count INTEGER DEFAULT 0,
      dynamic_nodes_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (signature_hash) REFERENCES layout_signatures(signature_hash) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_layout_masks_updated_at
      ON layout_masks(updated_at);
  `);

  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('layout_templates','layout_masks') ORDER BY name"
  ).all();
  console.log('Tables present:', tables.map((t) => t.name).join(', '));

  db.close();
  console.log('✅ Migration complete');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Migration failed:', error && error.stack ? error.stack : error);
    process.exit(1);
  });
}

module.exports = { main };
