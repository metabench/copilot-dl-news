#!/usr/bin/env node

/**
 * Data Export CLI Tool
 * 
 * Export articles, domains, and analytics data in multiple formats.
 * 
 * Usage:
 *   node tools/export-data.js --format json --output data/exports/articles.json
 *   node tools/export-data.js --format csv --type domains --since 2025-01-01
 *   node tools/export-data.js --format rss --host example.com > feed.xml
 *   node tools/export-data.js --format jsonl --stream --limit 10000 > large.jsonl
 * 
 * Options:
 *   --format <format>   Output format: json, jsonl, csv, rss, atom (default: json)
 *   --type <type>       Data type: articles, domains, analytics (default: articles)
 *   --output <file>     Output file path (or stdout if omitted)
 *   --since <date>      Filter since date (ISO 8601)
 *   --until <date>      Filter until date (ISO 8601)
 *   --host <hostname>   Filter by hostname
 *   --limit <number>    Maximum records (default: 1000)
 *   --stream            Use streaming mode for large datasets (JSONL/CSV only)
 *   --fields <list>     Comma-separated field list for CSV
 *   --db <path>         Database path (default: data/news.db)
 *   --verbose, -v       Verbose logging
 *   --help, -h          Show help
 * 
 * @module export-data
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ensureDb } = require('../src/db/sqlite/ensureDb');
const { ExportService } = require('../src/export/ExportService');

// Default paths
const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'news.db');

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    format: 'json',
    type: 'articles',
    output: null,
    since: null,
    until: null,
    host: null,
    limit: 1000,
    stream: false,
    fields: null,
    dbPath: DEFAULT_DB_PATH,
    verbose: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--format':
      case '-f':
        options.format = next;
        i++;
        break;
      case '--type':
      case '-t':
        options.type = next;
        i++;
        break;
      case '--output':
      case '-o':
        options.output = next;
        i++;
        break;
      case '--since':
        options.since = next;
        i++;
        break;
      case '--until':
        options.until = next;
        i++;
        break;
      case '--host':
        options.host = next;
        i++;
        break;
      case '--limit':
      case '-l':
        options.limit = parseInt(next, 10) || 1000;
        i++;
        break;
      case '--stream':
        options.stream = true;
        break;
      case '--fields':
        options.fields = next.split(',').map(f => f.trim());
        i++;
        break;
      case '--db':
        options.dbPath = next;
        i++;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Data Export CLI Tool

Export articles, domains, and analytics data in multiple formats.

Usage:
  node tools/export-data.js [options]

Options:
  --format <format>   Output format: json, jsonl, csv, rss, atom (default: json)
  --type <type>       Data type: articles, domains, analytics (default: articles)
  --output <file>     Output file path (writes to stdout if omitted)
  --since <date>      Filter since date (ISO 8601, e.g., 2025-01-01)
  --until <date>      Filter until date (ISO 8601)
  --host <hostname>   Filter by hostname
  --limit <number>    Maximum records (default: 1000, max: 100000)
  --stream            Use streaming mode for large datasets (JSONL/CSV only)
  --fields <list>     Comma-separated field list for CSV
  --db <path>         Database path (default: data/news.db)
  --verbose, -v       Verbose logging
  --help, -h          Show this help

Formats:
  json    Standard JSON with metadata wrapper (default)
  jsonl   Newline-delimited JSON (streaming-friendly)
  csv     Comma-separated values with headers
  rss     RSS 2.0 XML feed (articles only)
  atom    Atom 1.0 XML feed (articles only)

Examples:
  # Export all articles as JSON
  node tools/export-data.js --format json --output exports/articles.json

  # Export articles from a specific host as CSV
  node tools/export-data.js --format csv --host example.com --output exports/example.csv

  # Export recent articles as RSS feed
  node tools/export-data.js --format rss --since 2025-01-01 > feed.xml

  # Stream large dataset as JSONL
  node tools/export-data.js --format jsonl --stream --limit 100000 > large.jsonl

  # Export domains with specific fields
  node tools/export-data.js --type domains --format csv --fields host,article_count

  # Export with date range
  node tools/export-data.js --since 2025-01-01 --until 2025-01-31 --output january.json
`);
}

/**
 * Create a simple articles adapter from database
 * @param {Object} db - Database connection
 * @returns {Object} Articles adapter
 */
function createSimpleArticlesAdapter(db) {
  return {
    exportArticles(options = {}) {
      const { limit = 1000, since, until, host, offset = 0 } = options;

      let sql = `
        SELECT 
          ca.id,
          u.url,
          u.host,
          ca.title,
          ca.date as published_at,
          hr.fetched_at,
          ca.word_count,
          ca.section as category,
          ca.byline,
          cs.body_text
        FROM content_analysis ca
        JOIN http_responses hr ON hr.id = ca.http_response_id
        JOIN urls u ON u.id = hr.url_id
        LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
        WHERE 1=1
      `;

      const params = [];

      if (since) {
        sql += ` AND (ca.date >= ? OR hr.fetched_at >= ?)`;
        params.push(since, since);
      }

      if (until) {
        sql += ` AND (ca.date <= ? OR hr.fetched_at <= ?)`;
        params.push(until, until);
      }

      if (host) {
        sql += ` AND u.host = ?`;
        params.push(host);
      }

      sql += ` ORDER BY hr.fetched_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      try {
        return db.prepare(sql).all(...params);
      } catch (err) {
        // Table might not exist
        console.error('Query failed:', err.message);
        return [];
      }
    },

    exportArticlesBatch(options) {
      return this.exportArticles(options);
    },

    listDomains(options = {}) {
      const { limit = 1000 } = options;

      try {
        const sql = `
          SELECT 
            u.host,
            COUNT(*) as article_count,
            MIN(hr.fetched_at) as first_crawled,
            MAX(hr.fetched_at) as last_crawled
          FROM urls u
          JOIN http_responses hr ON hr.url_id = u.id
          GROUP BY u.host
          ORDER BY article_count DESC
          LIMIT ?
        `;

        return { items: db.prepare(sql).all(limit) };
      } catch (err) {
        console.error('Query failed:', err.message);
        return { items: [] };
      }
    },

    exportDomains(options = {}) {
      const result = this.listDomains(options);
      return result.items || [];
    }
  };
}

/**
 * Main CLI function
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Validate format
  const validFormats = ['json', 'jsonl', 'csv', 'rss', 'atom'];
  if (!validFormats.includes(options.format)) {
    console.error(`Error: Invalid format '${options.format}'. Valid formats: ${validFormats.join(', ')}`);
    process.exit(1);
  }

  // Validate type
  const validTypes = ['articles', 'domains', 'analytics'];
  if (!validTypes.includes(options.type)) {
    console.error(`Error: Invalid type '${options.type}'. Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  // Validate feed formats for non-article types
  if ((options.format === 'rss' || options.format === 'atom') && options.type !== 'articles') {
    console.error(`Error: RSS/Atom feeds only supported for articles, not ${options.type}`);
    process.exit(1);
  }

  // Open database
  let db;
  try {
    if (!fs.existsSync(options.dbPath)) {
      console.error(`Error: Database not found at ${options.dbPath}`);
      process.exit(1);
    }
    db = ensureDb(options.dbPath, { readonly: true });
  } catch (err) {
    console.error(`Error: Failed to open database: ${err.message}`);
    process.exit(1);
  }

  // Create adapters
  const articlesAdapter = createSimpleArticlesAdapter(db);

  // Create export service
  const exportService = new ExportService({
    articlesAdapter,
    domainsAdapter: articlesAdapter,
    logger: options.verbose ? console : { log: () => {}, error: console.error }
  });

  if (options.verbose) {
    console.error(`[export] Format: ${options.format}`);
    console.error(`[export] Type: ${options.type}`);
    console.error(`[export] Limit: ${options.limit}`);
    if (options.since) console.error(`[export] Since: ${options.since}`);
    if (options.until) console.error(`[export] Until: ${options.until}`);
    if (options.host) console.error(`[export] Host: ${options.host}`);
    if (options.output) console.error(`[export] Output: ${options.output}`);
    if (options.stream) console.error(`[export] Streaming: enabled`);
  }

  try {
    let output;

    // Handle streaming mode
    if (options.stream && (options.format === 'jsonl' || options.format === 'csv')) {
      const stream = exportService.createExportStream(options.type, options.format, {
        since: options.since,
        until: options.until,
        host: options.host,
        limit: options.limit,
        fields: options.fields
      });

      if (options.output) {
        // Ensure output directory exists
        const outputDir = path.dirname(options.output);
        if (outputDir && !fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const writeStream = fs.createWriteStream(options.output);
        stream.pipe(writeStream);

        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
          stream.on('error', reject);
        });

        if (options.verbose) {
          const stats = fs.statSync(options.output);
          console.error(`[export] Written ${stats.size} bytes to ${options.output}`);
        }
      } else {
        // Pipe to stdout
        stream.pipe(process.stdout);
        await new Promise((resolve, reject) => {
          stream.on('end', resolve);
          stream.on('error', reject);
        });
      }

      db.close();
      return;
    }

    // Non-streaming export
    const exportOptions = {
      since: options.since,
      until: options.until,
      host: options.host,
      limit: options.limit,
      fields: options.fields
    };

    if (options.type === 'articles') {
      output = exportService.exportArticles(options.format, exportOptions);
    } else if (options.type === 'domains') {
      output = exportService.exportDomains(options.format, exportOptions);
    } else if (options.type === 'analytics') {
      console.error('Error: Analytics export requires analytics adapter (not implemented in CLI)');
      process.exit(1);
    }

    // Write output
    if (options.output) {
      // Ensure output directory exists
      const outputDir = path.dirname(options.output);
      if (outputDir && !fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(options.output, output, 'utf8');

      if (options.verbose) {
        const stats = fs.statSync(options.output);
        console.error(`[export] Written ${stats.size} bytes to ${options.output}`);
      }
    } else {
      // Write to stdout
      process.stdout.write(output);
    }

    db.close();

  } catch (err) {
    console.error(`Error: Export failed: ${err.message}`);
    if (options.verbose) {
      console.error(err.stack);
    }
    db.close();
    process.exit(1);
  }
}

// Run CLI
main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
