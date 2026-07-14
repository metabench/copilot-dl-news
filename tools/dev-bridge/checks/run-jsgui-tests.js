'use strict';

/**
 * run-jsgui-tests.js — run jsgui3-html mocha test file(s) on this machine
 * (uses jsgui3-html/test/node_modules mocha). argv = test paths relative to
 * the jsgui3-html repo; defaults to the raw-text-elements regression test.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const WORKSPACE = path.resolve(__dirname, '..', '..', '..', '..');
const JSGUI = path.join(WORKSPACE, 'jsgui3-html');
const MOCHA = path.join(JSGUI, 'test', 'node_modules', 'mocha', 'bin', 'mocha.js');

const tests = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['test/core/raw_text_elements.test.js', 'test/core/attribute_escaping.test.js'];

if (!fs.existsSync(MOCHA)) {
  console.log('mocha not found at', MOCHA);
  process.exit(2);
}

const child = spawn(process.execPath, [MOCHA, '--require', './test/setup.js', ...tests], {
  cwd: JSGUI,
  env: { ...process.env, NODE_PATH: path.join(JSGUI, 'test', 'node_modules') },
  windowsHide: true
});
child.stdout.on('data', (d) => process.stdout.write(d));
child.stderr.on('data', (d) => process.stdout.write(d));
child.on('exit', (code) => process.exit(code == null ? 2 : code));
