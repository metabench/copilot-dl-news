#!/usr/bin/env node
/**
 * URL Classification Tester
 * 
 * CLI tool for testing and verifying URL classifications against the decision tree.
 * Supports:
 * - Testing individual URLs
 * - Batch testing from database
 * - Comparing decision tree results against expected values
 * - Detailed trace output for debugging
 * - Export mismatches for review
 * 
 * @usage
 *   node tools/dev/url-classify-test.js --url "https://example.com/path"
 *   node tools/dev/url-classify-test.js --sample 200 --host theguardian.com
 *   node tools/dev/url-classify-test.js --sample 500 --export-mismatches
 *   node tools/dev/url-classify-test.js --trace --url "https://example.com/path"
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const DECISION_TREE_PATH = path.join(__dirname, '../../config/decision-trees/url-classification.json');
const DB_PATH = path.join(__dirname, '../../data/news.db');

// ═══════════════════════════════════════════════════════════════════════════
// URL Signal Extraction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract signals from a URL for decision tree evaluation
 * @param {string} rawUrl - The URL to analyze
 * @returns {Object} Signals object for decision tree
 */
function extractUrlSignals(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname || '/';
    const segments = path.split('/').filter(Boolean);
    const depth = segments.length;
    const lastSegment = segments[depth - 1] || '';
    const queryParams = new URLSearchParams(u.search);
    
    return {
      url: rawUrl,
      host: u.hostname,
      path: path,
      pathDepth: depth,
      segments: segments,
      section: segments[0] || null,
      slugLength: lastSegment.length,
      slug: lastSegment,
      hasHyphenatedSlug: lastSegment.includes('-') && lastSegment.length > 10,
      hasQueryParams: queryParams.size > 0,
      queryCount: queryParams.size,
      hasPageParam: queryParams.has('page'),
      
      // Date pattern checks (computed lazily in conditions)
      _hasGuardianDate: null,
      _hasNumericDate: null
    };
  } catch (e) {
    return {
      url: rawUrl,
      error: e.message,
      pathDepth: 0,
      slugLength: 0,
      hasHyphenatedSlug: false,
      hasQueryParams: false,
      queryCount: 0,
      hasPageParam: false
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Decision Tree Engine (Simplified for URL classification)
// ═══════════════════════════════════════════════════════════════════════════

class UrlClassificationEngine {
  constructor(configPath = DECISION_TREE_PATH) {
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    this.categories = this.config.categories;
    this.fallback = this.config.fallback;
  }
  
  /**
   * Classify a URL using the decision tree
   * @param {string} url - URL to classify
   * @param {Object} options - Options
   * @param {boolean} options.trace - Include detailed trace
   * @returns {Object} Classification result
   */
  classify(url, { trace = false } = {}) {
    const signals = extractUrlSignals(url);
    const results = [];
    const traces = {};
    
    // Evaluate each category
    for (const [categoryId, category] of Object.entries(this.categories)) {
      const pathSteps = [];
      const result = this._evaluateNode(category.tree, signals, pathSteps);
      
      results.push({
        categoryId,
        categoryName: category.displayName,
        match: result.result === 'match',
        confidence: result.confidence || 0,
        reason: result.reason
      });
      
      if (trace) {
        traces[categoryId] = pathSteps;
      }
    }
    
    // Find highest confidence match
    const matches = results.filter(r => r.match).sort((a, b) => b.confidence - a.confidence);
    
    let finalClassification;
    let finalConfidence;
    let finalReason;
    
    if (matches.length > 0) {
      finalClassification = matches[0].categoryId;
      finalConfidence = matches[0].confidence;
      finalReason = matches[0].reason;
    } else {
      finalClassification = this.fallback.classification;
      finalConfidence = this.fallback.confidence;
      finalReason = this.fallback.reason;
    }
    
    const output = {
      url,
      classification: finalClassification,
      confidence: finalConfidence,
      reason: finalReason,
      allResults: results,
      signals: {
        pathDepth: signals.pathDepth,
        slugLength: signals.slugLength,
        hasHyphenatedSlug: signals.hasHyphenatedSlug,
        hasPageParam: signals.hasPageParam,
        hasQueryParams: signals.hasQueryParams
      }
    };
    
    if (trace) {
      output.traces = traces;
    }
    
    return output;
  }
  
  /**
   * Recursively evaluate a decision node
   * @private
   */
  _evaluateNode(node, signals, pathSteps) {
    // Result node - terminal
    if (node.result !== undefined) {
      return {
        result: node.result,
        confidence: node.confidence,
        reason: node.reason
      };
    }
    
    // Branch node - evaluate condition
    const conditionResult = this._evaluateCondition(node.condition, signals);
    const conditionDesc = this._describeCondition(node.condition);
    
    pathSteps.push({
      nodeId: node.id || 'anonymous',
      condition: conditionDesc,
      result: conditionResult,
      branch: conditionResult ? 'yes' : 'no'
    });
    
    // Follow the appropriate branch
    const nextNode = conditionResult ? node.yes : node.no;
    return this._evaluateNode(nextNode, signals, pathSteps);
  }
  
  /**
   * Evaluate a single condition
   * @private
   */
  _evaluateCondition(condition, signals) {
    // Handle negation
    let result;
    
    switch (condition.type) {
      case 'url_matches':
        result = this._evalUrlMatches(condition, signals);
        break;
      case 'compare':
        result = this._evalCompare(condition, signals);
        break;
      case 'compound':
        result = this._evalCompound(condition, signals);
        break;
      default:
        throw new Error(`Unknown condition type: ${condition.type}`);
    }
    
    return condition.negate ? !result : result;
  }
  
  /**
   * Evaluate url_matches condition
   * @private
   */
  _evalUrlMatches(condition, signals) {
    const url = signals.url.toLowerCase();
    const matchType = condition.matchType || 'segment';
    
    for (const pattern of condition.patterns) {
      if (matchType === 'contains') {
        if (url.includes(pattern.toLowerCase())) return true;
      } else if (matchType === 'segment') {
        const regex = new RegExp(`(^|/)${this._escapeRegex(pattern)}(/|$|\\?|#)`, 'i');
        if (regex.test(url)) return true;
      } else if (matchType === 'regex') {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(url)) return true;
        } catch (e) {
          console.error(`Invalid regex: ${pattern}`, e.message);
        }
      }
    }
    return false;
  }
  
  /**
   * Evaluate compare condition
   * @private
   */
  _evalCompare(condition, signals) {
    const fieldValue = signals[condition.field];
    const targetValue = condition.value;
    
    if (fieldValue === undefined) return false;
    
    switch (condition.operator) {
      case 'eq': return fieldValue === targetValue;
      case 'ne': return fieldValue !== targetValue;
      case 'gt': return fieldValue > targetValue;
      case 'gte': return fieldValue >= targetValue;
      case 'lt': return fieldValue < targetValue;
      case 'lte': return fieldValue <= targetValue;
      default:
        throw new Error(`Unknown operator: ${condition.operator}`);
    }
  }
  
  /**
   * Evaluate compound condition
   * @private
   */
  _evalCompound(condition, signals) {
    if (condition.operator === 'AND') {
      return condition.conditions.every(c => this._evaluateCondition(c, signals));
    } else if (condition.operator === 'OR') {
      return condition.conditions.some(c => this._evaluateCondition(c, signals));
    }
    throw new Error(`Unknown compound operator: ${condition.operator}`);
  }
  
  /**
   * Describe a condition in human-readable form
   * @private
   */
  _describeCondition(condition) {
    const neg = condition.negate ? 'NOT ' : '';
    switch (condition.type) {
      case 'url_matches':
        return `${neg}url ${condition.matchType} [${condition.patterns.slice(0, 2).join(', ')}${condition.patterns.length > 2 ? '...' : ''}]`;
      case 'compare':
        return `${neg}${condition.field} ${condition.operator} ${condition.value}`;
      case 'compound':
        return `${neg}(${condition.conditions.length} conditions ${condition.operator})`;
      default:
        return `${neg}${condition.type}`;
    }
  }
  
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Database Access
// ═══════════════════════════════════════════════════════════════════════════

function getDbSample(dbPath, sampleSize, hostFilter = null) {
  const db = new Database(dbPath, { readonly: true });
  
  let query = `
    SELECT DISTINCT u.url, u.host
    FROM urls u
    WHERE u.url NOT LIKE '%/ss/c/%'
      AND u.url NOT LIKE '%intent/tweet%'
      AND u.url NOT LIKE '%dialog/share%'
      AND u.url NOT LIKE '%@%'
  `;
  
  const params = [];
  
  if (hostFilter) {
    query += ` AND u.host LIKE ?`;
    params.push(`%${hostFilter}%`);
  }
  
  query += ` ORDER BY RANDOM() LIMIT ?`;
  params.push(sampleSize);
  
  const rows = db.prepare(query).all(...params);
  db.close();
  
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// Output Formatting
// ═══════════════════════════════════════════════════════════════════════════

function printResult(result, verbose = false) {
  const conf = (result.confidence * 100).toFixed(0);
  const path = new URL(result.url).pathname.substring(0, 60);
  
  console.log(`${result.classification.padEnd(10)} ${conf.padStart(3)}%  ${path}`);
  
  if (verbose) {
    console.log(`  Reason: ${result.reason}`);
    console.log(`  Signals: depth=${result.signals.pathDepth}, slug=${result.signals.slugLength}, hyphen=${result.signals.hasHyphenatedSlug}`);
  }
}

function printTrace(result) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`URL: ${result.url}`);
  console.log(`Classification: ${result.classification} (${(result.confidence * 100).toFixed(0)}%)`);
  console.log(`Reason: ${result.reason}`);
  console.log(`${'─'.repeat(70)}`);
  console.log('Signals:');
  for (const [key, val] of Object.entries(result.signals)) {
    console.log(`  ${key}: ${val}`);
  }
  console.log(`${'─'.repeat(70)}`);
  
  for (const [catId, steps] of Object.entries(result.traces)) {
    const catResult = result.allResults.find(r => r.categoryId === catId);
    const marker = catResult.match ? '✓' : '✗';
    console.log(`\n${marker} ${catId}:`);
    for (const step of steps) {
      const arrow = step.result ? '→ yes' : '→ no';
      console.log(`  [${step.nodeId}] ${step.condition} ${arrow}`);
    }
  }
  console.log(`${'═'.repeat(70)}\n`);
}

function printSummary(results) {
  const counts = { article: 0, hub: 0, nav: 0, unknown: 0 };
  for (const r of results) {
    counts[r.classification] = (counts[r.classification] || 0) + 1;
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log('CLASSIFICATION SUMMARY');
  console.log('─'.repeat(50));
  for (const [cls, count] of Object.entries(counts)) {
    const pct = ((count / results.length) * 100).toFixed(1);
    console.log(`  ${cls.padEnd(10)} ${count.toString().padStart(5)} (${pct}%)`);
  }
  console.log('─'.repeat(50));
  console.log(`  TOTAL      ${results.length.toString().padStart(5)}`);
  console.log('═'.repeat(50));
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    url: null,
    sample: null,
    host: null,
    trace: false,
    verbose: false,
    json: false,
    exportMismatches: false,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' && args[i + 1]) {
      opts.url = args[++i];
    } else if (arg === '--sample' && args[i + 1]) {
      opts.sample = parseInt(args[++i], 10);
    } else if (arg === '--host' && args[i + 1]) {
      opts.host = args[++i];
    } else if (arg === '--trace' || arg === '-t') {
      opts.trace = true;
    } else if (arg === '--verbose' || arg === '-v') {
      opts.verbose = true;
    } else if (arg === '--json' || arg === '-j') {
      opts.json = true;
    } else if (arg === '--export-mismatches') {
      opts.exportMismatches = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    }
  }
  
  return opts;
}

function showHelp() {
  console.log(`
URL Classification Tester

USAGE:
  node tools/dev/url-classify-test.js [options]

OPTIONS:
  --url <url>           Test a single URL
  --sample <n>          Test n random URLs from database
  --host <domain>       Filter by host (e.g., theguardian.com)
  --trace, -t           Show detailed decision trace
  --verbose, -v         Show signals and reason for each URL
  --json, -j            Output as JSON
  --export-mismatches   Export unknown/uncertain to tmp/mismatches.json
  --help, -h            Show this help

EXAMPLES:
  # Test a single URL with trace
  node tools/dev/url-classify-test.js --url "https://theguardian.com/world" --trace

  # Test 200 random Guardian URLs
  node tools/dev/url-classify-test.js --sample 200 --host theguardian.com

  # Export all uncertain classifications for review
  node tools/dev/url-classify-test.js --sample 500 --export-mismatches --json
`);
}

async function main() {
  const opts = parseArgs();
  
  if (opts.help) {
    showHelp();
    process.exit(0);
  }
  
  const engine = new UrlClassificationEngine();
  
  if (opts.url) {
    // Single URL test
    const result = engine.classify(opts.url, { trace: opts.trace });
    
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (opts.trace) {
      printTrace(result);
    } else {
      printResult(result, opts.verbose);
    }
  } else if (opts.sample) {
    // Batch test
    const urls = getDbSample(DB_PATH, opts.sample, opts.host);
    const results = [];
    const mismatches = [];
    
    console.log(`Testing ${urls.length} URLs...`);
    if (!opts.json) console.log('─'.repeat(70));
    
    for (const { url } of urls) {
      const result = engine.classify(url, { trace: false });
      results.push(result);
      
      if (result.classification === 'unknown' || result.confidence < 0.7) {
        mismatches.push(result);
      }
      
      if (!opts.json && opts.verbose) {
        printResult(result, opts.verbose);
      }
    }
    
    if (opts.json) {
      console.log(JSON.stringify({
        sampleSize: results.length,
        summary: {
          article: results.filter(r => r.classification === 'article').length,
          hub: results.filter(r => r.classification === 'hub').length,
          nav: results.filter(r => r.classification === 'nav').length,
          unknown: results.filter(r => r.classification === 'unknown').length
        },
        mismatches: mismatches.length,
        results: opts.verbose ? results : undefined
      }, null, 2));
    } else {
      printSummary(results);
      
      if (mismatches.length > 0) {
        console.log(`\nUncertain/Unknown Classifications: ${mismatches.length}`);
        for (const m of mismatches.slice(0, 10)) {
          const path = new URL(m.url).pathname.substring(0, 50);
          console.log(`  ${m.classification.padEnd(10)} ${(m.confidence * 100).toFixed(0).padStart(3)}%  ${path}`);
        }
        if (mismatches.length > 10) {
          console.log(`  ... and ${mismatches.length - 10} more`);
        }
      }
    }
    
    if (opts.exportMismatches && mismatches.length > 0) {
      const exportPath = path.join(__dirname, '../../tmp/classification-mismatches.json');
      fs.writeFileSync(exportPath, JSON.stringify(mismatches, null, 2));
      console.log(`\nExported ${mismatches.length} uncertain classifications to ${exportPath}`);
    }
  } else {
    showHelp();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
