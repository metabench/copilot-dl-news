#!/usr/bin/env node
"use strict";

/**
 * crawl-status.js — Crawl Session Status & Diagnostics
 * 
 * Provides visibility into active and past crawls by analyzing:
 * - Running node processes that appear to be crawlers
 * - Evidence files in testlogs/download-evidence/
 * - Log files in tmp/ and testlogs/
 * - Task event database records
 * 
 * Usage:
 *   node tools/dev/crawl-status.js                  # Show overview
 *   node tools/dev/crawl-status.js --active         # Show only active crawls
 *   node tools/dev/crawl-status.js --recent [n]     # Show n most recent (default 5)
 *   node tools/dev/crawl-status.js --evidence       # List evidence files
 *   node tools/dev/crawl-status.js --logs           # Analyze recent log files
 *   node tools/dev/crawl-status.js --json           # JSON output
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const EVIDENCE_DIR = path.join(process.cwd(), "testlogs", "download-evidence");
const TMP_DIR = path.join(process.cwd(), "tmp");
const TESTLOGS_DIR = path.join(process.cwd(), "testlogs");

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const recentIdx = args.indexOf("--recent");
  
  return {
    json: args.includes("--json"),
    active: args.includes("--active"),
    recent: recentIdx >= 0 ? parseInt(args[recentIdx + 1], 10) || 5 : 5,
    showRecent: args.includes("--recent"),
    evidence: args.includes("--evidence"),
    logs: args.includes("--logs"),
    help: args.includes("--help") || args.includes("-h"),
    verbose: args.includes("-v") || args.includes("--verbose")
  };
}

// Get active crawl processes
function getActiveCrawls() {
  try {
    // Step 1: Get basic process info
    const basicResult = execSync(
      `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id,StartTime | ConvertTo-Json -Compress"`,
      { encoding: "utf8", timeout: 10000 }
    );
    
    if (!basicResult.trim()) return [];
    
    const basicProcs = JSON.parse(basicResult);
    const procs = Array.isArray(basicProcs) ? basicProcs : [basicProcs];
    
    // Step 2: Get command lines via WMIC and filter to crawl processes
    const crawlPatterns = ["crawl", "guardian", "NewsCrawler", "mini-crawl"];
    const crawlProcs = [];
    
    for (const proc of procs) {
      try {
        const wmicResult = execSync(
          `wmic process where "ProcessId=${proc.Id}" get CommandLine /format:list`,
          { encoding: "utf8", timeout: 5000 }
        );
        const cmdMatch = wmicResult.match(/CommandLine=(.+)/);
        const cmdLine = cmdMatch ? cmdMatch[1].trim() : "";
        
        if (crawlPatterns.some(pat => cmdLine.toLowerCase().includes(pat.toLowerCase()))) {
          crawlProcs.push({
            pid: proc.Id,
            startTime: proc.StartTime,
            runtime: formatRuntime(proc.StartTime),
            command: extractCrawlCommand(cmdLine)
          });
        }
      } catch {
        // Skip processes we can't query
      }
    }
    
    return crawlProcs;
  } catch (err) {
    return [];
  }
}

// Format runtime duration
function formatRuntime(startTime) {
  if (!startTime) return "unknown";
  
  // Handle Windows date format from PowerShell (can be /Date(timestamp)/ format)
  let start;
  if (typeof startTime === "string" && startTime.includes("/Date(")) {
    const ts = parseInt(startTime.match(/\d+/)?.[0] || "0", 10);
    start = new Date(ts);
  } else {
    start = new Date(startTime);
  }
  
  if (isNaN(start.getTime())) return "unknown";
  
  const now = new Date();
  const diffMs = now - start;
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Extract meaningful crawl command description
function extractCrawlCommand(cmdLine) {
  if (!cmdLine) return "unknown";
  
  // Try to find the script name
  const match = cmdLine.match(/node(?:\.exe)?\s+(?:"([^"]+)"|(\S+))/i);
  if (match) {
    return path.basename(match[1] || match[2]);
  }
  
  return cmdLine.length > 50 ? cmdLine.substring(0, 47) + "..." : cmdLine;
}

// Get evidence files
function getEvidenceFiles() {
  if (!fs.existsSync(EVIDENCE_DIR)) return [];
  
  const files = fs.readdirSync(EVIDENCE_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const filePath = path.join(EVIDENCE_DIR, f);
      const stats = fs.statSync(filePath);
      
      try {
        const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return {
          filename: f,
          path: filePath,
          created: stats.mtime,
          pagesDownloaded: content.distinctPagesWithDownloads || content.pagesDownloaded || 0,
          totalBytes: content.totalBytesDownloaded || 0,
          exitReason: content.crawlerExitSummary?.reason || content.exitReason || "unknown",
          domain: extractDomain(content),
          success: isSuccessfulCrawl(content)
        };
      } catch (err) {
        return {
          filename: f,
          path: filePath,
          created: stats.mtime,
          error: "Failed to parse"
        };
      }
    })
    .sort((a, b) => b.created - a.created);
  
  return files;
}

// Extract domain from evidence
function extractDomain(content) {
  // Try various places where domain might be stored
  const url = content.sampleFirstPages?.[0]?.url || 
              content.seedUrl || 
              content.startUrl ||
              "";
  
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

// Determine if crawl was successful
function isSuccessfulCrawl(content) {
  const reason = content.crawlerExitSummary?.reason || content.exitReason || "";
  const pages = content.distinctPagesWithDownloads || content.pagesDownloaded || 0;
  
  // Success criteria
  const successReasons = ["max-downloads-reached", "queue-exhausted", "completed"];
  const failReasons = ["error", "timeout", "crash", "stall"];
  
  if (failReasons.some(r => reason.toLowerCase().includes(r))) return false;
  if (successReasons.some(r => reason.toLowerCase().includes(r)) && pages > 0) return true;
  
  return pages > 0;
}

// Get recent crawl log files
function getRecentLogs(limit = 10) {
  const logs = [];
  
  // Check tmp/ for crawl logs
  if (fs.existsSync(TMP_DIR)) {
    const tmpFiles = fs.readdirSync(TMP_DIR)
      .filter(f => f.includes("guardian") || f.includes("crawl"))
      .filter(f => f.endsWith(".log") || f.endsWith(".txt") || f.endsWith(".json"));
    
    tmpFiles.forEach(f => {
      const filePath = path.join(TMP_DIR, f);
      const stats = fs.statSync(filePath);
      logs.push({
        filename: f,
        path: filePath,
        dir: "tmp",
        created: stats.mtime,
        size: stats.size,
        analysis: analyzeLogFile(filePath)
      });
    });
  }
  
  return logs
    .sort((a, b) => b.created - a.created)
    .slice(0, limit);
}

// Analyze a log file for key metrics
function analyzeLogFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    
    // Count key events
    let enqueued = 0;
    let dequeued = 0;
    let errors = 0;
    let pages = 0;
    let exitReason = null;
    let lastQueueSize = 0;
    
    for (const line of lines) {
      if (line.includes('"action":"enqueued"')) {
        enqueued++;
        const match = line.match(/"queueSize":(\d+)/);
        if (match) lastQueueSize = Math.max(lastQueueSize, parseInt(match[1], 10));
      }
      if (line.includes('"action":"dequeued"')) dequeued++;
      if (line.includes("Error") || line.includes("error")) errors++;
      if (line.includes("PAGE {") || line.includes("Saved article")) pages++;
      
      // Check for test results
      if (line.includes("TEST PASSED")) exitReason = "passed";
      if (line.includes("TEST FAILED")) exitReason = "failed";
      if (line.includes("Exit reason:")) {
        const match = line.match(/Exit reason:\s*(\S+)/);
        if (match) exitReason = match[1];
      }
    }
    
    return {
      lines: lines.length,
      enqueued,
      dequeued,
      maxQueueSize: lastQueueSize,
      pages,
      errors,
      exitReason
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Format bytes
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

// Main function
function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(`
crawl-status.js — Crawl Session Status & Diagnostics

USAGE:
  node tools/dev/crawl-status.js [options]

OPTIONS:
  --active        Show only active crawl processes
  --recent [n]    Show n most recent evidence files (default 5)
  --evidence      Focus on evidence files
  --logs          Analyze recent log files
  --json          Output as JSON
  -v, --verbose   Show more details
  -h, --help      Show this help

EVIDENCE:
  Evidence files are stored in testlogs/download-evidence/
  They contain proof of successful crawls with page counts and bytes.

EXAMPLES:
  node tools/dev/crawl-status.js                  # Overview
  node tools/dev/crawl-status.js --active         # Active crawls only
  node tools/dev/crawl-status.js --recent 10      # Last 10 crawls
  node tools/dev/crawl-status.js --logs --json    # Log analysis as JSON
`);
    process.exit(0);
  }
  
  const activeCrawls = getActiveCrawls();
  const evidenceFiles = getEvidenceFiles();
  const recentLogs = args.logs ? getRecentLogs(args.recent) : [];
  
  if (args.json) {
    const output = {
      timestamp: new Date().toISOString(),
      active: activeCrawls,
      evidence: args.evidence || !args.active ? evidenceFiles.slice(0, args.recent) : [],
      logs: recentLogs,
      summary: {
        activeCrawls: activeCrawls.length,
        totalEvidence: evidenceFiles.length,
        recentSuccesses: evidenceFiles.filter(e => e.success).slice(0, 10).length,
        recentFailures: evidenceFiles.filter(e => e.success === false).slice(0, 10).length
      }
    };
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  }
  
  // Human-readable output
  console.log("\n┌─ Crawl Status ──────────────────────────────────────────────────────┐\n");
  
  // Active crawls
  console.log("🔄 ACTIVE CRAWLS:");
  if (activeCrawls.length === 0) {
    console.log("   (none detected)\n");
  } else {
    activeCrawls.forEach(c => {
      console.log(`   PID ${c.pid.toString().padEnd(6)} │ ${c.runtime.padEnd(10)} │ ${c.command}`);
    });
    console.log();
  }
  
  // Recent evidence
  if (!args.active) {
    console.log(`📊 RECENT CRAWL EVIDENCE (${Math.min(args.recent, evidenceFiles.length)}/${evidenceFiles.length}):`);
    if (evidenceFiles.length === 0) {
      console.log("   (no evidence files found)\n");
    } else {
      evidenceFiles.slice(0, args.recent).forEach(e => {
        if (e.error) {
          console.log(`   ⚠️  ${e.filename} - ${e.error}`);
        } else {
          const status = e.success ? "✅" : "❌";
          const date = e.created.toISOString().split("T")[0];
          const time = e.created.toISOString().split("T")[1].substring(0, 5);
          console.log(`   ${status} ${date} ${time} │ ${e.pagesDownloaded.toString().padStart(5)} pages │ ${formatBytes(e.totalBytes).padStart(8)} │ ${e.exitReason} │ ${e.domain}`);
        }
      });
      console.log();
    }
  }
  
  // Log analysis
  if (args.logs) {
    console.log(`📝 RECENT LOG FILES (${recentLogs.length}):`);
    if (recentLogs.length === 0) {
      console.log("   (no log files found)\n");
    } else {
      recentLogs.forEach(l => {
        const date = l.created.toISOString().split("T")[0];
        const time = l.created.toISOString().split("T")[1].substring(0, 5);
        const a = l.analysis;
        
        if (a.error) {
          console.log(`   ⚠️  ${l.filename} - ${a.error}`);
        } else {
          const status = a.exitReason === "passed" ? "✅" : 
                        a.exitReason === "failed" ? "❌" : "➖";
          console.log(`   ${status} ${date} ${time} │ ${a.lines.toString().padStart(5)} lines │ enq:${a.enqueued} deq:${a.dequeued} max:${a.maxQueueSize} │ ${l.filename}`);
        }
      });
      console.log();
    }
  }
  
  // Summary
  const successCount = evidenceFiles.filter(e => e.success).length;
  const failCount = evidenceFiles.filter(e => e.success === false).length;
  
  console.log("─────────────────────────────────────────────────────────────────────");
  console.log(`Summary: ${activeCrawls.length} active │ ${evidenceFiles.length} evidence files │ ${successCount} ✅ ${failCount} ❌`);
  console.log("└─────────────────────────────────────────────────────────────────────┘\n");
}

main();
