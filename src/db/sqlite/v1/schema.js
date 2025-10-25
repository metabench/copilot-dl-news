/**
 * @fileoverview Schema initialization for all database tables.
 * 
 * This module centralizes the creation and migration of all database tables.
 * It is designed to be idempotent and safe to run on every application start.
 */
'use strict';

function initCoreTables(db, { verbose, logger }) {
  if (verbose) logger.log('[schema] Initializing core tables (articles, fetches, etc.)...');
  
  // Migration: Add missing 'host' column to articles table if needed
  try {
    const articlesInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='articles'").get();
    if (articlesInfo && articlesInfo.sql) {
      if (!articlesInfo.sql.toLowerCase().includes('host')) {
        if (verbose) logger.log('[schema] Migrating articles table: adding host column...');
        try {
          db.exec('ALTER TABLE articles ADD COLUMN host TEXT');
        } catch (alterErr) {
          if (verbose) logger.warn('[schema] Warning: Could not add host column to articles:', alterErr.message);
        }
      }
    }
  } catch (err) {
    // Table doesn't exist yet, will be created below
    if (verbose && err.message && !err.message.includes('no such table')) {
      logger.warn('[schema] Warning during articles migration:', err.message);
    }
  }
  
  // Migration: Add missing 'host' column to urls table if needed
  try {
    const urlsInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='urls'").get();
    if (urlsInfo && urlsInfo.sql) {
      if (!urlsInfo.sql.toLowerCase().includes('host')) {
        if (verbose) logger.log('[schema] Migrating urls table: adding host column...');
        try {
          db.exec('ALTER TABLE urls ADD COLUMN host TEXT');
        } catch (alterErr) {
          if (verbose) logger.warn('[schema] Warning: Could not add host column to urls:', alterErr.message);
        }
      }
    }
  } catch (err) {
    // Table doesn't exist yet, will be created below
    if (verbose && err.message && !err.message.includes('no such table')) {
      logger.warn('[schema] Warning during urls migration:', err.message);
    }
  }
  
  // Migration: Add missing 'host' column to fetches table if needed
  try {
    const fetchesInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='fetches'").get();
    if (fetchesInfo && fetchesInfo.sql) {
      if (!fetchesInfo.sql.toLowerCase().includes('host')) {
        if (verbose) logger.log('[schema] Migrating fetches table: adding host column...');
        try {
          db.exec('ALTER TABLE fetches ADD COLUMN host TEXT');
        } catch (alterErr) {
          if (verbose) logger.warn('[schema] Warning: Could not add host column to fetches:', alterErr.message);
        }
      }
    }
  } catch (err) {
    // Table doesn't exist yet, will be created below
    if (verbose && err.message && !err.message.includes('no such table')) {
      logger.warn('[schema] Warning during fetches migration:', err.message);
    }
  }
  
  // Migration: Fix crawl_jobs.id from INTEGER to TEXT
  try {
    const crawlJobsInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='crawl_jobs'").get();
    if (crawlJobsInfo && crawlJobsInfo.sql && crawlJobsInfo.sql.includes('id INTEGER PRIMARY KEY AUTOINCREMENT')) {
      if (verbose) logger.log('[schema] Migrating crawl_jobs table: changing id from INTEGER to TEXT...');
      try {
        db.exec(`
          CREATE TABLE crawl_jobs_new (
            id TEXT PRIMARY KEY,
            url TEXT,
            args TEXT,
            pid INTEGER,
            started_at TEXT,
            ended_at TEXT,
            status TEXT,
            crawl_type_id INTEGER REFERENCES crawl_types(id)
          );
          INSERT INTO crawl_jobs_new SELECT CAST(id AS TEXT), url, args, pid, started_at, ended_at, status, crawl_type_id FROM crawl_jobs;
          DROP TABLE crawl_jobs;
          ALTER TABLE crawl_jobs_new RENAME TO crawl_jobs;
        `);
      } catch (migrateErr) {
        if (verbose) logger.warn('[schema] Warning: Could not migrate crawl_jobs table:', migrateErr.message);
      }
    }
  } catch (err) {
    // Table doesn't exist yet, will be created below
    if (verbose && err.message && !err.message.includes('no such table')) {
      logger.warn('[schema] Warning during crawl_jobs migration:', err.message);
    }
  }
  
  // Migration: Add missing 'status' column to existing core tables
  const coreTablesWithStatus = ['crawl_jobs', 'crawl_tasks', 'compression_buckets', 'planner_stage_events'];
  for (const tableName of coreTablesWithStatus) {
    try {
      const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
      if (tableInfo && tableInfo.sql) {
        if (!tableInfo.sql.toLowerCase().includes('status ')) {
          if (verbose) logger.log(`[schema] Migrating ${tableName} table: adding status column...`);
          try {
            db.exec(`ALTER TABLE ${tableName} ADD COLUMN status TEXT`);
          } catch (alterErr) {
            if (verbose) logger.warn(`[schema] Warning: Could not add status column to ${tableName}:`, alterErr.message);
          }
        }
      }
    } catch (err) {
      // Table doesn't exist yet, will be created below
      if (verbose && err.message && !err.message.includes('no such table')) {
        logger.warn(`[schema] Warning during ${tableName} status migration:`, err.message);
      }
    }
  }
  
  // Migration: Add missing 'created_at' column to existing core tables
  const coreTablesWithCreatedAt = ['urls', 'domains', 'content_storage', 'compression_buckets', 'bucket_entries', 'query_telemetry'];
  for (const tableName of coreTablesWithCreatedAt) {
    try {
      const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
      if (tableInfo && tableInfo.sql) {
        if (!tableInfo.sql.toLowerCase().includes('created_at ')) {
          if (verbose) logger.log(`[schema] Migrating ${tableName} table: adding created_at column...`);
          try {
            // SQLite doesn't allow non-constant DEFAULTs in ALTER TABLE, so add column without DEFAULT first
            db.exec(`ALTER TABLE ${tableName} ADD COLUMN created_at TEXT`);
            
            // For tables that should have a DEFAULT, update existing rows and add a trigger
            if (['content_storage', 'compression_buckets', 'bucket_entries', 'query_telemetry'].includes(tableName)) {
              // Update existing rows with current timestamp
              db.exec(`UPDATE ${tableName} SET created_at = datetime('now') WHERE created_at IS NULL`);
              
              // Note: We can't add DEFAULT constraints to existing columns in SQLite
              // The application code will need to handle setting created_at on inserts
            }
          } catch (alterErr) {
            if (verbose) logger.warn(`[schema] Warning: Could not add created_at column to ${tableName}:`, alterErr.message);
          }
        }
      }
    } catch (err) {
      // Table doesn't exist yet, will be created below
      if (verbose && err.message && !err.message.includes('no such table')) {
        logger.warn(`[schema] Warning during ${tableName} created_at migration:`, err.message);
      }
    }
  }
  
  // ========== url_aliases.url_exists Migration ==========
  // Migration: Add url_exists column to url_aliases table (used by DeepUrlAnalyzer)
  try {
    const urlAliasesInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='url_aliases'").get();
    if (urlAliasesInfo && !urlAliasesInfo.sql.toLowerCase().includes('url_exists')) {
      if (verbose) logger.log('[schema] Adding url_exists column to url_aliases table...');
      db.exec('ALTER TABLE url_aliases ADD COLUMN url_exists INTEGER DEFAULT 0');
    }
  } catch (err) {
    // Table doesn't exist yet or ALTER failed - will be created by ALL_TABLES_SCHEMA
    if (verbose && err.code !== 'SQLITE_ERROR') {
      logger.warn('[schema] Warning during url_aliases migration:', err.message);
    }
  }
  
  const { ALL_TABLES_SCHEMA } = require('./schema-definitions');
  db.exec(ALL_TABLES_SCHEMA);
  
  // Create host indexes defensively (won't fail if column doesn't exist due to migration issues)
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_articles_host ON articles(host)'); } catch (indexErr) {
    if (verbose) logger.warn('[schema] Could not create idx_articles_host:', indexErr.message);
  }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_urls_host ON urls(host)'); } catch (indexErr) {
    if (verbose) logger.warn('[schema] Could not create idx_urls_host:', indexErr.message);
  }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_urls_canonical ON urls(canonical_url)'); } catch (indexErr) {
    if (verbose) logger.warn('[schema] Could not create idx_urls_canonical:', indexErr.message);
  }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_fetches_host ON fetches(host)'); } catch (indexErr) {
    if (verbose) logger.warn('[schema] Could not create idx_fetches_host:', indexErr.message);
  }
  
  // Create triggers for latest_fetch maintenance
  if (verbose) logger.log('[schema] Initializing fetches triggers...');
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_latest_fetch_upsert
    AFTER INSERT ON fetches
    BEGIN
      INSERT INTO latest_fetch(url, ts, http_status, classification, word_count)
      VALUES (NEW.url, COALESCE(NEW.fetched_at, NEW.request_started_at), NEW.http_status, NEW.classification, NEW.word_count)
      ON CONFLICT(url) DO UPDATE SET
        ts = CASE WHEN COALESCE(NEW.fetched_at, NEW.request_started_at) > COALESCE(latest_fetch.ts, '') THEN COALESCE(NEW.fetched_at, NEW.request_started_at) ELSE latest_fetch.ts END,
        http_status = CASE WHEN COALESCE(NEW.fetched_at, NEW.request_started_at) >= COALESCE(latest_fetch.ts, '') THEN NEW.http_status ELSE latest_fetch.http_status END,
        classification = CASE WHEN COALESCE(NEW.fetched_at, NEW.request_started_at) >= COALESCE(latest_fetch.ts, '') THEN NEW.classification ELSE latest_fetch.classification END,
        word_count = CASE WHEN COALESCE(NEW.fetched_at, NEW.request_started_at) >= COALESCE(latest_fetch.ts, '') THEN NEW.word_count ELSE latest_fetch.word_count END;
    END;
    
    CREATE TRIGGER IF NOT EXISTS trg_urls_from_fetches_insert
    AFTER INSERT ON fetches
    BEGIN
      INSERT OR IGNORE INTO urls(url, created_at, last_seen_at)
      VALUES (NEW.url, COALESCE(NEW.fetched_at, datetime('now')), COALESCE(NEW.fetched_at, datetime('now')));
      UPDATE urls SET last_seen_at = COALESCE(NEW.fetched_at, datetime('now')) WHERE url = NEW.url;
    END;
  `);
}

function initGazetteerTables(db, { verbose, logger }) {
    if (verbose) logger.log('[schema] Initializing gazetteer tables...');

    // Rename legacy admin_level column to wikidata_admin_level for provenance clarity
    try {
      const placeColumns = db.prepare("PRAGMA table_info('places')").all();
      const hasLegacyAdminLevel = placeColumns.some((column) => column.name === 'admin_level');
      const hasWikidataAdminLevel = placeColumns.some((column) => column.name === 'wikidata_admin_level');
      if (hasLegacyAdminLevel && !hasWikidataAdminLevel) {
        if (verbose) logger.log('[schema] Renaming places.admin_level → places.wikidata_admin_level');
        db.exec('ALTER TABLE places RENAME COLUMN admin_level TO wikidata_admin_level');
      }
    } catch (renameError) {
      if (verbose) {
        logger.warn('[schema] Failed to rename places.admin_level column:', renameError.message);
      }
    }
    // ... implementation from ensureDb.js ...
    db.exec(`
    CREATE TABLE IF NOT EXISTS places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,                  -- country | region | city | poi | supranational
      country_code TEXT,                   -- ISO-3166 alpha-2 when applicable
      adm1_code TEXT,                      -- first-level admin code when applicable
      adm2_code TEXT,                      -- second-level admin code when applicable
      population INTEGER,
      timezone TEXT,
      lat REAL,
      lng REAL,
      bbox TEXT,                           -- JSON [west,south,east,north] when available
      canonical_name_id INTEGER,           -- references place_names.id (optional)
      source TEXT,                         -- provenance (e.g., restcountries@v3)
      extra JSON,                          -- JSON blob for source-specific data
      wikidata_qid TEXT,                   -- Wikidata QID (e.g., Q30 for USA)
      osm_type TEXT,                       -- OpenStreetMap type (node, way, relation)
      osm_id TEXT,                         -- OpenStreetMap ID
      area REAL,                           -- Area in square kilometers
      gdp_usd REAL,                        -- GDP in USD (for countries/regions)
  wikidata_admin_level INTEGER,        -- Wikidata administrative level (P2959)
      wikidata_props JSON,                 -- Comprehensive Wikidata properties
      osm_tags JSON,                       -- OpenStreetMap tags
      crawl_depth INTEGER DEFAULT 0,       -- 0=country, 1=ADM1, 2=ADM2, 3=city
      priority_score REAL,                 -- For breadth-first scheduling
      last_crawled_at INTEGER              -- Timestamp of last data fetch
    );
    CREATE INDEX IF NOT EXISTS idx_places_kind ON places(kind);
    CREATE INDEX IF NOT EXISTS idx_places_country ON places(country_code);
    CREATE INDEX IF NOT EXISTS idx_places_adm1 ON places(adm1_code);
    CREATE INDEX IF NOT EXISTS idx_places_adm2 ON places(adm2_code);
    CREATE INDEX IF NOT EXISTS idx_places_canonical_name ON places(canonical_name_id);
    -- Helpful composite and filter indexes to speed common SSR filters
    CREATE INDEX IF NOT EXISTS idx_places_kind_country ON places(kind, country_code);
    CREATE INDEX IF NOT EXISTS idx_places_population ON places(population);
    -- New indexes for breadth-first crawling
    CREATE INDEX IF NOT EXISTS idx_places_wikidata_qid ON places(wikidata_qid);
    CREATE INDEX IF NOT EXISTS idx_places_crawl_depth ON places(crawl_depth);
    CREATE INDEX IF NOT EXISTS idx_places_priority_score ON places(priority_score);
    CREATE INDEX IF NOT EXISTS idx_places_osm ON places(osm_type, osm_id);

    CREATE TABLE IF NOT EXISTS place_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      normalized TEXT,                     -- lowercased/diacritics-free for matching
      lang TEXT,                           -- BCP-47 (e.g., en, fr, zh-Hans)
      script TEXT,                         -- optional ISO 15924
      name_kind TEXT,                      -- endonym | exonym | alias | abbrev | official | common | demonym
      is_preferred INTEGER,                -- 0/1
      is_official INTEGER,                 -- 0/1
      source TEXT,
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_place_names_place ON place_names(place_id);
    CREATE INDEX IF NOT EXISTS idx_place_names_norm ON place_names(normalized);
  CREATE INDEX IF NOT EXISTS idx_place_names_lang ON place_names(lang);
  -- Fast LIKE on lower(name) by storing normalized; also index lower(name) via generated expression fallback
  CREATE INDEX IF NOT EXISTS idx_place_names_name ON place_names(name);

    CREATE TABLE IF NOT EXISTS place_hierarchy (
      parent_id INTEGER NOT NULL,
      child_id INTEGER NOT NULL,
      relation TEXT,                       -- admin_parent | contains | member_of | capital_of
      depth INTEGER,
      metadata JSON,                       -- Optional metadata (e.g., for capital_of: { role: 'administrative' })
      PRIMARY KEY (parent_id, child_id, relation),
      FOREIGN KEY (parent_id) REFERENCES places(id) ON DELETE CASCADE,
      FOREIGN KEY (child_id) REFERENCES places(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS place_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      version TEXT,
      url TEXT,
      license TEXT
    );

    CREATE TABLE IF NOT EXISTS place_external_ids (
      source TEXT NOT NULL,
      ext_id TEXT NOT NULL,
      place_id INTEGER NOT NULL,
      PRIMARY KEY (source, ext_id),
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_place_external_place ON place_external_ids(place_id);

    CREATE TABLE IF NOT EXISTS place_attribute_values (
      place_id INTEGER NOT NULL,
      attr TEXT NOT NULL,
      source TEXT NOT NULL,
      value_json TEXT,
      confidence REAL,
      fetched_at INTEGER,
      metadata JSON,
      PRIMARY KEY (place_id, attr, source),
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ingestion_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,                -- Source name (restcountries, wikidata, osm, etc.)
      source_version TEXT,                 -- Source version (v3.1, latest, etc.)
      started_at INTEGER NOT NULL,         -- Unix timestamp
      completed_at INTEGER,                -- Unix timestamp
      status TEXT DEFAULT 'running',       -- running | completed | failed
      countries_processed INTEGER,
      places_created INTEGER,
      places_updated INTEGER,
      names_added INTEGER,
      error_message TEXT,
      metadata JSON                        -- Additional run metadata
    );
    CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source_status ON ingestion_runs(source, status);
    CREATE INDEX IF NOT EXISTS idx_ingestion_runs_completed ON ingestion_runs(completed_at);
    CREATE INDEX IF NOT EXISTS idx_place_attr_attr ON place_attribute_values(attr);
    CREATE INDEX IF NOT EXISTS idx_place_attr_source ON place_attribute_values(source);

    CREATE TABLE IF NOT EXISTS gazetteer_crawl_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage TEXT NOT NULL,                 -- countries | adm1 | adm2 | cities | osm_boundaries
      status TEXT NOT NULL,                -- pending | in_progress | completed | failed
      started_at INTEGER,
      completed_at INTEGER,
      records_total INTEGER DEFAULT 0,
      records_processed INTEGER DEFAULT 0,
      records_upserted INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      error_message TEXT,
      metadata JSON
    );
    CREATE INDEX IF NOT EXISTS idx_crawl_state_stage ON gazetteer_crawl_state(stage);
    CREATE INDEX IF NOT EXISTS idx_crawl_state_status ON gazetteer_crawl_state(status);
    
    CREATE TABLE IF NOT EXISTS topic_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      lang TEXT NOT NULL,
      term TEXT NOT NULL,
      normalized TEXT NOT NULL,
      source TEXT,
      metadata JSON
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_topic_keywords ON topic_keywords(topic, lang, normalized);
    CREATE INDEX IF NOT EXISTS idx_topic_keywords_lang ON topic_keywords(lang);

    CREATE TABLE IF NOT EXISTS crawl_skip_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      term TEXT NOT NULL,
      normalized TEXT NOT NULL,
      reason TEXT,
      source TEXT,
      metadata JSON
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_crawl_skip_terms ON crawl_skip_terms(lang, normalized);
    CREATE INDEX IF NOT EXISTS idx_crawl_skip_terms_reason ON crawl_skip_terms(reason);
  CREATE INDEX IF NOT EXISTS idx_place_hierarchy_parent ON place_hierarchy(parent_id);
  CREATE INDEX IF NOT EXISTS idx_place_hierarchy_child ON place_hierarchy(child_id);
  CREATE INDEX IF NOT EXISTS idx_place_hierarchy_relation ON place_hierarchy(relation);

    CREATE TABLE IF NOT EXISTS domain_locales (
      host TEXT PRIMARY KEY,
      country_code TEXT,
      primary_langs TEXT,                  -- CSV or JSON of language tags
      confidence REAL,
      source TEXT,
      updated_at TEXT
    );
  `);

  // Schema migrations for robustness features (idempotent)
  try { db.exec(`ALTER TABLE places ADD COLUMN status TEXT DEFAULT 'current'`); } catch (_) {}
  try { db.exec(`ALTER TABLE places ADD COLUMN valid_from TEXT`); } catch (_) {}
  try { db.exec(`ALTER TABLE places ADD COLUMN valid_to TEXT`); } catch (_) {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_places_status ON places(status)`); } catch (_) {}
  // Normalize status values for existing rows
  try { db.exec(`UPDATE places SET status = 'current' WHERE status IS NULL OR TRIM(status) = ''`); } catch (_) {}
  try { db.exec(`UPDATE places SET status = LOWER(TRIM(status)) WHERE status IS NOT NULL`); } catch (_) {}
  try { db.exec(`UPDATE places SET status = 'historical' WHERE status IN ('historic','former','defunct')`); } catch (_) {}

  // Clean up duplicate place_names before enforcing uniqueness
  try {
    db.exec(`
      WITH grouped AS (
        SELECT place_id,
               COALESCE(NULLIF(TRIM(normalized), ''), LOWER(TRIM(name))) AS norm,
               COALESCE(lang, '') AS lang,
               COALESCE(name_kind, '') AS kind,
               MIN(id) AS keep_id,
               COUNT(*) AS cnt
        FROM place_names
        GROUP BY place_id, norm, lang, kind
        HAVING cnt > 1
      )
      DELETE FROM place_names
      WHERE EXISTS (
        SELECT 1 FROM grouped g
        WHERE place_names.place_id = g.place_id
          AND COALESCE(NULLIF(TRIM(place_names.normalized), ''), LOWER(TRIM(place_names.name))) = g.norm
          AND COALESCE(place_names.lang, '') = g.lang
          AND COALESCE(place_names.name_kind, '') = g.kind
          AND place_names.id <> g.keep_id
      );
    `);
  } catch (_) {}
  // Now enforce uniq index for place_names
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_place_names ON place_names(place_id, normalized, lang, name_kind);`); } catch (_) {}

  // Dedupe and enforce uniqueness on place_sources (name,version,url,license)
  try {
    // Delete duplicates keeping the lowest id
    db.exec(`
      WITH grouped AS (
        SELECT name, version, url, license, MIN(id) AS keep_id, COUNT(*) AS cnt
        FROM place_sources
        GROUP BY name, version, url, license
        HAVING cnt > 1
      )
      DELETE FROM place_sources
      WHERE EXISTS (
        SELECT 1 FROM grouped g
        WHERE place_sources.name = g.name
          AND IFNULL(place_sources.version,'') = IFNULL(g.version,'')
          AND IFNULL(place_sources.url,'') = IFNULL(g.url,'')
          AND IFNULL(place_sources.license,'') = IFNULL(g.license,'')
          AND place_sources.id <> g.keep_id
      );
    `);
  } catch (_) {}
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_place_sources ON place_sources(name, version, url, license);`);
  } catch (_) {}

  // Dedupe countries and regions and enforce uniqueness via partial indexes
  try {
    // Countries: unique by country_code when kind='country'
    db.exec(`
      WITH grouped AS (
        SELECT country_code, MIN(id) AS keep_id, COUNT(*) AS cnt
        FROM places
        WHERE kind='country' AND country_code IS NOT NULL
        GROUP BY country_code
        HAVING cnt > 1
      )
      DELETE FROM places
      WHERE kind='country'
        AND country_code IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM grouped g
          WHERE places.country_code = g.country_code
            AND places.id <> g.keep_id
        );
    `);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_country_places ON places(country_code) WHERE kind='country' AND country_code IS NOT NULL;`);
  } catch (_) {}

  try {
    // Regions (ADM1): unique by (country_code, adm1_code) when kind='region'
    db.exec(`
      WITH grouped AS (
        SELECT country_code, adm1_code, MIN(id) AS keep_id, COUNT(*) AS cnt
        FROM places
        WHERE kind='region' AND adm1_code IS NOT NULL AND country_code IS NOT NULL
        GROUP BY country_code, adm1_code
        HAVING cnt > 1
      )
      DELETE FROM places
      WHERE kind='region'
        AND adm1_code IS NOT NULL AND country_code IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM grouped g
          WHERE places.country_code = g.country_code
            AND places.adm1_code = g.adm1_code
            AND places.id <> g.keep_id
        );
    `);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_region_places ON places(country_code, adm1_code) WHERE kind='region' AND country_code IS NOT NULL AND adm1_code IS NOT NULL;`);
  } catch (_) {}

  // Triggers to prevent bad data
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_place_hierarchy_no_self_ins
      BEFORE INSERT ON place_hierarchy
      WHEN NEW.parent_id = NEW.child_id
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy parent_id equals child_id'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_place_hierarchy_no_self_upd
      BEFORE UPDATE ON place_hierarchy
      WHEN NEW.parent_id = NEW.child_id
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy parent_id equals child_id'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_place_names_nonempty_ins
      BEFORE INSERT ON place_names
      WHEN TRIM(NEW.name) = ''
      BEGIN SELECT RAISE(ABORT, 'place_names.name must be non-empty'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_place_names_nonempty_upd
      BEFORE UPDATE ON place_names
      WHEN TRIM(NEW.name) = ''
      BEGIN SELECT RAISE(ABORT, 'place_names.name must be non-empty'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`DROP TRIGGER IF EXISTS trg_places_kind_check_ins;`);
    // Enforce kind domain
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_kind_check_ins
      BEFORE INSERT ON places
      WHEN NEW.kind NOT IN ('country','region','city','poi','supranational', 'planet')
      BEGIN SELECT RAISE(ABORT, 'places.kind invalid'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`DROP TRIGGER IF EXISTS trg_places_kind_check_upd;`);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_kind_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.kind NOT IN ('country','region','city','poi','supranational', 'planet')
      BEGIN SELECT RAISE(ABORT, 'places.kind invalid'); END;
    `);
  } catch (_) {}
  try {
    // Enforce lat/lng ranges when provided
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_latlng_check_ins
      BEFORE INSERT ON places
      WHEN NEW.lat IS NOT NULL AND (NEW.lat < -90 OR NEW.lat > 90)
      BEGIN SELECT RAISE(ABORT, 'places.lat out of range'); END;
    }`);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_latlng_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.lat IS NOT NULL AND (NEW.lat < -90 OR NEW.lat > 90)
      BEGIN SELECT RAISE(ABORT, 'places.lat out of range'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_lng_check_ins
      BEFORE INSERT ON places
      WHEN NEW.lng IS NOT NULL AND (NEW.lng < -180 OR NEW.lng > 180)
      BEGIN SELECT RAISE(ABORT, 'places.lng out of range'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_lng_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.lng IS NOT NULL AND (NEW.lng < -180 OR NEW.lng > 180)
      BEGIN SELECT RAISE(ABORT, 'places.lng out of range'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_population_check_ins
      BEFORE INSERT ON places
      WHEN NEW.population IS NOT NULL AND NEW.population < 0
      BEGIN SELECT RAISE(ABORT, 'places.population must be >= 0'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_population_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.population IS NOT NULL AND NEW.population < 0
      BEGIN SELECT RAISE(ABORT, 'places.population must be >= 0'); END;
    `);
  } catch (_) {}
  try {
    // Enforce uppercase ISO country codes
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_country_upper_ins
      BEFORE INSERT ON places
      WHEN NEW.country_code IS NOT NULL AND NEW.country_code <> UPPER(NEW.country_code)
      BEGIN SELECT RAISE(ABORT, 'places.country_code must be uppercase'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_country_upper_upd
      BEFORE UPDATE ON places
      WHEN NEW.country_code IS NOT NULL AND NEW.country_code <> UPPER(NEW.country_code)
      BEGIN SELECT RAISE(ABORT, 'places.country_code must be uppercase'); END;
    `);
  } catch (_) {}
  try {
    // Ensure canonical_name_id references a name for the same place
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_canon_ins
      AFTER INSERT ON places
      WHEN NEW.canonical_name_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM place_names pn WHERE pn.id = NEW.canonical_name_id AND pn.place_id = NEW.id
      )
      BEGIN SELECT RAISE(ABORT, 'places.canonical_name_id must reference a name belonging to this place'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_canon_upd
      AFTER UPDATE ON places
      WHEN NEW.canonical_name_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM place_names pn WHERE pn.id = NEW.canonical_name_id AND pn.place_id = NEW.id
      )
      BEGIN SELECT RAISE(ABORT, 'places.canonical_name_id must reference a name belonging to this place'); END;
    `);
  } catch (_) {}
  // Enforce status domain and relax code requirements for historical places
  try { db.exec(`DROP TRIGGER IF EXISTS trg_places_country_require_ins;`); } catch (_) {}
  try { db.exec(`DROP TRIGGER IF EXISTS trg_places_country_require_upd;`); } catch (_) {}
  try { db.exec(`DROP TRIGGER IF EXISTS trg_places_region_require_ins;`); } catch (_) {}
  try { db.exec(`DROP TRIGGER IF EXISTS trg_places_region_require_upd;`); } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_status_check_ins
      BEFORE INSERT ON places
      WHEN NEW.status IS NOT NULL AND NEW.status NOT IN ('current','historical')
      BEGIN SELECT RAISE(ABORT, 'places.status invalid'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_status_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.status IS NOT NULL AND NEW.status NOT IN ('current','historical')
      BEGIN SELECT RAISE(ABORT, 'places.status invalid'); END;
    `);
  } catch (_) {}
  try {
    // Require 2-letter country_code only for current countries
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_country_require_ins
      BEFORE INSERT ON places
      WHEN NEW.kind='country' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR LENGTH(TRIM(NEW.country_code)) <> 2)
      BEGIN SELECT RAISE(ABORT, 'current country rows require 2-letter country_code'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_country_require_upd
      BEFORE UPDATE ON places
      WHEN NEW.kind='country' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR LENGTH(TRIM(NEW.country_code)) <> 2)
      BEGIN SELECT RAISE(ABORT, 'current country rows require 2-letter country_code'); END;
    `);
  } catch (_) {}
  try {
    // Require region codes only for current regions
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_region_require_ins
      BEFORE INSERT ON places
      WHEN NEW.kind='region' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR TRIM(NEW.country_code) = '' OR NEW.adm1_code IS NULL OR TRIM(NEW.adm1_code) = '')
      BEGIN SELECT RAISE(ABORT, 'current region rows require country_code and adm1_code'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_region_require_upd
      BEFORE UPDATE ON places
      WHEN NEW.kind='region' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR TRIM(NEW.country_code) = '' OR NEW.adm1_code IS NULL OR TRIM(NEW.adm1_code) = '')
      BEGIN SELECT RAISE(ABORT, 'current region rows require country_code and adm1_code'); END;
    `);
  } catch (_) {}
  try {
    // If a canonical name is deleted, clear the reference on places
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_place_names_delete_clear_canonical
      AFTER DELETE ON place_names
      BEGIN
        UPDATE places SET canonical_name_id = NULL WHERE canonical_name_id = OLD.id;
      END;
    `);
  } catch (_) {}
  try {
    // Prevent cycles in place_hierarchy (guard: child cannot already reach parent)
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_place_hierarchy_no_cycle_ins
      BEFORE INSERT ON place_hierarchy
      WHEN EXISTS (
        WITH RECURSIVE reach(parent, child) AS (
          SELECT parent_id, child_id FROM place_hierarchy
          UNION ALL
          SELECT ph.parent_id, reach.child FROM place_hierarchy ph JOIN reach ON ph.child_id = reach.parent
        )
        SELECT 1 FROM reach WHERE parent = NEW.child_id AND child = NEW.parent_id
      )
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy insertion would create a cycle'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_place_hierarchy_no_cycle_upd
      BEFORE UPDATE ON place_hierarchy
      WHEN EXISTS (
        WITH RECURSIVE reach(parent, child) AS (
          SELECT parent_id, child_id FROM place_hierarchy
          UNION ALL
          SELECT ph.parent_id, reach.child FROM place_hierarchy ph JOIN reach ON ph.child_id = reach.parent
        )
        SELECT 1 FROM reach WHERE parent = NEW.child_id AND child = NEW.parent_id
      )
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy update would create a cycle'); END;
    `);
  } catch (_) {}
}

function initPlaceHubsTables(db, { verbose, logger }) {
    if (verbose) logger.log('[schema] Initializing place hubs tables...');
    // ... implementation from ensureDb.js ...
    db.exec(`
    CREATE TABLE IF NOT EXISTS place_hubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      place_slug TEXT,
      place_kind TEXT,
      topic_slug TEXT,
      topic_label TEXT,
      topic_kind TEXT,
      title TEXT,
      first_seen_at TEXT,
      last_seen_at TEXT,
      nav_links_count INTEGER,
      article_links_count INTEGER,
      evidence TEXT
    );

    CREATE TABLE IF NOT EXISTS place_page_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL,
      host TEXT NOT NULL,
      url TEXT NOT NULL,
      page_kind TEXT NOT NULL DEFAULT 'country-hub',
      publisher TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      verified_at TEXT,
      evidence JSON,
      hub_id INTEGER,
      UNIQUE(place_id, host, page_kind),
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
      FOREIGN KEY (hub_id) REFERENCES place_hubs(id) ON DELETE SET NULL
    );
  `);

  try {
    const cols = db.prepare('PRAGMA table_info(place_hubs)').all().map((row) => row.name);
    const ensureCol = (name, ddl) => {
      if (!cols.includes(name)) {
        db.exec(`ALTER TABLE place_hubs ADD COLUMN ${name} ${ddl}`);
        cols.push(name);
      }
    };

    ensureCol('place_slug', 'TEXT');
    ensureCol('place_kind', 'TEXT');
    ensureCol('topic_slug', 'TEXT');
    ensureCol('topic_label', 'TEXT');
    ensureCol('topic_kind', 'TEXT');
    ensureCol('title', 'TEXT');
    ensureCol('first_seen_at', 'TEXT');
    ensureCol('last_seen_at', 'TEXT');
    ensureCol('nav_links_count', 'INTEGER');
    ensureCol('article_links_count', 'INTEGER');
    ensureCol('evidence', 'TEXT');
  } catch (_) {}

  try { db.exec('CREATE INDEX IF NOT EXISTS idx_place_hubs_host ON place_hubs(host)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_place_hubs_place ON place_hubs(place_slug)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_place_hubs_topic ON place_hubs(topic_slug)'); } catch (_) {}

  try { db.exec('CREATE INDEX IF NOT EXISTS idx_place_page_mappings_host_kind ON place_page_mappings(host, page_kind)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_place_page_mappings_place ON place_page_mappings(place_id)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_place_page_mappings_status ON place_page_mappings(status)'); } catch (_) {}

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS place_hub_unknown_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host TEXT NOT NULL,
        url TEXT NOT NULL,
        canonical_url TEXT,
        term_slug TEXT NOT NULL,
        term_label TEXT,
        source TEXT,
        reason TEXT,
        confidence TEXT,
        evidence TEXT,
        occurrences INTEGER NOT NULL DEFAULT 1,
        first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(host, canonical_url, term_slug)
      );
    `);
  } catch (_) {}

  try { db.exec('CREATE INDEX IF NOT EXISTS idx_unknown_terms_host ON place_hub_unknown_terms(host)'); } catch (_) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_unknown_terms_slug ON place_hub_unknown_terms(term_slug)'); } catch (_) {}
}

function initCompressionTables(db, { verbose, logger }) {
    if (verbose) logger.log('[schema] Initializing compression tables...');
    // Tables are now created in ALL_TABLES_SCHEMA, just seed the data

  // Seed compression types (idempotent)
  const compressionTypes = [
    // No compression
    { name: 'none', algorithm: 'none', level: 0, mime_type: null, extension: null, memory_mb: 0, description: 'No compression' },
    
    // Gzip levels
    { name: 'gzip_1', algorithm: 'gzip', level: 1, mime_type: 'application/gzip', extension: '.gz', memory_mb: 1, description: 'Gzip fast (level 1)' },
    { name: 'gzip_3', algorithm: 'gzip', level: 3, mime_type: 'application/gzip', extension: '.gz', memory_mb: 2, description: 'Gzip balanced (level 3)' },
    { name: 'gzip_6', algorithm: 'gzip', level: 6, mime_type: 'application/gzip', extension: '.gz', memory_mb: 4, description: 'Gzip standard (level 6)' },
    { name: 'gzip_9', algorithm: 'gzip', level: 9, mime_type: 'application/gzip', extension: '.gz', memory_mb: 8, description: 'Gzip maximum (level 9)' },
    
    // Brotli levels
    { name: 'brotli_0', algorithm: 'brotli', level: 0, mime_type: 'application/x-br', extension: '.br', memory_mb: 1, window_bits: 20, description: 'Brotli fastest (level 0)' },
    { name: 'brotli_1', algorithm: 'brotli', level: 1, mime_type: 'application/x-br', extension: '.br', memory_mb: 2, window_bits: 20, description: 'Brotli fast (level 1)' },
    { name: 'brotli_3', algorithm: 'brotli', level: 3, mime_type: 'application/x-br', extension: '.br', memory_mb: 4, window_bits: 21, description: 'Brotli fast (level 3)' },
    { name: 'brotli_4', algorithm: 'brotli', level: 4, mime_type: 'application/x-br', extension: '.br', memory_mb: 8, window_bits: 22, description: 'Brotli balanced (level 4)' },
    { name: 'brotli_5', algorithm: 'brotli', level: 5, mime_type: 'application/x-br', extension: '.br', memory_mb: 16, window_bits: 22, description: 'Brotli balanced (level 5)' },
    { name: 'brotli_6', algorithm: 'brotli', level: 6, mime_type: 'application/x-br', extension: '.br', memory_mb: 16, window_bits: 22, description: 'Brotli standard (level 6)' },
    { name: 'brotli_7', algorithm: 'brotli', level: 7, mime_type: 'application/x-br', extension: '.br', memory_mb: 32, window_bits: 23, description: 'Brotli high quality (level 7)' },
    { name: 'brotli_8', algorithm: 'brotli', level: 8, mime_type: 'application/x-br', extension: '.br', memory_mb: 32, window_bits: 23, description: 'Brotli high quality (level 8)' },
    { name: 'brotli_9', algorithm: 'brotli', level: 9, mime_type: 'application/x-br', extension: '.br', memory_mb: 64, window_bits: 23, description: 'Brotli high quality (level 9)' },
    { name: 'brotli_10', algorithm: 'brotli', level: 10, mime_type: 'application/x-br', extension: '.br', memory_mb: 128, window_bits: 24, block_bits: 24, description: 'Brotli ultra-high (level 10, 128MB)' },
    { name: 'brotli_11', algorithm: 'brotli', level: 11, mime_type: 'application/x-br', extension: '.br', memory_mb: 256, window_bits: 24, block_bits: 24, description: 'Brotli maximum (level 11, 256MB, 16MB window)' },
    
    // Zstd levels (optional)
    { name: 'zstd_3', algorithm: 'zstd', level: 3, mime_type: 'application/zstd', extension: '.zst', memory_mb: 8, description: 'Zstandard fast (level 3)' },
    { name: 'zstd_19', algorithm: 'zstd', level: 19, mime_type: 'application/zstd', extension: '.zst', memory_mb: 512, description: 'Zstandard ultra (level 19)' }
  ];

  const insertType = db.prepare(`
    INSERT OR IGNORE INTO compression_types (
      name, algorithm, level, mime_type, extension, 
      memory_mb, window_bits, block_bits, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const type of compressionTypes) {
    insertType.run(
      type.name,
      type.algorithm,
      type.level,
      type.mime_type,
      type.extension,
      type.memory_mb,
      type.window_bits || null,
      type.block_bits || null,
      type.description
    );
  }
}

function initBackgroundTasksTables(db, { verbose, logger }) {
    if (verbose) logger.log('[schema] Initializing background tasks tables...');
    // ... implementation from ensureDb.js ...
    db.exec(`
    CREATE TABLE IF NOT EXISTS background_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'resuming', 'running', 'paused', 'completed', 'failed', 'cancelled')),
      progress_current INTEGER DEFAULT 0,
      progress_total INTEGER DEFAULT 0,
      progress_message TEXT,
      config TEXT, -- JSON configuration
      metadata TEXT, -- JSON metadata
      error_message TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      resume_started_at TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_background_tasks_status ON background_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_background_tasks_type ON background_tasks(task_type);
    CREATE INDEX IF NOT EXISTS idx_background_tasks_created ON background_tasks(created_at DESC);
  `);
}

function initViews(db, { verbose, logger }) {
  if (verbose) logger.log('[schema] Phase 5: Removing backward compatibility views (normalized-only schema)...');

  // Phase 5: Drop backward compatibility views (normalized schema is now the source of truth)
  try {
    db.exec('DROP VIEW IF EXISTS articles_view');
    db.exec('DROP VIEW IF EXISTS fetches_view');
    db.exec('DROP VIEW IF EXISTS places_view');
    if (verbose) logger.log('[schema] ✓ Backward compatibility views dropped');
  } catch (err) {
    logger.error(`[schema] ✗ Failed to drop backward compatibility views:`, err.message);
  }

  // Phase 5: Add composite indexes for normalized schema query performance
  if (verbose) logger.log('[schema] Adding composite indexes for normalized schema...');
  
  try {
    // Composite index for urls -> http_responses JOIN (already exists in schema-definitions.js)
    // idx_http_responses_url ON http_responses(url_id, fetched_at DESC)
    
    // Additional composite index for http_responses queries with status filtering
    db.exec('CREATE INDEX IF NOT EXISTS idx_http_responses_url_status ON http_responses(url_id, http_status)');
    
    // Composite index for content_storage -> content_analysis JOIN
    db.exec('CREATE INDEX IF NOT EXISTS idx_content_analysis_content_classification ON content_analysis(content_id, classification)');
    
    // Composite index for discovery_events queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_discovery_events_url_discovered ON discovery_events(url_id, discovered_at DESC)');
    
    // Composite index for place_provenance queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_place_provenance_place_source ON place_provenance(place_id, source)');
    
    // Composite index for place_attributes queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_place_attributes_place_attr ON place_attributes(place_id, attribute_kind)');
    
    if (verbose) logger.log('[schema] ✓ Composite indexes added');
  } catch (err) {
    logger.error(`[schema] ✗ Failed to add composite indexes:`, err.message);
  }
}

/**
 * Initialize database schema by applying all table creation and migration logic.
 * This function is IDEMPOTENT - safe to call multiple times.
 * 
 * @param {Database} db - better-sqlite3 Database instance
 * @param {Object} options - Initialization options
 * @param {boolean} [options.verbose=false] - Log table creation
 * @param {Object} [options.logger=console] - Logger instance
 */
function initializeSchema(db, options = {}) {
  const { verbose = false, logger = console } = options;
  
  if (verbose) {
    logger.log('[schema] Initializing database schema...');
  }

  const run = (name, fn) => {
    try {
      fn(db, { verbose, logger });
      if (verbose) logger.log(`[schema] ✓ ${name} initialized`);
      return { success: true };
    } catch (err) {
      logger.error(`[schema] ✗ Failed to initialize ${name}:`, err.message);
      // Log the error but don't throw - allow server to start with partial schema
      // Features depending on failed tables will degrade gracefully
      return { success: false, error: err.message };
    }
  };

  const results = {
    coreTables: run('Core Tables', initCoreTables),
    gazetteer: run('Gazetteer', initGazetteerTables),
    placeHubs: run('Place Hubs', initPlaceHubsTables),
    compression: run('Compression', initCompressionTables),
    backgroundTasks: run('Background Tasks', initBackgroundTasksTables),
    views: run('Views', initViews)
  };
  
  if (verbose) {
    logger.log('[schema] Schema initialization complete.');
    const failed = Object.entries(results).filter(([_, r]) => !r.success);
    if (failed.length > 0) {
      logger.warn(`[schema] ${failed.length} schema(s) failed to initialize:`,
        failed.map(([name]) => name).join(', '));
    }
  }
  
  return results;
}

module.exports = { 
  initializeSchema,
  initCoreTables,
  initGazetteerTables,
  initPlaceHubsTables,
  initCompressionTables,
  initBackgroundTasksTables,
  initViews
};
