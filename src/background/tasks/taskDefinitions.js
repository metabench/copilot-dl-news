/**
 * @fileoverview Background Task Parameter Definitions
 * 
 * Defines schemas for task parameters used by the property editor.
 * Each task type has a schema with fields, validation, and defaults.
 */

const { FieldType, validateValues } = require('../../ui/shared/propertyEditor');

/**
 * Task parameter definitions
 * Maps task types to their parameter schemas
 */
const TASK_DEFINITIONS = {
  'article-compression': {
    taskType: 'article-compression',
    title: 'Compress Articles',
    description: 'Compress article content using Brotli compression with configurable quality settings',
    icon: '🗜️',
    fields: [
      {
        name: 'quality',
        label: 'Compression Quality',
        type: FieldType.NUMBER,
        default: 10,
        min: 0,
        max: 11,
        required: true,
        description: 'Brotli quality level (0=fastest, 11=best compression). Recommended: 10-11 for archival'
      },
      {
        name: 'lgwin',
        label: 'Window Size',
        type: FieldType.NUMBER,
        default: 24,
        min: 10,
        max: 24,
        required: true,
        description: 'Logarithm of window size (10-24). Higher = better compression but more memory. Max 24 = 16MB'
      },
      {
        name: 'compressionMethod',
        label: 'Compression Method',
        type: FieldType.SELECT,
        default: 'brotli',
        options: [
          { value: 'brotli', label: 'Brotli (recommended)' },
          { value: 'gzip', label: 'Gzip' },
          { value: 'zstd', label: 'Zstandard' }
        ],
        required: true,
        description: 'Compression algorithm to use'
      },
      {
        name: 'targetArticles',
        label: 'Target Articles',
        type: FieldType.SELECT,
        default: 'uncompressed',
        options: [
          { value: 'uncompressed', label: 'Only uncompressed articles' },
          { value: 'all', label: 'All articles' },
          { value: 'older_than_30d', label: 'Older than 30 days' },
          { value: 'older_than_90d', label: 'Older than 90 days' }
        ],
        required: true,
        description: 'Which articles to compress'
      },
      {
        name: 'batchSize',
        label: 'Batch Size',
        type: FieldType.NUMBER,
        default: 100,
        min: 10,
        max: 1000,
        required: true,
        description: 'Number of articles to process per batch'
      },
      {
        name: 'enableBucketCompression',
        label: 'Enable Bucket Compression',
        type: FieldType.BOOLEAN,
        default: true,
        description: 'Group similar articles for additional compression savings (20x+ ratios possible)'
      }
    ]
  },

  'database-export': {
    taskType: 'database-export',
    title: 'Export Database',
    description: 'Export database to JSON/NDJSON format for backup or analysis',
    icon: '💾',
    fields: [
      {
        name: 'outputPath',
        label: 'Output Path',
        type: FieldType.PATH,
        default: './data/exports/export.ndjson',
        required: true,
        placeholder: './data/exports/my-export.ndjson',
        description: 'File path for export output'
      },
      {
        name: 'format',
        label: 'Export Format',
        type: FieldType.SELECT,
        default: 'ndjson',
        options: [
          { value: 'ndjson', label: 'Newline-Delimited JSON' },
          { value: 'json', label: 'JSON Array' },
          { value: 'csv', label: 'CSV' }
        ],
        required: true,
        description: 'Output file format'
      },
      {
        name: 'tables',
        label: 'Tables to Export',
        type: FieldType.MULTISELECT,
        default: ['articles', 'fetches'],
        options: [
          { value: 'articles', label: 'Articles' },
          { value: 'fetches', label: 'Fetches' },
          { value: 'sitemaps', label: 'Sitemaps' },
          { value: 'domains', label: 'Domains' },
          { value: 'gazetteer_places', label: 'Gazetteer Places' }
        ],
        required: true,
        description: 'Which database tables to include in export'
      },
      {
        name: 'compress',
        label: 'Compress Output',
        type: FieldType.BOOLEAN,
        default: true,
        description: 'Gzip compress the output file'
      },
      {
        name: 'limit',
        label: 'Row Limit (0 = all)',
        type: FieldType.NUMBER,
        default: 0,
        min: 0,
        description: 'Maximum rows to export per table (0 for unlimited)'
      }
    ]
  },

  'gazetteer-import': {
    taskType: 'gazetteer-import',
    title: 'Import Gazetteer Data',
    description: 'Import place data from external sources into the gazetteer',
    icon: '🌍',
    fields: [
      {
        name: 'sourcePath',
        label: 'Source File',
        type: FieldType.PATH,
        required: true,
        placeholder: './data/gazetteer.ndjson',
        description: 'Path to NDJSON file with place data'
      },
      {
        name: 'mode',
        label: 'Import Mode',
        type: FieldType.SELECT,
        default: 'merge',
        options: [
          { value: 'merge', label: 'Merge with existing data' },
          { value: 'replace', label: 'Replace existing data' },
          { value: 'append', label: 'Append only (skip duplicates)' }
        ],
        required: true,
        description: 'How to handle existing places'
      },
      {
        name: 'batchSize',
        label: 'Batch Size',
        type: FieldType.NUMBER,
        default: 500,
        min: 50,
        max: 5000,
        required: true,
        description: 'Number of places to import per batch'
      },
      {
        name: 'validateData',
        label: 'Validate Data',
        type: FieldType.BOOLEAN,
        default: true,
        description: 'Validate place data before importing'
      }
    ]
  },

  'database-vacuum': {
    taskType: 'database-vacuum',
    title: 'Vacuum Database',
    description: 'Reclaim space and optimize database performance (requires exclusive access)',
    icon: '🧹',
    fields: [
      {
        name: 'mode',
        label: 'Vacuum Mode',
        type: FieldType.SELECT,
        default: 'full',
        options: [
          { value: 'full', label: 'Full Vacuum (reclaim all space)' },
          { value: 'incremental', label: 'Incremental (faster, less space reclaimed)' },
          { value: 'analyze', label: 'Analyze Only (update statistics)' }
        ],
        required: true,
        description: 'Type of vacuum operation'
      },
      {
        name: 'backupFirst',
        label: 'Backup Before Vacuum',
        type: FieldType.BOOLEAN,
        default: true,
        description: 'Create database backup before vacuuming'
      }
    ]
  },

  'analysis-run': {
    taskType: 'analysis-run',
    title: 'Run Content Analysis',
    description: 'Analyze article content for places, topics, quality metrics, and award milestones',
    icon: '🔍',
    fields: [
      {
        name: 'analysisVersion',
        label: 'Analysis Version',
        type: FieldType.NUMBER,
        default: 1,
        min: 1,
        max: 10,
        required: true,
        description: 'Analysis algorithm version to use'
      },
      {
        name: 'pageLimit',
        label: 'Page Limit (0 = all)',
        type: FieldType.NUMBER,
        default: 0,
        min: 0,
        max: 100000,
        description: 'Maximum pages to analyze (0 for unlimited)'
      },
      {
        name: 'domainLimit',
        label: 'Domain Limit (0 = all)',
        type: FieldType.NUMBER,
        default: 0,
        min: 0,
        max: 10000,
        description: 'Maximum domains to analyze (0 for unlimited)'
      },
      {
        name: 'skipPages',
        label: 'Skip Page Analysis',
        type: FieldType.BOOLEAN,
        default: false,
        description: 'Skip individual article analysis (only domains & milestones)'
      },
      {
        name: 'skipDomains',
        label: 'Skip Domain Analysis',
        type: FieldType.BOOLEAN,
        default: false,
        description: 'Skip domain-level aggregation (only pages & milestones)'
      },
      {
        name: 'skipMilestones',
        label: 'Skip Milestone Awarding',
        type: FieldType.BOOLEAN,
        default: false,
        description: 'Skip awarding achievement milestones for domains'
      },
      {
        name: 'verbose',
        label: 'Verbose Logging',
        type: FieldType.BOOLEAN,
        default: false,
        description: 'Enable detailed progress logging'
      }
    ]
  },

  'crawl-site': {
    taskType: 'crawl-site',
    title: 'Crawl News Site',
    description: 'Crawl a news website using the standard crawler configuration',
    icon: '🕷️',
    fields: [
      {
        name: 'startUrl',
        label: 'Start URL',
        type: FieldType.STRING,
        required: true,
        placeholder: 'https://example.com',
        description: 'URL to begin crawling from'
      },
      {
        name: 'maxPages',
        label: 'Max Pages',
        type: FieldType.NUMBER,
        default: 100,
        min: 1,
        max: 10000,
        required: true,
        description: 'Maximum number of pages to crawl'
      },
      {
        name: 'maxConcurrency',
        label: 'Concurrency',
        type: FieldType.NUMBER,
        default: 5,
        min: 1,
        max: 20,
        required: true,
        description: 'Number of parallel requests'
      },
      {
        name: 'rateLimitMs',
        label: 'Rate Limit (ms)',
        type: FieldType.NUMBER,
        default: 0,
        min: 0,
        max: 5000,
        description: 'Delay between requests in milliseconds'
      },
      {
        name: 'respectRobotsTxt',
        label: 'Respect robots.txt',
        type: FieldType.BOOLEAN,
        default: true,
        description: 'Honor robots.txt exclusion rules'
      },
      {
        name: 'userAgent',
        label: 'User Agent',
        type: FieldType.STRING,
        default: 'NewsBot/1.0',
        placeholder: 'NewsBot/1.0',
        description: 'HTTP User-Agent header'
      }
    ]
  }
};

/**
 * Get task definition by task type
 * @param {string} taskType - Task type identifier
 * @returns {Object|null} Task definition or null if not found
 */
function getTaskDefinition(taskType) {
  return TASK_DEFINITIONS[taskType] || null;
}

/**
 * Get all available task types
 * @returns {Array<string>} Array of task type identifiers
 */
function getAvailableTaskTypes() {
  return Object.keys(TASK_DEFINITIONS);
}

/**
 * Get task definitions for UI rendering
 * @returns {Array<Object>} Array of task definition summaries
 */
function getTaskSummaries() {
  return Object.values(TASK_DEFINITIONS).map(def => ({
    taskType: def.taskType,
    title: def.title,
    description: def.description,
    icon: def.icon || '📋'
  }));
}

/**
 * Validate parameters against task definition
 * @param {string} taskType - Task type identifier
 * @param {Object} parameters - Parameters to validate
 * @returns {Object} { valid: boolean, errors: Array }
 */
function validateTaskParameters(taskType, parameters) {
  const definition = getTaskDefinition(taskType);
  
  if (!definition) {
    return {
      valid: false,
      errors: [{ field: 'taskType', message: `Unknown task type: ${taskType}` }]
    };
  }

  return validateValues(parameters, definition);
}

module.exports = {
  TASK_DEFINITIONS,
  getTaskDefinition,
  getAvailableTaskTypes,
  getTaskSummaries,
  validateTaskParameters
};
