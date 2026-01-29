const fs = require('fs');
const path = require('path');

/**
 * Fast database size analysis using file system stats.
 * For detailed per-table breakdown, we still need to scan dbstat,
 * but we can provide instant overall size information.
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
  return dbPath;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function quickAnalysis() {
  const dbPath = getDbPath();
  
  console.log(`${colors.cyan}Quick Database Size Analysis${colors.reset}`);
  console.log(`Database: ${dbPath}\n`);

  if (!fs.existsSync(dbPath)) {
    console.error(`${colors.yellow}❌ Database file not found${colors.reset}`);
    process.exit(1);
  }

  // File system stats (instant)
  const start = Date.now();
  const stats = fs.statSync(dbPath);
  console.log(`${colors.green}✓ File size check: ${Date.now() - start}ms${colors.reset}`);
  
  const totalSize = stats.size;
  console.log(`\n${colors.cyan}Total Database File Size: ${formatBytes(totalSize)}${colors.reset}`);

  // Check for WAL and SHM files
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';
  
  let walSize = 0;
  let shmSize = 0;

  if (fs.existsSync(walPath)) {
    walSize = fs.statSync(walPath).size;
    console.log(`${colors.blue}WAL File: ${formatBytes(walSize)}${colors.reset}`);
  }

  if (fs.existsSync(shmPath)) {
    shmSize = fs.statSync(shmPath).size;
    console.log(`${colors.blue}SHM File: ${formatBytes(shmSize)}${colors.reset}`);
  }

  const totalWithWal = totalSize + walSize + shmSize;
  if (walSize > 0 || shmSize > 0) {
    console.log(`\n${colors.cyan}Total with WAL/SHM: ${formatBytes(totalWithWal)}${colors.reset}`);
  }

  console.log(`\n${colors.yellow}Note: For per-table breakdown, use sqlite3 CLI or accept longer scan time.${colors.reset}`);
  console.log(`${colors.yellow}The dbstat query requires scanning all database pages.${colors.reset}`);
}

if (require.main === module) {
  quickAnalysis();
}

module.exports = { quickAnalysis };
