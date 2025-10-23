#!/usr/bin/env node

/**
 * Show analysis for a specific URL.
 * 
 * Displays the analysis data for a given URL, showing:
 * - The highest analysis version in the system
 * - The analysis version of the page
 * - Whether the page is using the latest analysis version (green) or not (orange)
 * 
 * Usage:
 *   node src/tools/show-analysis.js --url "https://www.theguardian.com/world"
 *   node src/tools/show-analysis.js --url "https://www.theguardian.com/world" --verbose
 */

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDatabase } = require('../db/sqlite');

const projectRoot = findProjectRoot(__dirname);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  orange: '\x1b[38;5;208m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m'
};

function parseArgs(argv = process.argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const raw = argv[i];
    if (typeof raw !== 'string' || !raw.startsWith('--')) continue;
    
    const eq = raw.indexOf('=');
    if (eq > -1) {
      // --key=value format
      const keyPart = raw.slice(2, eq);
      const key = keyPart.replace(/-([a-z])/gi, (_, ch) => ch.toUpperCase());
      const value = raw.slice(eq + 1).trim();
      args[key] = value;
    } else {
      // --key value format (check next arg)
      const keyPart = raw.slice(2);
      const key = keyPart.replace(/-([a-z])/gi, (_, ch) => ch.toUpperCase());
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[key] = argv[++i];
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function formatJson(obj, indent = 2) {
  return JSON.stringify(obj, null, indent);
}

function formatAnalysisJson(analysisJson) {
  if (!analysisJson) return null;
  try {
    const parsed = typeof analysisJson === 'string' ? JSON.parse(analysisJson) : analysisJson;
    return parsed;
  } catch (err) {
    console.error(`${colors.orange}Error parsing analysis JSON: ${err.message}${colors.reset}`);
    return null;
  }
}

async function main() {
  const args = parseArgs();
  const url = args.url;
  const verbose = args.verbose === true || args.verbose === 'true';

  if (!url) {
    console.error(`${colors.bold}${colors.orange}Error: --url parameter is required${colors.reset}`);
    console.error('\nUsage:');
    console.error('  node src/tools/show-analysis.js --url "https://example.com"');
    process.exit(1);
  }

  try {
    const dbPath = path.join(projectRoot, 'data', 'news.db');
    const db = ensureDatabase(dbPath);

    // Get the highest analysis version
    const maxVersionResult = db.prepare(
      'SELECT COALESCE(MAX(analysis_version), 0) as max_version FROM content_analysis'
    ).get();
    const maxAnalysisVersion = maxVersionResult?.max_version || 0;

    // Find the URL and get its most recent download with analysis
    const analysisResult = db.prepare(`
      SELECT 
        ca.id as analysis_id,
        ca.content_id,
        ca.analysis_version,
        ca.analysis_json,
        ca.title,
        ca.section,
        ca.word_count,
        ca.classification,
        ca.article_xpath,
        ca.nav_links_count,
        ca.article_links_count,
        u.url,
        u.host,
        u.canonical_url,
        hr.http_status,
        hr.content_type,
        hr.fetched_at,
        cs.storage_type,
        cs.uncompressed_size,
        cs.compressed_size,
        cs.compression_ratio,
        ct.algorithm as compression_algorithm
      FROM content_analysis ca
      JOIN content_storage cs ON ca.content_id = cs.id
      JOIN http_responses hr ON cs.http_response_id = hr.id
      JOIN urls u ON hr.url_id = u.id
      LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
      WHERE u.url = ?
      ORDER BY hr.fetched_at DESC
      LIMIT 1
    `).get(url);

    if (!analysisResult) {
      console.log(`${colors.orange}No analysis found for URL: ${url}${colors.reset}`);
      db.close();
      process.exit(1);
    }

    // Determine if the page is using the latest version
    const isLatestVersion = analysisResult.analysis_version === maxAnalysisVersion;
    const statusColor = isLatestVersion ? colors.green : colors.orange;
    const statusText = isLatestVersion ? 'UP-TO-DATE ✓' : 'OUTDATED ⚠';

    // Display header
    console.log(`\n${colors.bold}${colors.cyan}Analysis Report${colors.reset}`);
    console.log('═'.repeat(70));

    // System version info
    console.log(`\n${colors.bold}System Status:${colors.reset}`);
    console.log(`  Latest analysis version:   ${colors.bold}${maxAnalysisVersion}${colors.reset}`);
    console.log(`  This page's version:       ${colors.bold}${analysisResult.analysis_version}${colors.reset}`);
    console.log(`  Status:                    ${colors.bold}${statusColor}${statusText}${colors.reset}`);

    // URL info
    console.log(`\n${colors.bold}URL Information:${colors.reset}`);
    console.log(`  URL:                       ${analysisResult.url}`);
    console.log(`  Host:                      ${analysisResult.host}`);
    if (analysisResult.canonical_url && analysisResult.canonical_url !== analysisResult.url) {
      console.log(`  Canonical URL:             ${analysisResult.canonical_url}`);
    }

    // HTTP Response info
    console.log(`\n${colors.bold}HTTP Response:${colors.reset}`);
    console.log(`  Status:                    ${analysisResult.http_status}`);
    console.log(`  Content-Type:              ${analysisResult.content_type}`);
    console.log(`  Fetched at:                ${analysisResult.fetched_at}`);

    // Content storage info
    console.log(`\n${colors.bold}Content Storage:${colors.reset}`);
    console.log(`  Storage Type:              ${analysisResult.storage_type}`);
    console.log(`  Uncompressed Size:         ${formatBytes(analysisResult.uncompressed_size)}`);
    console.log(`  Compressed Size:           ${formatBytes(analysisResult.compressed_size)}`);
    if (analysisResult.compression_algorithm) {
      console.log(`  Compression:               ${analysisResult.compression_algorithm}`);
      const ratio = analysisResult.compression_ratio ? (analysisResult.compression_ratio * 100).toFixed(1) : 'N/A';
      console.log(`  Compression Ratio:         ${ratio}%`);
    }

    // Analysis results
    console.log(`\n${colors.bold}Analysis Results:${colors.reset}`);
    console.log(`  Classification:            ${analysisResult.classification || 'N/A'}`);
    console.log(`  Title:                     ${analysisResult.title || 'N/A'}`);
    console.log(`  Section:                   ${analysisResult.section || 'N/A'}`);
    console.log(`  Word Count:                ${analysisResult.word_count || 'N/A'}`);
    console.log(`  Article Links:             ${analysisResult.article_links_count || 0}`);
    console.log(`  Navigation Links:          ${analysisResult.nav_links_count || 0}`);

    // XPath patterns
    if (analysisResult.article_xpath) {
      console.log(`\n${colors.bold}Article XPath Pattern:${colors.reset}`);
      console.log(`  ${analysisResult.article_xpath}`);
    }

    // Analysis JSON (if verbose)
    if (verbose && analysisResult.analysis_json) {
      const analysisData = formatAnalysisJson(analysisResult.analysis_json);
      if (analysisData) {
        console.log(`\n${colors.bold}Analysis Details (Verbose):${colors.reset}`);
        
        // Show analysis version and kind
        if (analysisData.analysis_version) {
          console.log(`  Analysis Version:          ${analysisData.analysis_version}`);
        }
        if (analysisData.kind) {
          console.log(`  Analysis Kind:             ${analysisData.kind}`);
        }

        // Show findings if present
        if (analysisData.findings && Object.keys(analysisData.findings).length > 0) {
          console.log(`\n${colors.bold}Findings:${colors.reset}`);
          
          // Show places summary
          if (analysisData.findings.places && Array.isArray(analysisData.findings.places)) {
            const places = analysisData.findings.places;
            const uniquePlaces = [...new Set(places.map(p => p.place))];
            const uniqueCountries = [...new Set(places.filter(p => p.country_code).map(p => p.country_code))];
            
            console.log(`  ${colors.bold}Places Extracted:${colors.reset}`);
            console.log(`    Total occurrences:     ${places.length}`);
            console.log(`    Unique places:         ${uniquePlaces.length}`);
            console.log(`    Countries found:       ${uniqueCountries.length}`);
            
            if (uniquePlaces.length > 0) {
              console.log(`    First 20 unique places:`);
              uniquePlaces.slice(0, 20).forEach((place, idx) => {
                const placeData = places.find(p => p.place === place);
                const kind = placeData?.place_kind ? ` (${placeData.place_kind})` : '';
                const country = placeData?.country_code ? ` [${placeData.country_code}]` : '';
                console.log(`      ${idx + 1}. ${place}${kind}${country}`);
              });
              if (uniquePlaces.length > 20) {
                console.log(`      ... and ${uniquePlaces.length - 20} more unique places`);
              }
            }
          }
        }

        // Show meta if present
        if (analysisData.meta && Object.keys(analysisData.meta).length > 0) {
          console.log(`\n${colors.bold}Metadata:${colors.reset}`);
          Object.entries(analysisData.meta).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
          });
        }

        // Show notes if present
        if (analysisData.notes) {
          console.log(`\n${colors.bold}Notes:${colors.reset}`);
          console.log(`  ${analysisData.notes}`);
        }

        // Show full JSON structure if very verbose
        if (args.verbose === 'full' || args.veryVerbose) {
          console.log(`\n${colors.bold}Full Analysis JSON:${colors.reset}`);
          console.log(formatJson(analysisData, 2));
        }
      }
    }

    console.log(`\n${'═'.repeat(70)}\n`);

    db.close();
    process.exit(0);
  } catch (error) {
    console.error(`${colors.bold}${colors.orange}Error: ${error.message}${colors.reset}`);
    if (args.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'N/A';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

main().catch(err => {
  console.error(`${colors.bold}${colors.orange}Fatal error: ${err.message}${colors.reset}`);
  if (process.argv.includes('--verbose')) {
    console.error(err.stack);
  }
  process.exit(1);
});
