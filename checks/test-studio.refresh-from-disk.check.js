#!/usr/bin/env node
'use strict';

/**
 * Check: Test Studio - refreshFromDisk
 *
 * Verifies TestResultService can:
 * - import valid run artifacts from disk
 * - skip invalid JSON and missing runId
 * - be idempotent across repeated refreshes
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TestResultService = require('../src/ui/server/testStudio/TestResultService');

function check(name, condition, expected, actual) {
  const pass = !!condition;
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) {
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual:   ${actual}`);
    process.exitCode = 1;
  }
  return pass;
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Check: Test Studio - refreshFromDisk');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-dl-news-test-results-'));

  try {
    const validRun = {
      runId: 'run-check-001',
      timestamp: new Date().toISOString(),
      testResults: [
        {
          name: 'sample.test.js',
          assertionResults: [
            { title: 'works', status: 'passed', duration: 5 }
          ]
        }
      ]
    };

    writeJson(path.join(tmpDir, 'latest.json'), validRun);
    fs.writeFileSync(path.join(tmpDir, 'invalid.json'), '{not-json', 'utf8');
    writeJson(path.join(tmpDir, 'missing-runid.json'), { timestamp: validRun.timestamp, testResults: [] });

    const service = new TestResultService({ resultsDir: tmpDir, autoImportFromDisk: true });

    const first = await service.refreshFromDisk({ dir: tmpDir, minIntervalMs: 0, maxFiles: 10 });
    check('First refresh imports 1 run', first.imported === 1, 1, first.imported);

    const countAfterFirst = await service.getRunCount();
    check('Run count is 1 after import', countAfterFirst === 1, 1, countAfterFirst);

    const second = await service.refreshFromDisk({ dir: tmpDir, minIntervalMs: 0, maxFiles: 10 });
    check('Second refresh imports 0 runs (idempotent)', second.imported === 0, 0, second.imported);
    check('Second refresh skips at least 1 file', second.skipped >= 1, '>= 1', second.skipped);

    const countAfterSecond = await service.getRunCount();
    check('Run count remains 1', countAfterSecond === 1, 1, countAfterSecond);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('\n───────────────────────────────────────────────────────────────');
  console.log(process.exitCode ? '❌ Some checks failed' : '✅ All checks passed');
  console.log('───────────────────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('Fatal error in refreshFromDisk check:', err);
  process.exitCode = 1;
});
