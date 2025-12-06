"use strict";

function assertDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("createLayoutMasksQueries requires a better-sqlite3 database handle");
  }
}

function createLayoutMasksQueries(db) {
  assertDatabase(db);

  const upsertStmt = db.prepare(`
    INSERT INTO layout_masks (signature_hash, mask_json, sample_count, dynamic_nodes_count, updated_at)
    VALUES (@signature_hash, @mask_json, @sample_count, @dynamic_nodes_count, datetime('now'))
    ON CONFLICT(signature_hash) DO UPDATE SET
      mask_json = excluded.mask_json,
      sample_count = excluded.sample_count,
      dynamic_nodes_count = excluded.dynamic_nodes_count,
      updated_at = datetime('now')
  `);

  const getStmt = db.prepare(`
    SELECT signature_hash, mask_json, sample_count, dynamic_nodes_count, created_at, updated_at
      FROM layout_masks
     WHERE signature_hash = ?
  `);

  return {
    upsert({ signature_hash, mask_json, sample_count = 0, dynamic_nodes_count = 0 }) {
      upsertStmt.run({ signature_hash, mask_json, sample_count, dynamic_nodes_count });
    },
    get(signature_hash) {
      return getStmt.get(signature_hash) || null;
    }
  };
}

module.exports = { createLayoutMasksQueries };
