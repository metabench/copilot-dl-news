#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
  buildGuardianHubInventory,
  buildGuardianDbPersistencePlan,
  buildGuardianSampleCrawlPlan,
  buildGuardianSampleObservabilitySummary,
  buildGuardianRuntimeLatestStoryProof,
  buildGuardianRuntimeSamplesFromLog,
  buildGuardianRuntimePatternProof,
  extractGuardianHubStories,
  persistGuardianHubPatternsToStore,
  readHtmlFile
} = require('./lib/guardian-place-hubs');
const { loadJsonArtifacts } = require('./lib/throughput-analyzer');

function parseArgs(argv = process.argv.slice(2)) {
  const mode = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'inventory';
  const start = mode === argv[0] ? 1 : 0;
  const args = { mode, json: false, pretty: false };
  for (let i = start; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') { args.json = true; continue; }
    if (token === '--pretty') { args.pretty = true; args.json = true; continue; }
    if (token === '--help' || token === '-h') { args.help = true; continue; }
    if (!token.startsWith('--')) throw new Error(`unexpected positional argument: ${token}`);
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function showHelp() {
  console.log(`guardian-place-hubs - local Guardian place-hub planning

Usage:
  node tools/crawl/guardian-place-hubs.js inventory --json
  node tools/crawl/guardian-place-hubs.js extract --html tests/fixtures/the-guardian-world.html --url https://www.theguardian.com/world/france --json
  node tools/crawl/guardian-place-hubs.js plan --size small --json
  node tools/crawl/guardian-place-hubs.js db-plan --json
  node tools/crawl/guardian-place-hubs.js persist --db data/samples/guardian-hubs.db --json
  node tools/crawl/guardian-place-hubs.js runtime-proof --db data/samples/guardian-hubs.db --json
  node tools/crawl/guardian-place-hubs.js latest-story-proof --db data/samples/guardian-hubs.db --html tests/fixtures/the-guardian-world.html --url https://www.theguardian.com/world/france --json
  node tools/crawl/guardian-place-hubs.js runtime-samples --watch tmp/guardian-small-watch.stderr.log --json
  node tools/crawl/guardian-place-hubs.js sample-summary --launch tmp/guardian-small-rerun-launch.stdout.json --watch tmp/guardian-small-rerun-watch.stderr.log --sample-before tmp/guardian-small-rerun-sample-before.json --sample-after tmp/guardian-small-final-sample-after.json --production-before tmp/guardian-small-rerun-production-before.json --production-after tmp/guardian-small-rerun-production-after.json --json
  node tools/crawl/guardian-place-hubs.js sample-summary --sample-after tmp/guardian-small-final-sample-after.json --meter-samples tmp/meter.jsonl --fetch-samples tmp/fetch.jsonl --limiter-snapshots tmp/limiter.json --json

Modes:
  inventory   No-contact Guardian hub pattern inventory and candidate URL set
  extract     Extract latest-story candidates from saved/fixture Guardian hub HTML
  plan        Build a local-only small/medium sample crawl plan to an isolated DB
  db-plan     No-contact DB-module persistence plan for Guardian hub heuristics
  persist     Persist Guardian hub URL patterns through the DB module
  runtime-proof
              Persist patterns to an isolated DB and prove runtime predictor use
  latest-story-proof
              Prove saved Guardian hub links become runtime latest-story candidates
  runtime-samples
              Extract PAGE-log fetch, limiter, and runtime latest-story samples
  sample-summary
              Summarize saved Guardian sample proof, terminal/job evidence, and observability gaps

Options:
  --html <path>       Saved HTML for extract mode
  --url <url>         Hub URL for extract mode
  --size <small|medium>
  --sample-db <path>  Isolated sample DB path for plan mode
  --db <path>         Isolated DB path for persist/runtime-proof mode
  --token <value>     Stable token for generated sample DB names
  --launch <path>     Saved launch JSON for sample-summary mode
  --watch <path>      Saved watch stderr log for sample-summary mode
  --meter-samples <path>
                     Saved JSON/JSONL meter samples for sample-summary throughput attribution
  --fetch-samples <path>
                     Saved JSON/JSONL fetch/freshness samples for sample-summary throughput attribution
  --limiter-snapshots <path>
                     Saved JSON/JSONL limiter snapshots with Crawl-delay/backoff evidence
  --runtime-samples <path>
                     Saved guardian runtime-samples artifact for sample-summary mode
  --fetch-out <path>  runtime-samples mode: write fetch sample array
  --limiter-out <path>
                     runtime-samples mode: write limiter snapshot array
  --stories-out <path>
                     runtime-samples mode: write runtime latest-story candidates
  --out <path>        Write JSON artifact
  --json / --pretty   Machine-readable output

Policy: inventory/extract/plan do not start crawlers, contact targets, write DBs,
or touch remote servers. Plan commands, when executed by a later step, are local
crawler runs only and write isolated sample DBs.`);
}

function writeOut(filePath, payload, pretty = false) {
  if (!filePath || filePath === true) return;
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(payload, null, pretty ? 2 : 0)}\n`);
}

function printPayload(payload, args) {
  writeOut(args.out, payload, args.pretty);
  if (args.json) {
    console.log(JSON.stringify(payload, null, args.pretty ? 2 : 0));
    return;
  }
  if (payload.mode === 'guardian-place-hub-pattern-inventory') {
    console.log(`Guardian patterns: ${payload.patterns.length}`);
    console.log(`Candidate URLs: ${payload.candidates.length}`);
    return;
  }
  if (payload.mode === 'guardian-hub-story-extraction') {
    console.log(`Stories: ${payload.stories.length}`);
    for (const story of payload.stories.slice(0, 10)) console.log(`- ${story.url}`);
    return;
  }
  if (payload.mode === 'guardian-place-hub-sample-crawl-plan') {
    console.log(`Guardian ${payload.size} sample plan`);
    console.log(payload.command.display);
    return;
  }
  if (payload.mode === 'guardian-place-hub-runtime-pattern-proof') {
    console.log(`Runtime stored-pattern matches: ${payload.proof.storedPatternMatches}/${payload.proof.expectedHubCount}`);
    return;
  }
  if (payload.mode === 'guardian-runtime-latest-story-proof') {
    console.log(`Runtime latest-story candidates: ${payload.proof.runtimeLatestStoryCandidates}/${payload.proof.storyCount}`);
    return;
  }
  if (payload.mode === 'guardian-runtime-samples') {
    console.log(`Runtime samples: pages=${payload.counts.pageEvents} latest-story=${payload.counts.runtimeLatestStoryCandidates}`);
    return;
  }
  if (payload.mode === 'guardian-sample-observability-summary') {
    console.log(`${payload.size || 'Guardian'} sample: ${payload.classification.label}`);
    console.log(`Terminal evidence: ${payload.watch.terminalEvidence.state}`);
  }
}

function readJsonArg(args, key) {
  const value = args[key];
  if (!value || value === true) return null;
  return JSON.parse(fs.readFileSync(path.resolve(value), 'utf8'));
}

function readJsonListArg(args, key) {
  const value = args[key];
  if (!value || value === true) return [];
  return loadJsonArtifacts(String(value).split(',').map((item) => item.trim()).filter(Boolean));
}

function readTextArg(args, key) {
  const value = args[key];
  if (!value || value === true) return '';
  return fs.readFileSync(path.resolve(value), 'utf8');
}

function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args.mode === 'help') {
    showHelp();
    return 0;
  }

  let payload;
  if (args.mode === 'inventory') {
    payload = buildGuardianHubInventory();
  } else if (args.mode === 'extract') {
    if (!args.html || args.html === true) throw new Error('--html is required for extract mode');
    const hubUrl = args.url && args.url !== true ? args.url : 'https://www.theguardian.com/world';
    payload = extractGuardianHubStories(readHtmlFile(args.html), hubUrl);
  } else if (args.mode === 'plan') {
    payload = buildGuardianSampleCrawlPlan({
      size: args.size,
      sampleDb: args['sample-db'] || args.sampleDb,
      token: args.token
    });
  } else if (args.mode === 'db-plan') {
    payload = buildGuardianDbPersistencePlan();
  } else if (args.mode === 'persist') {
    if (!args.db || args.db === true) throw new Error('--db is required for persist mode');
    const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
    const { createPlaceHubUrlPatternsStore } = require('../../src/data/db/placeHubUrlPatternsStore');
    const db = openNewsCrawlerDb(args.db);
    try {
      payload = persistGuardianHubPatternsToStore(createPlaceHubUrlPatternsStore(db));
    } finally {
      if (db && db.open) db.close();
    }
  } else if (args.mode === 'runtime-proof') {
    if (!args.db || args.db === true) throw new Error('--db is required for runtime-proof mode');
    const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
    const { createPlaceHubUrlPatternsStore } = require('../../src/data/db/placeHubUrlPatternsStore');
    const { PlaceHubPatternLearningService } = require('../../src/services/PlaceHubPatternLearningService');
    const db = openNewsCrawlerDb(args.db);
    try {
      const store = createPlaceHubUrlPatternsStore(db);
      const persistence = persistGuardianHubPatternsToStore(store);
      payload = buildGuardianRuntimePatternProof(new PlaceHubPatternLearningService({
        db,
        logger: { debug() {}, error() {}, info() {}, log() {}, warn() {} }
      }), {
        writesLocalDb: true
      });
      payload.persistence = {
        attempted: persistence.attempted,
        savedCount: persistence.savedCount,
        readback: persistence.readback
      };
    } finally {
      if (db && db.open) db.close();
    }
  } else if (args.mode === 'latest-story-proof') {
    if (!args.db || args.db === true) throw new Error('--db is required for latest-story-proof mode');
    if (!args.html || args.html === true) throw new Error('--html is required for latest-story-proof mode');
    const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
    const { createPlaceHubUrlPatternsStore } = require('../../src/data/db/placeHubUrlPatternsStore');
    const { PlaceHubPatternLearningService } = require('../../src/services/PlaceHubPatternLearningService');
    const db = openNewsCrawlerDb(args.db);
    try {
      const store = createPlaceHubUrlPatternsStore(db);
      const persistence = persistGuardianHubPatternsToStore(store);
      payload = buildGuardianRuntimeLatestStoryProof(new PlaceHubPatternLearningService({
        db,
        logger: { debug() {}, error() {}, info() {}, log() {}, warn() {} }
      }), {
        writesLocalDb: true,
        hubUrl: args.url && args.url !== true ? args.url : 'https://www.theguardian.com/world/france',
        html: readHtmlFile(args.html),
        evidenceSource: 'saved-fixture'
      });
      payload.persistence = {
        attempted: persistence.attempted,
        savedCount: persistence.savedCount,
        readback: persistence.readback
      };
    } finally {
      if (db && db.open) db.close();
    }
  } else if (args.mode === 'sample-summary') {
    const runtimeSamples = readJsonArg(args, 'runtime-samples');
    payload = buildGuardianSampleObservabilitySummary({
      size: args.size && args.size !== true ? args.size : null,
      launchReport: readJsonArg(args, 'launch'),
      watchLog: readTextArg(args, 'watch'),
      sampleBefore: readJsonArg(args, 'sample-before'),
      sampleAfter: readJsonArg(args, 'sample-after'),
      productionBefore: readJsonArg(args, 'production-before'),
      productionAfter: readJsonArg(args, 'production-after'),
      throughput: readJsonArg(args, 'throughput'),
      meterSamples: readJsonListArg(args, 'meter-samples'),
      fetchSamples: readJsonListArg(args, 'fetch-samples'),
      limiterSnapshots: readJsonListArg(args, 'limiter-snapshots'),
      cadenceComparison: readJsonArg(args, 'cadence'),
      runtimeProof: readJsonArg(args, 'runtime-proof'),
      runtimeSamples,
      extraction: readJsonArg(args, 'extraction')
    });
  } else if (args.mode === 'runtime-samples') {
    if (!args.watch || args.watch === true) throw new Error('--watch is required for runtime-samples mode');
    payload = buildGuardianRuntimeSamplesFromLog(readTextArg(args, 'watch'), {
      source: args.watch
    });
    writeOut(args['fetch-out'], payload.fetchSamples || [], args.pretty);
    writeOut(args['limiter-out'], payload.limiterSnapshots || [], args.pretty);
    writeOut(args['stories-out'], payload.runtimeLatestStoryExtraction?.candidates || [], args.pretty);
  } else {
    throw new Error(`unknown mode: ${args.mode}`);
  }

  printPayload(payload, args);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runCli();
  } catch (err) {
    console.error(`guardian-place-hubs error: ${err.message}`);
    process.exitCode = 2;
  }
}

module.exports = { parseArgs, runCli };
