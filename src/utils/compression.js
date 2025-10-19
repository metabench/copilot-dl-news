/**
 * Compression Utility Module
 * 
 * Provides compression and decompression using gzip and brotli at all quality levels.
 * Supports both individual file compression and bucket compression.
 */

const zlib = require('zlib');
const crypto = require('crypto');

/**
 * Compress content using specified algorithm and level
 * 
 * @param {Buffer|string} content - Content to compress
 * @param {Object} options - Compression options
 * @param {string} options.algorithm - 'gzip' | 'brotli' | 'zstd' | 'none'
 * @param {number} options.level - Compression level
 * @param {number} [options.windowBits] - Brotli window size (10-24, default 22)
 * @param {number} [options.blockBits] - Brotli block size (16-24, default auto)
 * @returns {Object} { compressed: Buffer, uncompressedSize: number, compressedSize: number, ratio: number, sha256: string }
 */
function compress(content, options = {}) {
  const { algorithm = 'gzip', level = 6, windowBits, blockBits } = options;
  
  // Handle empty content
  if (content == null || (typeof content === 'string' && content.length === 0) || 
      (Buffer.isBuffer(content) && content.length === 0)) {
    const emptyBuffer = Buffer.alloc(0);
    return {
      compressed: emptyBuffer,
      uncompressedSize: 0,
      compressedSize: 0,
      ratio: 0,
      sha256: crypto.createHash('sha256').update(emptyBuffer).digest('hex')
    };
  }
  
  // Convert string to buffer
  const uncompressedBuffer = Buffer.isBuffer(content) 
    ? content 
    : Buffer.from(content, 'utf8');
  
  const uncompressedSize = uncompressedBuffer.length;
  
  // Calculate SHA256 of uncompressed content
  const sha256 = crypto.createHash('sha256').update(uncompressedBuffer).digest('hex');
  
  let compressedBuffer;
  
  switch (algorithm) {
    case 'none':
      compressedBuffer = uncompressedBuffer;
      break;
      
    case 'gzip':
      compressedBuffer = zlib.gzipSync(uncompressedBuffer, {
        level: Math.max(1, Math.min(9, level))  // Clamp to 1-9
      });
      break;
      
    case 'brotli':
      const brotliParams = {
        [zlib.constants.BROTLI_PARAM_QUALITY]: Math.max(0, Math.min(11, level))  // Clamp to 0-11
      };
      
      // Set window size if specified (LGWIN = log2(window_size))
      if (windowBits) {
        brotliParams[zlib.constants.BROTLI_PARAM_LGWIN] = Math.max(10, Math.min(24, windowBits));
      }
      
      // Set block size if specified (LGBLOCK = log2(block_size))
      if (blockBits) {
        brotliParams[zlib.constants.BROTLI_PARAM_LGBLOCK] = Math.max(16, Math.min(24, blockBits));
      }
      
      // For ultra-high quality (10-11), maximize memory usage
      if (level >= 10) {
        brotliParams[zlib.constants.BROTLI_PARAM_LGWIN] = windowBits || 24;  // 16MB window
        brotliParams[zlib.constants.BROTLI_PARAM_LGBLOCK] = blockBits || 24; // 16MB blocks
        brotliParams[zlib.constants.BROTLI_PARAM_SIZE_HINT] = uncompressedSize; // Hint for better compression
      }
      
      compressedBuffer = zlib.brotliCompressSync(uncompressedBuffer, {
        params: brotliParams
      });
      break;
      
    case 'zstd':
      // Zstd requires external library (@mongodb-js/zstd or zstd-codec)
      // For now, fall back to brotli level 11 as alternative
      console.warn('Zstd compression requires @mongodb-js/zstd package. Falling back to brotli level 11.');
      return compress(content, { algorithm: 'brotli', level: 11, windowBits, blockBits });
      
    default:
      throw new Error(`Unknown compression algorithm: ${algorithm}`);
  }
  
  const compressedSize = compressedBuffer.length;
  const ratio = compressedSize / uncompressedSize;
  
  return {
    compressed: compressedBuffer,
    uncompressedSize,
    compressedSize,
    ratio,
    sha256,
    algorithm,
    level
  };
}

/**
 * Decompress content
 * 
 * @param {Buffer} compressedBuffer - Compressed content
 * @param {string} algorithm - 'gzip' | 'brotli' | 'zstd' | 'none'
 * @returns {Buffer} Decompressed content
 */
function decompress(compressedBuffer, algorithm = 'gzip') {
  if (!Buffer.isBuffer(compressedBuffer)) {
    throw new Error('Compressed content must be a Buffer');
  }
  
  switch (algorithm) {
    case 'none':
      return compressedBuffer;
      
    case 'gzip':
      return zlib.gunzipSync(compressedBuffer);
      
    case 'brotli':
      return zlib.brotliDecompressSync(compressedBuffer);
      
    case 'zstd':
      console.warn('Zstd decompression requires @mongodb-js/zstd package. Cannot decompress.');
      throw new Error('Zstd decompression not available');
      
    default:
      throw new Error(`Unknown compression algorithm: ${algorithm}`);
  }
}

/**
 * Get compression type from database by name
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} name - Compression type name (e.g., 'brotli_11')
 * @returns {Object} Compression type record
 */
function getCompressionType(db, name) {
  const type = db.prepare(`
    SELECT * FROM compression_types WHERE name = ?
  `).get(name);
  
  if (!type) {
    throw new Error(`Unknown compression type: ${name}`);
  }
  
  return type;
}

/**
 * Select optimal compression type based on content size and use case
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} contentSize - Size of uncompressed content in bytes
 * @param {string} useCase - 'realtime' | 'fast_compression' | 'balanced' | 'high_quality' | 'max_compression' | 'archival'
 * @returns {Object} Recommended compression type
 */
function selectCompressionType(db, contentSize, useCase = 'balanced') {
  // Size-based heuristics
  if (contentSize < 1024) {
    // Very small files: no compression
    return getCompressionType(db, 'none');
  }
  
  if (contentSize < 10 * 1024) {
    // Small files (< 10KB): fast compression
    if (useCase === 'max_compression' || useCase === 'archival') {
      return getCompressionType(db, 'brotli_6');
    }
    return getCompressionType(db, 'gzip_6');
  }
  
  if (contentSize < 100 * 1024) {
    // Medium files (10KB-100KB): balanced compression
    switch (useCase) {
      case 'realtime':
      case 'fast_compression':
        return getCompressionType(db, 'gzip_3');
      case 'balanced':
        return getCompressionType(db, 'brotli_6');
      case 'high_quality':
        return getCompressionType(db, 'brotli_9');
      case 'max_compression':
      case 'archival':
        return getCompressionType(db, 'brotli_11');
      default:
        return getCompressionType(db, 'brotli_6');
    }
  }
  
  // Large files (> 100KB): high compression worthwhile
  switch (useCase) {
    case 'realtime':
      return getCompressionType(db, 'gzip_1');
    case 'fast_compression':
      return getCompressionType(db, 'brotli_4');
    case 'balanced':
      return getCompressionType(db, 'brotli_6');
    case 'high_quality':
      return getCompressionType(db, 'brotli_9');
    case 'max_compression':
      return getCompressionType(db, 'brotli_10');
    case 'archival':
      return getCompressionType(db, 'brotli_11');
    default:
      return getCompressionType(db, 'brotli_6');
  }
}

/**
 * Compress and store content in database
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {Buffer|string} content - Content to compress and store
 * @param {Object} options - Storage options
 * @param {string} [options.compressionType] - Explicit compression type name
 * @param {string} [options.useCase] - Use case for automatic selection
 * @returns {Object} { contentId, compressionType, ratio, ... }
 */
function compressAndStore(db, content, options = {}) {
  const { compressionType, useCase = 'balanced', httpResponseId } = options;
  
  // Select compression type
  const type = compressionType 
    ? getCompressionType(db, compressionType)
    : selectCompressionType(db, Buffer.byteLength(content), useCase);
  
  // Compress
  const result = compress(content, {
    algorithm: type.algorithm,
    level: type.level,
    windowBits: type.window_bits,
    blockBits: type.block_bits
  });
  
  // Store in content_storage
  const insertResult = db.prepare(`
    INSERT INTO content_storage (
      http_response_id,
      storage_type,
      compression_type_id,
      content_blob,
      content_sha256,
      uncompressed_size,
      compressed_size,
      compression_ratio
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `).get(
    httpResponseId || null,
    type.algorithm === 'none' ? 'db_inline' : 'db_compressed',
    type.id,
    result.compressed,
    result.sha256,
    result.uncompressedSize,
    result.compressedSize,
    result.ratio
  );
  
  return {
    contentId: insertResult.id,
    compressionType: type.name,
    algorithm: type.algorithm,
    level: type.level,
    uncompressedSize: result.uncompressedSize,
    compressedSize: result.compressedSize,
    ratio: result.ratio,
    sha256: result.sha256
  };
}

/**
 * Retrieve and decompress content from database
 * 
 * @param {Database} db - better-sqlite3 database instance
 * @param {number} contentId - Content storage ID
 * @returns {Buffer} Decompressed content
 */
function retrieveAndDecompress(db, contentId) {
  const content = db.prepare(`
    SELECT cs.content_blob, ct.algorithm
    FROM content_storage cs
    JOIN compression_types ct ON cs.compression_type_id = ct.id
    WHERE cs.id = ?
  `).get(contentId);
  
  if (!content) {
    throw new Error(`Content not found: ${contentId}`);
  }
  
  return decompress(content.content_blob, content.algorithm);
}

module.exports = {
  compress,
  decompress,
  getCompressionType,
  selectCompressionType,
  compressAndStore,
  retrieveAndDecompress
};
