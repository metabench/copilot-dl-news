#!/usr/bin/env node
'use strict';

const {
  buildSequentialFixtureProofPlan,
  runSequentialFixtureProof,
  writeJsonFile,
} = require('./lib/sequential-fixture-proof');

function assignArg(args, rawKey, value) {
  const key = rawKey === 'fixture-token' ? 'targetToken' : rawKey;
  if (key === 'execute') {
    args.mode = 'execute';
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
  console.log(`sequential-fixture-proof - bounded medium loopback proof helper

Usage:
  node tools/crawl/sequential-fixture-proof.js plan --fixture-port 41965 --target-token medium-proof --json
  node tools/crawl/sequential-fixture-proof.js execute --fixture-port 41965 --target-token medium-proof --artifact-prefix tmp/medium-sequential-live --json

Options:
  --fixture-port <n>             Loopback fixture port, default 41892
  --target-token <token>         Fresh deterministic fixture URL suffix
  --artifact-prefix <path>       Artifact prefix, default tmp/medium-sequential-fixture
  --db <path>                    Local DB path, default data/news.db
  --ui-host <host>               Local UI host, default 127.0.0.1
  --ui-port <n>                  Local UI port, default 3173
  --watch-timeout <sec>          Per-host watch budget, default 120
  --launch-timeout <sec>         Per-host launch budget, default 180
  --no-output-timeout <sec>      Per-host no-output budget, default 90
  --local-smoke-report <path>    Tiny local smoke report to include in packet
  --comparison <path>            Tiny local smoke comparison to include in packet
  --compare-with <path>          Prior packet to compare against after execute
  --no-target-freshness          Skip exact target freshness DB inspection
  --wait-for-terminal            After DB proof, wait briefly for accepted local jobs to reach terminal state
  --terminal-wait-timeout <sec>  Terminal wait budget, default 30
  --out <path>                   Write plan/result JSON
  --json / --pretty              Machine-readable output

Safety:
  plan is no-contact. execute starts checked-in loopback fixture servers and
  bounded local crawlers only. It does not contact remote crawlers, internet
  targets, deploy, prune, drain, clear, seed, or mutate remote queue state.`);
}

function renderPlanText(plan) {
  const lines = [
    `Mode: ${plan.mode}`,
    `Fixture: medium ${plan.fixture.hosts.length} hosts on port ${plan.fixture.port}`,
    `Token: ${plan.fixture.targetToken || '(none)'}`,
    `Starts loopback/local on execute: ${plan.actionPolicy.executeStartsLoopbackFixtureServer}/${plan.actionPolicy.executeStartsLocalCrawler}`,
    'Steps:',
  ];
  for (const step of plan.steps) {
    lines.push(`- ${step.host}: ${step.launch.display}`);
  }
  lines.push(`Packet: ${plan.artifacts.packet}`);
  if (plan.compose.comparisonCommand) {
    lines.push(`Comparison: ${plan.artifacts.comparison}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderResultText(result) {
  const packet = result.packet || {};
  const lines = [
    `Mode: ${result.mode}`,
    `Exit: ${result.runStatus?.exitCode ?? 'unknown'}`,
    `Packet: ${packet.path || '(none)'}`,
    `Classification: ${packet.label || 'unknown'} (${packet.primary || 'unknown'})`,
    `Score: ${packet.score?.points ?? 0}/${packet.score?.maxPoints ?? 0} (${packet.score?.percent ?? 0}%)`,
  ];
  if (Array.isArray(packet.blockers) && packet.blockers.length) {
    lines.push(`Blockers: ${packet.blockers.join(', ')}`);
  }
  if (result.verification?.delta) {
    const delta = result.verification.delta;
    lines.push(`DB delta: urls=${delta.urls || 0}, responses=${delta.responses || 0}, content=${delta.content || 0}`);
  }
  return `${lines.join('\n')}\n`;
}

function writeOut(outPath, payload, pretty) {
  if (!outPath) return;
  writeJsonFile(outPath, payload, pretty);
}

function getPayloadExitCode(payload) {
  if (!payload) return 1;
  if (payload.mode === 'medium-sequential-fixture-proof-plan') return 0;
  const packetBlockers = Array.isArray(payload.packet?.blockers) ? payload.packet.blockers : [];
  if (packetBlockers.length) return 2;
  return Number(payload.runStatus?.exitCode || 0);
}

async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args.mode === 'help') {
    showHelp();
    return 0;
  }

  if (args.mode === 'plan' || args.mode === 'packet' || args.mode === 'dry-run') {
    const plan = buildSequentialFixtureProofPlan(args);
    writeOut(args.out, plan, args.pretty);
    if (args.json) {
      console.log(JSON.stringify(plan, null, args.pretty ? 2 : 0));
    } else {
      process.stdout.write(renderPlanText(plan));
    }
    return 0;
  }

  if (args.mode !== 'execute' && args.mode !== 'run') {
    throw new Error(`unknown command: ${args.mode}`);
  }

  const result = await runSequentialFixtureProof(args);
  writeOut(args.out, result, args.pretty);
  if (args.json) {
    console.log(JSON.stringify(result, null, args.pretty ? 2 : 0));
  } else {
    process.stdout.write(renderResultText(result));
  }
  return getPayloadExitCode(result);
}

if (require.main === module) {
  runCli(process.argv.slice(2))
    .then((status) => {
      if (status) process.exit(status);
    })
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}

module.exports = {
  getPayloadExitCode,
  parseArgs,
  renderPlanText,
  renderResultText,
  runCli,
};
