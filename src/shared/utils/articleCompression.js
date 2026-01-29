/**
 * Article Compression Utilities
 * 
 * Helper functions for compressing and decompressing article HTML content
 * Supports both individual compression and compression bucket storage
 * 
 * Uses CompressionFacade for all compression operations, ensuring consistent
 * algorithm validation, preset definitions, and stats calculation.
 */

const {
  compress,
  decompress,
  getCompressionType,
  getCompressionConfigPreset,
  resolvePresetName,
  createStatsObject,
  PRESETS
} = require('./CompressionFacade');
const { retrieveFromBucket } = require('./compressionBuckets');
const { getGlobalCache } = require('./bucketCache');

/**
 * Decompress article HTML (supports both individual and bucket compression)
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} articleId - Article ID
 * @param {Object} options - Decompression options
 * @param {boolean} [options.useCache] - Use bucket cache for bucket-compressed articles
 * @returns {Promise<string|null>} Decompressed HTML content
 */
async function decompressArticleHtml(db, articleId, options = {}) {
  const { useCache = true } = options;
  
  try {
    const article = db.prepare(`
      SELECT 
        compressed_html,
        compression_type_id,
        compression_bucket_id,
        compression_bucket_key,
        html
      FROM articles
      WHERE id = ?
    `).get(articleId);
    
    if (!article) {
      return null;
    }
    
    // If stored in compression bucket
    if (article.compression_bucket_id && article.compression_bucket_key) {
      const cache = useCache ? getGlobalCache() : null;
      const cachedTarBuffer = cache ? cache.get(db, article.compression_bucket_id).tarBuffer : null;
      
      const result = await retrieveFromBucket(
        db,
        article.compression_bucket_id,
        article.compression_bucket_key,
        cachedTarBuffer
      );
      
      return result.content.toString('utf8');
    }
    
    // If stored individually compressed
    if (article.compressed_html && article.compression_type_id) {
      const compressionType = db.prepare(
        'SELECT algorithm FROM compression_types WHERE id = ?'
      ).get(article.compression_type_id);
      
      if (!compressionType) {
        throw new Error(`Compression type not found: ${article.compression_type_id}`);
      }
      
      const decompressed = decompress(article.compressed_html, compressionType.algorithm);
      return decompressed.toString('utf8');
    }
    
    // Not compressed, return original
    return article.html;
    
  } catch (error) {
    console.error(`[articleCompression] Error decompressing article ${articleId}:`, error);
    throw error;
  }
}

/**
 * Compress article HTML and store it (individual compression only for now)
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} articleId - Article ID
 * @param {Object} options - Compression options
 * @param {string} [options.preset] - Compression preset name (default: PRESETS.BROTLI_6)
 *                                    Or use legacy format: { compressionType: 'brotli_10' }
 * @returns {Object} Compression result with statistics
 */
function compressAndStoreArticleHtml(db, articleId, options = {}) {
  // Support both new preset API and legacy compressionType API
  const presetInput = options.preset || options.compressionType || PRESETS.BROTLI_6;
  const presetName = resolvePresetName(presetInput);

  if (!presetName) {
    throw new Error(`Unknown compression preset: ${presetInput}`);
  }

  try {
    // Get article HTML
    const article = db.prepare('SELECT html FROM articles WHERE id = ?').get(articleId);

    if (!article || !article.html) {
      throw new Error(`Article ${articleId} not found or has no HTML`);
    }

    // Get compression type from database
    const compressionType = getCompressionType(db, presetName);
    if (!compressionType) {
      throw new Error(`Compression type not found: ${presetName}`);
    }

    // Align with configuration defaults to keep bucket + article flows consistent
    const presetConfig = getCompressionConfigPreset(presetName);

    // Compress HTML using CompressionFacade
    const result = compress(article.html, {
      preset: presetName,
      windowBits: compressionType.window_bits ?? presetConfig?.windowBits ?? undefined,
      blockBits: compressionType.block_bits ?? presetConfig?.blockBits ?? undefined
    });

    const stats = createStatsObject({
      ...result,
      preset: presetName
    });

    // Store compressed HTML
    db.prepare(`
      UPDATE articles
      SET compressed_html = ?,
          compression_type_id = ?,
          original_size = ?,
          compressed_size = ?,
          compression_ratio = ?
      WHERE id = ?
    `).run(
      result.compressed,
      compressionType.id,
      stats.uncompressedSize,
      stats.compressedSize,
      stats.ratio,
      articleId
    );

    return {
      articleId,
      compressionType: presetName,
      algorithm: result.algorithm,
      preset: stats.preset,
      originalSize: stats.uncompressedSize,
      compressedSize: stats.compressedSize,
      ratio: stats.ratio,
      spaceSaved: stats.uncompressedSize - stats.compressedSize,
      spaceSavedPercent: stats.uncompressedSize > 0 ? (1 - stats.ratio) * 100 : 0,
      sha256: result.sha256,
      timestamp: stats.timestamp
    };
  } catch (error) {
    console.error(`[articleCompression] Error compressing article ${articleId}:`, error);
    throw error;
  }
}


/**
 * Get compression status for an article
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} articleId - Article ID
 * @returns {Object|null} Compression status
 */
function getArticleCompressionStatus(db, articleId) {
  try {
    const article = db.prepare(`
      SELECT 
        id,
        compressed_html IS NOT NULL as is_individually_compressed,
        compression_bucket_id IS NOT NULL as is_bucket_compressed,
        compression_type_id,
        compression_bucket_id,
        compression_bucket_key,
        original_size,
        compressed_size,
        compression_ratio
      FROM articles
      WHERE id = ?
    `).get(articleId);
    
    if (!article) {
      return null;
    }
    
    let compressionType = null;
    if (article.compression_type_id) {
      const typeRow = db.prepare('SELECT name FROM compression_types WHERE id = ?')
        .get(article.compression_type_id);
      compressionType = typeRow ? typeRow.name : null;
    }
    
    return {
      articleId: article.id,
      isCompressed: article.is_individually_compressed || article.is_bucket_compressed,
      method: article.is_bucket_compressed ? 'bucket' : 
              article.is_individually_compressed ? 'individual' : 'uncompressed',
      compressionType,
      bucketId: article.compression_bucket_id,
      bucketKey: article.compression_bucket_key,
      originalSize: article.original_size,
      compressedSize: article.compressed_size,
      compressionRatio: article.compression_ratio,
      spaceSaved: article.original_size && article.compressed_size 
        ? article.original_size - article.compressed_size 
        : null,
      spaceSavedPercent: article.compression_ratio 
        ? (1 - article.compression_ratio) * 100 
        : null
    };
    
  } catch (error) {
    console.error(`[articleCompression] Error getting compression status for article ${articleId}:`, error);
    return null;
  }
}

module.exports = {
  decompressArticleHtml,
  compressAndStoreArticleHtml,
  getArticleCompressionStatus
};
