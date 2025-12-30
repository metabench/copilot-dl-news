'use strict';

/**
 * VisualAnalyzer - Extracts visual structure from rendered pages.
 * 
 * Works with TeacherService to identify:
 * - Largest text block (main content)
 * - Metadata regions (title, date, author)
 * - Navigation elements
 * - Layout regions for template matching
 */
class VisualAnalyzer {
  /**
   * @param {Object} options
   * @param {number} [options.minWordCount=50] - Minimum words for a text block
   * @param {number} [options.minBlockWidth=200] - Minimum width in pixels
   * @param {number} [options.minBlockHeight=100] - Minimum height in pixels
   */
  constructor(options = {}) {
    this.minWordCount = options.minWordCount ?? 50;
    this.minBlockWidth = options.minBlockWidth ?? 200;
    this.minBlockHeight = options.minBlockHeight ?? 100;
  }

  /**
   * Analyze a structure object returned by TeacherService.analyzeVisualStructure().
   * 
   * @param {Object} structure - Visual structure from page
   * @returns {Object} Analysis result with confidence scores
   */
  analyze(structure) {
    if (!structure) {
      return { valid: false, reason: 'no-structure' };
    }

    const result = {
      valid: true,
      title: structure.title || null,
      hasMainContent: false,
      hasMetadata: false,
      confidence: 0,
      mainContent: null,
      metadata: null,
      layout: null
    };

    // Analyze largest text block
    if (structure.largestTextBlock) {
      const block = structure.largestTextBlock;
      result.hasMainContent = true;
      result.mainContent = {
        wordCount: block.wordCount,
        position: block.rect,
        element: {
          tag: block.tagName,
          id: block.id || null,
          className: block.className || null
        },
        confidence: this._computeContentConfidence(block)
      };
    }

    // Analyze metadata block
    if (structure.metadataBlock) {
      result.hasMetadata = true;
      result.metadata = {
        selector: structure.metadataBlock.selector,
        position: structure.metadataBlock.rect,
        element: {
          tag: structure.metadataBlock.tagName
        }
      };
    }

    // Compute overall page layout classification
    result.layout = this._classifyLayout(structure);

    // Compute overall confidence
    result.confidence = this._computeOverallConfidence(result);

    return result;
  }

  /**
   * Compute confidence score for main content block.
   * @private
   */
  _computeContentConfidence(block) {
    let confidence = 0;

    // More words = higher confidence
    if (block.wordCount > 500) confidence += 0.4;
    else if (block.wordCount > 200) confidence += 0.3;
    else if (block.wordCount > 100) confidence += 0.2;
    else confidence += 0.1;

    // Larger area = higher confidence
    if (block.area > 500000) confidence += 0.3;
    else if (block.area > 200000) confidence += 0.2;
    else confidence += 0.1;

    // Semantic elements boost confidence
    if (['article', 'main', 'section'].includes(block.tagName)) {
      confidence += 0.2;
    }

    // Class name hints
    const className = (block.className || '').toLowerCase();
    if (className.includes('content') || className.includes('article') || className.includes('post')) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  /**
   * Classify the overall page layout.
   * @private
   */
  _classifyLayout(structure) {
    const skeleton = structure.skeleton;
    if (!skeleton) return { type: 'unknown' };

    // Count major structural elements
    const layoutFeatures = {
      hasHeader: false,
      hasNav: false,
      hasMain: false,
      hasAside: false,
      hasFooter: false,
      columnCount: 1
    };

    const traverse = (node) => {
      if (!node) return;
      
      switch (node.tag) {
        case 'header': layoutFeatures.hasHeader = true; break;
        case 'nav': layoutFeatures.hasNav = true; break;
        case 'main': layoutFeatures.hasMain = true; break;
        case 'aside': layoutFeatures.hasAside = true; break;
        case 'footer': layoutFeatures.hasFooter = true; break;
      }
      
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(skeleton);

    // Determine layout type
    let type = 'simple';
    if (layoutFeatures.hasMain && layoutFeatures.hasAside) {
      type = 'two-column';
      layoutFeatures.columnCount = 2;
    } else if (layoutFeatures.hasMain && layoutFeatures.hasNav) {
      type = 'standard-article';
    } else if (layoutFeatures.hasHeader && layoutFeatures.hasFooter) {
      type = 'standard-page';
    }

    return {
      type,
      features: layoutFeatures
    };
  }

  /**
   * Compute overall confidence score for the analysis.
   * @private
   */
  _computeOverallConfidence(result) {
    let confidence = 0;

    if (result.hasMainContent) {
      confidence += result.mainContent.confidence * 0.6;
    }

    if (result.hasMetadata) {
      confidence += 0.2;
    }

    if (result.layout?.type !== 'unknown') {
      confidence += 0.2;
    }

    return Math.min(1, confidence);
  }

  /**
   * Compare two layout structures for similarity.
   * 
   * @param {Object} structure1
   * @param {Object} structure2
   * @returns {number} Similarity score 0-1
   */
  compareLayouts(structure1, structure2) {
    if (!structure1?.skeleton || !structure2?.skeleton) {
      return 0;
    }

    const sig1 = this._computeSkeletonSignature(structure1.skeleton);
    const sig2 = this._computeSkeletonSignature(structure2.skeleton);

    // Compare signatures
    const keys = new Set([...Object.keys(sig1), ...Object.keys(sig2)]);
    let matches = 0;
    let total = keys.size;

    for (const key of keys) {
      if (sig1[key] === sig2[key]) {
        matches++;
      }
    }

    return total > 0 ? matches / total : 0;
  }

  /**
   * Compute a simple signature from a skeleton.
   * @private
   */
  _computeSkeletonSignature(skeleton, prefix = '') {
    const sig = {};
    
    if (!skeleton) return sig;
    
    const key = prefix ? `${prefix}>${skeleton.tag}` : skeleton.tag;
    sig[key] = skeleton.childCount;
    
    if (skeleton.children) {
      for (let i = 0; i < Math.min(skeleton.children.length, 5); i++) {
        const childSig = this._computeSkeletonSignature(skeleton.children[i], key);
        Object.assign(sig, childSig);
      }
    }
    
    return sig;
  }
}

module.exports = { VisualAnalyzer };
