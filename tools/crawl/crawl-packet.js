#!/usr/bin/env node
'use strict';

const {
  buildCrawlPacketComparison,
  buildPacketCadenceComparison,
  buildCrawlReliabilityPacket,
  renderCrawlPacketComparisonText,
  renderPacketCadenceComparisonText,
  renderCrawlReliabilityPacketText,
  buildPacketComparisonCard,
  renderPacketComparisonCardText,
  renderPacketComparisonCardHtml,
  writeComparisonOut,
  writePacketOut,
} = require('./lib/crawl-packet');

function assignArg(args, rawKey, value) {
  const key = rawKey === 'class' ? 'crawlClass' : rawKey;
  if (key === 'packet' || key === 'packets') {
    const values = Array.isArray(value) ? value : String(value || '').split(',');
    args.packet = [
      ...(Array.isArray(args.packet) ? args.packet : []),
      ...values.map(item => String(item || '').trim()).filter(Boolean),
    ];
    return;
  }
  args[key] = value;
}

function parseArgs(argv = process.argv.slice(2)) {
  const mode = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'plan';
  const start = mode === argv[0] ? 1 : 0;
  const args = {
    mode,
    json: false,
    pretty: false,
  };

  for (let index = start; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      args.json = true;
      continue;
    }
    if (token === '--html') {
      args.html = true;
      continue;
    }
    if (token === '--pretty') {
      args.pretty = true;
      args.json = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(`unexpected positional argument: ${token}`);
    }
    const eqIndex = token.indexOf('=');
    if (eqIndex !== -1) {
      assignArg(args, token.slice(2, eqIndex), token.slice(eqIndex + 1));
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      assignArg(args, key, true);
      continue;
    }
    assignArg(args, key, next);
    index += 1;
  }

  return args;
}

function showHelp() {
  console.log(`crawl-packet - no-contact crawl reliability packet and scorecard

Usage:
  node tools/crawl/crawl-packet.js plan --crawl-class tiny-local --json
  node tools/crawl/crawl-packet.js plan --crawl-class small-local --local-smoke-report tmp/local-smoke-report.json --json --out tmp/crawl-packet-small.json
  node tools/crawl/crawl-packet.js plan --fixture-preset small --fixture-port 41901 --json --out tmp/crawl-packet-small-fixture.json
  node tools/crawl/crawl-packet.js plan --crawl-class medium-local --json --out tmp/crawl-packet-medium.json
  node tools/crawl/crawl-packet.js compare --packet tmp/concurrent.json --packet tmp/sequential.json --json
  node tools/crawl/crawl-packet.js cadence --small tmp/crawl-packet-small-jobid-live.json --medium tmp/medium-sequential-terminalcap-packet.json --json --out tmp/small-vs-medium-cadence-comparison.json
  node tools/crawl/crawl-packet.js card --cadence tmp/small-vs-medium-cadence-comparison.json --json
  node tools/crawl/crawl-packet.js card --small tmp/crawl-packet-small-cadence-live.json --medium tmp/medium-sequential-terminalcap-packet.json --html --out tmp/small-vs-medium-card.html

Options:
  --crawl-class <tiny-local|small-local|medium-local>
  --fixture-preset <small|medium> Infer deterministic loopback target URLs and fixture start command
  --fixture-port <n>              Fixture HTTP port, default by preset
  --fixture-target-token <token>  Fresh deterministic suffix for fixture URLs
  --hosts <a,b>                 Override host list within the class cap
  --urls <a,b>                  Override target URLs within the class cap
  --profile <name>              Profile label / static dry-run profile
  --db <path>                   Local DB path, default data/news.db
  --max-pages <n>               Page cap, defaults by class
  --max-depth <n>               Depth cap, defaults by class
  --concurrency <n>             Local run concurrency, defaults by class
  --expected-min-downloads <n>  DB proof threshold
  --expected-min-hosts <n>      Distinct requested-host DB proof threshold
  --watch-timeout <sec>         Watch budget, defaults by class
  --ui-host <host>              Local UI host, default 127.0.0.1
  --ui-port <port>              Local UI port, defaults by class
  --local-smoke-report <path>   Include a saved monitored local-smoke report
  --comparison <path>           Include a saved local-smoke comparison
  --verification-report <path>  Include a saved monitored verify report for a small/medium run
  --launch-report <path>        Include saved run.js/crawl-batch JSON launch output
  --watch-log <path>            Include saved run.js stderr JSON watchFinal lines
  --packet <path>               Packet path for compare; repeatable or comma-separated
  --small <path>                Small reliability packet for cadence comparison
  --medium <path>               Medium reliability packet for cadence comparison
  --cadence <path>              Saved cadence comparison artifact for the card mode
  --html                        Render the comparison card as a read-only HTML fragment (card mode)
  --no-target-freshness         Skip local DB exact-target freshness inspection
  --out <path>                  Write compact JSON packet
  --json / --pretty             Machine-readable output

No-action policy:
  This command reads bounded local evidence files when supplied and writes only
  --out when requested. It does not start crawlers, contact the remote crawler,
  write DB rows, deploy, prune, drain, clear, seed, or change collect behavior.`);
}

function printPacket(packet, args) {
  writePacketOut(args.out, packet, args.pretty);
  if (args.json) {
    console.log(JSON.stringify(packet, null, args.pretty ? 2 : 0));
    return;
  }
  console.log(renderCrawlReliabilityPacketText(packet).trimEnd());
}

function printComparison(comparison, args) {
  writeComparisonOut(args.out, comparison, args.pretty);
  if (args.json) {
    console.log(JSON.stringify(comparison, null, args.pretty ? 2 : 0));
    return;
  }
  console.log(renderCrawlPacketComparisonText(comparison).trimEnd());
}

function printCadenceComparison(comparison, args) {
  writeComparisonOut(args.out, comparison, args.pretty);
  if (args.json) {
    console.log(JSON.stringify(comparison, null, args.pretty ? 2 : 0));
    return;
  }
  console.log(renderPacketCadenceComparisonText(comparison).trimEnd());
}

function printComparisonCard(card, args) {
  if (args.html) {
    const html = renderPacketComparisonCardHtml(card);
    if (args.out) {
      const fs = require('fs');
      const path = require('path');
      const resolved = path.resolve(args.out);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, html);
    }
    if (args.json) {
      console.log(JSON.stringify(card, null, args.pretty ? 2 : 0));
    } else {
      console.log(html.trimEnd());
    }
    return;
  }
  writeComparisonOut(args.out, card, args.pretty);
  if (args.json) {
    console.log(JSON.stringify(card, null, args.pretty ? 2 : 0));
    return;
  }
  console.log(renderPacketComparisonCardText(card).trimEnd());
}

function getPayloadExitCode(packet) {
  return packet?.classification?.blockers?.length ? 2 : 0;
}

function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args.mode === 'help') {
    showHelp();
    return 0;
  }
  if (args.mode === 'compare' || args.mode === 'compare-packets') {
    const comparison = buildCrawlPacketComparison(args);
    printComparison(comparison, args);
    return comparison.comparison.blockedCount >= comparison.comparison.packetCount ? 2 : 0;
  }
  if (args.mode === 'cadence' || args.mode === 'cadence-compare') {
    const comparison = buildPacketCadenceComparison(args);
    printCadenceComparison(comparison, args);
    return comparison.cadenceConsistent ? 0 : 2;
  }
  if (args.mode === 'card' || args.mode === 'comparison-card') {
    const card = buildPacketComparisonCard(args);
    printComparisonCard(card, args);
    return card.verdict.cadenceConsistent ? 0 : 2;
  }
  if (args.mode !== 'plan' && args.mode !== 'packet' && args.mode !== 'scorecard') {
    throw new Error(`unknown command: ${args.mode}`);
  }
  if (!args.noTargetFreshness && !args['no-target-freshness'] && args.targetFreshness == null && args['target-freshness'] == null) {
    args.targetFreshness = true;
  }
  const packet = buildCrawlReliabilityPacket(args);
  printPacket(packet, args);
  return getPayloadExitCode(packet);
}

if (require.main === module) {
  try {
    const status = runCli(process.argv.slice(2));
    if (status) process.exit(status);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  getPayloadExitCode,
  parseArgs,
  runCli,
};
