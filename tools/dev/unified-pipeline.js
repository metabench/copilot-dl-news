#!/usr/bin/env node
'use strict';

/**
 * unified-pipeline.js - CLI for running crawl→analysis→disambiguation workflows
 * 
 * @example
 * # Full pipeline with UI
 * node tools/dev/unified-pipeline.js --seed https://bbc.com --pages 100 --analyze --electron
 * 
 * # Crawl only
 * node tools/dev/unified-pipeline.js --seed https://bbc.com --pages 50 --skip-analysis
 * 
 * # Analysis only (skip crawl)
 * node tools/dev/unified-pipeline.js --analyze-only --limit 100
 * 
 * # JSON output for AI agents
 * node tools/dev/unified-pipeline.js --seed https://bbc.com --pages 10 --json
 */

const path = require('path');

// Add project root to path for imports
const projectRoot = path.resolve(__dirname, '../..');
process.chdir(projectRoot);

const { UnifiedPipeline, STAGES, STAGE_STATE } = require('../../src/pipelines');

// ─────────────────────────────────────────────────────────────────────────────
// CLI Argument Parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(args) {
  const options = {
    url: null,
    operation: 'siteExplorer',
    maxPages: 100,
    maxDepth: 3,
    analyze: true,
    disambiguate: false,
    analyzeOnly: false,
    limit: null,
    ui: 'console',
    json: false,
    quiet: false,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    switch (arg) {
      case '--seed':
      case '--url':
      case '-u':
        options.url = next;
        i++;
        break;
        
      case '--operation':
      case '-o':
        options.operation = next;
        i++;
        break;
        
      case '--pages':
      case '--max-pages':
      case '-n':
        options.maxPages = parseInt(next, 10);
        i++;
        break;
        
      case '--depth':
      case '--max-depth':
        options.maxDepth = parseInt(next, 10);
        i++;
        break;
        
      case '--analyze':
        options.analyze = true;
        break;
        
      case '--skip-analysis':
      case '--no-analyze':
        options.analyze = false;
        break;
        
      case '--disambiguate':
        options.disambiguate = true;
        break;
        
      case '--analyze-only':
        options.analyzeOnly = true;
        options.analyze = true;
        break;
        
      case '--limit':
      case '-l':
        options.limit = parseInt(next, 10);
        i++;
        break;
        
      case '--ui':
        options.ui = next;
        i++;
        break;
        
      case '--electron':
        options.ui = 'electron';
        break;
        
      case '--headless':
        options.ui = 'headless';
        break;
        
      case '--json':
      case '-j':
        options.json = true;
        break;
        
      case '--quiet':
      case '-q':
        options.quiet = true;
        break;
        
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }
  
  return options;
}

function printHelp() {
  console.log(`
unified-pipeline.js - Run crawl→analysis→disambiguation workflows

USAGE:
  node tools/dev/unified-pipeline.js [options]

CRAWL OPTIONS:
  --seed, --url, -u <url>    Starting URL for crawl (required unless --analyze-only)
  --operation, -o <name>     Crawl operation (default: siteExplorer)
  --pages, -n <number>       Maximum pages to crawl (default: 100)
  --depth <number>           Maximum crawl depth (default: 3)

ANALYSIS OPTIONS:
  --analyze                  Run analysis after crawl (default: true)
  --skip-analysis            Skip analysis stage
  --analyze-only             Skip crawl, run analysis only
  --limit, -l <number>       Limit records to analyze
  --disambiguate             Run disambiguation after analysis

UI OPTIONS:
  --ui <mode>                UI mode: console, browser, electron, headless
  --electron                 Shorthand for --ui electron
  --headless                 Shorthand for --ui headless

OUTPUT OPTIONS:
  --json, -j                 Output results as JSON
  --quiet, -q                Suppress progress output

EXAMPLES:
  # Full crawl + analysis with Electron UI
  node tools/dev/unified-pipeline.js --seed https://bbc.com --pages 100 --electron

  # Quick test crawl (10 pages)
  node tools/dev/unified-pipeline.js --seed https://example.com --pages 10 --json

  # Analysis only (no crawl)
  node tools/dev/unified-pipeline.js --analyze-only --limit 50

  # Full pipeline including disambiguation
  node tools/dev/unified-pipeline.js --seed https://bbc.com --pages 100 --analyze --disambiguate
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress Display
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function createProgressBar(current, total, width = 30) {
  const ratio = total > 0 ? current / total : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

class ConsoleProgressDisplay {
  constructor(options = {}) {
    this.quiet = options.quiet || false;
    this.json = options.json || false;
    this.stageStart = null;
    this.lastLine = '';
  }
  
  onStageStart({ stage, index, total }) {
    if (this.quiet || this.json) return;
    
    this.stageStart = Date.now();
    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`  Stage ${index + 1}/${total}: ${stage.toUpperCase()}`);
    console.log(`═══════════════════════════════════════════════════════════════`);
  }
  
  onProgress(data) {
    if (this.quiet || this.json) return;
    
    const { stage, current, total, rate, eta, status, method } = data;
    
    const bar = createProgressBar(current || 0, total || 100);
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const rateStr = rate ? `${rate.toFixed(1)}/sec` : '';
    const etaStr = eta ? `ETA: ${formatDuration(eta * 1000)}` : '';
    const methodStr = method ? `[${method}]` : '';
    
    const line = `  ${bar} ${percent}% │ ${current || 0}/${total || '?'} │ ${rateStr} │ ${etaStr} ${methodStr}`;
    
    // Clear and rewrite line
    process.stdout.write('\r' + ' '.repeat(this.lastLine.length) + '\r');
    process.stdout.write(line);
    this.lastLine = line;
  }
  
  onStageComplete({ stage, result }) {
    if (this.quiet || this.json) return;
    
    // Clear progress line
    process.stdout.write('\r' + ' '.repeat(this.lastLine.length) + '\r');
    this.lastLine = '';
    
    const duration = result.durationMs ? formatDuration(result.durationMs) : 'N/A';
    console.log(`  ✓ ${stage} complete (${duration})`);
    
    // Print relevant stats
    if (result.pagesDownloaded) {
      console.log(`    Pages downloaded: ${result.pagesDownloaded}`);
    }
    if (result.analyzed) {
      console.log(`    Records analyzed: ${result.analyzed}`);
    }
    if (result.errors) {
      console.log(`    Errors: ${result.errors}`);
    }
  }
  
  onStageError({ stage, error }) {
    if (this.json) return;
    
    // Clear progress line
    process.stdout.write('\r' + ' '.repeat(this.lastLine.length) + '\r');
    this.lastLine = '';
    
    console.error(`  ✗ ${stage} failed: ${error}`);
  }
  
  onPipelineComplete({ success, totalDuration, stages }) {
    if (this.json) {
      console.log(JSON.stringify({ success, totalDuration, stages }, null, 2));
      return;
    }
    
    if (this.quiet) return;
    
    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`  PIPELINE ${success ? 'COMPLETE ✓' : 'FAILED ✗'}`);
    console.log(`  Total duration: ${formatDuration(totalDuration)}`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);
  }
  
  onPipelineError({ stage, error }) {
    if (this.json) {
      console.log(JSON.stringify({ success: false, error, stage }, null, 2));
      return;
    }
    
    console.error(`\n✗ Pipeline failed at stage "${stage}": ${error}\n`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  
  // Validate options
  if (!options.analyzeOnly && !options.url) {
    console.error('Error: --seed <url> is required (or use --analyze-only)');
    process.exit(1);
  }
  
  // Create progress display
  const display = new ConsoleProgressDisplay({
    quiet: options.quiet,
    json: options.json
  });
  
  // Create pipeline
  const pipelineOptions = {
    url: options.url,
    crawlOperation: options.operation,
    maxPages: options.maxPages,
    maxDepth: options.maxDepth,
    analyze: options.analyze,
    disambiguate: options.disambiguate,
    analysisLimit: options.limit,
    skipStages: options.analyzeOnly ? ['crawl'] : []
  };
  
  const pipeline = new UnifiedPipeline(pipelineOptions);
  
  // Wire up events
  pipeline.on('stage:start', (e) => display.onStageStart(e));
  pipeline.on('progress', (e) => display.onProgress(e));
  pipeline.on('stage:complete', (e) => display.onStageComplete(e));
  pipeline.on('stage:error', (e) => display.onStageError(e));
  pipeline.on('pipeline:complete', (e) => display.onPipelineComplete(e));
  pipeline.on('pipeline:error', (e) => display.onPipelineError(e));
  
  // Handle graceful stop
  process.on('SIGINT', () => {
    console.log('\n\nStop requested...');
    pipeline.stop();
  });
  
  // Run pipeline
  try {
    if (!options.quiet && !options.json) {
      console.log(`\nUnified Pipeline`);
      console.log(`  URL: ${options.url || '(analyze-only)'}`);
      console.log(`  Operation: ${options.operation}`);
      console.log(`  Max Pages: ${options.maxPages}`);
      console.log(`  Analyze: ${options.analyze}`);
      console.log(`  Disambiguate: ${options.disambiguate}`);
    }
    
    const result = await pipeline.run();
    process.exit(0);
    
  } catch (error) {
    if (!options.json) {
      console.error('Pipeline error:', error.message);
    }
    process.exit(1);
  }
}

main();
