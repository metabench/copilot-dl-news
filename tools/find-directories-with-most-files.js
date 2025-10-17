#!/usr/bin/env node

/**
 * find-directories-with-most-files.js
 * 
 * Analyzes directory tree and shows directories with the most files.
 * 
 * Usage:
 *   node find-directories-with-most-files.js              # Top 10 directories (excludes node_modules)
 *   node find-directories-with-most-files.js --limit 20   # Top 20 directories
 *   node find-directories-with-most-files.js --unlimited  # All directories
 *   node find-directories-with-most-files.js --all        # All directories (alias)
 *   node find-directories-with-most-files.js --include-node-modules  # Include node_modules
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
let limit = 10;
let excludeNodeModules = true;

if (args.includes('--unlimited') || args.includes('--all')) {
  limit = Infinity;
} else if (args.includes('--limit')) {
  const idx = args.indexOf('--limit');
  if (idx < args.length - 1) {
    const parsed = parseInt(args[idx + 1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = parsed;
    }
  }
}

if (args.includes('--include-node-modules')) {
  excludeNodeModules = false;
}

/**
 * Recursively count files in all directories
 */
function countFilesInDirectories(rootDir) {
  const dirCounts = new Map();

  function traverse(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      let fileCount = 0;

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules if excluded
          if (excludeNodeModules && entry.name === 'node_modules') {
            continue;
          }
          // Recursively traverse subdirectories
          traverse(fullPath);
        } else if (entry.isFile()) {
          fileCount++;
        }
      }

      // Store the file count for this directory
      if (fileCount > 0) {
        const relativePath = path.relative(rootDir, dir);
        dirCounts.set(relativePath, fileCount);
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  traverse(rootDir);
  return dirCounts;
}

/**
 * Format table with right-padded cells
 */
function formatTable(rows, columnWidths) {
  return rows.map((row, idx) => {
    return row
      .map((cell, colIdx) => {
        const width = columnWidths[colIdx];
        if (colIdx === row.length - 1) {
          // Last column, right-align numbers
          return String(cell).padStart(width);
        }
        // Other columns, left-align
        return String(cell).padEnd(width);
      })
      .join(' │ ');
  });
}

// Main execution
const rootDir = process.cwd();
console.log(`\n📁 Directory File Count Analysis\n`);
console.log(`Repository: ${path.basename(rootDir)}`);
console.log(`Root: ${rootDir}`);
if (excludeNodeModules) {
  console.log(`Filter: node_modules excluded (use --include-node-modules to include)\n`);
} else {
  console.log(`Filter: node_modules included\n`);
}

const dirCounts = countFilesInDirectories(rootDir);

// Sort by file count (descending)
const sorted = Array.from(dirCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, limit);

if (sorted.length === 0) {
  console.log('No directories with files found.');
  process.exit(0);
}

// Prepare table data
const rows = [];
rows.push(['Directory', 'File Count']);
rows.push(['-'.repeat(80), '-'.repeat(12)]);

sorted.forEach(([dir, count]) => {
  rows.push([dir || '.', count]);
});

// Calculate column widths
const columnWidths = [82, 12];

// Format and display table
const formattedRows = formatTable(rows, columnWidths);
formattedRows.forEach((row, idx) => {
  if (idx < 2) {
    // Header and separator
    console.log(row);
  } else {
    console.log(row);
  }
});

console.log();
console.log(`Total directories analyzed: ${dirCounts.size}`);
console.log(`Showing: Top ${Math.min(limit, sorted.length)} directories\n`);
