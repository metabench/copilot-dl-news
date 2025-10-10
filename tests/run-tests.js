#!/usr/bin/env node
/**
 * Test Runner - Autonomous Test Execution
 * 
 * This script reads test configuration from test-config.json and executes tests
 * WITHOUT requiring PowerShell confirmation dialogs. AI agents can modify the
 * config file to adjust test parameters autonomously.
 * 
 * Usage:
 *   node tests/run-tests.js <suite-name>
 *   node tests/run-tests.js unit
 *   node tests/run-tests.js e2e
 *   node tests/run-tests.js dev-geography
 *   node tests/run-tests.js unit --files="file1.test.js,file2.test.js"
 *   node tests/run-tests.js unit --files="$(node tests/query-test-failures.js --format=files-only)"
 * 
 * Available suites: unit, integration, e2e, e2e-quick, all, dev-geography, dev-geography-monitor
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Read configuration
const configPath = path.join(__dirname, 'test-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Parse command line arguments
function parseArgs() {
  const args = {
    suite: process.argv[2],
    files: null
  };
  
  for (let i = 3; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--files=')) {
      args.files = arg.substring(8).split(',').map(f => f.trim()).filter(f => f);
    }
  }
  
  return args;
}

const cmdArgs = parseArgs();
const suiteName = cmdArgs.suite;

if (!suiteName) {
  console.error('Error: Please specify a test suite name');
  console.error('');
  console.error('Available suites:');
  Object.keys(config.testSuites).forEach(name => {
    const suite = config.testSuites[name];
    console.error(`  ${name.padEnd(20)} - ${suite.description}`);
  });
  console.error('');
  console.error('Usage: node tests/run-tests.js <suite-name>');
  process.exit(1);
}

const suite = config.testSuites[suiteName];

if (!suite) {
  console.error(`Error: Unknown test suite "${suiteName}"`);
  console.error('');
  console.error('Available suites:', Object.keys(config.testSuites).join(', '));
  process.exit(1);
}

console.log(`Running test suite: ${suiteName}`);
console.log(`Description: ${suite.description}`);
if (suite.note) {
  console.log(`Note: ${suite.note}`);
}
console.log('');

// Build Jest command arguments
const jestPath = path.join(__dirname, '..', 'node_modules', 'jest', 'bin', 'jest.js');
const args = [
  '--experimental-vm-modules',
  jestPath
];

// If specific files are provided, use them instead of test path pattern
if (cmdArgs.files && cmdArgs.files.length > 0) {
  console.log(`Running ${cmdArgs.files.length} specific test file(s):`);
  cmdArgs.files.forEach(f => console.log(`  - ${f}`));
  console.log('');
  
  // Add each file as a positional argument
  args.push(...cmdArgs.files);
} else {
  // Add test path pattern
  if (suite.testPathPattern) {
    args.push('--testPathPattern', suite.testPathPattern);
  }
}

// Add test path ignore patterns (always apply)
if (suite.testPathIgnorePatterns && suite.testPathIgnorePatterns.length > 0) {
  args.push('--testPathIgnorePatterns', suite.testPathIgnorePatterns.join('|'));
}

// Add timeout
if (suite.timeout) {
  args.push('--testTimeout', suite.timeout.toString());
}

// Add max workers
if (suite.maxWorkers) {
  args.push('--maxWorkers', suite.maxWorkers.toString());
}

// Add force exit
if (suite.forceExit) {
  args.push('--forceExit');
}

// Add detect open handles
if (suite.detectOpenHandles) {
  args.push('--detectOpenHandles');
}

// Add reporters
args.push('--reporters=default');
args.push('--reporters=./jest-timing-reporter.js');

console.log('Jest command:', 'node', args.join(' '));
console.log('');

// Set environment variables from config
const env = { ...process.env };

// Add suite name to environment for reporter
env.TEST_SUITE_NAME = suiteName;

if (suite.environment) {
  Object.assign(env, suite.environment);
  console.log('Environment variables:', suite.environment);
  console.log('');
}

// Spawn Jest process
const jest = spawn('node', args, {
  cwd: path.join(__dirname, '..'),
  env,
  stdio: 'inherit'
});

jest.on('exit', (code) => {
  process.exit(code);
});
