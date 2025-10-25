#!/usr/bin/env node
/**
 * Test Log Migration and Cleanup Tool
 * 
 * Migrates legacy test-timing-*.log files from root to testlogs/ directory,
 * validates existing logs, and safely removes migrated files.
 * 
 * Features:
 * - Only imports from last full test run (ignores old logs)
 * - Validates "ALL" suite claims (checks test count)
 * - Detects duplicate imports (checks existing testlogs)
 * - Dry-run mode by default (requires --execute to delete)
 * 
 * Usage:
 *   node tools/migrate-test-logs.js          # Dry run (show what would happen)
 *   node tools/migrate-test-logs.js --execute # Actually migrate and delete
 *   node tools/migrate-test-logs.js --verbose # Show detailed analysis
 *   node tools/migrate-test-logs.js --audit   # Audit existing testlogs
 */

// Parse command line args
const args = process.argv.slice(2);

// Check for help first
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Test Log Migration and Cleanup Tool

Migrates legacy test-timing-*.log files from root to testlogs/ directory,
validates existing logs, and safely removes migrated files.

USAGE:
  node tools/migrate-test-logs.js [options]

OPTIONS:
  --help, -h       Show this help message
  --execute        Actually perform migration and delete old files (default: dry-run)
  --verbose        Show detailed analysis during migration
  --audit          Audit existing testlogs/ directory without migration

FEATURES:
  - Only imports from last full test run (ignores old logs)
  - Validates "ALL" suite claims (checks test count)
  - Detects duplicate imports (checks existing testlogs)
  - Dry-run mode by default (safe preview)

EXAMPLES:
  node tools/migrate-test-logs.js              # Dry run (show what would happen)
  node tools/migrate-test-logs.js --execute    # Actually migrate and delete
  node tools/migrate-test-logs.js --verbose    # Show detailed analysis
  node tools/migrate-test-logs.js --audit      # Audit existing testlogs/

SAFETY:
  - Dry-run by default - no files deleted without --execute
  - Keeps most recent log until verified in testlogs/
  - Detects duplicates to avoid overwriting good data
`);
  process.exit(0);
}

const dryRun = !args.includes('--execute');
const verbose = args.includes('--verbose');
const auditOnly = args.includes('--audit');

/**
 * Calculate SHA256 hash of a file
 */
function calculateFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Parse test log to extract metadata
 */
function parseTestLog(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Extract timestamp from header
  const headerMatch = lines.find(l => l.includes('Test Timing Report'))?.match(/(\d{4}-\d{2}-\d{2}T[\d:-]+Z)/);
  const timestamp = headerMatch ? headerMatch[1] : null;
  
  // Count test files and tests from the detailed list
  let totalFiles = 0;
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const testFiles = new Set();
  
  for (const line of lines) {
    // Match lines like: "1. 15.61s - tests\e2e-features\geography-crawl\startup-and-telemetry.test.js (1 tests, 0 passed, 1 failed)"
    const match = line.match(/^\d+\.\s+[\d.]+s\s+-\s+(.+?\.test\.js)\s+\((\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed\)/);
    if (match) {
      const [, file, tests, passed, failed] = match;
      testFiles.add(file);
      totalTests += parseInt(tests);
      passedTests += parseInt(passed);
      failedTests += parseInt(failed);
    }
  }
  
  totalFiles = testFiles.size;
  
  // Try to extract suite name from filename patterns
  let suite = 'unknown';
  const fileContent = content.toLowerCase();
  if (fileContent.includes('e2e') && fileContent.includes('http')) {
    suite = 'integration';
  } else if (fileContent.includes('e2e')) {
    suite = 'e2e';
  } else if (fileContent.includes('unit')) {
    suite = 'unit';
  } else if (totalFiles > 100) {
    // If testing lots of files, likely "all"
    suite = 'ALL';
  }
  
  return {
    timestamp,
    suite,
    totalFiles,
    totalTests,
    passedTests,
    failedTests,
    testFiles: Array.from(testFiles),
    size: fs.statSync(filePath).size,
    hash: calculateFileHash(filePath)
  };
}

/**
 * Check if a log file already exists in testlogs with similar content
 */
function findDuplicateInTestlogs(metadata) {
  if (!fs.existsSync(TESTLOGS_DIR)) return null;
  
  const existingLogs = fs.readdirSync(TESTLOGS_DIR)
    .filter(f => f.endsWith('.log'))
    .map(f => path.join(TESTLOGS_DIR, f));
  
  for (const logPath of existingLogs) {
    try {
      const existingMeta = parseTestLog(logPath);
      
      // Consider it a duplicate if:
      // 0. Hash match (exact file content match - most reliable)
      if (metadata.hash && existingMeta.hash && metadata.hash === existingMeta.hash) {
        return {
          path: logPath,
          filename: path.basename(logPath),
          reason: 'Exact file match (SHA256 hash)'
        };
      }
      
      // 1. Timestamps are very close (within 2 minutes)
      // 2. Test counts match closely
      if (metadata.timestamp && existingMeta.timestamp) {
        const timeDiff = Math.abs(new Date(metadata.timestamp) - new Date(existingMeta.timestamp));
        const testCountDiff = Math.abs(metadata.totalTests - existingMeta.totalTests);
        
        if (timeDiff < 120000 && testCountDiff < 5) {
          return {
            path: logPath,
            filename: path.basename(logPath),
            reason: `Similar timestamp (${Math.round(timeDiff/1000)}s apart) and test count`
          };
        }
      }
      
      // Also check if test file lists overlap significantly
      if (metadata.testFiles.length > 0 && existingMeta.testFiles.length > 0) {
        const overlap = metadata.testFiles.filter(f => existingMeta.testFiles.includes(f)).length;
        const overlapPercent = (overlap / Math.min(metadata.testFiles.length, existingMeta.testFiles.length)) * 100;
        
        if (overlapPercent > 90) {
          return {
            path: logPath,
            filename: path.basename(logPath),
            reason: `${Math.round(overlapPercent)}% test file overlap`
          };
        }
      }
    } catch (error) {
      // Skip files that can't be parsed
      if (verbose) {
        console.log(`   ⚠️  Couldn't parse ${path.basename(logPath)}: ${error.message}`);
      }
    }
  }
  
  return null;
}

/**
 * Validate "ALL" suite claims
 */
function validateAllSuiteClaim(metadata) {
  if (metadata.suite !== 'ALL') return { valid: true };
  
  const issues = [];
  
  // Check test count threshold
  if (metadata.totalTests < MIN_TESTS_FOR_ALL_SUITE) {
    issues.push(`Only ${metadata.totalTests} tests (expected ${MIN_TESTS_FOR_ALL_SUITE}+)`);
  }
  
  // Check if actually comprehensive
  if (metadata.totalFiles < 50) {
    issues.push(`Only ${metadata.totalFiles} test files (seems too few for "ALL")`);
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Find the most recent root log file
 */
function findMostRecentRootLog() {
  const rootLogs = fs.readdirSync(ROOT_DIR)
    .filter(f => f.startsWith('test-timing-') && f.endsWith('.log'))
    .map(f => ({
      name: f,
      path: path.join(ROOT_DIR, f),
      mtime: fs.statSync(path.join(ROOT_DIR, f)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return rootLogs.length > 0 ? rootLogs[0] : null;
}

/**
 * Audit existing testlogs directory
 */
function auditTestlogs() {
  console.log('\n📋 TESTLOGS AUDIT\n');
  console.log('═'.repeat(80));
  
  if (!fs.existsSync(TESTLOGS_DIR)) {
    console.log('❌ testlogs/ directory does not exist');
    return;
  }
  
  const logs = fs.readdirSync(TESTLOGS_DIR)
    .filter(f => f.endsWith('.log'))
    .map(f => path.join(TESTLOGS_DIR, f));
  
  console.log(`Found ${logs.length} log files in testlogs/\n`);
  
  const allSuiteLogs = [];
  const issues = [];
  
  for (const logPath of logs) {
    const filename = path.basename(logPath);
    const metadata = parseTestLog(logPath);
    
    console.log(`\n📄 ${filename}`);
    console.log(`   Suite: ${metadata.suite}`);
    console.log(`   Tests: ${metadata.totalTests} (${metadata.passedTests} passed, ${metadata.failedTests} failed)`);
    console.log(`   Files: ${metadata.totalFiles} test files`);
    console.log(`   Size: ${(metadata.size / 1024).toFixed(1)} KB`);
    
    if (metadata.suite === 'ALL') {
      allSuiteLogs.push({ filename, metadata });
      const validation = validateAllSuiteClaim(metadata);
      if (!validation.valid) {
        console.log(`   ⚠️  Issues with "ALL" claim:`);
        validation.issues.forEach(issue => console.log(`      - ${issue}`));
        issues.push({ filename, issues: validation.issues });
      } else {
        console.log(`   ✅ Valid "ALL" suite`);
      }
    }
    
    if (verbose && metadata.totalFiles < 20) {
      console.log(`   Test files:`);
      metadata.testFiles.slice(0, 10).forEach(f => console.log(`      - ${f}`));
      if (metadata.testFiles.length > 10) {
        console.log(`      ... and ${metadata.testFiles.length - 10} more`);
      }
    }
  }
  
  if (issues.length > 0) {
    console.log('\n\n⚠️  VALIDATION ISSUES FOUND:\n');
    issues.forEach(({ filename, issues }) => {
      console.log(`${filename}:`);
      issues.forEach(issue => console.log(`  - ${issue}`));
    });
  }
  
  console.log('\n' + '═'.repeat(80));
}

/**
 * Main migration logic
 */
function migrateTestLogs() {
  console.log('\n🔄 TEST LOG MIGRATION TOOL\n');
  console.log('═'.repeat(80));
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be deleted\n');
    console.log('   Use --execute to actually migrate and delete files\n');
  } else {
    console.log('⚠️  EXECUTE MODE - Files will be deleted after migration\n');
  }
  
  // Find most recent root log
  const mostRecent = findMostRecentRootLog();
  
  if (!mostRecent) {
    console.log('✅ No test-timing-*.log files found in root directory');
    return;
  }
  
  console.log(`📊 Most recent log: ${mostRecent.name}`);
  console.log(`   Last modified: ${mostRecent.mtime.toISOString()}\n`);
  
  // Parse the most recent log
  const metadata = parseTestLog(mostRecent.path);
  
  console.log('📈 Log Analysis:');
  console.log(`   Suite: ${metadata.suite}`);
  console.log(`   Tests: ${metadata.totalTests} (${metadata.passedTests} passed, ${metadata.failedTests} failed)`);
  console.log(`   Files: ${metadata.totalFiles} test files`);
  console.log(`   Size: ${(metadata.size / 1024).toFixed(1)} KB\n`);
  
  // Validate "ALL" claim if applicable
  if (metadata.suite === 'ALL') {
    const validation = validateAllSuiteClaim(metadata);
    if (!validation.valid) {
      console.log('⚠️  Warning: "ALL" suite validation issues:');
      validation.issues.forEach(issue => console.log(`   - ${issue}`));
      console.log('');
    } else {
      console.log('✅ Valid "ALL" suite claim\n');
    }
  }
  
  // Check for duplicates in testlogs
  const duplicate = findDuplicateInTestlogs(metadata);
  
  if (duplicate) {
    console.log('⚠️  Possible duplicate found in testlogs:');
    console.log(`   ${duplicate.filename}`);
    console.log(`   Reason: ${duplicate.reason}\n`);
    console.log('❌ Skipping import to avoid duplication\n');
  } else {
    console.log('✅ No duplicates found in testlogs/\n');
    
    // Generate target filename
    const targetName = metadata.timestamp 
      ? `${metadata.timestamp}_${metadata.suite}.log`
      : `imported_${Date.now()}_${metadata.suite}.log`;
    const targetPath = path.join(TESTLOGS_DIR, targetName);
    
    console.log(`📋 Would copy to: testlogs/${targetName}\n`);
    
    if (!dryRun) {
      // Ensure testlogs directory exists
      if (!fs.existsSync(TESTLOGS_DIR)) {
        fs.mkdirSync(TESTLOGS_DIR, { recursive: true });
      }
      
      // Copy the file
      fs.copyFileSync(mostRecent.path, targetPath);
      console.log(`✅ Copied to testlogs/${targetName}\n`);
    }
  }
  
  // Count all old logs
  const allRootLogs = fs.readdirSync(ROOT_DIR)
    .filter(f => f.startsWith('test-timing-') && f.endsWith('.log'));
  
  console.log(`🗑️  Cleanup Analysis:`);
  console.log(`   Total root logs: ${allRootLogs.length}`);
  
  if (duplicate) {
    console.log(`   Would delete: ${allRootLogs.length} (duplicate found, safe to clean all)`);
  } else {
    console.log(`   Would delete: ${allRootLogs.length - 1} (keeping most recent until verified)`);
  }
  
  if (!dryRun) {
    const logsToDelete = duplicate 
      ? allRootLogs 
      : allRootLogs.filter(f => f !== mostRecent.name);
    
    console.log(`\n🗑️  Deleting ${logsToDelete.length} old log files...\n`);
    
    let deleted = 0;
    for (const logFile of logsToDelete) {
      const logPath = path.join(ROOT_DIR, logFile);
      try {
        fs.unlinkSync(logPath);
        deleted++;
        if (verbose) {
          console.log(`   Deleted: ${logFile}`);
        }
      } catch (error) {
        console.error(`   ❌ Failed to delete ${logFile}: ${error.message}`);
      }
    }
    
    console.log(`\n✅ Deleted ${deleted} old log files`);
    
    if (!duplicate && mostRecent) {
      console.log(`\n📌 Kept most recent: ${mostRecent.name}`);
      console.log(`   Delete this manually after verifying testlogs/ import`);
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  
  if (dryRun) {
    console.log('\n💡 Run with --execute to actually perform migration and cleanup');
    console.log('💡 Run with --verbose to see detailed analysis');
    console.log('💡 Run with --audit to review existing testlogs/');
  }
}

// Main execution
if (auditOnly) {
  auditTestlogs();
} else {
  migrateTestLogs();
}
