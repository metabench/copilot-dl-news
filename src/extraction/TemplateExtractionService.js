'use strict';

const { TemplateExtractor } = require('./TemplateExtractor');

/**
 * Template Extraction Service
 * 
 * Orchestrates template-based content extraction by:
 * 1. Looking up extraction configs from layout_templates
 * 2. Falling back to Readability when no template exists
 * 3. Learning new templates from successful Teacher extractions
 * 
 * @module extraction/TemplateExtractionService
 */
class TemplateExtractionService {
  /**
   * @param {Object} options
   * @param {Object} options.db - Database handle (better-sqlite3)
   * @param {Object} [options.layoutTemplateQueries] - Optional pre-created queries
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.templateExtractor] - Custom TemplateExtractor instance
   */
  constructor(options = {}) {
    if (!options.db) {
      throw new Error('TemplateExtractionService requires a database handle');
    }
    
    this.db = options.db;
    this.logger = options.logger ?? console;
    this.templateExtractor = options.templateExtractor ?? new TemplateExtractor({ logger: this.logger });
    
    // Initialize queries
    if (options.layoutTemplateQueries) {
      this._queries = options.layoutTemplateQueries;
    } else {
      const { createLayoutTemplatesQueries } = require('../db/sqlite/v1/queries/layoutTemplates');
      this._queries = createLayoutTemplatesQueries(this.db);
    }
    
    // Cache for frequently used configs
    this._configCache = new Map();
    this._cacheMaxSize = options.cacheMaxSize ?? 100;
    
    // Stats
    this._stats = {
      templateHits: 0,
      templateMisses: 0,
      cacheHits: 0,
      savedConfigs: 0
    };
  }

  /**
   * Extract content using template if available
   * 
   * @param {string} html - Raw HTML content
   * @param {string} signatureHash - Layout signature hash for template lookup
   * @param {Object} [options]
   * @param {string} [options.url] - Source URL
   * @param {string} [options.producer='static-skeletonhash-v1'] - Signature producer
   * @returns {ExtractionResult|null} Extraction result or null if no template
   */
  extractWithTemplate(html, signatureHash, options = {}) {
    const producer = options.producer ?? 'static-skeletonhash-v1';
    const cacheKey = `${producer}:${signatureHash}`;
    
    // Try cache first
    let config = this._configCache.get(cacheKey);
    if (config) {
      this._stats.cacheHits++;
    } else {
      // Load from database
      const template = this._queries.get({ producer, signature_hash: signatureHash });
      
      if (!template || !template.extraction_config_json) {
        this._stats.templateMisses++;
        return null;
      }
      
      try {
        config = JSON.parse(template.extraction_config_json);
        this._cacheConfig(cacheKey, config);
      } catch (err) {
        this.logger.warn(`Invalid config for ${signatureHash}: ${err.message}`);
        this._stats.templateMisses++;
        return null;
      }
    }
    
    this._stats.templateHits++;
    
    // Extract using template
    const result = this.templateExtractor.extract(html, config, { url: options.url });
    result.signatureHash = signatureHash;
    result.producer = producer;
    
    return result;
  }

  /**
   * Save extraction config for a layout template
   * 
   * @param {string} signatureHash - Layout signature hash
   * @param {Object} config - Extraction config object
   * @param {Object} [options]
   * @param {string} [options.host] - Domain host
   * @param {string} [options.label] - Human-readable label
   * @param {string} [options.notes] - Notes about this template
   * @param {string} [options.exampleUrl] - Example URL for this template
   * @param {string} [options.producer='static-skeletonhash-v1']
   */
  saveConfig(signatureHash, config, options = {}) {
    // Validate config first
    const validation = this.templateExtractor.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid config: ${validation.errors.join(', ')}`);
    }
    
    const producer = options.producer ?? 'static-skeletonhash-v1';
    const configJson = JSON.stringify(config, null, 2);
    
    this._queries.upsert({
      signature_hash: signatureHash,
      producer,
      host: options.host ?? null,
      label: options.label ?? null,
      notes: options.notes ?? null,
      example_url: options.exampleUrl ?? null,
      extraction_config_json: configJson
    });
    
    // Update cache
    const cacheKey = `${producer}:${signatureHash}`;
    this._cacheConfig(cacheKey, config);
    
    this._stats.savedConfigs++;
    
    this.logger.info(`Saved extraction config for ${signatureHash} (host: ${options.host})`);
  }

  /**
   * Get extraction config for a template
   * 
   * @param {string} signatureHash
   * @param {Object} [options]
   * @param {string} [options.producer='static-skeletonhash-v1']
   * @returns {Object|null} Config object or null
   */
  getConfig(signatureHash, options = {}) {
    const producer = options.producer ?? 'static-skeletonhash-v1';
    const cacheKey = `${producer}:${signatureHash}`;
    
    // Check cache
    const cached = this._configCache.get(cacheKey);
    if (cached) {
      this._stats.cacheHits++;
      return cached;
    }
    
    // Load from database
    const template = this._queries.get({ producer, signature_hash: signatureHash });
    
    if (!template || !template.extraction_config_json) {
      return null;
    }
    
    try {
      const config = JSON.parse(template.extraction_config_json);
      this._cacheConfig(cacheKey, config);
      return config;
    } catch (err) {
      this.logger.warn(`Invalid config for ${signatureHash}: ${err.message}`);
      return null;
    }
  }

  /**
   * List all templates with configs for a host
   * 
   * @param {string} host - Domain host
   * @returns {Array<{signatureHash: string, config: Object, label: string|null}>}
   */
  listConfigsForHost(host) {
    const templates = this._queries.listByHost(host);
    
    return templates
      .filter(t => t.extraction_config_json)
      .map(t => {
        let config = null;
        try {
          config = JSON.parse(t.extraction_config_json);
        } catch (e) {
          // Skip invalid configs
        }
        return {
          signatureHash: t.signature_hash,
          config,
          label: t.label,
          exampleUrl: t.example_url,
          updatedAt: t.updated_at
        };
      })
      .filter(t => t.config !== null);
  }

  /**
   * Create config from Teacher extraction output
   * 
   * Uses the selectors discovered during Teacher's visual analysis
   * to build an extraction config for future fast-path extraction.
   * 
   * @param {Object} teacherOutput - Output from TeacherService.analyzeVisualStructure()
   * @param {Object} [observedSelectors] - Manually observed/validated selectors
   * @param {Object} [options]
   * @returns {Object} New extraction config
   */
  createConfigFromTeacher(teacherOutput, observedSelectors = {}, options = {}) {
    const selectors = {
      title: observedSelectors.title ?? null,
      body: observedSelectors.body ?? null,
      date: observedSelectors.date ?? null,
      author: observedSelectors.author ?? null,
      ...observedSelectors
    };
    
    // If Teacher output includes structure info, try to infer selectors
    if (teacherOutput?.structure) {
      const struct = teacherOutput.structure;
      
      // Infer body selector from largestTextBlock
      if (!selectors.body && struct.largestTextBlock) {
        const block = struct.largestTextBlock;
        if (block.id) {
          selectors.body = `#${block.id}`;
        } else if (block.className) {
          selectors.body = `.${block.className.split(' ')[0]}`;
        } else if (block.tagName) {
          selectors.body = block.tagName;
        }
      }
      
      // Infer metadata selector
      if (!selectors.date && struct.metadataBlock) {
        selectors.date = struct.metadataBlock.selector;
      }
    }
    
    return this.templateExtractor.createConfig(selectors, {
      url: options.url,
      confidence: options.confidence ?? 0.75
    });
  }

  /**
   * Get service statistics
   * @returns {Object}
   */
  getStats() {
    return {
      ...this._stats,
      cacheSize: this._configCache.size,
      cacheMaxSize: this._cacheMaxSize
    };
  }

  /**
   * Clear the config cache
   */
  clearCache() {
    this._configCache.clear();
  }

  // ───────────────────────────────────────────────────────────────
  // Private helpers
  // ───────────────────────────────────────────────────────────────

  /**
   * Cache a config with LRU eviction
   * @private
   */
  _cacheConfig(key, config) {
    // Simple LRU: delete oldest entry if at capacity
    if (this._configCache.size >= this._cacheMaxSize) {
      const firstKey = this._configCache.keys().next().value;
      this._configCache.delete(firstKey);
    }
    this._configCache.set(key, config);
  }
}

module.exports = { TemplateExtractionService };
