'use strict';

/**
 * CLI tool for inspecting and executing the Wikidata queries that power the
 * geography crawl. It reuses the same SPARQL builders as the runtime ingestors
 * so changes can be validated without running the full pipeline.
 */

const path = require('path');
const chalk = require('chalk');
const WikidataService = require('../core/crawler/gazetteer/services/WikidataService');
const {
  DEFAULT_LABEL_LANGUAGES,
  DEFAULT_REGION_CLASS_QIDS,
  buildCountryClause,
  buildCountryDiscoveryQuery,
  buildAdm1DiscoveryQuery,
  buildCitiesDiscoveryQuery
} = require('../core/crawler/gazetteer/queries/geographyQueries');

const CLI_ACTIONS = Object.freeze({
  LIST: 'list',
  RUN: 'run',
  PRINT: 'print'
});

const DEFAULT_OPTIONS = Object.freeze({
  limit: null,
  minPopulation: null,
  countryCode: null,
  countryQid: null,
  printOnly: false,
  json: false,
  quiet: false,
  previewRows: 5,
  noCache: false,
  timeoutMs: 20000,
  languages: DEFAULT_LABEL_LANGUAGES
});

const QUERY_REGISTRY = Object.freeze({
  countries: {
    description: 'Country discovery query used by WikidataCountryIngestor',
    required: [],
    build(config) {
      return buildCountryDiscoveryQuery({
        limit: config.limit,
        languages: config.languages
      });
    }
  },
  adm1: {
    description: 'First-level administrative division query used by WikidataAdm1Ingestor',
    required: ['countryCode', 'countryQid'],
    build(config) {
      const countryClause = buildCountryClause({
        subjectVar: 'region',
        countryCode: config.countryCode,
        countryQid: config.countryQid
      });
      return buildAdm1DiscoveryQuery({
        countryClause,
        regionClassQids: config.regionClassQids || DEFAULT_REGION_CLASS_QIDS,
        languages: config.languages,
        limit: config.limit ?? 500
      });
    }
  },
  cities: {
    description: 'City discovery query used by WikidataCitiesIngestor',
    required: ['countryCode', 'countryQid'],
    build(config) {
      const countryClause = buildCountryClause({
        subjectVar: 'city',
        countryCode: config.countryCode,
        countryQid: config.countryQid
      });
      return buildCitiesDiscoveryQuery({
        countryClause,
        languages: config.languages,
        limit: config.limit ?? 200,
        minPopulation: config.minPopulation
      });
    }
  }
});

function printHeader(title) {
  console.log(chalk.cyan.bold(`\n${title}`));
}

function printInfo(message) {
  console.log(chalk.gray(`• ${message}`));
}

function printSuccess(message) {
  console.log(chalk.green(`✓ ${message}`));
}

function printError(message) {
  console.error(chalk.red(`✖ ${message}`));
}

function printWarning(message) {
  console.warn(chalk.yellow(`⚠ ${message}`));
}

function parseArgv(rawArgs) {
  const result = { action: CLI_ACTIONS.RUN, positional: [] };

  for (let i = 0; i < rawArgs.length; i++) {
    const token = rawArgs[i];
    if (token === 'list') {
      result.action = CLI_ACTIONS.LIST;
      continue;
    }
    if (token === 'print') {
      result.action = CLI_ACTIONS.PRINT;
      continue;
    }

    if (!token.startsWith('--')) {
      result.positional.push(token);
      continue;
    }

    const stripped = token.slice(2);
    const [key, inlineValue] = stripped.split('=');
    if (inlineValue !== undefined) {
      result[key] = inlineValue;
      continue;
    }

    const next = rawArgs[i + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = next;
      i += 1;
    }
  }

  return result;
}

function coerceOptions(parsed) {
  const options = { ...DEFAULT_OPTIONS };

  if (parsed.limit != null) {
    const value = Number(parsed.limit);
    if (!Number.isNaN(value) && value > 0) {
      options.limit = value;
    }
  }

  if (parsed['min-population'] != null) {
    const value = Number(parsed['min-population']);
    if (!Number.isNaN(value) && value >= 0) {
      options.minPopulation = value;
    }
  }

  if (parsed.preview != null) {
    const value = Number(parsed.preview);
    if (!Number.isNaN(value) && value > 0) {
      options.previewRows = value;
    }
  }

  if (parsed.timeout != null) {
    const value = Number(parsed.timeout);
    if (!Number.isNaN(value) && value > 0) {
      options.timeoutMs = value;
    }
  }

  if (parsed.languages) {
    options.languages = String(parsed.languages)
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean);
  }

  options.countryCode = parsed['country-code'] ? String(parsed['country-code']).toUpperCase() : null;
  options.countryQid = parsed['country-qid'] ? String(parsed['country-qid']).toUpperCase() : null;
  options.printOnly = parsed['print-only'] === true || parsed.action === CLI_ACTIONS.PRINT;
  options.json = parsed.json === true || parsed.format === 'json';
  options.quiet = parsed.quiet === true;
  options.noCache = parsed['no-cache'] === true;
  options.dryRun = parsed['dry-run'] === true;
  options.regionClassQids = parsed['region-class-qids']
    ? String(parsed['region-class-qids']).split(',').map(qid => qid.trim()).filter(Boolean)
    : null;

  return options;
}

function ensureCountryContext(name, options) {
  if (name === 'countries') {
    return;
  }

  if (!options.countryCode && !options.countryQid) {
    throw new Error('This query requires --country-code (ISO2) or --country-qid (QID).');
  }

  if (!options.countryCode) {
    printWarning('country-code missing; query will rely solely on QID.');
  }
  if (!options.countryQid) {
    printWarning('country-qid missing; query will rely solely on ISO code.');
  }
}

function listQueries() {
  printHeader('Available geography queries');
  Object.entries(QUERY_REGISTRY).forEach(([key, meta]) => {
    printInfo(`${chalk.bold(key)} – ${meta.description}`);
  });
}

function resolveQueryDefinition(name) {
  const def = QUERY_REGISTRY[name];
  if (!def) {
    const available = Object.keys(QUERY_REGISTRY).join(', ');
    throw new Error(`Unknown query "${name}". Available options: ${available}`);
  }
  return def;
}

function buildQuery(definition, options) {
  const config = {
    limit: options.limit,
    minPopulation: options.minPopulation,
    countryCode: options.countryCode,
    countryQid: options.countryQid,
    languages: options.languages,
    regionClassQids: options.regionClassQids
  };
  const query = definition.build(config);
  return { query, config };
}

function printQueryPreview(name, query, config) {
  printHeader(`Query: ${name}`);
  printInfo(`Limit: ${config.limit ?? 'default'}`);
  if (config.countryCode) {
    printInfo(`Country code: ${config.countryCode}`);
  }
  if (config.countryQid) {
    printInfo(`Country QID: ${config.countryQid}`);
  }
  if (config.minPopulation != null) {
    printInfo(`Min population: ${config.minPopulation}`);
  }
  printInfo(`Languages: ${(config.languages || []).join(', ')}`);
  console.log('\n' + query + '\n');
}

function summariseBindings(bindings) {
  if (!Array.isArray(bindings) || bindings.length === 0) {
    return [];
  }
  return bindings.map(row => {
    const entry = {};
    for (const [key, value] of Object.entries(row)) {
      entry[key] = value?.value ?? null;
    }
    return entry;
  });
}

async function executeQuery(name, query, options) {
  const cacheDir = path.join(process.cwd(), 'data', 'cache', 'sparql');
  const service = new WikidataService({
    cacheDir,
    sleepMs: 250,
    timeoutMs: options.timeoutMs,
    logger: options.quiet ? { info() {}, error: console.error, warn: console.warn } : console
  });

  const result = await service.executeSparqlQuery(query, {
    useCache: !options.noCache,
    timeoutMs: options.timeoutMs
  });

  const bindings = summariseBindings(result?.results?.bindings);
  const displayed = options.previewRows < bindings.length
    ? bindings.slice(0, options.previewRows)
    : bindings;

  printSuccess(`${name} query returned ${bindings.length} row(s).`);

  if (options.json) {
    console.log(JSON.stringify({ bindings, query }, null, 2));
    return;
  }

  if (displayed.length === 0) {
    printWarning('No rows to display.');
    return;
  }

  console.table(displayed);
  if (displayed.length < bindings.length) {
    printInfo(`Preview truncated to ${displayed.length} of ${bindings.length} row(s). Use --preview=N to adjust.`);
  }
}

function printHelp() {
  printHeader('Geography crawl query CLI');
  console.log('Usage:');
  console.log('  node src/tools/geography-crawl-queries.js list');
  console.log('  node src/tools/geography-crawl-queries.js <query> [options]\n');
  console.log('Queries:');
  Object.entries(QUERY_REGISTRY).forEach(([key, meta]) => {
    console.log(`  ${key.padEnd(10)} ${meta.description}`);
  });
  console.log('\nOptions:');
  console.log('  --limit <n>                 Limit rows returned by the query');
  console.log('  --country-code <ISO2>       Country ISO 3166-1 alpha-2 code');
  console.log('  --country-qid <QID>         Wikidata QID of the country');
  console.log('  --min-population <n>        Minimum population filter (cities query)');
  console.log('  --languages <list>          Comma separated language codes for labels');
  console.log('  --preview <n>               Rows to display (default 5)');
  console.log('  --timeout <ms>              Override request timeout (default 20000)');
  console.log('  --no-cache                  Disable local SPARQL response cache');
  console.log('  --json                      Output JSON instead of table preview');
  console.log('  --print-only                Print the SPARQL query without executing');
  console.log('  --dry-run                   Alias for --print-only');
  console.log('  --region-class-qids <list>  Override ADM1 class list (comma separated)');
  console.log('  --quiet                     Suppress info logs');
  console.log('  print                       Shortcut action to only print the query');
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp();
    return;
  }

  const parsed = parseArgv(rawArgs);

  if (parsed.action === CLI_ACTIONS.LIST) {
    listQueries();
    return;
  }

  const positional = parsed.positional || [];
  const queryName = positional[0];
  if (!queryName) {
    throw new Error('Missing query name. Run with list or provide e.g. "countries".');
  }

  const options = coerceOptions({ ...parsed });
  const definition = resolveQueryDefinition(queryName);

  ensureCountryContext(queryName, options);

  const { query, config } = buildQuery(definition, options);

  if (options.printOnly || options.dryRun || parsed.action === CLI_ACTIONS.PRINT) {
    printQueryPreview(queryName, query, config);
    return;
  }

  await executeQuery(queryName, query, options);
}

if (require.main === module) {
  main().catch((error) => {
    printError(error.message || String(error));
    if (process.env.DEBUG_GEOGRAPHY_QUERY_CLI) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  });
}
