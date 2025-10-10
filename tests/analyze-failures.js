#!/usr/bin/env node
'use strict';

/**
 * Analyze test failures from recent logs and provide detailed diagnostics.
 * 
 * Usage:
 *   node tests/analyze-failures.js                    # Analyze latest log
 *   node tests/analyze-failures.js --all              # Analyze all recent logs
 *   node tests/analyze-failures.js --test "pattern"   # Filter by test pattern
 *   node tests/analyze-failures.js --json             # Output JSON
 *   node tests/analyze-failures.js --suite unit       # Analyze specific suite
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'testlogs');

function parseLogFile(logPath) {
  const content = fs.readFileSync(logPath, 'utf8');
  const filename = path.basename(logPath);
  
  // Extract timestamp and suite from filename: 2025-10-10T20-23-49-218Z_unit.log
  const match = filename.match(/^(\d{4}-\d{2}-\d{2}T[\d-]+Z)_(.+)\.log$/);
  const timestamp = match ? match[1] : 'unknown';
  const suite = match ? match[2] : 'unknown';
  
  const failures = [];
  let currentTest = null;
  let errorBlock = [];
  let inErrorBlock = false;
  
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect FAIL marker: " FAIL  src/path/to/test.js (10.5 s)"
    if (line.match(/^\s*FAIL\s+(.+?)\s+\([\d.]+\s*s\)/)) {
      const filePath = line.match(/FAIL\s+(.+?)\s+\(/)[1].trim();
      if (!failures.find(f => f.file === filePath)) {
        failures.push({
          file: filePath,
          tests: [],
          rawFile: filePath
        });
      }
    }
    
    // Detect test name: "  ● Test Suite › Test Name"
    if (line.match(/^\s*●\s+(.+?)(?:\s+›\s+(.+))?$/)) {
      const parts = line.replace(/^\s*●\s+/, '').split(' › ');
      currentTest = {
        suite: parts[0],
        name: parts.length > 1 ? parts.slice(1).join(' › ') : null,
        fullName: line.replace(/^\s*●\s+/, ''),
        error: null,
        lineNumber: null,
        errorType: null,
        errorMessage: null,
        codeSnippet: null
      };
      errorBlock = [];
      inErrorBlock = false;
    }
    
    // Detect error message (next line after ●)
    if (currentTest && !currentTest.errorMessage && line.match(/^\s{4}[A-Z][a-zA-Z]+Error:|^\s{4}Error:/)) {
      currentTest.errorType = line.trim().split(':')[0];
      currentTest.errorMessage = line.trim();
      inErrorBlock = true;
    }
    
    // Detect expect() failure messages
    if (currentTest && !currentTest.errorMessage && line.match(/^\s{4}expect\(/)) {
      currentTest.errorType = 'AssertionError';
      currentTest.errorMessage = line.trim();
      inErrorBlock = true;
    }
    
    // Collect error block lines
    if (inErrorBlock && line.match(/^\s{4,}/)) {
      errorBlock.push(line);
      
      // Extract line number from stack trace: "at Object.<anonymous> (src/test.js:123:45)"
      const lineMatch = line.match(/at .+? \((.+?):(\d+):\d+\)/);
      if (lineMatch && !currentTest.lineNumber) {
        currentTest.lineNumber = parseInt(lineMatch[2], 10);
        currentTest.codeSnippet = extractCodeSnippet(lineMatch[1], currentTest.lineNumber);
      }
    }
    
    // End of error block (empty line or new section)
    if (inErrorBlock && (line.trim() === '' || line.match(/^\s*●|^\s*FAIL|^\s*PASS/))) {
      if (currentTest) {
        currentTest.error = errorBlock.join('\n');
        
        // Find the test file and add this test to it
        const testFile = failures.find(f => currentTest.error.includes(f.file));
        if (testFile) {
          testFile.tests.push(currentTest);
        } else if (failures.length > 0) {
          // Add to most recent FAIL file
          failures[failures.length - 1].tests.push(currentTest);
        }
        
        currentTest = null;
        errorBlock = [];
        inErrorBlock = false;
      }
    }
  }
  
  return {
    timestamp,
    suite,
    logPath,
    failures: failures.filter(f => f.tests.length > 0),
    totalFailures: failures.reduce((sum, f) => sum + f.tests.length, 0)
  };
}

function extractCodeSnippet(filePath, lineNumber) {
  try {
    const fullPath = path.join(__dirname, '..', filePath);
    if (!fs.existsSync(fullPath)) return null;
    
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    const start = Math.max(0, lineNumber - 3);
    const end = Math.min(lines.length, lineNumber + 2);
    
    return lines.slice(start, end).map((line, idx) => {
      const num = start + idx + 1;
      const marker = num === lineNumber ? '>' : ' ';
      return `${marker} ${num.toString().padStart(4)} | ${line}`;
    }).join('\n');
  } catch (err) {
    return null;
  }
}

function getRecentLogs(suiteFilter = null) {
  if (!fs.existsSync(LOG_DIR)) {
    return [];
  }
  
  return fs.readdirSync(LOG_DIR)
    .filter(f => f.endsWith('.log'))
    .filter(f => !suiteFilter || f.includes(`_${suiteFilter}.log`))
    .map(f => path.join(LOG_DIR, f))
    .sort()
    .reverse();
}

function analyzeFailures(options = {}) {
  const {
    all = false,
    testPattern = null,
    json = false,
    suite = null
  } = options;
  
  const logs = getRecentLogs(suite);
  
  if (logs.length === 0) {
    console.log('No test logs found in testlogs/');
    return { results: [], summary: { totalLogs: 0, totalFailures: 0, uniqueFiles: 0 } };
  }
  
  const logsToAnalyze = all ? logs.slice(0, 10) : [logs[0]];
  const results = logsToAnalyze.map(parseLogFile);
  
  // Filter by test pattern if provided
  if (testPattern) {
    results.forEach(result => {
      result.failures = result.failures.filter(f => 
        f.file.includes(testPattern) || 
        f.tests.some(t => t.fullName.includes(testPattern))
      );
      result.totalFailures = result.failures.reduce((sum, f) => sum + f.tests.length, 0);
    });
  }
  
  const summary = {
    totalLogs: results.length,
    totalFailures: results.reduce((sum, r) => sum + r.totalFailures, 0),
    uniqueFiles: new Set(results.flatMap(r => r.failures.map(f => f.file))).size,
    latestRun: results[0]
  };
  
  if (json) {
    console.log(JSON.stringify({ results, summary }, null, 2));
    return { results, summary };
  }
  
  // Human-readable output
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 TEST FAILURE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`Analyzed: ${summary.totalLogs} log file(s)`);
  console.log(`Total failures: ${summary.totalFailures}`);
  console.log(`Unique test files: ${summary.uniqueFiles}\n`);
  
  results.forEach((result, idx) => {
    if (result.totalFailures === 0) return;
    
    console.log(`\n${'─'.repeat(63)}`);
    console.log(`📅 ${result.timestamp} | Suite: ${result.suite}`);
    console.log(`   ${result.totalFailures} failure(s) in ${result.failures.length} file(s)`);
    console.log(`${'─'.repeat(63)}\n`);
    
    result.failures.forEach(fileFailure => {
      console.log(`❌ ${fileFailure.file}`);
      console.log(`   ${fileFailure.tests.length} test(s) failing\n`);
      
      fileFailure.tests.forEach((test, testIdx) => {
        console.log(`   ${testIdx + 1}. ${test.fullName}`);
        
        if (test.errorType) {
          console.log(`      Error: ${test.errorType}`);
        }
        
        if (test.errorMessage) {
          const shortMsg = test.errorMessage.length > 100 
            ? test.errorMessage.substring(0, 100) + '...' 
            : test.errorMessage;
          console.log(`      ${shortMsg}`);
        }
        
        if (test.lineNumber) {
          console.log(`      Line: ${test.lineNumber}`);
        }
        
        if (test.codeSnippet && !testPattern) {
          console.log(`\n${test.codeSnippet}\n`);
        }
        
        console.log('');
      });
    });
  });
  
  return { results, summary };
}

function generateFailedTestsList(options = {}) {
  const { results } = analyzeFailures({ ...options, json: true });
  
  if (results.length === 0 || results[0].totalFailures === 0) {
    console.log('No failures found.');
    return [];
  }
  
  const latest = results[0];
  const failedFiles = latest.failures.map(f => f.file);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📝 FAILED TEST FILES (for targeted rerun)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  failedFiles.forEach((file, idx) => {
    console.log(`${idx + 1}. ${file}`);
  });
  
  console.log(`\n✅ Found ${failedFiles.length} failed test file(s)`);
  console.log('\nTo rerun failed tests only:');
  console.log(`  node tests/run-failed-tests.js\n`);
  
  // Write to a file for other scripts to use
  const failedTestsPath = path.join(__dirname, 'failed-tests.json');
  fs.writeFileSync(failedTestsPath, JSON.stringify({
    timestamp: latest.timestamp,
    suite: latest.suite,
    files: failedFiles,
    count: failedFiles.length
  }, null, 2));
  
  console.log(`📄 Failed tests list saved to: tests/failed-tests.json\n`);
  
  return failedFiles;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    all: args.includes('--all'),
    json: args.includes('--json'),
    list: args.includes('--list'),
    testPattern: null,
    suite: null
  };
  
  const testIdx = args.indexOf('--test');
  if (testIdx !== -1 && args[testIdx + 1]) {
    options.testPattern = args[testIdx + 1];
  }
  
  const suiteIdx = args.indexOf('--suite');
  if (suiteIdx !== -1 && args[suiteIdx + 1]) {
    options.suite = args[suiteIdx + 1];
  }
  
  if (options.list) {
    generateFailedTestsList(options);
  } else {
    analyzeFailures(options);
  }
}

module.exports = { analyzeFailures, generateFailedTestsList, parseLogFile };
