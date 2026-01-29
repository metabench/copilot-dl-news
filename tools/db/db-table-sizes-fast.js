const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Fast table size analysis using the native sqlite3 command-line tool.
 * This is MUCH faster than using better-sqlite3 for large databases.
 * 
 * The sqlite3 CLI is written in C and optimized for performance.
 * It can analyze multi-GB databases in seconds rather than minutes.
 */

const colors = {
  green: '\x1b[92m',
  blue: '\x1b[94m',
  cyan: '\x1b[96m',
  yellow: '\x1b[93m',
  reset: '\x1b[0m'
};

function getDbPath() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'news.db');
  console.log(`Analyzing database at: ${dbPath}\n`);
  return dbPath;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function checkSqlite3Available() {
  try {
    execSync('sqlite3 -version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

function analyzeWithSqlite3() {
  const dbPath = getDbPath();
  
  if (!fs.existsSync(dbPath)) {
    console.error(`${colors.yellow}❌ Database file not found: ${dbPath}${colors.reset}`);
    process.exit(1);
  }

  if (!checkSqlite3Available()) {
    console.error(`${colors.yellow}❌ sqlite3 command-line tool not found in PATH${colors.reset}`);
    console.error('\nPlease install SQLite:');
    console.error('  • Windows: Download from https://www.sqlite.org/download.html');
    console.error('  • Or use: winget install SQLite.SQLite');
    console.error('  • Or use: choco install sqlite');
    process.exit(1);
  }

  console.log('Using native sqlite3 CLI for fast analysis...\n');

  // Get page size
  console.log('RUNNING: PRAGMA page_size');
  const start1 = Date.now();
  const pageSizeOutput = execSync(`sqlite3 "${dbPath}" "PRAGMA page_size;"`, { 
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const pageSize = parseInt(pageSizeOutput.trim());
  console.log(`${colors.green}COMPLETED in ${Date.now() - start1}ms${colors.reset}`);
  console.log(`Page size: ${pageSize} bytes\n`);

  // Query table sizes - this is the fast C implementation
  console.log('RUNNING: SELECT name, COUNT(*), SUM(pgsize) FROM dbstat GROUP BY name');
  const start2 = Date.now();
  
  const query = `
    SELECT 
      name,
      COUNT(*) as page_count,
      SUM(pgsize) as size_bytes
    FROM dbstat
    WHERE name NOT LIKE 'sqlite_%'
    GROUP BY name
    ORDER BY size_bytes DESC;
  `;
  
  try {
    const output = execSync(`sqlite3 -csv "${dbPath}" "${query.replace(/\n/g, ' ')}"`, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large output
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    console.log(`${colors.green}COMPLETED in ${Date.now() - start2}ms${colors.reset}\n`);

    // Parse CSV output
    const lines = output.trim().split('\n');
    const tableStats = lines.map(line => {
      const [name, page_count, size_bytes] = line.split(',');
      return {
        name,
        page_count: parseInt(page_count),
        size_bytes: parseInt(size_bytes)
      };
    });

    if (!tableStats.length) {
      console.log('❌ No tables found.');
      return;
    }

    console.log(`✓ Found ${tableStats.length} tables\n`);

    const totalSize = tableStats.reduce((acc, row) => acc + row.size_bytes, 0);

    // Format for display
    const headers = ['Table Name', 'Pages', 'Size', '%'];
    const rows = tableStats.map(row => ({
      'Table Name': row.name,
      'Pages': row.page_count.toLocaleString(),
      'Size': formatBytes(row.size_bytes),
      '%': totalSize > 0 ? ((row.size_bytes / totalSize) * 100).toFixed(1) + '%' : '0.0%',
    }));

    // Calculate column widths
    const widths = {};
    headers.forEach(h => {
      widths[h] = Math.max(h.length, ...rows.map(d => String(d[h]).length));
    });

    // Print header
    const headerLine = headers.map(h => h.padEnd(widths[h])).join(' | ');
    const separatorLine = headers.map(h => '-'.repeat(widths[h])).join('-|-');
    console.log(headerLine);
    console.log(separatorLine);

    // Print rows
    rows.forEach(d => {
      const rowLine = headers.map(h => String(d[h]).padEnd(widths[h])).join(' | ');
      console.log(rowLine);
    });

    console.log(`\n${colors.cyan}Total Database Size: ${formatBytes(totalSize)}${colors.reset}`);
    console.log(`\n${colors.green}✓ Analysis complete!${colors.reset}`);

  } catch (error) {
    console.error(`\n${colors.yellow}❌ Error running query: ${error.message}${colors.reset}`);
    console.error('\nThis query scans the entire database and may be slow for very large databases.');
    console.error('The native sqlite3 tool is still faster than Node.js implementations.');
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    analyzeWithSqlite3();
  } catch (error) {
    console.error(`\n${colors.yellow}❌ Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

module.exports = { analyzeWithSqlite3 };
