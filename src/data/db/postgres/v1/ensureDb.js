'use strict';

const { TABLE_STATEMENTS, INDEX_STATEMENTS, VIEW_STATEMENTS } = require('./schema-definitions');

const COMPRESSION_TYPES = [
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

async function seedCompressionTypes(client) {
  const sql = `
    INSERT INTO compression_types (
      name, algorithm, level, mime_type, extension,
      memory_mb, window_bits, block_bits, description
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (name) DO NOTHING
  `;

  for (const type of COMPRESSION_TYPES) {
    await client.query(sql, [
      type.name,
      type.algorithm,
      type.level,
      type.mime_type,
      type.extension,
      type.memory_mb,
      type.window_bits || null,
      type.block_bits || null,
      type.description
    ]);
  }
}

async function ensureDb(pool, options = {}) {
  const { logger = console, verbose = false } = options;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Tables
    if (verbose) logger.log('[postgres] Applying tables...');
    for (const sql of TABLE_STATEMENTS) {
      await client.query(sql);
    }

    // 2. Indexes
    if (verbose) logger.log('[postgres] Applying indexes...');
    for (const sql of INDEX_STATEMENTS) {
      await client.query(sql);
    }

    // 3. Views
    if (verbose) logger.log('[postgres] Applying views...');
    for (const sql of VIEW_STATEMENTS) {
      await client.query(sql);
    }

    // 4. Seed Data
    if (verbose) logger.log('[postgres] Seeding compression types...');
    await seedCompressionTypes(client);

    await client.query('COMMIT');
    if (verbose) logger.log('[postgres] Schema initialization complete.');

    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[postgres] Schema initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { ensureDb };
