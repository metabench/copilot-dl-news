'use strict';
// jest-failures.js <testPath> — run jest with --json and print ONLY the
// failing test full names + first error line each. The bridge caps run-tests
// tails at 4k, which console-noisy suites overflow; this stays compact.
const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');

const testPath = process.argv[2];
if (!testPath) { console.log('usage: jest-failures.js <testPath>'); process.exit(1); }
const outFile = path.join(os.tmpdir(), `jest-out-${Date.now()}.json`);
const r = spawnSync(process.execPath, [
  path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js'),
  path.resolve(ROOT, testPath), '--json', `--outputFile=${outFile}`, '--silent'
], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });

let data;
try { data = JSON.parse(fs.readFileSync(outFile, 'utf8')); }
catch (e) { console.log('no json output; stderr tail:', (r.stderr || '').slice(-1500)); process.exit(1); }
finally { try { fs.unlinkSync(outFile); } catch (_) {} }

console.log(`suites ${data.numPassedTestSuites}/${data.numTotalTestSuites} passed; tests ${data.numPassedTests}/${data.numTotalTests} passed, ${data.numFailedTests} failed`);
for (const suite of data.testResults) {
  for (const t of suite.assertionResults || suite.testResults || []) {
    if (t.status === 'failed') {
      const msg = String((t.failureMessages || [''])[0]).replace(/\x1b\[[0-9;]*m/g, '').split('\n').find(l => l.trim()) || '';
      console.log(`FAIL: ${t.fullName}`);
      console.log(`  -> ${msg.trim().slice(0, 160)}`);
    }
  }
}
process.exit(data.numFailedTests ? 1 : 0);
