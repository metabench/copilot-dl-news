#!/usr/bin/env node
'use strict';

/**
 * Confidence Backfill Tool
 * 
 * Computes and stores confidence scores for existing content_analysis rows.
 * 
 * Usage:
 *   node tools/confidence-backfill.js --limit 100          # Process 100 rows
 *   node tools/confidence-backfill.js --all                # Process all rows
 *   node tools/confidence-backfill.js --domain guardian    # Filter by domain
 *   node tools/confidence-backfill.js --dry-run            # Preview without updating
 *   node tools/confidence-backfill.js --json               # JSON output
 */

const Database = require('better-sqlite3');
const path = require('path');
const { ContentConfidenceScorer } = require('../src/intelligence/analysis/ContentConfidenceScorer');
const { decompress } = require('../src/shared/utils/compression');

// Parse args
const args = process.argv.slice(2);
function hasFlag(name) {
  return args.includes(name);
}
function getArg(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1];
}

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
confidence-backfill - Compute and store confidence scores for content_analysis

OPTIONS:
  --limit <n>       Number of rows to process (default: 100)
  --all             Process all rows without confidence score
  --domain <host>   Filter to pages from a specific domain
  --dry-run         Preview scores without updating database
  --json            Output results as JSON
  --verbose, -v     Show per-row details
  --help, -h        Show this help

EXAMPLES:
  node tools/confidence-backfill.js --limit 50
  node tools/confidence-backfill.js --domain theguardian.com --limit 100
  node tools/confidence-backfill.js --all --dry-run
  node tools/confidence-backfill.js --limit 100 --json
`);
  process.exit(0);
}

const limit = hasFlag('--all') ? null : parseInt(getArg('--limit', '100'), 10);
const domain = getArg('--domain', null);
const dryRun = hasFlag('--dry-run');
const jsonOutput = hasFlag('--json');
const verbose = hasFlag('--verbose') || hasFlag('-v');
const dbPath = getArg('--db', path.join(__dirname, '../data/news.db'));

// Open database
const db = new Database(dbPath, { readonly: dryRun });
const scorer = new ContentConfidenceScorer();

// Decompression helper - uses compression_types table to determine algorithm
function decompressContent(db, blob, compressionTypeId) {
  if (!blob) return null;
  
  try {
    // Look up the algorithm from compression_types table
    const type = db.prepare('SELECT algorithm FROM compression_types WHERE id = ?').get(compressionTypeId);
    if (!type) {
      // Fallback: assume uncompressed if type not found
      return blob.toString('utf-8');
    }
    
    const decompressed = decompress(blob, type.algorithm);
    return decompressed.toString('utf-8');
  } catch (e) {
    return null;
  }
}

// Build query
let whereClause = 'WHERE ca.confidence_score IS NULL';
const queryParams = [];

if (domain) {
  whereClause += ' AND u.url LIKE ?';
  queryParams.push(`%${domain}%`);
}

let limitClause = '';
if (limit) {
  limitClause = `LIMIT ${limit}`;
}

const query = `
  SELECT 
    ca.id as analysis_id,
    ca.content_id,
    ca.title,
    ca.word_count,
    ca.date,
    ca.section,
    ca.analysis_json,
    cs.content_blob,
    cs.compression_type_id,
    u.url
  FROM content_analysis ca
  JOIN content_storage cs ON cs.id = ca.content_id
  LEFT JOIN http_responses hr ON hr.id = cs.http_response_id
  LEFT JOIN urls u ON u.id = hr.url_id
  ${whereClause}
  ORDER BY ca.id DESC
  ${limitClause}
`;

const rows = db.prepare(query).all(...queryParams);

if (!jsonOutput) {
  console.log(`Found ${rows.length} rows to process.${domain ? ` (domain: ${domain})` : ''}`);
}

// Process rows
const results = [];
const stats = {
  processed: 0,
  updated: 0,
  errors: 0,
  byLevel: { high: 0, good: 0, medium: 0, low: 0, none: 0 }
};

const updateStmt = dryRun ? null : db.prepare(`
  UPDATE content_analysis SET confidence_score = ? WHERE id = ?
`);

for (const row of rows) {
  try {
    // Parse analysis JSON if available
    let analysisData = {};
    if (row.analysis_json) {
      try {
        analysisData = JSON.parse(row.analysis_json);
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    // Get content text if needed
    let contentText = null;
    if (!row.word_count && row.content_blob) {
      const html = decompressContent(db, row.content_blob, row.compression_type_id);
      if (html) {
        // Simple text extraction (strip tags)
        contentText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
    
    // Build extraction object for scoring
    const extraction = {
      title: row.title || analysisData.title,
      wordCount: row.word_count,
      content: contentText,
      date: row.date || analysisData.date,
      section: row.section || analysisData.section,
      author: analysisData.author || analysisData.byline,
      readability: analysisData.readability
    };
    
    // Compute score
    const confidence = scorer.score(extraction);
    
    stats.processed++;
    stats.byLevel[confidence.level]++;
    
    if (verbose && !jsonOutput) {
      console.log(`  ${row.analysis_id}: ${confidence.score.toFixed(3)} (${confidence.level}) - ${row.url?.slice(0, 60) || 'no-url'}...`);
    }
    
    // Update database
    if (!dryRun && updateStmt) {
      updateStmt.run(confidence.score, row.analysis_id);
      stats.updated++;
    }
    
    results.push({
      analysisId: row.analysis_id,
      url: row.url,
      score: confidence.score,
      level: confidence.level,
      recommendation: confidence.recommendation,
      needsTeacherReview: confidence.needsTeacherReview
    });
    
  } catch (e) {
    stats.errors++;
    if (!jsonOutput) {
      console.error(`  Error processing ${row.analysis_id}: ${e.message}`);
    }
  }
}

db.close();

// Output results
if (jsonOutput) {
  console.log(JSON.stringify({
    processed: stats.processed,
    updated: stats.updated,
    errors: stats.errors,
    byLevel: stats.byLevel,
    dryRun,
    results: verbose ? results : undefined
  }, null, 2));
} else {
  console.log(`\nProcessed ${stats.processed} rows${dryRun ? ' (dry-run)' : ''}.`);
  console.log(`Updated: ${stats.updated}, Errors: ${stats.errors}`);
  console.log(`\nConfidence distribution:`);
  console.log(`  High (0.8+):   ${stats.byLevel.high}`);
  console.log(`  Good (0.6-0.8): ${stats.byLevel.good}`);
  console.log(`  Medium (0.3-0.6): ${stats.byLevel.medium}`);
  console.log(`  Low (<0.3):    ${stats.byLevel.low}`);
  
  const needsReview = stats.byLevel.low + stats.byLevel.medium;
  if (needsReview > 0) {
    console.log(`\n⚠️  ${needsReview} pages need Teacher review (confidence < 0.6)`);
  }
}
