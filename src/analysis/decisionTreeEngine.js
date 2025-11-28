/**
 * @fileoverview Decision Tree Engine for Page Classification
 * 
 * Executes JSON-configured decision trees with full audit trail.
 * Boolean-only decisions following branch paths until a result node.
 * 
 * @example
 * const engine = new DecisionTreeEngine(config);
 * const result = engine.evaluate('in-depth', pageData);
 * // result: { match: true, confidence: 0.85, path: [...], reason: 'url-pattern-series+high-word-count' }
 */

const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} EvaluationContext
 * @property {string} url - The URL being evaluated
 * @property {string} [title] - Page title
 * @property {string} [description] - Page description
 * @property {string} [classification] - Page classification (nav, article, etc.)
 * @property {number} [article_links_count] - Number of article links
 * @property {number} [section_avg_word_count] - Average word count for section
 * @property {number} [domain_avg_word_count] - Average word count for domain
 * @property {number} [max_linked_word_count] - Max word count among linked articles
 */

/**
 * @typedef {Object} PathStep
 * @property {string} nodeId - ID of the node evaluated
 * @property {string} condition - Human-readable condition description
 * @property {boolean} result - Result of condition evaluation
 * @property {string} branch - Which branch was taken ('yes' or 'no')
 */

/**
 * @typedef {Object} EvaluationResult
 * @property {boolean} match - Whether the category matched
 * @property {number} confidence - Confidence score (0.0-1.0)
 * @property {string} reason - Compact reason code for storage
 * @property {PathStep[]} path - Full audit trail of decisions made
 * @property {string} encodedPath - Compact encoded path for storage
 */

class DecisionTreeEngine {
  /**
   * @param {Object} config - Decision tree configuration
   */
  constructor(config) {
    this.config = config;
    this.version = config.version;
    this.name = config.name;
    this.categories = config.categories;
  }

  /**
   * Load configuration from JSON file
   * @param {string} configPath - Path to configuration JSON file
   * @returns {DecisionTreeEngine}
   */
  static fromFile(configPath) {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    return new DecisionTreeEngine(config);
  }

  /**
   * Load the default page-categories configuration
   * @returns {DecisionTreeEngine}
   */
  static loadPageCategories() {
    const configPath = path.join(__dirname, '../../config/decision-trees/page-categories.json');
    return DecisionTreeEngine.fromFile(configPath);
  }

  /**
   * Get list of available category slugs
   * @returns {string[]}
   */
  getCategoryIds() {
    return Object.keys(this.categories);
  }

  /**
   * Evaluate a single category against page data
   * @param {string} categoryId - Category slug to evaluate
   * @param {EvaluationContext} context - Page data to evaluate
   * @returns {EvaluationResult}
   */
  evaluate(categoryId, context) {
    const category = this.categories[categoryId];
    if (!category) {
      throw new Error(`Unknown category: ${categoryId}`);
    }

    const path = [];
    const result = this._evaluateNode(category.tree, context, path);
    
    return {
      categoryId,
      categoryName: category.displayName,
      match: result.result === 'match',
      confidence: result.confidence || 0,
      reason: result.reason,
      path,
      encodedPath: this._encodePath(path)
    };
  }

  /**
   * Evaluate all categories against page data
   * @param {EvaluationContext} context - Page data to evaluate
   * @returns {EvaluationResult[]}
   */
  evaluateAll(context) {
    const results = [];
    for (const categoryId of this.getCategoryIds()) {
      const result = this.evaluate(categoryId, context);
      results.push(result);
    }
    return results;
  }

  /**
   * Get all matching categories (match=true)
   * @param {EvaluationContext} context - Page data to evaluate
   * @returns {EvaluationResult[]}
   */
  getMatches(context) {
    return this.evaluateAll(context).filter(r => r.match);
  }

  /**
   * Recursively evaluate a decision node
   * @private
   */
  _evaluateNode(node, context, path) {
    // Result node - terminal
    if (node.result !== undefined) {
      return {
        result: node.result,
        confidence: node.confidence,
        reason: node.reason
      };
    }

    // Branch node - evaluate condition
    const conditionResult = this._evaluateCondition(node.condition, context);
    const conditionDesc = this._describeCondition(node.condition);
    
    const step = {
      nodeId: node.id || 'anonymous',
      condition: conditionDesc,
      result: conditionResult,
      branch: conditionResult ? 'yes' : 'no'
    };
    path.push(step);

    // Follow the appropriate branch
    const nextNode = conditionResult ? node.yes : node.no;
    return this._evaluateNode(nextNode, context, path);
  }

  /**
   * Evaluate a single condition
   * @private
   */
  _evaluateCondition(condition, context) {
    switch (condition.type) {
      case 'url_matches':
        return this._evalUrlMatches(condition, context);
      case 'text_contains':
        return this._evalTextContains(condition, context);
      case 'compare':
        return this._evalCompare(condition, context);
      case 'compound':
        return this._evalCompound(condition, context);
      case 'flag':
        return this._evalFlag(condition, context);
      default:
        throw new Error(`Unknown condition type: ${condition.type}`);
    }
  }

  /**
   * Evaluate url_matches condition
   * @private
   */
  _evalUrlMatches(condition, context) {
    const url = (context.url || '').toLowerCase();
    const matchType = condition.matchType || 'segment';
    
    for (const pattern of condition.patterns) {
      const pat = pattern.toLowerCase();
      
      if (matchType === 'contains') {
        if (url.includes(pat)) return true;
      } else if (matchType === 'segment') {
        // Match as path segment (between slashes or at boundaries)
        const regex = new RegExp(`(^|/)${this._escapeRegex(pat)}(/|$|\\?|#)`, 'i');
        if (regex.test(url)) return true;
        // Also check if pattern appears with hyphens around it
        const hyphenRegex = new RegExp(`[-/]${this._escapeRegex(pat)}[-/]`, 'i');
        if (hyphenRegex.test(url)) return true;
      } else if (matchType === 'regex') {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(url)) return true;
      }
    }
    return false;
  }

  /**
   * Evaluate text_contains condition
   * @private
   */
  _evalTextContains(condition, context) {
    const fieldValue = (context[condition.field] || '').toLowerCase();
    
    for (const pattern of condition.patterns) {
      if (fieldValue.includes(pattern.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  /**
   * Evaluate compare condition
   * @private
   */
  _evalCompare(condition, context) {
    const fieldValue = context[condition.field];
    let targetValue = condition.value;
    
    // Handle field reference
    if (targetValue && typeof targetValue === 'object' && targetValue.field) {
      targetValue = context[targetValue.field];
      if (targetValue !== undefined && condition.value.multiplier) {
        targetValue = targetValue * condition.value.multiplier;
      }
    }
    
    // Handle undefined values
    if (fieldValue === undefined || targetValue === undefined) {
      return false;
    }
    
    switch (condition.operator) {
      case 'eq':  return fieldValue === targetValue;
      case 'ne':  return fieldValue !== targetValue;
      case 'gt':  return fieldValue > targetValue;
      case 'gte': return fieldValue >= targetValue;
      case 'lt':  return fieldValue < targetValue;
      case 'lte': return fieldValue <= targetValue;
      default:
        throw new Error(`Unknown operator: ${condition.operator}`);
    }
  }

  /**
   * Evaluate compound condition (AND/OR)
   * @private
   */
  _evalCompound(condition, context) {
    if (condition.operator === 'AND') {
      return condition.conditions.every(c => this._evaluateCondition(c, context));
    } else if (condition.operator === 'OR') {
      return condition.conditions.some(c => this._evaluateCondition(c, context));
    }
    throw new Error(`Unknown compound operator: ${condition.operator}`);
  }

  /**
   * Evaluate flag condition
   * @private
   */
  _evalFlag(condition, context) {
    const value = !!context[condition.flag];
    const expected = condition.expected !== false;
    return value === expected;
  }

  /**
   * Generate human-readable description of a condition
   * @private
   */
  _describeCondition(condition) {
    switch (condition.type) {
      case 'url_matches':
        return `url matches [${condition.patterns.slice(0, 3).join(', ')}${condition.patterns.length > 3 ? '...' : ''}]`;
      case 'text_contains':
        return `${condition.field} contains [${condition.patterns.slice(0, 2).join(', ')}${condition.patterns.length > 2 ? '...' : ''}]`;
      case 'compare':
        const valDesc = typeof condition.value === 'object' 
          ? `${condition.value.field}${condition.value.multiplier ? '*' + condition.value.multiplier : ''}`
          : condition.value;
        return `${condition.field} ${condition.operator} ${valDesc}`;
      case 'compound':
        return `(${condition.conditions.length} conditions ${condition.operator})`;
      case 'flag':
        return `${condition.flag} is ${condition.expected !== false}`;
      default:
        return `${condition.type}`;
    }
  }

  /**
   * Encode path as compact string for storage
   * Format: nodeId:branch,nodeId:branch,...
   * @private
   */
  _encodePath(path) {
    return path.map(step => {
      const shortId = step.nodeId.replace(/^[a-z]+-/, '').slice(0, 8);
      const branch = step.branch === 'yes' ? 'Y' : 'N';
      return `${shortId}:${branch}`;
    }).join(',');
  }

  /**
   * Escape special regex characters
   * @private
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * Compact storage format for decision results
 * Designed for database storage with minimal space
 */
class DecisionJustification {
  /**
   * Create a compact justification record
   * @param {EvaluationResult} result
   * @returns {Object} Compact storage object
   */
  static toCompact(result) {
    return {
      cat: result.categoryId,           // Category slug
      m: result.match ? 1 : 0,          // Match flag (0/1)
      c: Math.round(result.confidence * 100), // Confidence as integer 0-100
      r: result.reason,                 // Reason code
      p: result.encodedPath             // Encoded path
    };
  }

  /**
   * Expand compact format back to full result
   * @param {Object} compact
   * @returns {Object}
   */
  static fromCompact(compact) {
    return {
      categoryId: compact.cat,
      match: compact.m === 1,
      confidence: compact.c / 100,
      reason: compact.r,
      encodedPath: compact.p
    };
  }

  /**
   * Encode multiple results as single JSON string
   * @param {EvaluationResult[]} results
   * @returns {string}
   */
  static encodeMultiple(results) {
    const matches = results.filter(r => r.match);
    const compacts = matches.map(r => DecisionJustification.toCompact(r));
    return JSON.stringify(compacts);
  }
}

module.exports = {
  DecisionTreeEngine,
  DecisionJustification
};
