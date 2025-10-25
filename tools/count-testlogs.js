#!/usr/bin/env node
/**
 * count-testlogs.js - Count files in the testlogs directory
 * 
 * Usage:
 *   node tools/count-testlogs.js              # Show total count
 *   node tools/count-testlogs.js --breakdown  # Show breakdown by suite
 *   node tools/count-testlogs.js --verbose    # Show file details
 */

// Check for help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Test Logs Counter

Counts and analyzes files in the testlogs directory.

USAGE:
  node tools/count-testlogs.js [options]

OPTIONS:
  --help, -h       Show this help message
  --breakdown      Show breakdown by test suite (unit, e2e, integration, etc.)
  --verbose        Show detailed file information with sizes

EXAMPLES:
  node tools/count-testlogs.js                    # Show total count
  node tools/count-testlogs.js --breakdown        # Show suite breakdown
  node tools/count-testlogs.js --verbose          # Show file details and sizes

OUTPUT:
  Without options: Just the total number of log files
  --breakdown: Counts per test suite
  --verbose: File list with sizes, sorted by modification time
`);
  process.exit(0);
}
const path = require('path');

const testlogsDir = path.join(__dirname, '..', 'testlogs');

// Check if testlogs directory exists
if (!fs.existsSync(testlogsDir)) {
  console.error(`❌ testlogs directory not found at ${testlogsDir}`);
  process.exit(1);
}

// Read all files in testlogs directory
const files = fs.readdirSync(testlogsDir);

// Filter for actual files (exclude directories)
const logFiles = files.filter(file => {
  const fullPath = path.join(testlogsDir, file);
  return fs.statSync(fullPath).isFile();
});

const showBreakdown = process.argv.includes('--breakdown');
const showVerbose = process.argv.includes('--verbose');

if (showBreakdown) {
  // Group by suite
  const byType = {};
  logFiles.forEach(file => {
    // Extract suite from filename (e.g., 2025-10-10T19-30-20-013Z_unit.log → unit, or _ALL.log → ALL)
    const match = file.match(/_([a-zA-Z-]+)\./);
    const suite = match ? match[1] : 'unknown';
    
    if (!byType[suite]) {
      byType[suite] = [];
    }
    byType[suite].push(file);
  });

  console.log(`\nTest Log Breakdown:\n`);
  Object.entries(byType)
    .sort()
    .forEach(([suite, files]) => {
      console.log(`  ${suite}: ${files.length} file${files.length !== 1 ? 's' : ''}`);
    });
  
  console.log(`\nTotal: ${logFiles.length} file${logFiles.length !== 1 ? 's' : ''}\n`);
} else if (showVerbose) {
  // Show file details with sizes
  console.log(`\nTest Log Files:\n`);
  let totalSize = 0;
  
  logFiles
    .map(file => {
      const fullPath = path.join(testlogsDir, file);
      const stats = fs.statSync(fullPath);
      return { file, size: stats.size, mtime: stats.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)  // Sort by most recent first
    .forEach(({ file, size }) => {
      const sizeKB = (size / 1024).toFixed(1);
      console.log(`  ${file.padEnd(50)} ${sizeKB.padStart(8)} KB`);
      totalSize += size;
    });
  
  const totalMB = (totalSize / 1024 / 1024).toFixed(2);
  console.log(`\nTotal: ${logFiles.length} file${logFiles.length !== 1 ? 's' : ''} (${totalMB} MB)\n`);
} else {
  // Simple count
  console.log(`${logFiles.length}`);
}

process.exit(0);
