'use strict';

const crypto = require('crypto');

/**
 * SkeletonHasher - Generates structure fingerprints for page layouts.
 * 
 * Implements a two-level hashing strategy:
 * - Level 1 (L1): Coarse hash based on top-level structure
 * - Level 2 (L2): Fine hash including nested element details
 * 
 * Pages with matching L1 hashes are structurally similar.
 * Pages with matching L2 hashes are likely from the same template.
 */
class SkeletonHasher {
  /**
   * @param {Object} options
   * @param {number} [options.l1Depth=2] - Depth for L1 hash
   * @param {number} [options.l2Depth=4] - Depth for L2 hash
   * @param {string} [options.algorithm='sha256'] - Hash algorithm
   */
  constructor(options = {}) {
    this.l1Depth = options.l1Depth ?? 2;
    this.l2Depth = options.l2Depth ?? 4;
    this.algorithm = options.algorithm ?? 'sha256';
  }

  /**
   * Compute both L1 and L2 hashes for a skeleton structure.
   * 
   * L1 (coarse): Only tag names - groups pages with similar layout structure
   * L2 (fine): Tags + child counts + text flags - identifies exact templates
   * 
   * @param {Object} skeleton - DOM skeleton from VisualAnalyzer
   * @returns {{l1: string, l2: string, signature: Object}}
   */
  hash(skeleton) {
    if (!skeleton) {
      return { l1: null, l2: null, signature: null };
    }

    // L1: Coarse signature (tags only, for layout similarity)
    const l1Sig = this._buildCoarseSignature(skeleton, 0, this.l1Depth);
    // L2: Fine signature (tags + counts + text, for exact template match)
    const l2Sig = this._buildFineSignature(skeleton, 0, this.l2Depth);

    const l1Hash = this._hashSignature(l1Sig);
    const l2Hash = this._hashSignature(l2Sig);

    return {
      l1: l1Hash.substring(0, 8),  // Short hash for L1
      l2: l2Hash.substring(0, 16), // Longer hash for L2
      signature: {
        l1: l1Sig,
        l2: l2Sig
      }
    };
  }

  /**
   * Build a coarse signature (L1) - only tag structure matters.
   * This allows pages with same layout but different content counts to match.
   * @private
   */
  _buildCoarseSignature(node, depth, maxDepth) {
    if (!node || depth > maxDepth) {
      return null;
    }

    // L1: Only tag name, no counts
    const sig = { t: node.tag };

    if (node.children && depth < maxDepth) {
      sig.ch = [];
      for (const child of node.children) {
        const childSig = this._buildCoarseSignature(child, depth + 1, maxDepth);
        if (childSig) {
          sig.ch.push(childSig);
        }
      }
      if (sig.ch.length === 0) {
        delete sig.ch;
      }
    }

    return sig;
  }

  /**
   * Build a fine signature (L2) - includes counts and text flags.
   * Pages with matching L2 are likely from the exact same template.
   * @private
   */
  _buildFineSignature(node, depth, maxDepth) {
    if (!node || depth > maxDepth) {
      return null;
    }

    const sig = {
      t: node.tag,           // Tag name
      c: node.childCount,    // Child count
      h: node.hasText ? 1 : 0 // Has text content
    };

    if (node.children && depth < maxDepth) {
      sig.ch = [];
      for (const child of node.children) {
        const childSig = this._buildFineSignature(child, depth + 1, maxDepth);
        if (childSig) {
          sig.ch.push(childSig);
        }
      }
      if (sig.ch.length === 0) {
        delete sig.ch;
      }
    }

    return sig;
  }

  /**
   * Hash a signature object to a string.
   * @private
   */
  _hashSignature(sig) {
    const json = JSON.stringify(sig);
    return crypto.createHash(this.algorithm).update(json).digest('hex');
  }

  /**
   * Compare two skeleton hashes for similarity.
   * 
   * @param {{l1: string, l2: string}} hash1
   * @param {{l1: string, l2: string}} hash2
   * @returns {{l1Match: boolean, l2Match: boolean, similarity: number}}
   */
  compare(hash1, hash2) {
    if (!hash1 || !hash2) {
      return { l1Match: false, l2Match: false, similarity: 0 };
    }

    const l1Match = hash1.l1 === hash2.l1;
    const l2Match = hash1.l2 === hash2.l2;

    // Compute similarity score
    let similarity = 0;
    if (l2Match) {
      similarity = 1.0;  // Exact template match
    } else if (l1Match) {
      similarity = 0.7;  // Similar structure
    } else {
      // Partial match based on hash prefix
      const prefixLen = this._commonPrefixLength(hash1.l1, hash2.l1);
      similarity = prefixLen / 8 * 0.5;
    }

    return { l1Match, l2Match, similarity };
  }

  /**
   * Find common prefix length of two strings.
   * @private
   */
  _commonPrefixLength(str1, str2) {
    if (!str1 || !str2) return 0;
    let len = 0;
    const maxLen = Math.min(str1.length, str2.length);
    for (let i = 0; i < maxLen; i++) {
      if (str1[i] === str2[i]) {
        len++;
      } else {
        break;
      }
    }
    return len;
  }

  /**
   * Cluster a set of skeleton hashes by L1 similarity.
   * 
   * @param {Array<{url: string, hash: Object}>} items
   * @returns {Map<string, Array<{url: string, hash: Object}>>}
   */
  clusterByL1(items) {
    const clusters = new Map();

    for (const item of items) {
      const l1 = item.hash?.l1;
      if (!l1) continue;

      if (!clusters.has(l1)) {
        clusters.set(l1, []);
      }
      clusters.get(l1).push(item);
    }

    return clusters;
  }

  /**
   * Generate a human-readable summary of a skeleton.
   * Accepts both raw skeletons (with `tag`) and signature format (with `t`).
   * 
   * @param {Object} skeleton
   * @returns {string}
   */
  summarize(skeleton) {
    if (!skeleton) return 'empty';

    const parts = [];
    const traverse = (node, depth = 0) => {
      if (!node || depth > 2) return;
      
      // Support both raw skeleton format (tag/children) and signature format (t/ch)
      const tagName = node.tag || node.t;
      const childCount = node.childCount ?? node.c ?? 0;
      const children = node.children || node.ch;
      
      const indent = '  '.repeat(depth);
      const childInfo = childCount > 0 ? ` (${childCount} children)` : '';
      parts.push(`${indent}<${tagName}>${childInfo}`);
      
      if (children) {
        for (const child of children.slice(0, 3)) {
          traverse(child, depth + 1);
        }
        if (children.length > 3) {
          parts.push(`${'  '.repeat(depth + 1)}... ${children.length - 3} more`);
        }
      }
    };

    traverse(skeleton);
    return parts.join('\n');
  }
}

module.exports = { SkeletonHasher };
