/**
 * src/config/compression.js
 *
 * Configuration for content compression system.
 * Defines compression tiers, lifecycle settings, and performance parameters.
 */

const compressionConfig = {
  // Compression Tiers (Hot/Warm/Cold strategy)
  tiers: {
    hot: {
      // < 7 days: No compression for fast access
      maxAgeDays: 7,
      compressionType: null, // No compression
      description: 'Hot tier: No compression for fast access'
    },
    warm: {
      // 7-30 days: Balanced compression
      minAgeDays: 7,
      maxAgeDays: 30,
      compressionType: 'brotli_6', // Balanced speed/size
      description: 'Warm tier: Brotli level 6 (balanced)'
    },
    cold: {
      // 30+ days: Maximum compression
      minAgeDays: 30,
      compressionType: 'brotli_11', // Maximum compression
      description: 'Cold tier: Brotli level 11 (maximum compression)'
    }
  },

  // Lifecycle Task Settings
  lifecycle: {
    // How often to run the compression lifecycle task
    scheduleIntervalMs: 24 * 60 * 60 * 1000, // Daily (24 hours)

    // Batch processing settings
    batchSize: 100, // Process 100 items per batch
    maxBatchesPerRun: 10, // Maximum 10 batches per lifecycle run

    // Age calculation settings
    ageCalculationField: 'created_at', // Field to use for age calculation

    // Performance limits
    maxProcessingTimeMs: 30 * 60 * 1000, // 30 minutes max per run
    memoryLimitMB: 512, // Memory limit for compression operations
  },

  // Compression Types Configuration
  types: {
    none: {
      id: 1,
      algorithm: 'none',
      level: 0,
      description: 'No compression'
    },
    gzip_1: {
      id: 2,
      algorithm: 'gzip',
      level: 1,
      description: 'Gzip level 1 (fastest)'
    },
    gzip_3: {
      id: 3,
      algorithm: 'gzip',
      level: 3,
      description: 'Gzip level 3 (balanced)'
    },
    gzip_6: {
      id: 4,
      algorithm: 'gzip',
      level: 6,
      description: 'Gzip level 6 (good compression)'
    },
    gzip_9: {
      id: 5,
      algorithm: 'gzip',
      level: 9,
      description: 'Gzip level 9 (maximum)'
    },
    brotli_0: {
      id: 6,
      algorithm: 'brotli',
      level: 0,
      description: 'Brotli level 0 (fastest)'
    },
    brotli_1: {
      id: 7,
      algorithm: 'brotli',
      level: 1,
      description: 'Brotli level 1'
    },
    brotli_3: {
      id: 8,
      algorithm: 'brotli',
      level: 3,
      description: 'Brotli level 3'
    },
    brotli_4: {
      id: 9,
      algorithm: 'brotli',
      level: 4,
      description: 'Brotli level 4'
    },
    brotli_5: {
      id: 10,
      algorithm: 'brotli',
      level: 5,
      description: 'Brotli level 5'
    },
    brotli_6: {
      id: 11,
      algorithm: 'brotli',
      level: 6,
      description: 'Brotli level 6 (balanced)'
    },
    brotli_7: {
      id: 12,
      algorithm: 'brotli',
      level: 7,
      description: 'Brotli level 7'
    },
    brotli_8: {
      id: 13,
      algorithm: 'brotli',
      level: 8,
      description: 'Brotli level 8'
    },
    brotli_9: {
      id: 14,
      algorithm: 'brotli',
      level: 9,
      description: 'Brotli level 9'
    },
    brotli_10: {
      id: 15,
      algorithm: 'brotli',
      level: 10,
      description: 'Brotli level 10 (high quality)'
    },
    brotli_11: {
      id: 16,
      algorithm: 'brotli',
      level: 11,
      description: 'Brotli level 11 (maximum)'
    },
    zstd_3: {
      id: 17,
      algorithm: 'zstd',
      level: 3,
      description: 'Zstd level 3 (fast)'
    },
    zstd_19: {
      id: 18,
      algorithm: 'zstd',
      level: 19,
      description: 'Zstd level 19 (maximum)'
    }
  },

  // Default compression settings
  defaults: {
    // Default compression for new content (compress with Brotli 6 by default)
    newContentCompression: 'brotli_6',

    // Default compression for migration/backfill
    migrationCompression: 'brotli_6',

    // Content types that should not be compressed
    skipCompressionTypes: [
      'image/',
      'video/',
      'audio/',
      'application/pdf',
      'application/zip',
      'application/x-compressed'
    ],

    // Minimum content size for compression (bytes)
    minCompressionSize: 1024, // 1KB minimum

    // Maximum content size for compression (bytes)
    maxCompressionSize: 50 * 1024 * 1024, // 50MB maximum
  },

  // Worker Pool Configuration
  workerPool: {
    poolSize: 1, // Start with 1 worker
    brotliQuality: 10, // High quality Brotli
    lgwin: 24, // 256MB window size
    maxQueueSize: 1000, // Maximum queued compression jobs
    timeoutMs: 5 * 60 * 1000, // 5 minute timeout per job
  },

  // Monitoring and Analytics
  monitoring: {
    // Enable compression analytics
    enabled: true,

    // Metrics collection interval
    metricsIntervalMs: 60 * 1000, // Every minute

    // Performance thresholds for alerts
    thresholds: {
      compressionRatioMin: 0.1, // Minimum 10% size reduction
      processingTimeMaxMs: 30 * 1000, // 30 seconds max per item
      errorRateMax: 0.05, // 5% maximum error rate
    },

    // Retention settings
    retention: {
      metricsDays: 30, // Keep metrics for 30 days
      logsDays: 7, // Keep detailed logs for 7 days
    }
  },

  // Feature Flags
  features: {
    // Enable automatic compression during ingestion (now enabled by default)
    autoCompressOnIngest: true,

    // Enable age-based lifecycle compression
    lifecycleCompression: true,

    // Enable compression analytics
    compressionAnalytics: true,

    // Enable background compression tasks
    backgroundCompression: true,

    // Enable compression worker pool
    workerPoolEnabled: true,
  }
};

/**
 * Get compression type configuration by name
 */
function getCompressionType(name) {
  return compressionConfig.types[name] || null;
}

/**
 * Get compression type configuration by ID
 */
function getCompressionTypeById(id) {
  return Object.values(compressionConfig.types).find(type => type.id === id) || null;
}

/**
 * Determine appropriate compression tier for content age
 */
function getTierForAge(ageDays) {
  if (ageDays < compressionConfig.tiers.hot.maxAgeDays) {
    return compressionConfig.tiers.hot;
  } else if (ageDays < compressionConfig.tiers.warm.maxAgeDays) {
    return compressionConfig.tiers.warm;
  } else {
    return compressionConfig.tiers.cold;
  }
}

/**
 * Check if content type should be compressed
 */
function shouldCompressContentType(contentType) {
  if (!contentType) return true;

  return !compressionConfig.defaults.skipCompressionTypes.some(skipType =>
    contentType.toLowerCase().startsWith(skipType.toLowerCase())
  );
}

/**
 * Check if content size is suitable for compression
 */
function shouldCompressContentSize(sizeBytes) {
  return sizeBytes >= compressionConfig.defaults.minCompressionSize &&
         sizeBytes <= compressionConfig.defaults.maxCompressionSize;
}

module.exports = {
  compressionConfig,
  getCompressionType,
  getCompressionTypeById,
  getTierForAge,
  shouldCompressContentType,
  shouldCompressContentSize
};