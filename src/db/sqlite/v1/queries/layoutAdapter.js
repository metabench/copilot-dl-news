"use strict";

/**
 * Layout Adapter — Unified persistence layer for layout analysis
 * 
 * Combines:
 * - layoutSignatures: Structural fingerprints (L1/L2 hashes)
 * - layoutTemplates: Learned extraction configurations
 * - layoutMasks: Dynamic content masks for diffing
 * 
 * This adapter is the single entry point for StructureMiner and related
 * services to interact with layout persistence.
 */

const { createLayoutSignaturesQueries } = require('./layoutSignatures');
const { createLayoutTemplatesQueries } = require('./layoutTemplates');
const { createLayoutMasksQueries } = require('./layoutMasks');

function assertDatabase(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createLayoutAdapter requires a better-sqlite3 database handle');
  }
}

/**
 * Create a unified layout adapter
 * @param {Database} db - better-sqlite3 database handle
 * @returns {Object} Layout adapter with signatures, templates, masks, and aggregate methods
 */
function createLayoutAdapter(db) {
  assertDatabase(db);

  const signatures = createLayoutSignaturesQueries(db);
  const templates = createLayoutTemplatesQueries(db);
  const masks = createLayoutMasksQueries(db);

  // Prepared statements for aggregate queries
  const getSignatureWithTemplateStmt = db.prepare(`
    SELECT 
      ls.signature_hash,
      ls.level,
      ls.signature,
      ls.first_seen_url,
      ls.seen_count,
      ls.created_at,
      ls.last_seen_at,
      lt.id as template_id,
      lt.producer,
      lt.host,
      lt.label,
      lt.extraction_config_json
    FROM layout_signatures ls
    LEFT JOIN layout_templates lt ON lt.signature_hash = ls.signature_hash
    WHERE ls.signature_hash = ?
  `);

  const getClustersByDomainStmt = db.prepare(`
    SELECT 
      ls.signature_hash,
      ls.level,
      ls.seen_count,
      ls.first_seen_url,
      lt.host,
      lt.label,
      lm.dynamic_nodes_count
    FROM layout_signatures ls
    LEFT JOIN layout_templates lt ON lt.signature_hash = ls.signature_hash
    LEFT JOIN layout_masks lm ON lm.signature_hash = ls.signature_hash
    WHERE ls.level = 2
      AND (lt.host = ? OR ls.first_seen_url LIKE ?)
    ORDER BY ls.seen_count DESC
    LIMIT ?
  `);

  const getStatsStmt = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM layout_signatures WHERE level = 1) as l1_count,
      (SELECT COUNT(*) FROM layout_signatures WHERE level = 2) as l2_count,
      (SELECT SUM(seen_count) FROM layout_signatures) as total_pages_analyzed,
      (SELECT COUNT(*) FROM layout_templates) as template_count,
      (SELECT COUNT(*) FROM layout_masks) as mask_count,
      (SELECT AVG(seen_count) FROM layout_signatures WHERE level = 2) as avg_cluster_size
  `);

  return {
    // Expose sub-modules for direct access
    signatures,
    templates,
    masks,

    // === Signature Operations ===

    /**
     * Save L1 and L2 signatures for a page
     * @param {Object} params
     * @param {string} params.url - The source URL
     * @param {Object} params.l1 - { hash, signature } from SkeletonHash
     * @param {Object} params.l2 - { hash, signature } from SkeletonHash
     */
    saveSignatures({ url, l1, l2 }) {
      const results = { l1: null, l2: null };
      
      if (l1 && l1.hash && l1.hash !== '0') {
        results.l1 = signatures.upsert({
          signature_hash: l1.hash,
          level: 1,
          signature: l1.signature,
          first_seen_url: url
        });
      }
      
      if (l2 && l2.hash && l2.hash !== '0') {
        results.l2 = signatures.upsert({
          signature_hash: l2.hash,
          level: 2,
          signature: l2.signature,
          first_seen_url: url
        });
      }
      
      return results;
    },

    /**
     * Get a signature with its associated template (if any)
     * @param {string} signatureHash
     * @returns {Object|null}
     */
    getSignatureWithTemplate(signatureHash) {
      return getSignatureWithTemplateStmt.get(signatureHash) || null;
    },

    /**
     * Get top clusters, optionally filtered by domain
     * @param {Object} [options]
     * @param {string} [options.domain] - Filter by domain
     * @param {number} [options.limit=10] - Max results
     * @returns {Array}
     */
    getTopClusters({ domain = null, limit = 10 } = {}) {
      if (domain) {
        return getClustersByDomainStmt.all(domain, `%${domain}%`, limit);
      }
      return signatures.getTopClusters(limit);
    },

    // === Template Operations ===

    /**
     * Save or update a template for a signature
     * @param {Object} params
     * @param {string} params.signatureHash - L2 signature hash
     * @param {string} [params.host] - Domain this template applies to
     * @param {string} [params.label] - Human-readable name
     * @param {Object} [params.extractionConfig] - Extraction selectors/hints
     * @param {string} [params.exampleUrl] - Representative URL
     * @param {string} [params.notes] - Additional notes
     */
    saveTemplate({ signatureHash, host = null, label = null, extractionConfig = null, exampleUrl = null, notes = null }) {
      return templates.upsert({
        signature_hash: signatureHash,
        host,
        label,
        example_url: exampleUrl,
        notes,
        extraction_config_json: extractionConfig ? JSON.stringify(extractionConfig) : null
      });
    },

    /**
     * Get template by signature hash
     * @param {string} signatureHash
     * @returns {Object|null}
     */
    getTemplate(signatureHash) {
      return templates.get({ signature_hash: signatureHash });
    },

    /**
     * Get all templates for a domain
     * @param {string} host
     * @returns {Array}
     */
    getTemplatesByHost(host) {
      return templates.listByHost(host);
    },

    // === Mask Operations ===

    /**
     * Save a layout mask (dynamic content detection result)
     * @param {Object} params
     * @param {string} params.signatureHash
     * @param {Object} params.mask - Mask data with dynamicPaths, staticPaths
     * @param {number} params.sampleCount - Number of samples used to generate mask
     */
    saveMask({ signatureHash, mask, sampleCount }) {
      return masks.upsert({
        signature_hash: signatureHash,
        mask_json: JSON.stringify(mask),
        sample_count: sampleCount,
        dynamic_nodes_count: mask.dynamicPaths?.length || 0
      });
    },

    /**
     * Get mask for a signature
     * @param {string} signatureHash
     * @returns {Object|null} Parsed mask with mask_json as object
     */
    getMask(signatureHash) {
      const row = masks.get(signatureHash);
      if (row && row.mask_json) {
        try {
          row.mask = JSON.parse(row.mask_json);
        } catch (e) {
          row.mask = null;
        }
      }
      return row;
    },

    // === Aggregate Operations ===

    /**
     * Get overall statistics
     * @returns {Object}
     */
    getStats() {
      return getStatsStmt.get();
    },

    /**
     * Find the best template match for a given signature
     * @param {string} l2Hash - L2 signature hash
     * @param {string} [domain] - Preferred domain for matching
     * @returns {Object|null} Best matching template or null
     */
    findBestTemplate(l2Hash, domain = null) {
      // First try exact match
      const exact = templates.get({ signature_hash: l2Hash });
      if (exact) return exact;

      // If domain provided, try to find domain-specific template
      if (domain) {
        const domainTemplates = templates.listByHost(domain);
        // Could implement fuzzy matching here in the future
        if (domainTemplates.length > 0) {
          return domainTemplates[0];
        }
      }

      return null;
    },

    /**
     * Batch process pages and save signatures
     * @param {Array<{url: string, l1: Object, l2: Object}>} pages
     * @returns {Object} { l1Stats, l2Stats }
     */
    batchSaveSignatures(pages) {
      const l1Sigs = [];
      const l2Sigs = [];

      for (const page of pages) {
        if (page.l1 && page.l1.hash && page.l1.hash !== '0') {
          l1Sigs.push({
            signature_hash: page.l1.hash,
            level: 1,
            signature: page.l1.signature,
            first_seen_url: page.url
          });
        }
        if (page.l2 && page.l2.hash && page.l2.hash !== '0') {
          l2Sigs.push({
            signature_hash: page.l2.hash,
            level: 2,
            signature: page.l2.signature,
            first_seen_url: page.url
          });
        }
      }

      return {
        l1Stats: signatures.batchUpsert(l1Sigs),
        l2Stats: signatures.batchUpsert(l2Sigs)
      };
    }
  };
}

module.exports = { createLayoutAdapter };
