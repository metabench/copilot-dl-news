#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
  buildFixturePlan,
  parseArgs,
  startFixtureServers,
} = require('./lib/local-fixture-server');

function writeJsonFile(filePath, payload, pretty = false) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(payload, null, pretty ? 2 : 0)}\n`);
}

function showHelp() {
  console.log(`local-fixture-server - deterministic loopback crawl targets

Usage:
  node tools/crawl/local-fixture-server.js --preset small --plan --json
  node tools/crawl/local-fixture-server.js --preset medium --port 41902 --plan --json --out tmp/medium-fixture-plan.json
  node tools/crawl/local-fixture-server.js --preset small --port 41901 --json

Options:
  --preset <small|medium>  Fixture target set, default small
  --port <n>               HTTP port, default 41891 for small, 41892 for medium
  --target-token <token>   Add a deterministic fresh suffix to fixture URLs
  --plan                   Print the no-contact fixture plan and exit
  --ready-file <path>      Write server readiness JSON while running
  --pid-file <path>        Write server PID while running
  --lifetime-ms <n>        Auto-close the fixture server after a bounded lifetime
  --out <path>             Write the emitted plan/ready JSON
  --json                   Machine-readable stdout

Safety:
  Plan mode starts nothing. Server mode binds only loopback hosts from the preset
  and never contacts internet targets, the remote crawler, or the remote queue.`);
}

function printPlan(plan, args) {
  writeJsonFile(args.out, plan, Boolean(args.pretty));
  if (args.json || args.pretty) {
    console.log(JSON.stringify(plan, null, args.pretty ? 2 : 0));
    return;
  }
  console.log([
    `Local fixture plan: ${plan.preset}`,
    `Port: ${plan.server.port}`,
    `Hosts: ${plan.hosts.join(', ')}`,
    `URLs: ${plan.urls.join(', ')}`,
    `Start: ${plan.commands.start.display}`,
  ].join('\n'));
}

function printReady(ready, args) {
  writeJsonFile(args.out, ready, Boolean(args.pretty));
  if (args.json || args.pretty) {
    console.log(JSON.stringify(ready, null, args.pretty ? 2 : 0));
    return;
  }
  console.log([
    `Local fixture server ready: ${ready.preset}`,
    `PID: ${ready.pid}`,
    `Port: ${ready.port}`,
    `URLs: ${ready.urls.join(', ')}`,
  ].join('\n'));
}

function waitForStop(runtime, args) {
  return new Promise((resolve) => {
    let closed = false;
    let lifetimeTimer = null;

    const finish = async () => {
      if (closed) return;
      closed = true;
      if (lifetimeTimer) clearTimeout(lifetimeTimer);
      process.off('SIGINT', finish);
      process.off('SIGTERM', finish);
      await runtime.close();
      resolve();
    };

    process.on('SIGINT', finish);
    process.on('SIGTERM', finish);

    const lifetimeMs = Number(args.lifetimeMs || 0);
    if (Number.isFinite(lifetimeMs) && lifetimeMs > 0) {
      lifetimeTimer = setTimeout(finish, lifetimeMs);
      if (typeof lifetimeTimer.unref === 'function') lifetimeTimer.unref();
    }
  });
}

async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    showHelp();
    return 0;
  }

  const plan = buildFixturePlan(args);
  if (args.plan) {
    printPlan(plan, args);
    return 0;
  }

  const runtime = await startFixtureServers(plan, { ...args, lifetimeMs: 0 });
  printReady(runtime.ready, args);
  await waitForStop(runtime, args);
  return 0;
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((status) => {
    if (status) process.exit(status);
  }).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  runCli,
  showHelp,
};
