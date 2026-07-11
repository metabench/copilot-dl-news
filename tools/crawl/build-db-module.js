#!/usr/bin/env node
'use strict';
// Build the sibling news-crawler-db module (tsc) — runnable via the bridge's
// run-node (which requires scripts to live inside THIS repo). Prints the tail
// of compiler output and exits with tsc's code.
const path = require('path');
const { spawn } = require('child_process');
const MOD = path.resolve(__dirname, '..', '..', '..', 'news-crawler-db');
const TSC = path.join(MOD, 'node_modules', 'typescript', 'bin', 'tsc');
const child = spawn(process.execPath, [TSC, '-p', MOD], { cwd: MOD, windowsHide: true });
let out = '';
child.stdout.on('data', (c) => { out += c.toString(); });
child.stderr.on('data', (c) => { out += c.toString(); });
child.on('exit', (code) => {
  console.log(out.slice(-4000) || '(no compiler output)');
  console.log('tsc exit:', code);
  process.exit(code || 0);
});
