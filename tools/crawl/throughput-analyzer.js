#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
  buildInternetThroughputApprovalPacket,
  buildThroughputAnalysis,
  loadJsonArtifacts,
  readJsonArtifact,
  renderThroughputAnalysisText
} = require('./lib/throughput-analyzer');

function parseArgs(argv = process.argv.slice(2)) {
  const mode = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'analyze';
  const start = mode === argv[0] ? 1 : 0;
  const args = { mode, json: false, pretty: false };
  for (let i = start; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') { args.json = true; continue; }
    if (token === '--pretty') { args.pretty = true; continue; }
    if (token === '--help' || token === '-h') { args.help = true; continue; }
    if (!token.startsWith('--')) throw new Error(`unexpected positional argument: ${token}`);
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    if (args[key] == null) args[key] = next;
    else if (Array.isArray(args[key])) args[key].push(next);
    else args[key] = [args[key], next];
    i += 1;
  }
  return args;
}

function showHelp() {
  console.log(`throughput-analyzer - no-contact crawl throughput attribution

Usage:
  node tools/crawl/throughput-analyzer.js analyze [options]
  node tools/crawl/throughput-analyzer.js approval [options]

Options:
  --progress <path>             Saved crawl-progress-monitor packet; repeatable
  --meter-samples <path>        JSON array/object or JSONL throughput-meter samples
  --fetch-samples <path>        JSON array/object or JSONL fetch/page samples
  --limiter-snapshots <path>    JSON array/object or JSONL limiter snapshots
  --cadence <path>              Saved crawl-packet cadence comparison artifact
  --approved                    Mark explicit approval present in the packet
  --sample-db <path>            Isolated sample DB path for approval packet
  --production-db <path>        Production DB path for isolation proof
  --url <url>                   Internet sample target URL for approval packet
  --out <path>                  Write report JSON
  --json                        Print JSON
  --pretty                      Pretty JSON

No-action policy: reads saved artifacts only. Does not start crawlers, contact
targets, write DB rows, or mutate queues.`);
}

function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args.mode === 'help') {
    showHelp();
    return 0;
  }
  if (args.mode === 'approval' || args.mode === 'approval-packet') {
    const report = buildInternetThroughputApprovalPacket({
      explicitApprovalPresent: args.approved === true,
      sampleDbPath: args['sample-db'] || args.sampleDb,
      productionDbPath: args['production-db'] || args.productionDb,
      targetUrl: args.url
    });
    if (args.out && args.out !== true) {
      fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
    }
    if (args.json) {
      console.log(JSON.stringify(report, null, args.pretty ? 2 : 0));
    } else {
      process.stdout.write(renderThroughputAnalysisText(report));
    }
    return report.classification.label === 'blocked' ? 3 : 0;
  }

  if (args.mode !== 'analyze' && args.mode !== 'analysis') {
    throw new Error(`unknown mode: ${args.mode}`);
  }

  const report = buildThroughputAnalysis({
    progressPackets: loadJsonArtifacts(args.progress),
    meterSamples: loadJsonArtifacts(args['meter-samples'] || args.meterSamples),
    fetchSamples: loadJsonArtifacts(args['fetch-samples'] || args.fetchSamples),
    limiterSnapshots: loadJsonArtifacts(args['limiter-snapshots'] || args.limiterSnapshots),
    cadenceComparison: args.cadence && args.cadence !== true ? readJsonArtifact(args.cadence) : null
  });

  if (args.out && args.out !== true) {
    fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, args.pretty ? 2 : 0));
  } else {
    process.stdout.write(renderThroughputAnalysisText(report));
  }
  return report.classification.label === 'throughput-blocked' ? 3 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = runCli();
  } catch (err) {
    console.error(`throughput-analyzer error: ${err.message}`);
    process.exitCode = 2;
  }
}

module.exports = { parseArgs, runCli };
