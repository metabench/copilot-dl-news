'use strict';

const {
  TABLE_DEFINITIONS,
  INDEX_DEFINITIONS,
  TRIGGER_DEFINITIONS
} = require('./schema-definitions');

const DEFAULT_LOGGER = console;

function unionSets(...sets) {
  const result = new Set();
  for (const set of sets) {
    for (const value of set) {
      result.add(value);
    }
  }
  return result;
}

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

const PLACE_HUB_TARGETS = new Set([
  'place_hubs',
  'place_page_mappings',
  'place_hub_candidates',
  'place_hub_unknown_terms',
  'place_hub_determinations',
  'place_hub_guess_runs',
  'hub_discoveries',
  'hub_validations',
  'knowledge_reuse_events',
  'problem_clusters',
  'priority_config_changes',
  'planner_patterns',
  'planner_stage_events',
  'coverage_gaps',
  'coverage_snapshots',
  'dashboard_metrics',
  'queue_events',
  'queue_events_enhanced',
  'milestone_achievements',
  'place_hub_audit'
]);

const COMPRESSION_TARGETS = new Set([
  'compression_buckets',
  'compression_status',
  'compression_types',
  'classification_types',
  'content_analysis',
  'content_storage',
  'bucket_entries'
]);

const BACKGROUND_TASK_TARGETS = new Set(['background_tasks']);

const NON_CORE_TARGETS = unionSets(
  GAZETTEER_TARGETS,
  PLACE_HUB_TARGETS,
  COMPRESSION_TARGETS,
  BACKGROUND_TASK_TARGETS
);

function normalizeOptions(options = {}) {
  const { verbose = false, logger = DEFAULT_LOGGER } = options;
  return { verbose, logger };
}

function filterDefinitions(definitions, { include, exclude }) {
  return definitions.filter((definition) => {
    if (include && include.size > 0) {
      return include.has(definition.target);
    }
    if (exclude && exclude.size > 0) {
      return !exclude.has(definition.target);
    }
    return true;
  });
}

function runStatements(db, statements, type, ctx) {
  const { verbose, logger } = ctx;
  for (const { name, sql } of statements) {
    try {
      db.exec(sql);
      if (verbose) {
        logger.log(`[schema]     ${type}: ${name}`);
      }
    } catch (error) {
      throw new Error(`${type} "${name}" failed: ${error.message}`);
    }
  }
}

function replaySubset(db, label, definitions, ctx) {
  const { verbose, logger } = ctx;
  const tables = definitions.tables || [];
  const indexes = definitions.indexes || [];
  const triggers = definitions.triggers || [];

  if (verbose) {
    logger.log(`[schema] Applying ${label} statements...`);
  }

  const apply = db.transaction(() => {
    runStatements(db, tables, 'table', ctx);
    runStatements(db, indexes, 'index', ctx);
    runStatements(db, triggers, 'trigger', ctx);
  });

  apply();

  if (verbose) {
    logger.log(
      `[schema] \u2713 ${label} applied (${tables.length} tables, ${indexes.length} indexes, ${triggers.length} triggers)`
    );
  }
}

function initCoreTables(db, options = {}) {
  const ctx = normalizeOptions(options);
  replaySubset(
    db,
    'core schema blueprint',
    {
      tables: filterDefinitions(TABLE_DEFINITIONS, { exclude: NON_CORE_TARGETS }),
      indexes: filterDefinitions(INDEX_DEFINITIONS, { exclude: NON_CORE_TARGETS }),
      triggers: filterDefinitions(TRIGGER_DEFINITIONS, { exclude: NON_CORE_TARGETS })
    },
    ctx
  );
}

function initGazetteerTables(db, options = {}) {
  const ctx = normalizeOptions(options);
  replaySubset(
    db,
    'gazetteer schema blueprint',
    {
      tables: filterDefinitions(TABLE_DEFINITIONS, { include: GAZETTEER_TARGETS }),
      indexes: filterDefinitions(INDEX_DEFINITIONS, { include: GAZETTEER_TARGETS }),
      triggers: filterDefinitions(TRIGGER_DEFINITIONS, { include: GAZETTEER_TARGETS })
    },
    ctx
  );
}

function initPlaceHubsTables(db, options = {}) {
  const ctx = normalizeOptions(options);
  const tables = filterDefinitions(TABLE_DEFINITIONS, { include: PLACE_HUB_TARGETS });
  const indexes = filterDefinitions(INDEX_DEFINITIONS, { include: PLACE_HUB_TARGETS });
  const triggers = filterDefinitions(TRIGGER_DEFINITIONS, { include: PLACE_HUB_TARGETS });

  replaySubset(
    db,
    'place hub schema blueprint',
    {
      tables,
      indexes,
      triggers
    },
    ctx
  );
}

function initCompressionTables(db, options = {}) {
  const ctx = normalizeOptions(options);
  replaySubset(
    db,
    'compression schema blueprint',
    {
      tables: filterDefinitions(TABLE_DEFINITIONS, { include: COMPRESSION_TARGETS }),
      indexes: filterDefinitions(INDEX_DEFINITIONS, { include: COMPRESSION_TARGETS }),
      triggers: filterDefinitions(TRIGGER_DEFINITIONS, { include: COMPRESSION_TARGETS })
    },
    ctx
  );

  seedCompressionTypes(db, ctx);
}

function initBackgroundTasksTables(db, options = {}) {
  const ctx = normalizeOptions(options);
  replaySubset(
    db,
    'background task schema blueprint',
    {
      tables: filterDefinitions(TABLE_DEFINITIONS, { include: BACKGROUND_TASK_TARGETS }),
      indexes: filterDefinitions(INDEX_DEFINITIONS, { include: BACKGROUND_TASK_TARGETS })
    },
    ctx
  );
}

function initViews(db, options = {}) {
  const ctx = normalizeOptions(options);
  const { verbose, logger } = ctx;

  try {
    if (verbose) {
      logger.log('[schema] Dropping legacy compatibility views...');
    }
    db.exec(`
      DROP VIEW IF EXISTS articles_view;
      DROP VIEW IF EXISTS fetches_view;
      DROP VIEW IF EXISTS places_view;
    `);
    if (verbose) {
      logger.log('[schema] \u2713 Legacy views removed');
    }
  } catch (error) {
    logger.warn(`[schema] Failed to drop legacy views: ${error.message}`);
  }
}

function initializeSchema(db, options = {}) {
  const ctx = normalizeOptions(options);
  const { verbose, logger } = ctx;

  if (verbose) {
    logger.log('[schema] Initializing database schema...');
  }

  const run = (label, fn) => {
    try {
      fn();
      return { success: true };
    } catch (error) {
      logger.error(`[schema] \u2717 Failed to initialize ${label}:`, error.message);
      return { success: false, error: error.message };
    }
  };

  const results = {
    coreTables: run('Core Tables', () => initCoreTables(db, ctx)),
    gazetteer: run('Gazetteer', () => initGazetteerTables(db, ctx)),
    placeHubs: run('Place Hubs', () => initPlaceHubsTables(db, ctx)),
    compression: run('Compression', () => initCompressionTables(db, ctx)),
    backgroundTasks: run('Background Tasks', () => initBackgroundTasksTables(db, ctx)),
    views: run('Views', () => initViews(db, ctx))
  };

  if (verbose) {
    logger.log('[schema] Schema initialization complete.');
    const failed = Object.entries(results).filter(([, result]) => !result.success);
    if (failed.length > 0) {
      logger.warn(`[schema] ${failed.length} schema section(s) failed: ${failed.map(([name]) => name).join(', ')}`);
    }
  }

  return results;
}

function seedCompressionTypes(db, ctx) {
  const { verbose, logger } = ctx;
  if (verbose) {
    logger.log('[schema] Seeding compression types...');
  }

  const compressionTypes = [
    { name: 'none', algorithm: 'none', level: 0, mime_type: null, extension: null, memory_mb: 0, description: 'No compression' },
    { name: 'gzip_1', algorithm: 'gzip', level: 1, mime_type: 'application/gzip', extension: '.gz', memory_mb: 1, description: 'Gzip fast (level 1)' },
    { name: 'gzip_3', algorithm: 'gzip', level: 3, mime_type: 'application/gzip', extension: '.gz', memory_mb: 2, description: 'Gzip balanced (level 3)' },
    { name: 'gzip_6', algorithm: 'gzip', level: 6, mime_type: 'application/gzip', extension: '.gz', memory_mb: 4, description: 'Gzip standard (level 6)' },
    { name: 'gzip_9', algorithm: 'gzip', level: 9, mime_type: 'application/gzip', extension: '.gz', memory_mb: 8, description: 'Gzip maximum (level 9)' },
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

module.exports = {
  initializeSchema,
  initCoreTables,
  initGazetteerTables,
  initPlaceHubsTables,
  initCompressionTables,
  initBackgroundTasksTables,
  initViews
};
