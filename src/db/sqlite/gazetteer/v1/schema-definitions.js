'use strict';

/**
 * Gazetteer Schema Definitions
 * 
 * Standalone schema for geographic place data (gazetteer).
 * Can be used independently or integrated into the main news database.
 * 
 * Tables:
 *   - places: Core place entities (countries, cities, regions)
 *   - place_names: Multilingual names and aliases
 *   - place_hierarchy: Parent/child relationships
 *   - place_sources: Data source metadata
 *   - place_external_ids: External system IDs (GeoNames, Wikidata, OSM)
 *   - place_attribute_values: Extensible attributes
 *   - place_attributes: Attribute type definitions
 *   - place_provenance: Raw data audit trail
 *   - ingestion_runs: Import run tracking
 *   - gazetteer_crawl_state: Crawl progress state
 *   - topic_keywords: Topic/keyword mappings
 *   - crawl_skip_terms: Terms to skip during crawling
 *   - domain_locales: Domain language/locale mappings
 */

// ─────────────────────────────────────────────────────────────────────────────
// Table Definitions
// ─────────────────────────────────────────────────────────────────────────────

const TABLE_DEFINITIONS = [
  // Core tables
  {
    name: 'places',
    target: 'places',
    sql: `CREATE TABLE IF NOT EXISTS places (
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
      source TEXT,                         -- provenance (e.g., restcountries@v3, geonames)
      extra JSON,                          -- JSON blob for source-specific data
      wikidata_qid TEXT,                   -- Wikidata QID (e.g., Q30 for USA)
      osm_type TEXT,                       -- OpenStreetMap type (node, way, relation)
      osm_id TEXT,                         -- OpenStreetMap ID
      area REAL,                           -- Area in square kilometers
      gdp_usd REAL,                        -- GDP in USD (for countries/regions)
      wikidata_admin_level INTEGER,        -- Wikidata administrative level
      wikidata_props JSON,                 -- Comprehensive Wikidata properties
      osm_tags JSON,                       -- OpenStreetMap tags
      crawl_depth INTEGER DEFAULT 0,       -- 0=country, 1=ADM1, 2=ADM2, 3=city
      priority_score REAL,                 -- For breadth-first scheduling
      last_crawled_at INTEGER,             -- Timestamp of last data fetch
      status TEXT DEFAULT 'current',       -- current | historical | disputed
      valid_from TEXT,                     -- ISO date when place became valid
      valid_to TEXT,                       -- ISO date when place ceased to exist
      place_type TEXT,                     -- More specific type within kind
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`
  },
  
  {
    name: 'place_names',
    target: 'place_names',
    sql: `CREATE TABLE IF NOT EXISTS place_names (
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
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    )`
  },
  
  {
    name: 'place_hierarchy',
    target: 'place_hierarchy',
    sql: `CREATE TABLE IF NOT EXISTS place_hierarchy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL,
      child_id INTEGER NOT NULL,
      relation_type TEXT,                  -- admin_parent | geographic_parent | timezone_parent
      source TEXT,
      UNIQUE(parent_id, child_id),
      FOREIGN KEY (parent_id) REFERENCES places(id) ON DELETE CASCADE,
      FOREIGN KEY (child_id) REFERENCES places(id) ON DELETE CASCADE
    )`
  },
  
  {
    name: 'place_sources',
    target: 'place_sources',
    sql: `CREATE TABLE IF NOT EXISTS place_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      version TEXT,
      url TEXT,
      license TEXT,
      last_updated TEXT
    )`
  },
  
  {
    name: 'place_external_ids',
    target: 'place_external_ids',
    sql: `CREATE TABLE IF NOT EXISTS place_external_ids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL,
      source TEXT NOT NULL,                -- geonames | wikidata | osm | iso3166
      ext_id TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(place_id, source, ext_id),
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    )`
  },
  
  {
    name: 'place_attributes',
    target: 'place_attributes',
    sql: `CREATE TABLE IF NOT EXISTS place_attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      data_type TEXT NOT NULL,             -- string | number | boolean | json
      description TEXT
    )`
  },
  
  {
    name: 'place_attribute_values',
    target: 'place_attribute_values',
    sql: `CREATE TABLE IF NOT EXISTS place_attribute_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL,
      attribute_id INTEGER NOT NULL,
      value TEXT,
      source TEXT,
      valid_from TEXT,
      valid_to TEXT,
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
      FOREIGN KEY (attribute_id) REFERENCES place_attributes(id) ON DELETE CASCADE
    )`
  },
  
  {
    name: 'place_provenance',
    target: 'place_provenance',
    sql: `CREATE TABLE IF NOT EXISTS place_provenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL REFERENCES places(id),
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      fetched_at INTEGER,
      raw_data TEXT,
      UNIQUE(place_id, source, external_id)
    )`
  },
  
  {
    name: 'ingestion_runs',
    target: 'ingestion_runs',
    sql: `CREATE TABLE IF NOT EXISTS ingestion_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',  -- running | completed | failed | cancelled
      records_processed INTEGER DEFAULT 0,
      records_inserted INTEGER DEFAULT 0,
      records_updated INTEGER DEFAULT 0,
      records_skipped INTEGER DEFAULT 0,
      records_failed INTEGER DEFAULT 0,
      error_message TEXT,
      config JSON,
      summary JSON
    )`
  },
  
  {
    name: 'gazetteer_crawl_state',
    target: 'gazetteer_crawl_state',
    sql: `CREATE TABLE IF NOT EXISTS gazetteer_crawl_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_crawl_at TEXT,
      last_source TEXT,
      current_depth INTEGER DEFAULT 0,
      places_total INTEGER DEFAULT 0,
      places_at_depth JSON,
      pending_queue JSON,
      config JSON
    )`
  },
  
  {
    name: 'topic_keywords',
    target: 'topic_keywords',
    sql: `CREATE TABLE IF NOT EXISTS topic_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      lang TEXT NOT NULL,
      term TEXT NOT NULL,
      normalized TEXT NOT NULL,
      source TEXT,
      UNIQUE(topic, lang, term)
    )`
  },
  
  {
    name: 'crawl_skip_terms',
    target: 'crawl_skip_terms',
    sql: `CREATE TABLE IF NOT EXISTS crawl_skip_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      reason TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      source TEXT
    )`
  },
  
  {
    name: 'domain_locales',
    target: 'domain_locales',
    sql: `CREATE TABLE IF NOT EXISTS domain_locales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      primary_lang TEXT NOT NULL,
      secondary_langs TEXT,               -- JSON array
      region_code TEXT,                   -- ISO 3166-1 alpha-2
      detected_at TEXT,
      confidence REAL,
      UNIQUE(domain)
    )`
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// Index Definitions
// ─────────────────────────────────────────────────────────────────────────────

const INDEX_DEFINITIONS = [
  // places indexes
  { name: 'idx_places_kind', target: 'places', sql: 'CREATE INDEX IF NOT EXISTS idx_places_kind ON places(kind)' },
  { name: 'idx_places_country', target: 'places', sql: 'CREATE INDEX IF NOT EXISTS idx_places_country ON places(country_code)' },
  { name: 'idx_places_wikidata', target: 'places', sql: 'CREATE INDEX IF NOT EXISTS idx_places_wikidata ON places(wikidata_qid)' },
  { name: 'idx_places_crawl_depth', target: 'places', sql: 'CREATE INDEX IF NOT EXISTS idx_places_crawl_depth ON places(crawl_depth)' },
  { name: 'idx_places_priority', target: 'places', sql: 'CREATE INDEX IF NOT EXISTS idx_places_priority ON places(priority_score DESC)' },
  { name: 'idx_places_source', target: 'places', sql: 'CREATE INDEX IF NOT EXISTS idx_places_source ON places(source)' },
  
  // place_names indexes
  { name: 'idx_place_names_place', target: 'place_names', sql: 'CREATE INDEX IF NOT EXISTS idx_place_names_place ON place_names(place_id)' },
  { name: 'idx_place_names_name', target: 'place_names', sql: 'CREATE INDEX IF NOT EXISTS idx_place_names_name ON place_names(name)' },
  { name: 'idx_place_names_norm', target: 'place_names', sql: 'CREATE INDEX IF NOT EXISTS idx_place_names_norm ON place_names(normalized)' },
  { name: 'idx_place_names_lang', target: 'place_names', sql: 'CREATE INDEX IF NOT EXISTS idx_place_names_lang ON place_names(lang)' },
  { name: 'uniq_place_names', target: 'place_names', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_place_names ON place_names(place_id, normalized, lang, name_kind)' },
  
  // place_hierarchy indexes
  { name: 'idx_place_hierarchy_parent', target: 'place_hierarchy', sql: 'CREATE INDEX IF NOT EXISTS idx_place_hierarchy_parent ON place_hierarchy(parent_id)' },
  { name: 'idx_place_hierarchy_child', target: 'place_hierarchy', sql: 'CREATE INDEX IF NOT EXISTS idx_place_hierarchy_child ON place_hierarchy(child_id)' },
  
  // place_external_ids indexes
  { name: 'idx_place_external_ids_place', target: 'place_external_ids', sql: 'CREATE INDEX IF NOT EXISTS idx_place_external_ids_place ON place_external_ids(place_id)' },
  { name: 'idx_place_external_ids_source', target: 'place_external_ids', sql: 'CREATE INDEX IF NOT EXISTS idx_place_external_ids_source ON place_external_ids(source, ext_id)' },
  
  // place_attribute_values indexes
  { name: 'idx_place_attr_values_place', target: 'place_attribute_values', sql: 'CREATE INDEX IF NOT EXISTS idx_place_attr_values_place ON place_attribute_values(place_id)' },
  
  // place_provenance indexes
  { name: 'idx_place_provenance_place', target: 'place_provenance', sql: 'CREATE INDEX IF NOT EXISTS idx_place_provenance_place ON place_provenance(place_id)' },
  { name: 'idx_place_provenance_source', target: 'place_provenance', sql: 'CREATE INDEX IF NOT EXISTS idx_place_provenance_source ON place_provenance(source)' },
  
  // topic_keywords indexes
  { name: 'idx_topic_keywords_topic', target: 'topic_keywords', sql: 'CREATE INDEX IF NOT EXISTS idx_topic_keywords_topic ON topic_keywords(topic)' },
  { name: 'idx_topic_keywords_norm', target: 'topic_keywords', sql: 'CREATE INDEX IF NOT EXISTS idx_topic_keywords_norm ON topic_keywords(normalized)' }
];

// ─────────────────────────────────────────────────────────────────────────────
// Trigger Definitions
// ─────────────────────────────────────────────────────────────────────────────

const TRIGGER_DEFINITIONS = [
  {
    name: 'trg_place_names_nonempty_ins',
    target: 'place_names',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_place_names_nonempty_ins
      BEFORE INSERT ON place_names
      WHEN NEW.name IS NULL OR trim(NEW.name) = ''
      BEGIN SELECT RAISE(ABORT, 'place_names.name must be non-empty'); END`
  },
  {
    name: 'trg_place_names_nonempty_upd',
    target: 'place_names',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_place_names_nonempty_upd
      BEFORE UPDATE ON place_names
      WHEN NEW.name IS NULL OR trim(NEW.name) = ''
      BEGIN SELECT RAISE(ABORT, 'place_names.name must be non-empty'); END`
  },
  {
    name: 'trg_place_names_delete_clear_canonical',
    target: 'place_names',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_place_names_delete_clear_canonical
      AFTER DELETE ON place_names
      BEGIN UPDATE places SET canonical_name_id = NULL WHERE canonical_name_id = OLD.id; END`
  },
  {
    name: 'trg_places_updated_at',
    target: 'places',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_places_updated_at
      AFTER UPDATE ON places
      BEGIN UPDATE places SET updated_at = datetime('now') WHERE id = NEW.id; END`
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// Target Sets for Filtering
// ─────────────────────────────────────────────────────────────────────────────

const GAZETTEER_TARGETS = new Set([
  'places',
  'place_names',
  'place_hierarchy',
  'place_sources',
  'place_external_ids',
  'place_attribute_values',
  'place_attributes',
  'place_provenance',
  'ingestion_runs',
  'gazetteer_crawl_state',
  'topic_keywords',
  'crawl_skip_terms',
  'domain_locales'
]);

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  TABLE_DEFINITIONS,
  INDEX_DEFINITIONS,
  TRIGGER_DEFINITIONS,
  GAZETTEER_TARGETS
};
