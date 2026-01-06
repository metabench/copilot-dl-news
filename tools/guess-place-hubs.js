#!/usr/bin/env node
'use strict';

const path = require('path');
const { GuessPlaceHubsOperation } = require('../src/crawler/operations/GuessPlaceHubsOperation');
const { CliFormatter } = require('../src/utils/CliFormatter');
const { CliArgumentParser } = require('../src/utils/CliArgumentParser');
const { findProjectRoot } = require('../src/utils/project-root');

const fmt = new CliFormatter();

function parseCliArgs(argv) {
  const parser = new CliArgumentParser(
    'guess-place-hubs',
    'Guess place hub candidates for a domain using gap analysis or active pattern probing'
  );

  parser
    .add('--url <url>', 'Target domain URL (e.g. https://www.theguardian.com)')
    .add('--db <path>', 'Path to news SQLite database', 'data/news.db')
    .add('--mode <mode>', 'Operation mode: "standard" (gaps) or "active-probe" (brute force)', 'standard')
    .add('--pattern <pattern>', 'Active probe URL pattern (e.g., "/world/{slug}")')
    .add('--lang <lang>', 'Target language for place names (e.g. "es", "fr")', 'en')
    .add('--kind <kind>', 'Probe specific kind (country, region, city)', 'country')
    .add('--parent <place>', 'Parent place name (e.g. "Colombia") for filtering')
    .add('--limit <number>', 'Max number of probes to run', undefined, 'int')
    .add('--apply', 'Apply changes (save discovered hubs to DB)', false, 'boolean')
    .add('--verbose', 'Enable verbose output', false, 'boolean')
    .add('--json', 'Output results as JSON', false, 'boolean');

  return parser.parse(argv);
}

function normalizeOptions(rawArgs) {
  const projectRoot = findProjectRoot(__dirname);
  const dbOption = rawArgs.db || 'data/news.db';
  const dbPath = path.isAbsolute(dbOption) ? dbOption : path.join(projectRoot, dbOption);

  const positional = rawArgs.positional || [];
  // Find first positional argument that looks like a URL (http) or a domain (no path separators/extensions)
  // Logic: skip node.exe, script.js. Look for 'http' or simple string.
  const startUrl = rawArgs.url || positional.find(arg => 
    arg && (
      arg.startsWith('http') || 
      (!arg.match(/[\\\/]/) && !arg.endsWith('.js') && !arg.endsWith('.exe'))
    )
  );

  if (!startUrl) {
    throw new Error('Start URL is required');
  }

  const mode = rawArgs.mode === 'active-probe' ? 'active-probe' : 'standard';
  const activePattern = rawArgs.pattern || (mode === 'active-probe' ? '/world/{slug}' : undefined);
  const lang = rawArgs.lang || 'en';
  const kinds = rawArgs.kind ? [rawArgs.kind] : ['country'];
  const parentPlace = rawArgs.parent;

  if (rawArgs.verbose) {
    console.log('[CLI Debug] Positional args:', positional);
    console.log('[CLI Debug] Raw options:', { url: rawArgs.url, limit: rawArgs.limit, lang, kind: rawArgs.kind, parent: parentPlace });
  }

  return {
    dbPath,
    startUrl,
    mode,
    activePattern,
    lang,
    kinds,
    parentPlace,
    limit: rawArgs.limit,
    apply: Boolean(rawArgs.apply),
    verbose: Boolean(rawArgs.verbose),
    json: Boolean(rawArgs.json)
  };
}

async function run(argv) {
  let rawArgs;
  try {
    rawArgs = parseCliArgs(argv);
  } catch (error) {
    fmt.error(error.message);
    process.exitCode = 1;
    return;
  }

  let options;
  try {
    options = normalizeOptions(rawArgs);
  } catch (error) {
    fmt.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (!options.json) {
    fmt.header('Guess Place Hubs');
    fmt.stat('Target', options.startUrl);
    fmt.stat('Mode', options.mode);
    if (options.mode === 'active-probe') {
      fmt.stat('Pattern', options.activePattern || '(none provided)');
    }
    fmt.stat('Database', options.dbPath);
    fmt.stat('Apply', options.apply ? 'yes' : 'no (dry-run)');
  }

  if (options.mode === 'active-probe' && !options.activePattern) {
    if (!options.json) {
      fmt.warn('Warning: "active-probe" mode usually requires a --pattern (e.g., "/world/{slug}")');
    }
  }

  const operation = new GuessPlaceHubsOperation();
  
  try {
    const result = await operation.run({
      startUrl: options.startUrl,
      overrides: {
        dbPath: options.dbPath,
        mode: options.mode,
        activePattern: options.activePattern,
        limit: options.limit,
        apply: options.apply,
        verbose: options.verbose,
        lang: options.lang,
        kinds: options.kinds,
        parentPlace: options.parentPlace
      },
      logger: options.json ? { info: () => {}, warn: () => {}, error: () => {} } : console
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.status === 'error') {
      throw new Error(result.error?.message || 'Unknown error');
    }

    const { candidates, summary } = result.result || {};
    const count = candidates ? candidates.length : 0;

    fmt.section('Results');
    fmt.stat('Candidates found', count, 'number');
    fmt.stat('Duration', `${result.elapsedMs}ms`);

    if (count > 0) {
      fmt.section('Candidates');
      const limited = candidates.slice(0, 20);
      limited.forEach(c => {
        const icon = c.exists ? '✅' : '🆕';
        console.log(`${icon} ${c.url.padEnd(60)} (${c.place_slug})`);
      });
      if (count > 20) {
        fmt.info(`...and ${count - 20} more`);
      }
    } else {
      fmt.info('No candidates found.');
    }

    fmt.footer();
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', error: error.message }));
    } else {
      fmt.error(error.message);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  // Pass slice(2) to avoid node/script path issues with commander
  // CliArgumentParser typically handles raw process.argv if passed directly, 
  // but let's be explicit to avoid "C:..." being detected as a URL.
  // Actually, CliArgumentParser uses program.parse(argv, { from: 'user' }) if passed an array.
  // We'll pass the sliced args to be safe.
  const args = process.argv.slice(2);
  run(args).catch(error => {
    console.error(error);
    process.exit(1);
  });
}
