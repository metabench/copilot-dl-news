/**
 * Compression Buckets Module
 * 
 * Manages compression buckets that store multiple similar files in a single compressed archive.
 * Uses tar format for packaging and applies compression algorithms (gzip/brotli) to the entire archive.
 * 
 * Uses CompressionFacade for all compression operations, ensuring consistent algorithm
 * validation, preset definitions, and stats calculation across bucket operations.
 */

const tar = require('tar-stream');
const {
  compress,
  decompress,
  getCompressionType,
  getCompressionConfigPreset,
  resolvePresetName,
  createStatsObject,
  PRESETS
} = require('./CompressionFacade');
// c209 (ncdb-debt ratchet): the compression_buckets SQL lives in
// news-crawler-db now, so the bucket schema has one home. This module keeps
// all tar/compression logic; only table access moved.
const {
  insertCompressionBucket,
  getCompressionBucketBlob,
  getCompressionBucketIndex,
  getCompressionBucketStats,
  finalizeCompressionBucket,
  countContentStorageForBucket,
  deleteCompressionBucket,
  queryCompressionBuckets
} = require('news-crawler-db');

/**
 * Create a compression bucket from multiple items
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {Object} options - Bucket creation options
 * @param {string} options.bucketType - Type of bucket ('article_content', 'http_body', 'analysis_results', etc.)
 * @param {string} [options.domainPattern] - Optional domain pattern for grouping
 * @param {string} [options.compressionType=PRESETS.BROTLI_11] - Compression type name
 * @param {Array<Object>} options.items - Items to add to bucket
 * @param {string} options.items[].key - Unique key for this item (e.g., SHA256 or article ID)
 * @param {Buffer|string} options.items[].content - Content to store
 * @param {Object} [options.items[].metadata] - Optional metadata (stored in index)
 * @returns {Object} { bucketId, compressionType, algorithm, itemCount, uncompressedSize, compressedSize, ratio, tarArchiveSize }
 */
function createBucket(db, options) {
  return new Promise((resolve, reject) => {
    try {
      const { bucketType, domainPattern, compressionType = PRESETS.BROTLI_11, items } = options;

      if (!items || items.length === 0) {
        return reject(new Error('Cannot create empty bucket'));
      }

      const presetName = resolvePresetName(compressionType);
      if (!presetName) {
        return reject(new Error(`Unknown compression preset: ${compressionType}`));
      }

      const type = getCompressionType(db, presetName);
      if (!type) {
        return reject(new Error(`Compression type not found: ${presetName}`));
      }

      const pack = tar.pack();
      const chunks = [];

      let aggregatedContentSize = 0;
      const index = {};

      for (const item of items) {
        const { key, content, metadata } = item;

        if (!key) {
          return reject(new Error('Each item must have a key'));
        }

        if (index[key]) {
          return reject(new Error(`Duplicate key found: ${key}`));
        }

        const buffer = Buffer.isBuffer(content)
          ? content
          : Buffer.from(content, 'utf8');

        aggregatedContentSize += buffer.length;

        const filename = sanitizeFilename(key);
        pack.entry({ name: filename, size: buffer.length }, buffer);

        index[key] = {
          filename,
          size: buffer.length,
          offset: null,
          metadata: metadata || null
        };
      }

      pack.finalize();

      const closePack = () => {
        pack.removeAllListeners();
        if (typeof pack.destroy === 'function') {
          try {
            pack.destroy();
          } catch (_) {
            // Ignore errors; stream may already be closed
          }
        }
      };

      pack.on('data', (chunk) => chunks.push(chunk));

      pack.on('end', () => {
        try {
          const tarBuffer = Buffer.concat(chunks);
          const presetConfig = getCompressionConfigPreset(presetName);
          const result = compress(tarBuffer, {
            preset: presetName,
            windowBits: type.window_bits ?? presetConfig?.windowBits ?? undefined,
            blockBits: type.block_bits ?? presetConfig?.blockBits ?? undefined
          });

          const stats = createStatsObject({
            ...result,
            preset: presetName,
            uncompressedSize: aggregatedContentSize
          });

          const insertResult = insertCompressionBucket(db, {
            bucketType,
            domainPattern: domainPattern || null,
            compressionTypeId: type.id,
            bucketBlob: result.compressed,
            contentCount: items.length,
            uncompressedSize: stats.uncompressedSize,
            compressedSize: stats.compressedSize,
            compressionRatio: stats.ratio,
            indexJson: JSON.stringify(index)
          });

          resolve({
            bucketId: insertResult.id,
            compressionType: presetName,
            algorithm: result.algorithm,
            itemCount: items.length,
            uncompressedSize: stats.uncompressedSize,
            compressedSize: stats.compressedSize,
            ratio: stats.ratio,
            tarArchiveSize: result.uncompressedSize
          });
        } catch (error) {
          reject(error);
        } finally {
          closePack();
          chunks.length = 0;
        }
      });

      pack.on('error', (err) => {
        closePack();
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}


/**
 * Retrieve an item from a compression bucket
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} bucketId - Bucket ID
 * @param {string} entryKey - Entry key to retrieve
 * @param {Buffer} [cachedTarBuffer] - Optional cached decompressed tar buffer (for performance)
 * @returns {Object} { content: Buffer, metadata: Object }
 */
async function retrieveFromBucket(db, bucketId, entryKey, cachedTarBuffer = null) {
  // Fetch bucket metadata
  const bucket = getCompressionBucketBlob(db, bucketId);
  
  if (!bucket) {
    throw new Error(`Bucket not found: ${bucketId}`);
  }
  
  // Parse index (with error handling)
  let index;
  try {
    index = JSON.parse(bucket.index_json);
  } catch (error) {
    throw new Error(`Corrupted bucket index for bucket ${bucketId}: ${error.message}`);
  }
  
  const entry = index[entryKey];
  
  if (!entry) {
    throw new Error(`Entry not found in bucket: ${entryKey}`);
  }
  
  // Decompress tar (use cached buffer if available)
  const tarBuffer = cachedTarBuffer || decompress(bucket.bucket_blob, bucket.algorithm);
  
  // Extract specific file from tar
  return new Promise((resolve, reject) => {
    const extract = tar.extract();
    let matchedContent = null;
    let encounteredError = false;

    const closeExtract = () => {
      extract.removeAllListeners();
      if (typeof extract.destroy === 'function') {
        try {
          extract.destroy();
        } catch (_) {
          // Stream already closed
        }
      }
    };

    extract.on('entry', (header, stream, next) => {
      const chunks = [];
      const isMatch = header.name === entry.filename;

      stream.on('data', (chunk) => {
        if (isMatch) {
          chunks.push(chunk);
        }
      });

      stream.on('end', () => {
        if (isMatch) {
          matchedContent = Buffer.concat(chunks);
        }
        next();
      });

      stream.on('error', (error) => {
        encounteredError = true;
        closeExtract();
        reject(error);
      });

      stream.resume();
    });

    extract.on('finish', () => {
      if (encounteredError) {
        closeExtract();
        return;
      }
      if (!matchedContent) {
        closeExtract();
        reject(new Error(`Entry file not found in tar: ${entry.filename}`));
        return;
      }
      closeExtract();
      resolve({
        content: matchedContent,
        metadata: entry.metadata
      });
    });

    extract.on('error', (error) => {
      encounteredError = true;
      closeExtract();
      reject(error);
    });

    // Write tar buffer to extract stream
    extract.end(tarBuffer);
  });
}

/**
 * List all entries in a compression bucket
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} bucketId - Bucket ID
 * @returns {Array<Object>} Array of { key, filename, size, metadata }
 */
function listBucketEntries(db, bucketId) {
  const bucket = getCompressionBucketIndex(db, bucketId);
  
  if (!bucket) {
    throw new Error(`Bucket not found: ${bucketId}`);
  }
  
  const index = JSON.parse(bucket.index_json);
  
  return Object.entries(index).map(([key, entry]) => ({
    key,
    filename: entry.filename,
    size: entry.size,
    metadata: entry.metadata
  }));
}

/**
 * Get compression bucket statistics
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} bucketId - Bucket ID
 * @returns {Object} Bucket statistics
 */
function getBucketStats(db, bucketId) {
  const bucket = getCompressionBucketStats(db, bucketId);
  
  if (!bucket) {
    throw new Error(`Bucket not found: ${bucketId}`);
  }
  
  return bucket;
}

/**
 * Finalize a compression bucket (mark as immutable)
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} bucketId - Bucket ID
 */
function finalizeBucket(db, bucketId) {
  const changes = finalizeCompressionBucket(db, bucketId);

  if (changes === 0) {
    throw new Error(`Bucket not found or already finalized: ${bucketId}`);
  }
}

/**
 * Delete a compression bucket
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} bucketId - Bucket ID
 */
function deleteBucket(db, bucketId) {
  // Check if any content_storage rows reference this bucket
  const referenceCount = countContentStorageForBucket(db, bucketId);

  if (referenceCount > 0) {
    throw new Error(`Cannot delete bucket: ${referenceCount} content_storage rows reference it`);
  }

  const changes = deleteCompressionBucket(db, bucketId);

  if (changes === 0) {
    throw new Error(`Bucket not found: ${bucketId}`);
  }
}

/**
 * Sanitize filename for tar entry (remove path separators, special chars)
 * 
 * @param {string} key - Original key
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(key) {
  return key
    .replace(/[\/\\]/g, '_')  // Replace path separators
    .replace(/[^a-zA-Z0-9._-]/g, '_')  // Replace special chars
    .substring(0, 255);  // Limit length
}

/**
 * Query compression buckets by type or domain pattern
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {Object} filters - Query filters
 * @param {string} [filters.bucketType] - Filter by bucket type
 * @param {string} [filters.domainPattern] - Filter by domain pattern
 * @param {boolean} [filters.finalizedOnly] - Only return finalized buckets
 * @param {number} [filters.limit] - Limit results
 * @returns {Array<Object>} Array of bucket records
 */
function queryBuckets(db, filters = {}) {
  return queryCompressionBuckets(db, filters);
}

module.exports = {
  createBucket,
  retrieveFromBucket,
  listBucketEntries,
  getBucketStats,
  finalizeBucket,
  deleteBucket,
  queryBuckets
};
