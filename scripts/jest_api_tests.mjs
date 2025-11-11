'use strict';

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';

/**
 * API test runner
 *
 * Usage examples:
 *   node scripts/jest_api_tests.mjs              # Run all default API suites
 *   node scripts/jest_api_tests.mjs tests/server/api/crawls.test.js
 *   node scripts/jest_api_tests.mjs -- --detectOpenHandles
 *
 * Positional arguments override the default file list. Use `--` to forward
 * additional options directly to Jest. Run with `--help` for details.
 */
const DEFAULT_TESTS = [
  'tests/server/api/background-tasks.test.js',
  'tests/server/api/analysis.test.js',
  'tests/server/api/crawls.test.js',
  'tests/server/api/health.test.js',
  'tests/server/api/place-hubs.test.js'
];


const MODULE_PATH = fileURLToPath(import.meta.url);
const ROOT_DIR = resolve(dirname(MODULE_PATH), '..');
const JEST_BIN = resolve(ROOT_DIR, 'node_modules', 'jest', 'bin', 'jest.js');
const TIMING_REPORTER = resolve(ROOT_DIR, 'tests', 'jest-timing-reporter.js');


function usage() {
  const scriptPath = relative(process.cwd(), fileURLToPath(import.meta.url));
  return `API Jest runner\n\n` +
    `Usage:\n` +
    `  node ${scriptPath} [test-file ...] [--] [jest-arg ...]\n\n` +
    `Options:\n` +
    `  --help            Show this message and exit\n` +
    `  --list            Print the default test files\n\n` +
    `Behaviour:\n` +
    `  • With no positional arguments, the runner executes the default API test suite.\n` +
    `  • Provide one or more test file paths to target a subset.\n` +
    `  • Use -- to forward flags directly to Jest (e.g., --detectOpenHandles).\n` +
    `  • The runner always enables --runTestsByPath and adds the standard\n` +
    `    guard rails (--bail=1 and --maxWorkers=50%).`;
}

function listDefaults() {
  console.log('Default API test files:');
  for (const file of DEFAULT_TESTS) {
    console.log(`  - ${file}`);
  }
}

function runJest(args) {
  if (!existsSync(JEST_BIN)) {
    console.error(`Cannot locate Jest CLI at ${relative(process.cwd(), JEST_BIN)}. Run npm install to restore dependencies.`);
    return 1;
  }

  const nodeArgs = ['--experimental-vm-modules', JEST_BIN, ...args];
  const env = {
    ...process.env,
    TEST_SUITE_NAME: process.env.TEST_SUITE_NAME || 'api',
    JEST_TIMING_REPORTER_MODE: process.env.JEST_TIMING_REPORTER_MODE || 'quiet'
  };
  const result = spawnSync(process.execPath, nodeArgs, {
    stdio: 'inherit',
    shell: false,
    env
  });

  if (result.error) {
    console.error('Failed to execute Jest:', result.error.message);
    return 1;
  }

  return typeof result.status === 'number' ? result.status : 1;
}


function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help')) {
    console.log(usage());
    return 0;
  }

  if (argv.includes('--list')) {
    listDefaults();
    return 0;
  }

  const passthroughIndex = argv.indexOf('--');
  const passthrough = passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : [];
  const rawArgs = passthroughIndex >= 0 ? argv.slice(0, passthroughIndex) : argv;

  const explicitFiles = rawArgs.filter((item) => !item.startsWith('--'));
  const extraFlags = rawArgs.filter((item) => item.startsWith('--'));

  const testFiles = explicitFiles.length > 0 ? explicitFiles : DEFAULT_TESTS;
  const resolvedFiles = testFiles.map((file) => resolve(ROOT_DIR, file));

  const jestArgs = [
    '--config',
    'jest.careful.config.js',
    '--bail=1',
    '--maxWorkers=50%',
    '--runTestsByPath',
    ...resolvedFiles
  ];

  const hasReporterOverride = extraFlags.some((item) => item.startsWith('--reporters')) ||
    passthrough.some((item) => typeof item === 'string' && item.startsWith('--reporters'));

  if (!hasReporterOverride) {
    jestArgs.push('--reporters=default', `--reporters=${TIMING_REPORTER}`);
  }

  jestArgs.push(...extraFlags, ...passthrough);

  const exitCode = runJest(jestArgs);
  return exitCode;
}


const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedPath === MODULE_PATH) {
  const code = main();
  process.exit(code);
}
