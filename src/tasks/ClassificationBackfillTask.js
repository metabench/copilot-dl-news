'use strict';

const { BackgroundTask } = require('./BackgroundTask');
const path = require('path');
const fs = require('fs');

/**
 * ClassificationBackfillTask - Reclassify all URLs in the database using the decision tree
 */
class ClassificationBackfillTask extends BackgroundTask {
  constructor(options = {}) {
    super(options);
    
    this.dbPath = options.dbPath || path.join(process.cwd(), 'data', 'news.db');
    this.batchSize = options.batchSize || 100;
    this.decisionTreePath = options.decisionTreePath || 
      path.join(process.cwd(), 'config', 'decision-trees', 'url-classification.json');
    
    // Results tracking
    this.results = {
      article: 0,
      hub: 0,
      nav: 0,
      unknown: 0,
      errors: 0,
      changed: 0,
      unchanged: 0
    };
    
    this.decisionTree = null;
    this.db = null;
  }
  
  getName() {
    return 'URL Classification Backfill';
  }
  
  getType() {
    return 'classification-backfill';
  }
  
  async _execute() {
    const Database = require('better-sqlite3');
    
    // Phase 1: Load decision tree
    this.updateProgress(0, { phase: 'init', message: 'Loading decision tree...' });
    
    if (!fs.existsSync(this.decisionTreePath)) {
      throw new Error(`Decision tree not found: ${this.decisionTreePath}`);
    }
    this.decisionTree = JSON.parse(fs.readFileSync(this.decisionTreePath, 'utf8'));
    
    // Phase 2: Open database and count URLs
    this.updateProgress(0, { phase: 'counting', message: 'Counting URLs...' });
    
    this.db = new Database(this.dbPath, { readonly: false });
    
    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM pages').get();
    const totalUrls = countRow.count;
    this.setTotal(totalUrls);
    
    this.updateProgress(0, { phase: 'processing', message: `Found ${totalUrls} URLs to classify` });
    
    // Ensure classification column exists
    this._ensureClassificationColumn();
    
    // Phase 3: Process in batches
    const selectStmt = this.db.prepare(`
      SELECT id, url, classification 
      FROM pages 
      ORDER BY id 
      LIMIT ? OFFSET ?
    `);
    
    const updateStmt = this.db.prepare(`
      UPDATE pages SET classification = ? WHERE id = ?
    `);
    
    let offset = 0;
    let processed = 0;
    
    while (true) {
      // Check for cancellation
      if (this.isCancelled()) {
        this.updateProgress(processed, { message: 'Cancelled' });
        break;
      }
      
      // Wait if paused
      await this.waitIfPaused();
      
      // Fetch batch
      const rows = selectStmt.all(this.batchSize, offset);
      if (rows.length === 0) break;
      
      // Process batch in a transaction
      const updateBatch = this.db.transaction((rows) => {
        for (const row of rows) {
          try {
            const newClassification = this._classifyUrl(row.url);
            this.results[newClassification]++;
            
            if (row.classification !== newClassification) {
              updateStmt.run(newClassification, row.id);
              this.results.changed++;
            } else {
              this.results.unchanged++;
            }
          } catch (err) {
            this.results.errors++;
          }
        }
      });
      
      updateBatch(rows);
      
      processed += rows.length;
      offset += this.batchSize;
      
      this.updateProgress(processed, {
        message: `${processed}/${totalUrls} | Changed: ${this.results.changed} | A:${this.results.article} H:${this.results.hub} N:${this.results.nav}`
      });
    }
    
    // Cleanup
    this.db.close();
    this.db = null;
    
    return this.results;
  }
  
  /**
   * Ensure the classification column exists
   */
  _ensureClassificationColumn() {
    const cols = this.db.prepare("PRAGMA table_info(pages)").all();
    const hasClassification = cols.some(c => c.name === 'classification');
    
    if (!hasClassification) {
      this.db.exec(`ALTER TABLE pages ADD COLUMN classification TEXT DEFAULT 'unknown'`);
    }
  }
  
  /**
   * Classify a URL using the decision tree
   * @param {string} url 
   * @returns {string} classification
   */
  _classifyUrl(url) {
    const signals = this._computeSignals(url);
    if (signals.error) return 'unknown';
    
    // Check each category tree in order
    const categories = ['nav', 'hub', 'article'];
    
    for (const category of categories) {
      const catTree = this.decisionTree.categories?.[category];
      if (!catTree?.tree) continue;
      
      const result = this._evaluateTree(signals, catTree.tree);
      if (result === 'match') {
        return category;
      }
    }
    
    return this.decisionTree.fallback || 'unknown';
  }
  
  /**
   * Compute URL signals
   */
  _computeSignals(urlStr) {
    try {
      const u = new URL(urlStr);
      const urlPath = u.pathname;
      const segments = urlPath.split('/').filter(Boolean);
      const depth = segments.length;
      const lastSegment = segments[depth - 1] || '';
      
      return {
        url: urlStr,
        host: u.hostname,
        path: urlPath,
        pathDepth: depth,
        segments,
        slug: lastSegment,
        slugLength: lastSegment.length,
        hasPage: u.searchParams.has('page'),
        hasDatePath: /\/\d{4}\/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{2})\/\d{1,2}\//i.test(urlPath),
        hasNumericDate: /\/\d{4}\/\d{2}\/\d{2}\//.test(urlPath),
        hasHyphenatedSlug: lastSegment.includes('-') && lastSegment.length > 10,
        hasSeriesSegment: urlPath.includes('/series/'),
        hasArticleSegment: /\/article[s]?\//.test(urlPath),
        hasLiveSegment: urlPath.includes('/live/'),
        isMediaFile: /\.(jpg|jpeg|png|gif|svg|webp|mp4|mp3|pdf)$/i.test(urlPath),
        fileExtension: urlPath.match(/\.([a-z0-9]+)$/i)?.[1] || null,
        queryParamCount: Array.from(u.searchParams).length
      };
    } catch (e) {
      return { error: e.message };
    }
  }
  
  /**
   * Evaluate a decision tree node
   */
  _evaluateTree(signals, node, depth = 0) {
    if (!node || depth > 50) return 'unknown';
    
    if (node.result !== undefined) {
      return node.result === 'match' || node.result === true ? 'match' : 'no-match';
    }
    
    if (node.condition) {
      const result = this._evaluateCondition(node.condition, signals);
      const nextNode = result ? node.yes : node.no;
      return this._evaluateTree(signals, nextNode, depth + 1);
    }
    
    return 'unknown';
  }
  
  /**
   * Evaluate a condition
   */
  _evaluateCondition(condition, signals) {
    if (!condition) return false;
    
    switch (condition.type) {
      case 'compare': {
        const actual = signals[condition.field];
        const value = condition.value;
        
        switch (condition.operator) {
          case 'eq': return actual === value;
          case 'ne': return actual !== value;
          case 'gt': return actual > value;
          case 'gte': return actual >= value;
          case 'lt': return actual < value;
          case 'lte': return actual <= value;
          default: return false;
        }
      }
      
      case 'flag': {
        const actual = !!signals[condition.flag];
        const expected = condition.expected !== false;
        return actual === expected;
      }
      
      case 'url_matches': {
        const patterns = condition.patterns || [];
        const urlSignal = signals.url || '';
        const pathSignal = signals.path || '';
        const matchType = condition.matchType || 'contains';
        const negate = condition.negate === true;
        
        let matched = false;
        for (const pattern of patterns) {
          if (matchType === 'regex') {
            try {
              const regex = new RegExp(pattern, 'i');
              if (regex.test(urlSignal) || regex.test(pathSignal)) {
                matched = true;
                break;
              }
            } catch (e) { /* ignore */ }
          } else {
            if (urlSignal.includes(pattern) || pathSignal.includes(pattern)) {
              matched = true;
              break;
            }
          }
        }
        
        return negate ? !matched : matched;
      }
      
      case 'compound': {
        const conditions = condition.conditions || [];
        const operator = (condition.operator || 'and').toLowerCase();
        
        if (operator === 'and') {
          return conditions.every(c => this._evaluateCondition(c, signals));
        } else {
          return conditions.some(c => this._evaluateCondition(c, signals));
        }
      }
      
      default:
        return false;
    }
  }
}

module.exports = { ClassificationBackfillTask };
