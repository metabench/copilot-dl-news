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

const path = require('path');
const { findProjectRoot } = require('../utils/project-root');
const { ensureDb } = require('../db/sqlite');
const { CliFormatter } = require('../utils/CliFormatter');
const { CliArgumentParser } = require('../utils/CliArgumentParser');
const { createShowAnalysisQueries } = require('../db/sqlite/v1/queries/analysis.showAnalysis');

const projectRoot = findProjectRoot(__dirname);
const fmt = new CliFormatter();

function parseCliArgs(argv) {
  const parser = new CliArgumentParser('show-analysis', 'Display content analysis details for a URL');

  parser
    .add('--db <path>', 'Path to SQLite database', 'data/news.db')
    .add('--url <value>', 'URL to inspect')
    .add('--verbose', 'Include detailed findings and metadata', false, 'boolean')
    .add('--full-json', 'Print full analysis JSON payload', false, 'boolean')
    .add('--json', 'Emit machine-readable JSON summary', false, 'boolean');

  return parser.parse(argv);
}

function formatJson(obj, indent = 2) {
  return JSON.stringify(obj, null, indent);
}

function parseAnalysisJson(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    throw new Error(`Failed to parse analysis JSON: ${error.message}`);
  }
}

function summarizeFindings(analysisData) {
  if (!analysisData?.findings?.places || !Array.isArray(analysisData.findings.places)) {
    return null;
  }
  const places = analysisData.findings.places;
  const uniquePlaces = [...new Set(places.map((p) => p.place))];
  const uniqueCountries = [...new Set(places.filter((p) => p.country_code).map((p) => p.country_code))];
  return {
    occurrences: places.length,
    uniquePlaces,
    uniqueCountries
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'N/A';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

if (require.main === module) {
  (async () => {
    let options;
    try {
      options = parseCliArgs(process.argv);
    } catch (error) {
      fmt.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return;
    }

    const { db: dbOption, url, verbose, json: jsonOutput, fullJson } = options;

    if (!url) {
      fmt.error('Missing required option: --url');
      fmt.info('Usage: node src/tools/show-analysis.js --url "https://example.com"');
      process.exitCode = 1;
      return;
    }

    const dbPath = path.isAbsolute(dbOption) ? dbOption : path.join(projectRoot, dbOption);

    if (!jsonOutput) {
      fmt.header('Analysis Report');
      fmt.section('Configuration');
      fmt.stat('Database path', dbPath);
      fmt.stat('Target URL', url);
      fmt.stat('Verbose mode', verbose ? 'enabled' : 'disabled');
      if (fullJson) fmt.stat('Full JSON', 'enabled');
    }

    let dbHandle;
    try {
      dbHandle = ensureDb(dbPath);
    } catch (error) {
      fmt.error(`Failed to open database: ${error.message || error}`);
      process.exitCode = 1;
      return;
    }

    try {
      const queries = createShowAnalysisQueries(dbHandle);
      const maxVersion = queries.getMaxAnalysisVersion();
      const analysisRow = queries.getLatestAnalysisForUrl(url);

      if (!analysisRow) {
        if (jsonOutput) {
          console.log(JSON.stringify({ url, found: false, reason: 'not-found' }));
        } else {
          fmt.warn(`No analysis found for URL: ${url}`);
          fmt.footer();
        }
        return;
      }

      const isLatest = analysisRow.analysis_version === maxVersion;
      const statusLabel = isLatest ? fmt.COLORS.success('UP-TO-DATE ✓') : fmt.COLORS.warning('OUTDATED ⚠');
      const compressionRatio = Number.isFinite(analysisRow.compression_ratio)
        ? `${(analysisRow.compression_ratio * 100).toFixed(1)}%`
        : 'N/A';

      let analysisJson = null;
      try {
        analysisJson = parseAnalysisJson(analysisRow.analysis_json);
      } catch (error) {
        fmt.warn(error.message);
      }

      const findingsSummary = analysisJson ? summarizeFindings(analysisJson) : null;

      if (jsonOutput) {
        console.log(JSON.stringify({
          url,
          found: true,
          latestVersion: maxVersion,
          pageVersion: analysisRow.analysis_version,
          isLatest,
          classification: analysisRow.classification || null,
          wordCount: analysisRow.word_count || null,
          section: analysisRow.section || null,
          findings: findingsSummary ? {
            occurrences: findingsSummary.occurrences,
            uniquePlaces: findingsSummary.uniquePlaces.length,
            uniqueCountries: findingsSummary.uniqueCountries.length
          } : null,
          fetchedAt: analysisRow.fetched_at,
          httpStatus: analysisRow.http_status,
          storage: {
            type: analysisRow.storage_type,
            uncompressedSize: analysisRow.uncompressed_size,
            compressedSize: analysisRow.compressed_size,
            compressionAlgorithm: analysisRow.compression_algorithm || null,
            compressionRatio: Number.isFinite(analysisRow.compression_ratio) ? analysisRow.compression_ratio : null
          }
        }, null, 2));
        return;
      }

      fmt.section('System Status');
      fmt.stat('Latest analysis version', maxVersion, 'number');
      fmt.stat("Page's analysis version", analysisRow.analysis_version, 'number');
      fmt.stat('Status', statusLabel);

      fmt.section('URL Information');
      fmt.stat('URL', analysisRow.url);
      fmt.stat('Host', analysisRow.host || 'N/A');
      if (analysisRow.canonical_url && analysisRow.canonical_url !== analysisRow.url) {
        fmt.stat('Canonical URL', analysisRow.canonical_url);
      }

      fmt.section('HTTP Response');
      fmt.stat('Status code', analysisRow.http_status || 'N/A');
      fmt.stat('Content-Type', analysisRow.content_type || 'N/A');
      fmt.stat('Fetched at', analysisRow.fetched_at || 'N/A');

      fmt.section('Content Storage');
      fmt.stat('Storage type', analysisRow.storage_type || 'N/A');
      fmt.stat('Uncompressed size', formatBytes(analysisRow.uncompressed_size));
      fmt.stat('Compressed size', formatBytes(analysisRow.compressed_size));
      if (analysisRow.compression_algorithm) {
        fmt.stat('Compression algorithm', analysisRow.compression_algorithm);
        fmt.stat('Compression ratio', compressionRatio);
      }

      fmt.section('Analysis Results');
      fmt.stat('Classification', analysisRow.classification || 'N/A');
      fmt.stat('Title', analysisRow.title || 'N/A');
      fmt.stat('Section', analysisRow.section || 'N/A');
      fmt.stat('Word count', analysisRow.word_count || 0, 'number');
      fmt.stat('Article links', analysisRow.article_links_count || 0, 'number');
      fmt.stat('Navigation links', analysisRow.nav_links_count || 0, 'number');
      if (analysisRow.article_xpath) {
        fmt.stat('Article XPath', analysisRow.article_xpath);
      }

      if (findingsSummary) {
        fmt.section('Places Findings');
        fmt.stat('Occurrences', findingsSummary.occurrences, 'number');
        fmt.stat('Unique places', findingsSummary.uniquePlaces.length, 'number');
        fmt.stat('Countries detected', findingsSummary.uniqueCountries.length, 'number');
        if (findingsSummary.uniquePlaces.length) {
          const preview = findingsSummary.uniquePlaces.slice(0, 20).map((place, idx) => ({
            '#': idx + 1,
            Place: place
          }));
          fmt.table(preview, { columns: ['#', 'Place'] });
          if (findingsSummary.uniquePlaces.length > 20) {
            fmt.info(`${findingsSummary.uniquePlaces.length - 20} additional places omitted`);
          }
        }
      }

      if (analysisJson?.meta && Object.keys(analysisJson.meta).length) {
        fmt.section('Metadata');
        for (const [key, value] of Object.entries(analysisJson.meta)) {
          if (key === 'linkSummary' && value && typeof value === 'object') {
            const navigationCount = Number.isFinite(value.navigation) ? value.navigation : 0;
            const articleCount = Number.isFinite(value.article) ? value.article : 0;
            const totalCount = Number.isFinite(value.total) ? value.total : navigationCount + articleCount;
            fmt.stat('Link summary (internal)', totalCount, 'number');
            fmt.stat('Navigation links (meta)', navigationCount, 'number');
            fmt.stat('Article links (meta)', articleCount, 'number');
            if (Array.isArray(value.navigationSamples) && value.navigationSamples.length) {
              fmt.list('Navigation samples', value.navigationSamples.slice(0, 5));
            }
            if (Array.isArray(value.articleSamples) && value.articleSamples.length) {
              fmt.list('Article samples', value.articleSamples.slice(0, 5));
            }
          } else if (value && typeof value === 'object') {
            fmt.dataPair(key, formatJson(value, 2));
          } else {
            fmt.stat(key, value);
          }
        }
      }

      if (analysisJson?.notes) {
        fmt.section('Notes');
        fmt.info(analysisJson.notes);
      }

      if (fullJson && analysisJson) {
        fmt.section('Full Analysis JSON');
        console.log(formatJson(analysisJson, 2));
      }

      fmt.footer();
    } catch (error) {
      fmt.error(error instanceof Error ? error.message : String(error));
      if (verbose) {
        console.error(error.stack);
      }
      process.exitCode = 1;
    } finally {
      try { dbHandle.close(); } catch (_) {}
    }
  })();
}
