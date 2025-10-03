const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { findProjectRoot } = require('../../utils/project-root');

// Ensure the gazetteer (places) schema exists on the provided db instance.
function ensureGazetteer(db) {
  if (!db) throw new Error('ensureGazetteer requires an open better-sqlite3 Database');

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
  extra JSON                           -- JSON blob for source-specific data
    );
    CREATE INDEX IF NOT EXISTS idx_places_kind ON places(kind);
    CREATE INDEX IF NOT EXISTS idx_places_country ON places(country_code);
  CREATE INDEX IF NOT EXISTS idx_places_adm1 ON places(adm1_code);
  CREATE INDEX IF NOT EXISTS idx_places_adm2 ON places(adm2_code);
  CREATE INDEX IF NOT EXISTS idx_places_canonical_name ON places(canonical_name_id);
  -- Helpful composite and filter indexes to speed common SSR filters
  CREATE INDEX IF NOT EXISTS idx_places_kind_country ON places(kind, country_code);
  CREATE INDEX IF NOT EXISTS idx_places_population ON places(population);

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
      relation TEXT,                       -- admin_parent | contains | member_of
      depth INTEGER,
      PRIMARY KEY (parent_id, child_id),
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
    // Enforce kind domain
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_kind_check_ins
      BEFORE INSERT ON places
      WHEN NEW.kind NOT IN ('country','region','city','poi','supranational')
      BEGIN SELECT RAISE(ABORT, 'places.kind invalid'); END;
    `);
  } catch (_) {}
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_places_kind_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.kind NOT IN ('country','region','city','poi','supranational')
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
    `);
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

function ensurePlaceHubs(db) {
  if (!db) throw new Error('ensurePlaceHubs requires an open better-sqlite3 Database');

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
}

// Open (and create if needed) a SQLite DB file and ensure gazetteer tables exist.
function ensureDb(dbFilePath) {
  const projectRoot = findProjectRoot(__dirname);
  const filePath = dbFilePath || path.join(projectRoot, 'data', 'news.db');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(filePath);
  // Sensible pragmas for tools
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  try { db.pragma('busy_timeout = 5000'); } catch (_) {}
  try { db.pragma('synchronous = NORMAL'); } catch (_) {}

  ensureGazetteer(db);
  ensurePlaceHubs(db);
  return db;
}

// Open a DB in read-only mode without attempting to create or migrate schema.
function openDbReadOnly(dbFilePath) {
  const projectRoot = findProjectRoot(__dirname);
  const filePath = dbFilePath || path.join(projectRoot, 'data', 'news.db');
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  // Pragmas safe for read-only
  try { db.pragma('foreign_keys = ON'); } catch (_) {}
  try { db.pragma('busy_timeout = 5000'); } catch (_) {}
  return db;
}

// Exposed utility for maintenance tasks
function dedupePlaceSources(db) {
  if (!db) throw new Error('dedupePlaceSources requires an open Database');
  const before = db.prepare('SELECT COUNT(*) c FROM place_sources').get().c;
  const groups = db.prepare(`
    SELECT name, version, url, license, MIN(id) AS keep_id, COUNT(*) AS cnt
    FROM place_sources
    GROUP BY name, version, url, license
    HAVING cnt > 1
  `).all();
  let removed = 0;
  const del = db.prepare(`DELETE FROM place_sources WHERE name=? AND IFNULL(version,'')=IFNULL(?, '') AND IFNULL(url,'')=IFNULL(?, '') AND IFNULL(license,'')=IFNULL(?, '') AND id<>?`);
  const txn = db.transaction((rows) => {
    for (const r of rows) {
      const info = del.run(r.name, r.version, r.url, r.license, r.keep_id);
      removed += info.changes || 0;
    }
  });
  txn(groups);
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_place_sources ON place_sources(name, version, url, license);`); } catch (_) {}
  const after = db.prepare('SELECT COUNT(*) c FROM place_sources').get().c;
  return { before, after, removed, duplicateGroups: groups.length };
}

module.exports = { ensureDb, ensureGazetteer, ensurePlaceHubs, openDbReadOnly, dedupePlaceSources };
