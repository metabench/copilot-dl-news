'use strict';

/**
 * StructureMiner - Batch analysis service for layout template learning
 * 
 * Processes HTML pages, computes structural signatures (L1/L2),
 * clusters by similarity, and identifies common vs varying regions.
 * 
 * This is the core service class; the CLI tool (tools/structure-miner.js)
 * provides the command-line interface.
 * 
 * @example
 * const miner = new StructureMiner({ db, logger: console });
 * const results = await miner.processBatch([
 *   { url: 'https://example.com/a', html: '<html>...</html>' },
 *   { url: 'https://example.com/b', html: '<html>...</html>' }
 * ]);
 */

const SkeletonHash = require('../../../intelligence/analysis/structure/SkeletonHash');
const { createLayoutAdapter } = require('../../../data/db/sqlite/v1/queries/layoutAdapter');

class StructureMiner {
  /**
   * @param {Object} options
   * @param {Database} options.db - better-sqlite3 database handle
   * @param {Object} [options.logger=console] - Logger with info/warn/error methods
   * @param {Object} [options.skeletonHash] - Custom SkeletonHash instance (for testing)
   */
  constructor({ db, logger = console, skeletonHash = null } = {}) {
    this.db = db;
    this.logger = logger;
    this.hasher = skeletonHash || SkeletonHash;
    this.adapter = db ? createLayoutAdapter(db) : null;
  }

  /**
   * Process a batch of HTML pages and cluster by L2 hash
   * 
   * @param {Array<{url: string, html: string}>} pages - Pages to process
   * @param {Object} [options]
   * @param {boolean} [options.persist=true] - Save signatures to database
   * @param {boolean} [options.collectSamples=false] - Collect HTML samples for mask generation
   * @param {number} [options.maxSamplesPerCluster=5] - Max HTML samples to keep per cluster
   * @returns {Object} Processing results with clusters and statistics
   */
  processBatch(pages, { persist = true, collectSamples = false, maxSamplesPerCluster = 5 } = {}) {
    const signatures = [];
    const clusters = new Map(); // l2Hash -> { urls: [], samples: [] }
    const errors = [];

    for (const { url, html } of pages) {
      try {
        const domain = new URL(url).hostname;
        
        // Compute L1 and L2 hashes
        const l1 = this.hasher.compute(html, 1);
        const l2 = this.hasher.compute(html, 2);

        const sig = {
          url,
          domain,
          l1Hash: l1.hash,
          l2Hash: l2.hash,
          l1Signature: l1.signature,
          l2Signature: l2.signature
        };
        signatures.push(sig);

        // Cluster by L2 hash
        if (l2.hash && l2.hash !== '0') {
          if (!clusters.has(l2.hash)) {
            clusters.set(l2.hash, { urls: [], samples: [] });
          }
          const cluster = clusters.get(l2.hash);
          cluster.urls.push(url);
          
          if (collectSamples && cluster.samples.length < maxSamplesPerCluster) {
            cluster.samples.push({ url, html });
          }
        }

        // Persist to database
        if (persist && this.adapter) {
          this.adapter.saveSignatures({ url, l1, l2 });
        }

      } catch (err) {
        errors.push({ url, error: err.message });
        this.logger.warn?.(`[StructureMiner] Failed to process ${url}: ${err.message}`);
      }
    }

    return {
      totalProcessed: pages.length,
      successCount: signatures.length,
      errorCount: errors.length,
      clusterCount: clusters.size,
      clusters: this._formatClusters(clusters),
      signatures,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Analyze a cluster to identify varying vs constant regions
   * 
   * This compares multiple HTML samples with the same L2 hash to find
   * which DOM paths contain dynamic content vs static structure.
   * 
   * @param {string} l2Hash - The L2 signature hash
   * @param {Array<string>} htmlSamples - 2+ HTML samples from the cluster
   * @returns {Object} Analysis with varying/constant paths and confidence
   */
  analyzeCluster(l2Hash, htmlSamples) {
    if (!htmlSamples || htmlSamples.length < 2) {
      return {
        l2Hash,
        varying: [],
        constant: [],
        confidence: 0,
        sampleCount: htmlSamples?.length || 0,
        error: 'Need at least 2 samples for cluster analysis'
      };
    }

    try {
      // Get L1 signatures (more detailed) for each sample
      const l1Signatures = htmlSamples.map(html => {
        const result = this.hasher.compute(html, 1);
        return result.signature;
      });

      // Parse signatures to extract structural paths
      const pathSets = l1Signatures.map(sig => this._extractPaths(sig));

      // Find paths that appear in ALL samples (constant)
      // and paths that differ (varying)
      const allPaths = new Set();
      pathSets.forEach(set => set.forEach(path => allPaths.add(path)));

      const constant = [];
      const varying = [];

      for (const path of allPaths) {
        const appearCount = pathSets.filter(set => set.has(path)).length;
        if (appearCount === pathSets.length) {
          constant.push(path);
        } else {
          varying.push(path);
        }
      }

      const confidence = constant.length / (constant.length + varying.length) || 0;

      return {
        l2Hash,
        varying,
        constant,
        confidence,
        sampleCount: htmlSamples.length,
        totalPaths: allPaths.size
      };
    } catch (err) {
      return {
        l2Hash,
        varying: [],
        constant: [],
        confidence: 0,
        sampleCount: htmlSamples.length,
        error: err.message
      };
    }
  }

  /**
   * Generate a template from cluster analysis
   * 
   * @param {string} domain - The domain this template applies to
   * @param {string} l2Hash - The L2 signature hash
   * @param {Object} analysis - Result from analyzeCluster
   * @param {Object} [options]
   * @param {boolean} [options.persist=true] - Save to database
   * @returns {Object} Template definition
   */
  generateTemplate(domain, l2Hash, analysis, { persist = true } = {}) {
    // Generate a template ID from domain and hash prefix
    const cleanDomain = domain.replace(/\./g, '-').replace(/[^a-z0-9-]/gi, '');
    const templateId = `${cleanDomain}-${l2Hash.slice(0, 8)}`;

    // Identify likely content selectors from varying paths
    const contentHints = analysis.varying.filter(path => 
      /article|content|main|post|body|text/i.test(path)
    );

    // Identify likely metadata selectors from constant paths  
    const metadataHints = analysis.constant.filter(path =>
      /meta|header|nav|title|head|time|date/i.test(path)
    );

    const template = {
      templateId,
      domain,
      l2Hash,
      confidence: analysis.confidence,
      sampleCount: analysis.sampleCount,
      structure: {
        varyingPaths: analysis.varying,
        constantPaths: analysis.constant
      },
      extractionHints: {
        contentSelectors: contentHints.slice(0, 10),
        metadataSelectors: metadataHints.slice(0, 10)
      }
    };

    // Persist if we have a database
    if (persist && this.adapter) {
      this.adapter.saveTemplate({
        signatureHash: l2Hash,
        host: domain,
        label: templateId,
        extractionConfig: template.extractionHints,
        notes: `Auto-generated from ${analysis.sampleCount} samples. Confidence: ${(analysis.confidence * 100).toFixed(1)}%`
      });
    }

    return template;
  }

  /**
   * Get statistics from the database
   * @returns {Object|null} Stats or null if no database
   */
  getStats() {
    if (!this.adapter) return null;
    return this.adapter.getStats();
  }

  /**
   * Get top clusters from the database
   * @param {Object} [options]
   * @param {string} [options.domain] - Filter by domain
   * @param {number} [options.limit=10] - Max results
   * @returns {Array}
   */
  getTopClusters({ domain = null, limit = 10 } = {}) {
    if (!this.adapter) return [];
    return this.adapter.getTopClusters({ domain, limit });
  }

  /**
   * Find a template for a given HTML
   * @param {string} html - HTML content
   * @param {string} [domain] - Optional domain hint
   * @returns {Object|null} Matching template or null
   */
  findTemplate(html, domain = null) {
    if (!this.adapter) return null;
    
    const l2 = this.hasher.compute(html, 2);
    if (!l2.hash || l2.hash === '0') return null;
    
    return this.adapter.findBestTemplate(l2.hash, domain);
  }

  // === Private Methods ===

  /**
   * Format clusters map into a sorted array
   * @private
   */
  _formatClusters(clusters) {
    return Array.from(clusters.entries())
      .map(([hash, data]) => ({
        l2Hash: hash,
        count: data.urls.length,
        sampleUrls: data.urls.slice(0, 5),
        hasSamples: data.samples.length > 0
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Extract structural paths from a signature string
   * 
   * The signature is a nested format like: html(head(title)body(div#main(article(p)(p))))
   * We extract paths like: html, html/head, html/head/title, etc.
   * 
   * @private
   */
  _extractPaths(signature) {
    const paths = new Set();
    if (!signature) return paths;

    const stack = [];
    let current = '';
    let depth = 0;

    for (const char of signature) {
      if (char === '(') {
        // Push current tag onto stack
        if (current) {
          stack.push(current);
          paths.add(stack.join('/'));
          current = '';
        }
        depth++;
      } else if (char === ')') {
        // Pop from stack
        if (current) {
          stack.push(current);
          paths.add(stack.join('/'));
          current = '';
          stack.pop();
        }
        stack.pop();
        depth--;
      } else {
        current += char;
      }
    }

    // Handle any trailing content
    if (current) {
      stack.push(current);
      paths.add(stack.join('/'));
    }

    return paths;
  }
}

module.exports = { StructureMiner };
