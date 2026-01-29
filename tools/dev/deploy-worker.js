#!/usr/bin/env node
"use strict";

/**
 * Convenience wrapper for deploying the distributed worker to the single remote server.
 *
 * This wraps tools/dev/remote-deploy.js with the correct local entrypoint.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

const localEntrypoint = path.join('labs', 'distributed-crawl', 'worker-server.js');

const forward = [
  '--app', 'worker',
  '--local', localEntrypoint,
  ...args,
];

const r = spawnSync('node', [path.join('tools', 'dev', 'remote-deploy.js'), ...forward], { stdio: 'inherit' });
process.exit(r.status || 0);
