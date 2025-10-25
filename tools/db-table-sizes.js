const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const https = require('https');
const extract = require('extract-zip');

/**
 * ANSI color codes
 */
const colors = {
  green: '\x1b[92m',
  blue: '\x1b[94m',
  cyan: '\x1b[96m',
  yellow: '\x1b[93m',
  reset: '\x1b[0m'
};

// --- Native CLI Downloader & Finder ---

async function downloadAndExtract(url, dest, exeName) {
  const zipPath = path.join(dest, 'sqlite-tools.zip');
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  console.log(`${colors.cyan}Downloading SQLite CLI from ${url}...${colors.reset}`);
  
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(zipPath);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download. Status code: ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(zipPath, () => {}); // Clean up
      reject(err);
    });
  });

  console.log('Download complete. Extracting...');
  await extract(zipPath, { dir: dest });
  fs.unlinkSync(zipPath); // Clean up zip file
  console.log('Extraction complete.');

  // The zip extracts into a subfolder, find the exe within it
  const files = fs.readdirSync(dest);
  const extractedFolder = files.find(f => fs.statSync(path.join(dest, f)).isDirectory());
  
  if (extractedFolder) {
    const extractedFolderPath = path.join(dest, extractedFolder);
    const exePath = path.join(extractedFolderPath, exeName);
    
    if (fs.existsSync(exePath)) {
      // Move the exe to the root of the bin folder for easier access
      const finalPath = path.join(dest, exeName);
      fs.renameSync(exePath, finalPath);
      // Clean up the now-empty extracted folder and any other files
      fs.rmSync(extractedFolderPath, { recursive: true, force: true });
      return finalPath;
    }
  }
  
  throw new Error(`${exeName} not found in extracted archive.`);
}

async function findOrDownloadSqliteCli() {
  const binDir = path.join(__dirname, 'bin');
  const exeName = 'sqlite3.exe';
  const localExePath = path.join(binDir, exeName);

  // 1. Check our local tools/bin directory first
  if (fs.existsSync(localExePath)) {
    return `"${localExePath}"`;
  }

  // 2. Check system PATH
  try {
    execSync('sqlite3 -version', { stdio: 'pipe' });
    return 'sqlite3'; // It's in the path
  } catch (e) {
    // Not in path, proceed to download
  }

  // 3. Download if not found
  console.log(`${colors.yellow}SQLite CLI not found locally or in PATH.${colors.reset}`);
  const platform = process.platform;
  if (platform !== 'win32') {
    console.error(`${colors.yellow}Automatic download is only supported on Windows.${colors.reset}`);
    console.error('Please install sqlite3 and ensure it is in your system PATH.');
    return null;
  }

  // URL for the latest SQLite 3.46 for Windows x64
  const downloadUrl = 'https://www.sqlite.org/2024/sqlite-tools-win-x64-3460000.zip';
  const finalPath = await downloadAndExtract(downloadUrl, binDir, exeName);
  return `"${finalPath}"`;
}


// --- Native CLI Analysis (Fastest) ---

function runFastAnalysisWithCli(sqliteCliPath) {
  const dbPath = getDbPath();
  console.log(`${colors.cyan}🚀 Using native SQLite CLI for fastest analysis...${colors.reset}\n`);

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

  console.log('RUNNING: Querying dbstat via sqlite3 CLI...');
  const start = Date.now();
  
  try {
    const command = `${sqliteCliPath} -csv "${dbPath}" "${query.replace(/\n/g, ' ')}"`;
    const output = execSync(command, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    console.log(`${colors.green}COMPLETED in ${Date.now() - start}ms${colors.reset}\n`);
    
    const lines = output.trim().split(/[\r\n]+/).filter(Boolean);
    if (!lines.length) {
      console.log('❌ No tables found or dbstat is empty.');
      return;
    }

    const tableStats = lines.map(line => {
      const [name, page_count, size_bytes] = line.split(',');
      return { name, page_count: parseInt(page_count), size_bytes: parseInt(size_bytes) };
    });

    displayResults(tableStats);

  } catch (error) {
    console.error(`\n${colors.yellow}❌ Error running sqlite3 CLI: ${error.message}${colors.reset}`);
    console.error('Please ensure the database is not locked and the query is correct.');
    process.exit(1);
  }
}


// --- Node.js Fallback Analysis (Slow) ---

/**
 * Animated progress bar with gradient effect
 */
class ProgressBar {
  constructor(message) {
    this.message = message;
    this.position = 0;
    this.width = 40;
    this.interval = null;
  }

  start() {
    process.stdout.write('\n');
    this.interval = setInterval(() => {
      const bar = Array(this.width).fill(' ').map((_, i) => {
        const dist = Math.abs(i - this.position);
        if (dist === 0) return '█';
        if (dist === 1) return '▓';
        if (dist === 2) return '▒';
        if (dist === 3) return '░';
        return ' ';
      }).join('');
      
      process.stdout.write(`\r${colors.blue}${this.message} [${bar}]${colors.reset}`);
      
      // Move position, cycling from left to right
      this.position++;
      if (this.position >= this.width) {
        this.position = 0;
      }
    }, 50);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
    }
  }
}

function runSlowAnalysisWithNode() {
  const dbPath = getDbPath();

  console.log(`${colors.yellow}⚠️ Using slow Node.js-based analysis (in a worker thread).${colors.reset}`);
  console.log('This will take a very long time (15-20+ minutes) for a large database.\n');

  const progressBar = new ProgressBar('Scanning database pages');
  progressBar.start();

  const worker = new Worker(path.join(__dirname, 'db-worker.js'), {
    workerData: { dbPath }
  });

  const start = Date.now();

  worker.on('message', (message) => {
    progressBar.stop();
    console.log(`${colors.green}COMPLETED in ${Date.now() - start}ms${colors.reset}\n`);
    
    if (message.success) {
      displayResults(message.payload);
    } else {
      console.error(`\n❌ Error in database worker: ${message.payload.message}`);
    }
  });

  worker.on('error', (error) => {
    progressBar.stop();
    console.error(`\n❌ Worker thread error: ${error.message}`);
    process.exit(1);
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      progressBar.stop();
      console.error(`\n❌ Worker stopped with exit code ${code}`);
      process.exit(1);
    }
  });
}

// --- Instant File Size Check ---

function runInstantFileSizeCheck() {
    const dbPath = getDbPath();
    console.log(`${colors.cyan}Quick Database Size Analysis${colors.reset}`);

    if (!fs.existsSync(dbPath)) {
        console.error(`${colors.yellow}❌ Database file not found${colors.reset}`);
        process.exit(1);
    }

    const stats = fs.statSync(dbPath);
    console.log(`\n${colors.cyan}Total Database File Size: ${formatBytes(stats.size)}${colors.reset}`);
    
    console.log(`\n${colors.yellow}This is the total file size. For a per-table breakdown, the native SQLite CLI is required.${colors.reset}`);
}


// --- Common Functions & Main Execution ---

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

function displayResults(tableStats) {
  if (!tableStats || !tableStats.length) {
    console.log('❌ No tables found.');
    return;
  }

  console.log(`✓ Found ${tableStats.length} tables\n`);
  tableStats.sort((a, b) => b.size_bytes - a.size_bytes);
  const totalSize = tableStats.reduce((acc, row) => acc + row.size_bytes, 0);

  const headers = ['Table Name', 'Pages', 'Size', '%'];
  const rows = tableStats.map(row => ({
    'Table Name': row.name,
    'Pages': row.page_count.toLocaleString(),
    'Size': formatBytes(row.size_bytes),
    '%': totalSize > 0 ? ((row.size_bytes / totalSize) * 100).toFixed(1) + '%' : '0.0%',
  }));

  const widths = {};
  headers.forEach(h => {
    widths[h] = Math.max(h.length, ...rows.map(d => String(d[h]).length));
  });

  const headerLine = headers.map(h => h.padEnd(widths[h])).join(' | ');
  const separatorLine = headers.map(h => '-'.repeat(widths[h])).join('-|-');
  console.log(headerLine);
  console.log(separatorLine);

  rows.forEach(d => {
    const rowLine = headers.map(h => String(d[h]).padEnd(widths[h])).join(' | ');
    console.log(rowLine);
  });

  console.log(`\n${colors.cyan}Total Database Size (from tables): ${formatBytes(totalSize)}${colors.reset}`);
}

async function main() {
  // Check for help first
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Database Table Sizes Analyzer

Analyze SQLite database table sizes and storage usage.

USAGE:
  node tools/db-table-sizes.js [options]

DESCRIPTION:
  This tool provides detailed analysis of database table sizes using the native
  SQLite CLI for fast results, or falls back to a slower Node.js-based analysis.

  It shows per-table row counts, sizes, and total database statistics.

OPTIONS:
  --help, -h    Show this help message

OUTPUT:
  - Table-by-table breakdown with row counts and sizes
  - Total database size calculation
  - Uses native SQLite CLI when available for speed

REQUIREMENTS:
  - SQLite database at data/news.db (or set DB_PATH env var)
  - Internet connection for downloading SQLite CLI (optional, for faster analysis)

EXAMPLES:
  node tools/db-table-sizes.js    # Analyze default database
`);
    process.exit(0);
  }

  const sqliteCliPath = await findOrDownloadSqliteCli();

  if (sqliteCliPath) {
    runFastAnalysisWithCli(sqliteCliPath);
  } else {
    console.log(`${colors.yellow}Could not find or download the native SQLite CLI.${colors.reset}`);
    console.log('This is the fastest way to get per-table database sizes.\n');
    console.log(`${colors.cyan}Options:${colors.reset}`);
    console.log(`1. Get an ${colors.green}instant total file size${colors.reset} (no per-table details).`);
    console.log(`2. Run a ${colors.yellow}very slow Node.js-based analysis${colors.reset} (15-20+ minutes).\n`);
    
    // In a real CLI tool, you might prompt the user for a choice.
    console.log('Proceeding with slow Node.js-based analysis (option 2)...\n');
    runSlowAnalysisWithNode();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
