#!/usr/bin/env node

/**
 * review-429-errors - Analyze 429 rate limit errors and download statistics
 *
 * Usage:
 *   node tools/review-429-errors.js [--host HOST] [--hours HOURS]
 *
 * Options:
 *   --host HOST       Analyze specific host (defaults to host of latest 429 error)
 *   --hours HOURS     Hours of history to analyze for patterns (default: 24)
 *   --help, -h        Show this help message
 *
 * This tool analyzes:
 * - Download statistics in the 1, 2, and 5 minutes before the most recent 429 error
 * - Total downloads, bytes downloaded, and success rates
 * - Rate limit patterns over the specified time period
 */

const { ensureDatabase } = require('../src/data/db/sqlite');
const { RateLimitAnalysisQueries } = require('../src/data/db/sqlite/queries/rateLimitAnalysis');

// Check for help flag first
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Review 429 Errors Tool

Analyzes 429 rate limit errors and download statistics before they occurred.

USAGE:
  node tools/review-429-errors.js [options]

OPTIONS:
  --host HOST       Analyze specific host (defaults to host of latest 429 error)
  --hours HOURS     Hours of history to analyze for patterns (default: 24)
  --help, -h        Show this help message

ANALYSIS INCLUDES:
  • Download stats in 1, 2, and 5 minutes before latest 429 error
  • Total downloads, MB downloaded, success rates
  • Rate limit error patterns over time
  • Host-specific analysis

EXAMPLES:
  node tools/review-429-errors.js                          # Analyze latest 429 error
  node tools/review-429-errors.js --host www.theguardian.com  # Specific host
  node tools/review-429-errors.js --hours 48               # 48 hours of history
`);
  process.exit(0);
}

// Parse command line arguments
const args = process.argv.slice(2);
let targetHost = null;
let hoursHistory = 24;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host' && args[i + 1]) {
    targetHost = args[i + 1];
    i++;
  } else if (args[i] === '--hours' && args[i + 1]) {
    hoursHistory = parseInt(args[i + 1], 10);
    if (isNaN(hoursHistory) || hoursHistory < 1) {
      console.error('Error: --hours must be a positive integer');
      process.exit(1);
    }
    i++;
  }
}

// Initialize database
const dbPath = require('path').join(__dirname, '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

// Create analysis queries instance
const analysis = new RateLimitAnalysisQueries(db);

async function main() {
  console.log('🔍 Analyzing 429 Rate Limit Errors\n');

  // Get 429 analysis
  const analysis429 = analysis.get429Analysis(targetHost);

  if (!analysis429.has429Errors) {
    console.log('ℹ️  No 429 errors found in database');
    if (analysis429.message) {
      console.log(`   ${analysis429.message}`);
    }
    console.log('\n📊 General Download Statistics (Last 24 hours):');

    // Show general download stats instead
    const generalStats = analysis.getDownloadStatsBefore429(new Date().toISOString(), 1440, targetHost); // 24 hours
    console.log(`   Total Downloads: ${generalStats.totalDownloads}`);
    console.log(`   Successful Downloads: ${generalStats.successfulDownloads}`);
    console.log(`   Error Downloads: ${generalStats.errorDownloads}`);
    console.log(`   Success Rate: ${generalStats.successRate}%`);
    console.log(`   Total Downloaded: ${generalStats.totalMB} MB`);
    console.log(`   Successful Downloaded: ${generalStats.successfulMB} MB`);

    if (targetHost) {
      console.log(`\n📊 Rate Limit Patterns for ${targetHost} (last ${hoursHistory} hours):`);
      const patterns = analysis.getRateLimitPatterns(targetHost, hoursHistory);
      if (patterns.hasData) {
        console.log(`   Total Requests: ${patterns.totalRequests.toLocaleString()}`);
        console.log(`   Requests/Hour: ${patterns.requestsPerHour}`);
        console.log(`   Successful Requests: ${patterns.successfulRequests.toLocaleString()}`);
        console.log(`   Error Requests: ${patterns.errorRequests.toLocaleString()}`);
      } else {
        console.log(`   ${patterns.message}`);
      }
    }

    console.log('\n✅ Analysis complete (no 429 errors to analyze)');
    process.exit(0);
  }

  // Display latest 429 error
  const latest429 = analysis429.latest429;
  console.log('📊 Latest 429 Error:');
  console.log(`   Timestamp: ${new Date(latest429.timestamp).toLocaleString()}`);
  console.log(`   Host: ${latest429.host}`);
  console.log(`   URL: ${latest429.url}`);
  console.log(`   Response Size: ${latest429.responseSize} bytes`);
  console.log('');

  // Display download statistics for different time windows
  console.log('📈 Download Statistics Before 429 Error:');
  console.log('');

  const timeWindows = ['last1Minutes', 'last2Minutes', 'last5Minutes'];
  for (const window of timeWindows) {
    const stats = analysis429.downloadStats[window];
    const windowNum = window.match(/(\d+)/)[1];

    console.log(`⏰ Last ${windowNum} Minute${windowNum > 1 ? 's' : ''}:`);
    console.log(`   Total Downloads: ${stats.totalDownloads}`);
    console.log(`   Successful Downloads: ${stats.successfulDownloads}`);
    console.log(`   Error Downloads: ${stats.errorDownloads}`);
    console.log(`   Success Rate: ${stats.successRate}%`);
    console.log(`   Total Downloaded: ${stats.totalMB} MB (${stats.totalBytesDownloaded.toLocaleString()} bytes)`);
    console.log(`   Successful Downloaded: ${stats.successfulMB} MB (${stats.successfulBytesDownloaded.toLocaleString()} bytes)`);

    if (stats.totalDownloads > 0) {
      console.log(`   Average Size: ${stats.avgBytesPerDownload.toLocaleString()} bytes`);
      console.log(`   Size Range: ${stats.minBytesPerDownload.toLocaleString()} - ${stats.maxBytesPerDownload.toLocaleString()} bytes`);
    }
    console.log('');
  }

  // Get rate limit patterns
  const hostToAnalyze = targetHost || latest429.host;
  console.log(`📊 Rate Limit Patterns for ${hostToAnalyze} (last ${hoursHistory} hours):`);
  console.log('');

  const patterns = analysis.getRateLimitPatterns(hostToAnalyze, hoursHistory);

  if (!patterns.hasData) {
    console.log(`❌ ${patterns.message}`);
  } else {
    console.log(`   Time Span: ${patterns.timeSpanHours} hours`);
    console.log(`   Total Requests: ${patterns.totalRequests.toLocaleString()}`);
    console.log(`   Successful Requests: ${patterns.successfulRequests.toLocaleString()}`);
    console.log(`   Error Requests: ${patterns.errorRequests.toLocaleString()}`);
    console.log(`   Rate Limit Errors: ${patterns.rateLimitErrors.toLocaleString()}`);
    console.log(`   Rate Limit Error Rate: ${patterns.rateLimitErrorRate}%`);
    console.log(`   Requests/Hour: ${patterns.requestsPerHour}`);
    console.log(`   Rate Limit Errors/Hour: ${patterns.rateLimitErrorsPerHour}`);
    console.log(`   First Request: ${new Date(patterns.firstRequest).toLocaleString()}`);
    console.log(`   Last Request: ${new Date(patterns.lastRequest).toLocaleString()}`);
  }

  console.log('');
  console.log('✅ Analysis complete');
}

// Run the analysis
main().catch(error => {
  console.error('❌ Analysis failed:', error.message);
  process.exit(1);
});