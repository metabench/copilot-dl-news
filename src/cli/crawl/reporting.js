const { parsePositiveInteger } = require('../../config/overrideHelpers');
const { OUTPUT_VERBOSITY_LEVELS } = require('../../utils/outputVerbosity');
const { getLoggerWriter } = require('./cliRuntime');

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return value ?? 'n/a';
  }
  return value.toLocaleString('en-US');
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) {
    return 'n/a';
  }
  if (ms < 1000) {
    return `${ms} ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function printDownloadSummary(label, stats, overrides = {}, logger = console) {
  if (!stats || typeof stats !== 'object') {
    return;
  }
  const visited = Number.isFinite(stats.pagesVisited) ? stats.pagesVisited : null;
  const downloaded = Number.isFinite(stats.pagesDownloaded) ? stats.pagesDownloaded : null;
  const saved = Number.isFinite(stats.articlesSaved) ? stats.articlesSaved : null;
  const found = Number.isFinite(stats.articlesFound) ? stats.articlesFound : null;
  const limit = parsePositiveInteger(overrides?.maxDownloads);
  if (downloaded == null && visited == null && saved == null && found == null) {
    return;
  }
  const parts = [];
  if (downloaded != null) {
    const downloadPart = typeof limit === 'number'
      ? `${formatNumber(downloaded)}/${formatNumber(limit)}`
      : formatNumber(downloaded);
    parts.push(`downloaded ${downloadPart} pages`);
  }
  if (visited != null) {
    parts.push(`visited ${formatNumber(visited)} pages`);
  }
  if (saved != null) {
    parts.push(`saved ${formatNumber(saved)} articles`);
  } else if (found != null) {
    parts.push(`found ${formatNumber(found)} articles`);
  }
  const prefix = label ? `[${label}] ` : '';
  const writer = getLoggerWriter(logger, 'info');
  writer(`${prefix}Final stats: ${parts.join(' • ')}`);
}

function printStatus(label, status, meta = {}, logger = console) {
  const info = getLoggerWriter(logger, 'info');
  info(`${label} finished with status: ${status || 'unknown'}`);
  if (meta.configPath) {
    info(`  Config file: ${meta.configPath}`);
  }
  if (meta.elapsedMs != null) {
    info(`  Duration: ${formatDuration(meta.elapsedMs)}`);
  }
  if (Array.isArray(meta.steps)) {
    meta.steps.forEach((step) => {
      info(`  - ${step.name || step.operation || 'step'}: ${step.status || 'unknown'}`);
    });
  }
}

function printAvailabilitySummary(availability, includeOperations, includeSequences, logger = console) {
  const info = getLoggerWriter(logger, 'info');
  info('Crawl Availability');
  if (includeOperations && Array.isArray(availability.operations)) {
    info('\nOperations:');
    availability.operations.forEach((op) => {
      info(`  • ${op.name}${op.summary ? ` — ${op.summary}` : ''}`);
    });
  }
  const sequences = availability.sequences || availability.sequencePresets;
  if (includeSequences && Array.isArray(sequences)) {
    info('\nSequence Presets:');
    sequences.forEach((seq) => {
      const description = seq.description ? ` — ${seq.description}` : '';
      const steps = Array.isArray(seq.steps) && seq.steps.length
        ? ` (${seq.steps.map((step) => step.operation).join(' → ')})`
        : '';
      info(`  • ${seq.name}${description}${steps}`);
    });
  }
}

function printPlaceHelp(logger = console) {
  const info = getLoggerWriter(logger, 'info');
  info('Place workflows via crawl.js\n\n'
    + 'Usage:\n'
    + '  node crawl.js place guess <domain|url> [--kinds <list>] [--limit <n>] [--apply] [--json]\n'
    + '  node crawl.js place explore <domain|url> [--overrides <json>] [--json]\n\n'
    + 'Examples:\n'
    + '  node crawl.js place guess theguardian.com --kinds country,city --limit 5\n'
    + '  node crawl.js place explore https://www.theguardian.com --max-downloads 150 --planner-verbosity 2\n');
}

function printGuessPlaceSummary(response, logger = console) {
  const info = getLoggerWriter(logger, 'info');
  const error = getLoggerWriter(logger, 'error');
  const status = response?.status || 'unknown';
  info(`guessPlaceHubs → ${status}`);
  if (response?.elapsedMs != null) {
    info(`  Duration: ${formatDuration(response.elapsedMs)}`);
  }
  if (response?.domain) {
    info(`  Domain: ${response.domain}`);
  } else if (response?.startUrl) {
    info(`  Start URL: ${response.startUrl}`);
  }

  if (status !== 'ok') {
    const message = response?.error?.message || 'Unknown error';
    error(`  Error: ${message}`);
    return;
  }

  const summary = response?.result;
  if (!summary || typeof summary !== 'object') {
    info('  No summary returned.');
    return;
  }

  info(`  Places evaluated: ${formatNumber(summary.totalPlaces ?? 0)}`);
  if (summary.totalTopics != null) {
    info(`  Topics evaluated: ${formatNumber(summary.totalTopics ?? 0)}`);
  }
  info(`  URL candidates: ${formatNumber(summary.totalUrls ?? 0)}`);
  info(`  Fetched (HTTP OK): ${formatNumber(summary.fetched ?? 0)}`);
  info(`  Cached successes: ${formatNumber(summary.cached ?? 0)}`);
  info(`  Inserted hubs: ${formatNumber(summary.insertedHubs ?? 0)}`);
  info(`  Updated hubs: ${formatNumber(summary.updatedHubs ?? 0)}`);
  info(`  Errors: ${formatNumber(summary.errors ?? 0)}`);

  const recommendations = Array.isArray(summary.recommendations) ? summary.recommendations : [];
  if (recommendations.length > 0) {
    info('  Recommendations:');
    recommendations.slice(0, 3).forEach((item) => {
      info(`    - ${item}`);
    });
  }
}

function printExploreSummary(response, logger = console) {
  const info = getLoggerWriter(logger, 'info');
  const error = getLoggerWriter(logger, 'error');
  const status = response?.status || 'unknown';
  info(`findPlaceAndTopicHubs → ${status}`);
  if (response?.elapsedMs != null) {
    info(`  Duration: ${formatDuration(response.elapsedMs)}`);
  }
  if (response?.options?.crawlType) {
    info(`  Crawl type: ${response.options.crawlType}`);
  }

  if (status !== 'ok') {
    const message = response?.error?.message || 'Unknown error';
    error(`  Error: ${message}`);
    return;
  }

  const stats = response?.stats || {};
  info(`  Pages visited: ${formatNumber(stats.pagesVisited ?? 0)}`);
  info(`  Pages downloaded: ${formatNumber(stats.pagesDownloaded ?? 0)}`);
  info(`  Articles found: ${formatNumber(stats.articlesFound ?? 0)}`);
  info(`  Articles saved: ${formatNumber(stats.articlesSaved ?? 0)}`);
  if (stats.errors != null) {
    info(`  Errors: ${formatNumber(stats.errors ?? 0)}`);
  }
}

function printCrawlHelp(logger = console) {
  const info = getLoggerWriter(logger, 'info');
  info(
    'crawl.js — minimal crawl playground\n\n'
    + 'Usage:\n'
    + '  node crawl.js [--config <path>] [--start-url <url>] [--concurrency <n>] [--max-downloads <n>|--limit <n>] [--output-verbosity <level>]\n'
    + '      Run the config-driven crawl using config/crawl-runner.(json|yaml) or config.json defaults.\n'
    + '  node crawl.js availability [--all|--operations|--sequences]\n'
    + '  node crawl.js run-operation <operationName> <startUrl> [--overrides <json>] [--output-verbosity <level>]\n'
    + '  node crawl.js run-sequence <sequenceName> <startUrl> [--shared-overrides <json>] [--step-overrides <json>] [--continue-on-error] [--output-verbosity <level>]\n'
    + '  node crawl.js run-sequence-config <configName> [--config-dir <path>] [--config-host <host>] [--start-url <url>] [--shared-overrides <json>] [--step-overrides <json>] [--config-cli-overrides <json>] [--continue-on-error] [--output-verbosity <level>]\n\n'
    + '  node crawl.js place guess <domain|url> [--kinds <list>] [--limit <n>] [--apply] [--json]\n'
    + '  node crawl.js place explore <domain|url> [--overrides <json>] [--output-verbosity <level>] [--json]\n\n'
    + `Flags accept compact JSON objects (for example: --overrides "{\"plannerVerbosity\":2}").\n`
    + `Verbosity levels: ${OUTPUT_VERBOSITY_LEVELS.join(', ')}.\n`
  );
}

module.exports = {
  formatNumber,
  formatDuration,
  printDownloadSummary,
  printStatus,
  printAvailabilitySummary,
  printPlaceHelp,
  printGuessPlaceSummary,
  printExploreSummary,
  printCrawlHelp
};
