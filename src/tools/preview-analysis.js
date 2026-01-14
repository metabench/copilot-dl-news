#!/usr/bin/env node

/**
 * Perform and display an analysis for a single URL without saving it.
 *
 * Usage:
 *   node src/tools/preview-analysis.js --url "https://www.theguardian.com/world"
 */

const path = require('path');
const { findProjectRoot } = require('../shared/utils/project-root');
const { ensureDatabase } = require('../data/db/sqlite');
const { buildGazetteerMatchers } = require('../intelligence/analysis/place-extraction');
const { analyzePage } = require('../intelligence/analysis/page-analyzer');
const { performance } = require('perf_hooks');

const projectRoot = findProjectRoot(__dirname);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  orange: '\x1b[38;5;208m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function parseArgs(argv = process.argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const raw = argv[i];
    if (typeof raw !== 'string' || !raw.startsWith('--')) continue;
    
    const eq = raw.indexOf('=');
    if (eq > -1) {
      const keyPart = raw.slice(2, eq);
      const key = keyPart.replace(/-([a-z])/gi, (_, ch) => ch.toUpperCase());
      const value = raw.slice(eq + 1).trim();
      args[key] = value;
    } else {
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

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return 'N/A';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function printAnalysis(analysis) {
    console.log(`\n${colors.bold}${colors.cyan}Analysis Preview${colors.reset}`);
    console.log('═'.repeat(70));

    const { articleEvaluation } = analysis.meta;

    console.log(`\n${colors.bold}Classification Result:${colors.reset}`);
    const classificationColor = analysis.kind === 'article' ? colors.green : colors.orange;
    console.log(`  Final Classification:    ${classificationColor}${colors.bold}${analysis.kind.toUpperCase()}${colors.reset}`);
    
    if (articleEvaluation) {
        console.log(`  Confidence Score:        ${articleEvaluation.confidence.toFixed(2)}`);
    }

    console.log(`\n${colors.bold}Analysis Details:${colors.reset}`);
    console.log(`  Analysis Version:        ${analysis.analysis_version}`);
    console.log(`  Word Count:              ${analysis.meta.wordCount || 'N/A'}`);
    console.log(`  Article XPath:           ${analysis.meta.articleXPath || 'N/A'}`);
    
    if (analysis.meta.hub) {
        console.log(`\n${colors.bold}Hub Detection:${colors.reset}`);
        console.log(`  Hub Place:               ${colors.magenta}${analysis.meta.hub.placeLabel}${colors.reset}`);
        console.log(`  Hub Kind:                ${analysis.meta.hub.placeKind}`);
        console.log(`  Hub Source:              ${analysis.meta.hub.placeSource}`);
    }
    
    if (articleEvaluation) {
        console.log(`\n${colors.bold}Positive Signals (Reasons for Article classification):${colors.reset}`);
        if (articleEvaluation.reasons.length) {
            articleEvaluation.reasons.forEach(reason => console.log(`  - ${colors.green}${reason}${colors.reset}`));
        } else {
            console.log(`  ${colors.dim}(None)${colors.reset}`);
        }

        console.log(`\n${colors.bold}Negative Signals (Reasons for Nav/Hub classification):${colors.reset}`);
        if (articleEvaluation.rejections.length) {
            articleEvaluation.rejections.forEach(reason => console.log(`  - ${colors.orange}${reason}${colors.reset}`));
        } else {
            console.log(`  ${colors.dim}(None)${colors.reset}`);
        }

        console.log(`\n${colors.bold}Raw Evaluation Data:${colors.reset}`);
        console.log(colors.dim + JSON.stringify(articleEvaluation, null, 2) + colors.reset);
    }
    
    if (analysis.findings.places && analysis.findings.places.length > 0) {
        const places = analysis.findings.places;
        const uniquePlaces = [...new Set(places.map(p => p.place))];
        console.log(`\n${colors.bold}Place Detections:${colors.reset}`);
        console.log(`  Total Detections:        ${places.length}`);
        console.log(`  Unique Places:           ${uniquePlaces.length}`);
        
        const placesBySource = places.reduce((acc, p) => {
            acc[p.source] = (acc[p.source] || 0) + 1;
            return acc;
        }, {});

        console.log(`  Detections by Source:`);
        for (const [source, count] of Object.entries(placesBySource)) {
            console.log(`    - ${source}: ${count}`);
        }

        if (uniquePlaces.length > 0) {
            console.log(`\n  ${colors.bold}Top 10 Unique Places Found:${colors.reset}`);
            uniquePlaces.slice(0, 10).forEach((placeName, i) => {
                const place = places.find(p => p.place === placeName);
                console.log(`    ${i + 1}. ${place.place} (${place.place_kind}, ${place.country_code})`);
            });
            if (uniquePlaces.length > 10) {
                console.log(`    ...and ${uniquePlaces.length - 10} more.`);
            }
        }
    }
    
    console.log(`\n${colors.bold}Timings:${colors.reset}`);
    const timings = analysis.meta.timings;
    if (timings) {
        console.log(`  Overall Analysis:        ${timings.overallMs.toFixed(2)} ms`);
        console.log(`  Content Preparation:     ${timings.preparationMs.toFixed(2)} ms`);
        console.log(`  Build Analysis:          ${timings.buildAnalysisMs.toFixed(2)} ms`);
    }

    console.log(`\n${'═'.repeat(70)}\n`);
}


async function main() {
  const args = parseArgs();
  const url = args.url;

  if (!url) {
    console.error(`${colors.bold}${colors.orange}Error: --url parameter is required${colors.reset}`);
    console.error('\nUsage:');
    console.error('  node src/tools/preview-analysis.js --url "https://example.com"');
    process.exit(1);
  }

  let db;
  try {
    console.log(`${colors.dim}Connecting to database...${colors.reset}`);
    const dbPath = path.join(projectRoot, 'data', 'news.db');
    db = ensureDatabase(dbPath);

    console.log(`${colors.dim}Loading gazetteer...${colors.reset}`);
    const gazetteerStart = performance.now();
    const gazetteer = buildGazetteerMatchers(db);
    console.log(`${colors.dim}Gazetteer loaded in ${(performance.now() - gazetteerStart).toFixed(2)} ms.${colors.reset}`);

    console.log(`${colors.dim}Fetching URL: ${url}...${colors.reset}`);
    const fetchStart = performance.now();
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    console.log(`${colors.dim}Fetched ${formatBytes(html.length)} in ${(performance.now() - fetchStart).toFixed(2)} ms.${colors.reset}`);

    console.log(`${colors.dim}Analyzing page...${colors.reset}`);
    const { analysis, hubCandidate } = await analyzePage({
        url,
        html,
        db,
        gazetteer,
        targetVersion: 1021 // Arbitrary new version for preview
    });

    if (hubCandidate) {
        console.log(`\n${colors.bold}Hub Candidate Details:${colors.reset}`);
        console.log(JSON.stringify(hubCandidate, null, 2));
    }

    if (analysis.meta.preparation?.contentSignals) {
        console.log(`\n${colors.bold}Content Signals:${colors.reset}`);
        console.log(colors.dim + JSON.stringify(analysis.meta.preparation.contentSignals, null, 2) + colors.reset);
    }

    printAnalysis(analysis);

  } catch (error) {
    console.error(`\n${colors.bold}${colors.orange}Error: ${error.message}${colors.reset}`);
    if (args.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
      if (db) {
          db.close();
      }
  }
}

main().catch(err => {
  console.error(`${colors.bold}${colors.orange}Fatal error: ${err.message}${colors.reset}`);
  if (process.argv.includes('--verbose')) {
    console.error(err.stack);
  }
  process.exit(1);
});
