#!/usr/bin/env node
'use strict';

/**
 * Query Test Failures - Extract detailed failure information from test logs
 * 
 * Usage:
 *   node tests/query-test-failures.js [--suite=unit] [--test-name=pattern]
 * 
 * Outputs:
 *   - Test file paths that failed
 *   - Specific error messages with line numbers
 *   - Failure type (expect, error, timeout)
 *   - Quick summary for creating focused test runs
 */

const fs = require('fs');
const path = require('path');

const TESTLOGS_DIR = path.join(__dirname, '..', 'testlogs');

function parseArgs() {
  const args = {
    suite: 'unit',
    testName: null,
    format: 'summary' // 'summary', 'detailed', 'json', 'files-only'
  };
  
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--suite=')) {
      args.suite = arg.split('=')[1];
    } else if (arg.startsWith('--test-name=')) {
      args.testName = arg.split('=')[1];
    } else if (arg.startsWith('--format=')) {
      args.format = arg.split('=')[1];
    }
  }
  
  return args;
}

function findLatestLog(suite) {
  if (!fs.existsSync(TESTLOGS_DIR)) {
    return null;
  }
  
  const files = fs.readdirSync(TESTLOGS_DIR)
    .filter(f => f.endsWith('.log') && f.includes(`_${suite}`))
    .map(f => ({
      name: f,
      path: path.join(TESTLOGS_DIR, f),
      mtime: fs.statSync(path.join(TESTLOGS_DIR, f)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return files.length > 0 ? files[0].path : null;
}

function extractFailures(logContent) {
  const failures = [];
  const lines = logContent.split('\n');
  
  let currentTest = null;
  let currentError = [];
  let inFailure = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match FAIL header
    const failMatch = line.match(/^\s*FAIL\s+(.+\.test\.js)\s*(\([\d.]+\s*s\))?/);
    if (failMatch) {
      currentTest = {
        file: failMatch[1].replace(/\\/g, '/'),
        errors: []
      };
      inFailure = false;
      continue;
    }
    
    // Match test name (● symbol)
    const testNameMatch = line.match(/^\s*●\s+(.+)/);
    if (testNameMatch && currentTest) {
      if (currentError.length > 0 && inFailure) {
        currentTest.errors.push({
          name: currentError[0],
          details: currentError.slice(1).join('\n').trim()
        });
      }
      currentError = [testNameMatch[1].trim()];
      inFailure = true;
      continue;
    }
    
    // Collect error details
    if (inFailure && currentTest) {
      // Look for expect() errors with line numbers
      const expectMatch = line.match(/at\s+(?:Object\.|)(\w+)\s+\((.+):(\d+):(\d+)\)/);
      if (expectMatch) {
        const [, method, file, lineNum, col] = expectMatch;
        currentError.push(`  at ${method} (${file}:${lineNum}:${col})`);
      } else if (line.trim().length > 0 && !line.match(/^Summary of all|^Test Suites:/)) {
        currentError.push(line);
      }
      
      // End of this test's error if we hit blank line or next test
      if (line.trim() === '' && currentError.length > 1) {
        currentTest.errors.push({
          name: currentError[0],
          details: currentError.slice(1).join('\n').trim()
        });
        currentError = [];
        inFailure = false;
      }
    }
    
    // Save current test when we move to next or end
    if (currentTest && (failMatch || i === lines.length - 1)) {
      if (currentError.length > 0 && inFailure) {
        currentTest.errors.push({
          name: currentError[0],
          details: currentError.slice(1).join('\n').trim()
        });
      }
      if (currentTest.errors.length > 0) {
        failures.push(currentTest);
      }
      currentTest = null;
      currentError = [];
      inFailure = false;
    }
  }
  
  return failures;
}

function extractLineNumbers(errorDetails) {
  const lineNums = [];
  const matches = errorDetails.matchAll(/at\s+.+\((.+):(\d+):(\d+)\)/g);
  for (const match of matches) {
    lineNums.push({
      file: match[1],
      line: parseInt(match[2], 10),
      col: parseInt(match[3], 10)
    });
  }
  return lineNums;
}

function categorizeFailure(errorDetails) {
  if (errorDetails.includes('expect(received)')) return 'assertion';
  if (errorDetails.includes('SqliteError:')) return 'database';
  if (errorDetails.includes('TypeError:') || errorDetails.includes('ReferenceError:')) return 'runtime-error';
  if (errorDetails.includes('Exceeded timeout')) return 'timeout';
  if (errorDetails.includes('not a constructor')) return 'import-error';
  if (errorDetails.includes('no such table') || errorDetails.includes('no such column')) return 'schema';
  return 'other';
}

function formatSummary(failures, testNameFilter) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`TEST FAILURES SUMMARY - ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  let totalFailures = 0;
  const byCategory = {};
  const failedFiles = [];
  
  for (const test of failures) {
    let testMatches = true;
    if (testNameFilter) {
      testMatches = test.errors.some(e => 
        e.name.toLowerCase().includes(testNameFilter.toLowerCase())
      );
    }
    
    if (!testMatches) continue;
    
    failedFiles.push(test.file);
    console.log(`\n📋 ${test.file}`);
    console.log('─'.repeat(60));
    
    for (const error of test.errors) {
      totalFailures++;
      const category = categorizeFailure(error.details);
      byCategory[category] = (byCategory[category] || 0) + 1;
      
      console.log(`\n  ❌ ${error.name}`);
      
      const lines = extractLineNumbers(error.details);
      if (lines.length > 0) {
        console.log(`     Line: ${lines[0].line} (${test.file})`);
      }
      
      console.log(`     Type: ${category}`);
      
      // Extract key error message
      const errorLines = error.details.split('\n');
      const keyError = errorLines.find(l => 
        l.includes('Error:') || 
        l.includes('Expected:') || 
        l.includes('Received:') ||
        l.includes('no such')
      );
      if (keyError) {
        console.log(`     Error: ${keyError.trim().substring(0, 80)}`);
      }
    }
  }
  
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('SUMMARY STATISTICS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Failures: ${totalFailures}`);
  console.log(`Failed Test Files: ${failedFiles.length}`);
  console.log('\nFailures by Category:');
  for (const [category, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${category}: ${count}`);
  }
  
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('FOCUSED TEST COMMAND');
  console.log('═══════════════════════════════════════════════════════════');
  
  if (failedFiles.length > 0) {
    console.log('\nRun only failed tests:');
    console.log(`node tests/run-tests.js unit --files="${failedFiles.join(',')}"`);
    
    console.log('\nOr use npm run test:file pattern:');
    const uniquePaths = [...new Set(failedFiles.map(f => {
      const parts = f.split('/');
      return parts[parts.length - 1].replace('.test.js', '');
    }))];
    
    if (uniquePaths.length <= 5) {
      for (const pattern of uniquePaths) {
        console.log(`npm run test:file "${pattern}"`);
      }
    } else {
      console.log(`# ${uniquePaths.length} test files - run individually or in batches`);
    }
  }
}

function formatFilesOnly(failures) {
  const files = failures.map(f => f.file);
  console.log(files.join(','));
}

function formatDetailed(failures, testNameFilter) {
  for (const test of failures) {
    let testMatches = true;
    if (testNameFilter) {
      testMatches = test.errors.some(e => 
        e.name.toLowerCase().includes(testNameFilter.toLowerCase())
      );
    }
    
    if (!testMatches) continue;
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`FILE: ${test.file}`);
    console.log('═'.repeat(70));
    
    for (const error of test.errors) {
      console.log(`\nTEST: ${error.name}`);
      console.log('─'.repeat(70));
      console.log(error.details);
      console.log('');
    }
  }
}

function formatJson(failures) {
  console.log(JSON.stringify(failures, null, 2));
}

function main() {
  const args = parseArgs();
  
  const logFile = findLatestLog(args.suite);
  if (!logFile) {
    console.error(`No log file found for suite: ${args.suite}`);
    console.error(`Looking in: ${TESTLOGS_DIR}`);
    process.exit(1);
  }
  
  const logContent = fs.readFileSync(logFile, 'utf-8');
  const failures = extractFailures(logContent);
  
  if (failures.length === 0) {
    console.log('✅ No test failures found!');
    process.exit(0);
  }
  
  switch (args.format) {
    case 'summary':
      formatSummary(failures, args.testName);
      break;
    case 'detailed':
      formatDetailed(failures, args.testName);
      break;
    case 'json':
      formatJson(failures);
      break;
    case 'files-only':
      formatFilesOnly(failures);
      break;
    default:
      console.error(`Unknown format: ${args.format}`);
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { extractFailures, categorizeFailure, extractLineNumbers };
