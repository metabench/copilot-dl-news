#!/usr/bin/env node
/**
 * health-check.js - Container Health Check Script
 * ================================================
 * 
 * Verifies the crawler container is healthy by checking:
 * - Database connection
 * - Queue accessibility
 * - Basic runtime health
 * 
 * Exit codes:
 *   0 - Healthy
 *   1 - Unhealthy
 * 
 * Usage:
 *   node deploy/scripts/health-check.js
 *   node deploy/scripts/health-check.js --verbose
 */

const { execSync } = require('child_process');
const path = require('path');

// Configuration
const TIMEOUT_MS = 5000;
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

/**
 * Health check result
 * @typedef {{ name: string, healthy: boolean, message: string, durationMs: number }} CheckResult
 */

/**
 * Run a single health check with timeout
 * @param {string} name 
 * @param {() => Promise<void>} checkFn 
 * @returns {Promise<CheckResult>}
 */
async function runCheck(name, checkFn) {
  const start = Date.now();
  try {
    await Promise.race([
      checkFn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)
      )
    ]);
    return {
      name,
      healthy: true,
      message: 'OK',
      durationMs: Date.now() - start
    };
  } catch (error) {
    return {
      name,
      healthy: false,
      message: error.message,
      durationMs: Date.now() - start
    };
  }
}

/**
 * Check PostgreSQL connection
 */
async function checkPostgres() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL not set');
  }
  
  // Try to connect using pg client
  const { Client } = require('pg');
  const client = new Client({ connectionString: dbUrl });
  
  try {
    await client.connect();
    const result = await client.query('SELECT 1 as health');
    if (result.rows[0].health !== 1) {
      throw new Error('Unexpected query result');
    }
  } finally {
    await client.end();
  }
}

/**
 * Check SQLite database (for staging/dev)
 */
async function checkSqlite() {
  const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), 'data', 'news.db');
  const fs = require('fs');
  
  // Check file exists
  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite database not found: ${dbPath}`);
  }
  
  // Try to open and query
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  
  try {
    const result = db.prepare('SELECT 1 as health').get();
    if (result.health !== 1) {
      throw new Error('Unexpected query result');
    }
  } finally {
    db.close();
  }
}

/**
 * Check database based on environment
 */
async function checkDatabase() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
    await checkPostgres();
  } else {
    await checkSqlite();
  }
}

/**
 * Check Redis connection (if configured)
 */
async function checkRedis() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    // Redis not configured - skip
    return;
  }
  
  const Redis = require('ioredis');
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: TIMEOUT_MS
  });
  
  try {
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error(`Unexpected PING response: ${pong}`);
    }
  } finally {
    client.disconnect();
  }
}

/**
 * Check process memory is within bounds
 */
async function checkMemory() {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  const rssMB = Math.round(used.rss / 1024 / 1024);
  
  // Fail if using more than 90% of max old space
  const maxOldSpaceMB = parseInt(process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1] || '2048');
  const heapUsagePercent = (heapUsedMB / maxOldSpaceMB) * 100;
  
  if (heapUsagePercent > 90) {
    throw new Error(`High memory usage: ${heapUsedMB}MB / ${maxOldSpaceMB}MB (${heapUsagePercent.toFixed(1)}%)`);
  }
  
  if (VERBOSE) {
    console.log(`  Memory: heap=${heapUsedMB}MB/${heapTotalMB}MB, rss=${rssMB}MB`);
  }
}

/**
 * Check event loop is not blocked
 */
async function checkEventLoop() {
  const start = Date.now();
  
  await new Promise(resolve => setImmediate(resolve));
  
  const lag = Date.now() - start;
  if (lag > 100) {
    throw new Error(`Event loop lag: ${lag}ms`);
  }
}

/**
 * Main health check runner
 */
async function main() {
  const startTime = Date.now();
  
  if (VERBOSE) {
    console.log('Running health checks...\n');
  }
  
  // Define checks to run
  const checks = [
    { name: 'database', fn: checkDatabase },
    { name: 'memory', fn: checkMemory },
    { name: 'event-loop', fn: checkEventLoop }
  ];
  
  // Add Redis check if configured
  if (process.env.REDIS_URL) {
    checks.push({ name: 'redis', fn: checkRedis });
  }
  
  // Run all checks
  const results = await Promise.all(
    checks.map(({ name, fn }) => runCheck(name, fn))
  );
  
  // Evaluate results
  const unhealthy = results.filter(r => !r.healthy);
  const totalDuration = Date.now() - startTime;
  
  if (VERBOSE) {
    console.log('\nResults:');
    for (const result of results) {
      const status = result.healthy ? '✓' : '✗';
      console.log(`  ${status} ${result.name}: ${result.message} (${result.durationMs}ms)`);
    }
    console.log(`\nTotal: ${totalDuration}ms`);
  }
  
  if (unhealthy.length > 0) {
    if (!VERBOSE) {
      // Print failures in non-verbose mode
      console.error('Health check failed:');
      for (const result of unhealthy) {
        console.error(`  - ${result.name}: ${result.message}`);
      }
    }
    process.exit(1);
  }
  
  if (VERBOSE) {
    console.log('\nHealth check passed!');
  }
  
  process.exit(0);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Health check crashed:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Health check rejected:', reason);
  process.exit(1);
});

// Run
main().catch(error => {
  console.error('Health check error:', error.message);
  process.exit(1);
});
