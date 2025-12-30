"use strict";

function assertDatabase(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("createLayoutTemplatesQueries requires a better-sqlite3 database handle");
  }
}

function createLayoutTemplatesQueries(db) {
  assertDatabase(db);

  const upsertStmt = db.prepare(`
    INSERT INTO layout_templates (
      signature_hash,
      producer,
      host,
      label,
      notes,
      example_url,
      extraction_config_json,
      updated_at
    ) VALUES (
      @signature_hash,
      COALESCE(@producer, 'static-skeletonhash-v1'),
      @host,
      @label,
      @notes,
      @example_url,
      @extraction_config_json,
      datetime('now')
    )
    ON CONFLICT(producer, signature_hash) DO UPDATE SET
      host = excluded.host,
      label = excluded.label,
      notes = excluded.notes,
      example_url = excluded.example_url,
      extraction_config_json = excluded.extraction_config_json,
      updated_at = datetime('now')
  `);

  const getStmt = db.prepare(`
    SELECT
      id,
      signature_hash,
      producer,
      host,
      label,
      notes,
      example_url,
      extraction_config_json,
      created_at,
      updated_at
    FROM layout_templates
    WHERE producer = ? AND signature_hash = ?
  `);

  const listByHostStmt = db.prepare(`
    SELECT
      id,
      signature_hash,
      producer,
      host,
      label,
      notes,
      example_url,
      extraction_config_json,
      created_at,
      updated_at
    FROM layout_templates
    WHERE host = ?
    ORDER BY updated_at DESC
  `);

  return {
    upsert({
      signature_hash,
      producer = "static-skeletonhash-v1",
      host = null,
      label = null,
      notes = null,
      example_url = null,
      extraction_config_json = null
    }) {
      upsertStmt.run({
        signature_hash,
        producer,
        host,
        label,
        notes,
        example_url,
        extraction_config_json
      });
    },
    get({ producer = "static-skeletonhash-v1", signature_hash }) {
      return getStmt.get(producer, signature_hash) || null;
    },
    listByHost(host) {
      return listByHostStmt.all(host);
    }
  };
}

module.exports = { createLayoutTemplatesQueries };
