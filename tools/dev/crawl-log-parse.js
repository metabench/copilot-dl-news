#!/usr/bin/env node
"use strict";

/**
 * crawl-log-parse.js — Deep Crawl Log Analysis
 * 
 * Parses crawl logs (from stdout/files) to extract detailed metrics:
 * - Queue dynamics (enqueue/dequeue patterns)
 * - Page fetch results
 * - Error categorization
 * - Timeline reconstruction
 * 
 * Usage:
 *   node tools/dev/crawl-log-parse.js <logfile>           # Analyze a log file
 *   node tools/dev/crawl-log-parse.js <logfile> --json    # JSON output
 *   node tools/dev/crawl-log-parse.js <logfile> --errors  # Focus on errors
 *   node tools/dev/crawl-log-parse.js <logfile> --queue   # Focus on queue dynamics
 *   node tools/dev/crawl-log-parse.js <logfile> --timeline # Show timeline
 *   cat log.txt | node tools/dev/crawl-log-parse.js -     # Read from stdin
 */

const fs = require("fs");
const readline = require("readline");

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith("-"));
  
  return {
    file: file || "-",
    json: args.includes("--json"),
    errors: args.includes("--errors"),
    queue: args.includes("--queue"),
    timeline: args.includes("--timeline"),
    summary: args.includes("--summary"),
    verbose: args.includes("-v") || args.includes("--verbose"),
    help: args.includes("--help") || args.includes("-h"),
    limit: parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] || "0", 10)
  };
}

// Event types we track
const EVENT_TYPES = {
  QUEUE_ENQUEUE: "queue:enqueue",
  QUEUE_DEQUEUE: "queue:dequeue",
  QUEUE_DROP: "queue:drop",
  PAGE_SUCCESS: "page:success",
  PAGE_ERROR: "page:error",
  MILESTONE: "milestone",
  PROGRESS: "progress",
  ERROR: "error",
  RESULT: "result"
};

// Parse a single log line
function parseLine(line, lineNum) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  
  // QUEUE events
  if (trimmed.startsWith("QUEUE {")) {
    try {
      const json = JSON.parse(trimmed.substring(6));
      return {
        type: json.action === "enqueued" ? EVENT_TYPES.QUEUE_ENQUEUE :
              json.action === "dequeued" ? EVENT_TYPES.QUEUE_DEQUEUE :
              json.action === "drop" ? EVENT_TYPES.QUEUE_DROP : "queue:other",
        lineNum,
        url: json.url,
        queueSize: json.queueSize,
        depth: json.depth,
        reason: json.reason,
        raw: json
      };
    } catch {
      return null;
    }
  }
  
  // PAGE events
  if (trimmed.startsWith("PAGE {")) {
    try {
      const json = JSON.parse(trimmed.substring(5));
      return {
        type: json.status === "success" ? EVENT_TYPES.PAGE_SUCCESS : EVENT_TYPES.PAGE_ERROR,
        lineNum,
        url: json.url,
        httpStatus: json.httpStatus,
        bytes: json.bytesDownloaded,
        durationMs: json.totalMs,
        depth: json.depth,
        cached: json.source === "cache",
        raw: json
      };
    } catch {
      return null;
    }
  }
  
  // MILESTONE events
  if (trimmed.startsWith("MILESTONE {")) {
    try {
      const json = JSON.parse(trimmed.substring(10));
      return {
        type: EVENT_TYPES.MILESTONE,
        lineNum,
        kind: json.kind,
        message: json.message,
        scope: json.scope,
        raw: json
      };
    } catch {
      return null;
    }
  }
  
  // PROGRESS events
  if (trimmed.startsWith("PROGRESS {")) {
    try {
      const json = JSON.parse(trimmed.substring(9));
      return {
        type: EVENT_TYPES.PROGRESS,
        lineNum,
        visited: json.visited,
        downloaded: json.downloaded,
        queueSize: json.queueSize,
        errors: json.errors,
        bytes: json.bytes,
        raw: json
      };
    } catch {
      return null;
    }
  }
  
  // Test results
  if (trimmed.includes("TEST PASSED") || trimmed.includes("✅ TEST PASSED")) {
    return { type: EVENT_TYPES.RESULT, lineNum, result: "passed", message: trimmed };
  }
  if (trimmed.includes("TEST FAILED") || trimmed.includes("❌ TEST FAILED")) {
    return { type: EVENT_TYPES.RESULT, lineNum, result: "failed", message: trimmed };
  }
  
  // Exit reason
  if (trimmed.includes("Exit reason:")) {
    const match = trimmed.match(/Exit reason:\s*(\S+)/);
    return { type: EVENT_TYPES.RESULT, lineNum, result: "exit", exitReason: match?.[1], message: trimmed };
  }
  
  // Error detection
  if (trimmed.toLowerCase().includes("error") && !trimmed.includes('"errors":')) {
    return { type: EVENT_TYPES.ERROR, lineNum, message: trimmed.substring(0, 200) };
  }
  
  return null;
}

// Analyze parsed events
function analyzeEvents(events) {
  const analysis = {
    counts: {
      total: events.length,
      queueEnqueue: 0,
      queueDequeue: 0,
      queueDrop: 0,
      pageSuccess: 0,
      pageError: 0,
      milestones: 0,
      errors: 0
    },
    queue: {
      maxSize: 0,
      finalSize: 0,
      uniqueUrls: new Set(),
      dropReasons: {}
    },
    pages: {
      total: 0,
      cached: 0,
      network: 0,
      totalBytes: 0,
      avgDurationMs: 0,
      byHttpStatus: {},
      byDepth: {}
    },
    timeline: [],
    errors: [],
    result: null,
    exitReason: null
  };
  
  let durationSum = 0;
  let durationCount = 0;
  
  for (const event of events) {
    switch (event.type) {
      case EVENT_TYPES.QUEUE_ENQUEUE:
        analysis.counts.queueEnqueue++;
        analysis.queue.maxSize = Math.max(analysis.queue.maxSize, event.queueSize || 0);
        analysis.queue.finalSize = event.queueSize || 0;
        if (event.url) analysis.queue.uniqueUrls.add(event.url);
        break;
        
      case EVENT_TYPES.QUEUE_DEQUEUE:
        analysis.counts.queueDequeue++;
        analysis.queue.finalSize = event.queueSize || 0;
        break;
        
      case EVENT_TYPES.QUEUE_DROP:
        analysis.counts.queueDrop++;
        const reason = event.reason || "unknown";
        analysis.queue.dropReasons[reason] = (analysis.queue.dropReasons[reason] || 0) + 1;
        break;
        
      case EVENT_TYPES.PAGE_SUCCESS:
        analysis.counts.pageSuccess++;
        analysis.pages.total++;
        if (event.cached) analysis.pages.cached++;
        else analysis.pages.network++;
        analysis.pages.totalBytes += event.bytes || 0;
        if (event.durationMs) {
          durationSum += event.durationMs;
          durationCount++;
        }
        const status = event.httpStatus || "unknown";
        analysis.pages.byHttpStatus[status] = (analysis.pages.byHttpStatus[status] || 0) + 1;
        const depth = event.depth ?? "unknown";
        analysis.pages.byDepth[depth] = (analysis.pages.byDepth[depth] || 0) + 1;
        break;
        
      case EVENT_TYPES.PAGE_ERROR:
        analysis.counts.pageError++;
        break;
        
      case EVENT_TYPES.MILESTONE:
        analysis.counts.milestones++;
        analysis.timeline.push({
          lineNum: event.lineNum,
          kind: event.kind,
          message: event.message
        });
        break;
        
      case EVENT_TYPES.ERROR:
        analysis.counts.errors++;
        analysis.errors.push({
          lineNum: event.lineNum,
          message: event.message
        });
        break;
        
      case EVENT_TYPES.RESULT:
        if (event.result === "passed") analysis.result = "passed";
        if (event.result === "failed") analysis.result = "failed";
        if (event.exitReason) analysis.exitReason = event.exitReason;
        break;
    }
  }
  
  // Calculate averages
  if (durationCount > 0) {
    analysis.pages.avgDurationMs = Math.round(durationSum / durationCount);
  }
  
  // Convert Set to count
  analysis.queue.uniqueUrlsCount = analysis.queue.uniqueUrls.size;
  delete analysis.queue.uniqueUrls;
  
  return analysis;
}

// Format bytes
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

// Print human-readable analysis
function printAnalysis(analysis, args) {
  console.log("\n┌─ Crawl Log Analysis ────────────────────────────────────────────────┐\n");
  
  // Result summary
  if (analysis.result || analysis.exitReason) {
    const resultEmoji = analysis.result === "passed" ? "✅" : 
                        analysis.result === "failed" ? "❌" : "➖";
    console.log(`📋 RESULT: ${resultEmoji} ${analysis.result || "unknown"} (exit: ${analysis.exitReason || "unknown"})\n`);
  }
  
  // Event counts
  console.log("📊 EVENT COUNTS:");
  console.log(`   Queue: ${analysis.counts.queueEnqueue} enqueued, ${analysis.counts.queueDequeue} dequeued, ${analysis.counts.queueDrop} dropped`);
  console.log(`   Pages: ${analysis.counts.pageSuccess} success, ${analysis.counts.pageError} error`);
  console.log(`   Other: ${analysis.counts.milestones} milestones, ${analysis.counts.errors} errors\n`);
  
  // Queue dynamics
  if (args.queue || !args.errors) {
    console.log("📈 QUEUE DYNAMICS:");
    console.log(`   Max size: ${analysis.queue.maxSize}`);
    console.log(`   Final size: ${analysis.queue.finalSize}`);
    console.log(`   Unique URLs: ${analysis.queue.uniqueUrlsCount}`);
    if (Object.keys(analysis.queue.dropReasons).length > 0) {
      console.log("   Drop reasons:");
      Object.entries(analysis.queue.dropReasons)
        .sort((a, b) => b[1] - a[1])
        .forEach(([reason, count]) => {
          console.log(`      ${reason}: ${count}`);
        });
    }
    console.log();
  }
  
  // Page metrics
  if (!args.errors && !args.queue) {
    console.log("📄 PAGE METRICS:");
    console.log(`   Total: ${analysis.pages.total} (${analysis.pages.network} network, ${analysis.pages.cached} cached)`);
    console.log(`   Data: ${formatBytes(analysis.pages.totalBytes)}`);
    console.log(`   Avg duration: ${analysis.pages.avgDurationMs}ms`);
    if (Object.keys(analysis.pages.byHttpStatus).length > 0) {
      console.log("   By HTTP status:", Object.entries(analysis.pages.byHttpStatus).map(([k, v]) => `${k}:${v}`).join(", "));
    }
    if (Object.keys(analysis.pages.byDepth).length > 0) {
      console.log("   By depth:", Object.entries(analysis.pages.byDepth).map(([k, v]) => `d${k}:${v}`).join(", "));
    }
    console.log();
  }
  
  // Errors
  if (args.errors || analysis.errors.length > 0) {
    console.log(`⚠️  ERRORS (${analysis.errors.length}):`);
    if (analysis.errors.length === 0) {
      console.log("   (none)");
    } else {
      const toShow = args.limit ? analysis.errors.slice(0, args.limit) : analysis.errors.slice(0, 10);
      toShow.forEach(e => {
        console.log(`   L${e.lineNum}: ${e.message}`);
      });
      if (analysis.errors.length > toShow.length) {
        console.log(`   ... and ${analysis.errors.length - toShow.length} more`);
      }
    }
    console.log();
  }
  
  // Timeline
  if (args.timeline) {
    console.log("🕐 MILESTONE TIMELINE:");
    const toShow = args.limit ? analysis.timeline.slice(0, args.limit) : analysis.timeline.slice(0, 20);
    toShow.forEach(m => {
      console.log(`   L${m.lineNum.toString().padStart(5)}: [${m.kind}] ${m.message}`);
    });
    if (analysis.timeline.length > toShow.length) {
      console.log(`   ... and ${analysis.timeline.length - toShow.length} more`);
    }
    console.log();
  }
  
  console.log("└─────────────────────────────────────────────────────────────────────┘\n");
}

// Main function
async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(`
crawl-log-parse.js — Deep Crawl Log Analysis

USAGE:
  node tools/dev/crawl-log-parse.js <logfile> [options]
  cat log.txt | node tools/dev/crawl-log-parse.js - [options]

OPTIONS:
  --json          Output as JSON
  --errors        Focus on error messages
  --queue         Focus on queue dynamics
  --timeline      Show milestone timeline
  --summary       Show only summary stats
  --limit=N       Limit displayed items
  -v, --verbose   Show more details
  -h, --help      Show this help

EXAMPLES:
  node tools/dev/crawl-log-parse.js tmp/crawl.log
  node tools/dev/crawl-log-parse.js tmp/crawl.log --queue --json
  node tools/dev/crawl-log-parse.js tmp/crawl.log --errors --limit=20
`);
    process.exit(0);
  }
  
  // Read input
  let input;
  let content;
  
  if (args.file === "-") {
    input = process.stdin;
  } else {
    if (!fs.existsSync(args.file)) {
      console.error(`Error: File not found: ${args.file}`);
      process.exit(1);
    }
    
    // Check for UTF-16 BOM and convert if needed
    const buf = fs.readFileSync(args.file);
    if (buf[0] === 0xff && buf[1] === 0xfe) {
      // UTF-16 LE (common from PowerShell Tee-Object)
      content = buf.toString("utf16le").slice(1); // Skip BOM
    } else if (buf[0] === 0xfe && buf[1] === 0xff) {
      // UTF-16 BE
      content = buf.swap16().toString("utf16le").slice(1);
    } else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      // UTF-8 BOM
      content = buf.toString("utf8").slice(1);
    } else {
      content = buf.toString("utf8");
    }
  }
  
  // Parse lines
  const events = [];
  let lineNum = 0;
  
  if (content) {
    // Parse from string content (file with encoding detection)
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      lineNum++;
      const event = parseLine(line, lineNum);
      if (event) events.push(event);
    }
  } else {
    // Parse from stream (stdin)
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    for await (const line of rl) {
      lineNum++;
      const event = parseLine(line, lineNum);
      if (event) events.push(event);
    }
  }
  
  // Analyze
  const analysis = analyzeEvents(events);
  analysis.linesRead = lineNum;
  analysis.eventsParsed = events.length;
  
  // Output
  if (args.json) {
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    printAnalysis(analysis, args);
  }
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
