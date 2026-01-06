#!/usr/bin/env node
"use strict";

/**
 * node-procs.js — Node Process Manager
 * 
 * Lists, identifies, and manages node processes with purpose detection.
 * Helps agents understand what's running and safely stop unwanted processes.
 * 
 * Usage:
 *   node tools/dev/node-procs.js                    # List all node processes
 *   node tools/dev/node-procs.js --json             # JSON output
 *   node tools/dev/node-procs.js --kill-tests       # Kill test processes
 *   node tools/dev/node-procs.js --kill-crawls      # Kill crawl processes
 *   node tools/dev/node-procs.js --kill-all         # Kill all node processes
 *   node tools/dev/node-procs.js --kill <pid>       # Kill specific PID
 *   node tools/dev/node-procs.js --protected        # Show protected processes
 */

const { execSync, spawn } = require("child_process");
const path = require("path");

// Process categories and their detection patterns
const PROCESS_CATEGORIES = {
  jest: {
    label: "Jest Test",
    emoji: "🧪",
    patterns: ["jest", "node_modules\\jest", "npm run test"],
    protected: false
  },
  crawl: {
    label: "Crawler",
    emoji: "🕷️",
    patterns: ["crawl.js", "NewsCrawler", "mini-crawl", "test-guardian"],
    protected: false
  },
  server: {
    label: "Dev Server",
    emoji: "🌐",
    patterns: ["server.js", "dataExplorerServer", "docsViewer", "gazetteerInfo", "unifiedServer"],
    protected: true  // Usually want to keep servers running
  },
  electron: {
    label: "Electron",
    emoji: "⚡",
    patterns: ["electron", "unified-app"],
    protected: true
  },
  vscode: {
    label: "VS Code",
    emoji: "💻",
    patterns: ["Code.exe", "extensionHost", "tsserver"],
    protected: true  // Never kill VS Code
  },
  npm: {
    label: "NPM Script",
    emoji: "📦",
    patterns: ["npm", "npx"],
    protected: false
  },
  mcp: {
    label: "MCP Server",
    emoji: "🔌",
    patterns: ["mcp", "docs-memory"],
    protected: true
  },
  tool: {
    label: "Dev Tool",
    emoji: "🔧",
    patterns: ["js-scan", "js-edit", "md-scan", "svg-", "node-procs", "crawl-status"],
    protected: false
  },
  unknown: {
    label: "Unknown",
    emoji: "❓",
    patterns: [],
    protected: true  // Don't kill unknown processes by default
  }
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    json: args.includes("--json"),
    killTests: args.includes("--kill-tests"),
    killCrawls: args.includes("--kill-crawls"),
    killAll: args.includes("--kill-all"),
    killPid: args.includes("--kill") ? args[args.indexOf("--kill") + 1] : null,
    showProtected: args.includes("--protected"),
    help: args.includes("--help") || args.includes("-h"),
    dryRun: args.includes("--dry-run"),
    verbose: args.includes("-v") || args.includes("--verbose")
  };
}

// Get all node processes with command line info
function getNodeProcesses() {
  try {
    // Step 1: Get basic process info
    const basicResult = execSync(
      `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id,StartTime,WorkingSet64 | ConvertTo-Json -Compress"`,
      { encoding: "utf8", timeout: 10000 }
    );
    
    if (!basicResult.trim()) return [];
    
    const basicProcs = JSON.parse(basicResult);
    const procs = Array.isArray(basicProcs) ? basicProcs : [basicProcs];
    
    // Step 2: Get command lines via WMIC (simpler escaping)
    const enriched = procs.map(proc => {
      try {
        const wmicResult = execSync(
          `wmic process where "ProcessId=${proc.Id}" get CommandLine /format:list`,
          { encoding: "utf8", timeout: 5000 }
        );
        const cmdMatch = wmicResult.match(/CommandLine=(.+)/);
        return {
          Id: proc.Id,
          StartTime: proc.StartTime,
          WorkingSet: proc.WorkingSet64,
          CommandLine: cmdMatch ? cmdMatch[1].trim() : null,
          ParentId: null
        };
      } catch {
        return {
          Id: proc.Id,
          StartTime: proc.StartTime,
          WorkingSet: proc.WorkingSet64,
          CommandLine: null,
          ParentId: null
        };
      }
    });
    
    return enriched;
  } catch (err) {
    if (err.message.includes("Cannot find a process")) {
      return [];
    }
    throw err;
  }
}

// Categorize a process based on its command line
function categorizeProcess(proc) {
  const cmdLine = (proc.CommandLine || "").toLowerCase();
  
  for (const [key, category] of Object.entries(PROCESS_CATEGORIES)) {
    if (key === "unknown") continue;
    
    for (const pattern of category.patterns) {
      if (cmdLine.includes(pattern.toLowerCase())) {
        return { key, ...category };
      }
    }
  }
  
  return { key: "unknown", ...PROCESS_CATEGORIES.unknown };
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
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Format memory usage
function formatMemory(bytes) {
  if (!bytes) return "?";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
}

// Extract meaningful command description
function extractDescription(cmdLine) {
  if (!cmdLine) return "(no command line)";
  
  // Try to extract the script name
  const match = cmdLine.match(/node(?:\.exe)?\s+(?:"([^"]+)"|(\S+))/i);
  if (match) {
    const script = match[1] || match[2];
    // Get just the filename
    return path.basename(script);
  }
  
  // Truncate long command lines
  if (cmdLine.length > 60) {
    return cmdLine.substring(0, 57) + "...";
  }
  
  return cmdLine;
}

// Kill a process by PID
function killProcess(pid, dryRun = false) {
  if (dryRun) {
    console.log(`[DRY-RUN] Would kill PID ${pid}`);
    return { success: true, dryRun: true };
  }
  
  try {
    execSync(`taskkill /F /PID ${pid}`, { encoding: "utf8" });
    return { success: true, pid };
  } catch (err) {
    return { success: false, pid, error: err.message };
  }
}

// Main function
function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(`
node-procs.js — Node Process Manager

USAGE:
  node tools/dev/node-procs.js [options]

OPTIONS:
  --json          Output as JSON
  --kill-tests    Kill all Jest/test processes
  --kill-crawls   Kill all crawler processes
  --kill-all      Kill ALL node processes (dangerous!)
  --kill <pid>    Kill specific process by PID
  --protected     Show which processes are protected
  --dry-run       Show what would be killed without killing
  -v, --verbose   Show full command lines
  -h, --help      Show this help

CATEGORIES:
  🧪 Jest Test    - Test runners (killable)
  🕷️ Crawler      - Crawl processes (killable)
  🌐 Dev Server   - Development servers (protected)
  ⚡ Electron     - Electron apps (protected)
  💻 VS Code      - VS Code processes (protected)
  📦 NPM Script   - NPM/npx processes (killable)
  🔌 MCP Server   - MCP servers (protected)
  🔧 Dev Tool     - CLI dev tools (killable)
  ❓ Unknown      - Unrecognized (protected)

EXAMPLES:
  node tools/dev/node-procs.js                    # List all
  node tools/dev/node-procs.js --kill-tests       # Kill tests
  node tools/dev/node-procs.js --kill 12345       # Kill PID 12345
  node tools/dev/node-procs.js --dry-run --kill-all  # Preview kill-all
`);
    process.exit(0);
  }
  
  const processes = getNodeProcesses();
  
  if (processes.length === 0) {
    if (args.json) {
      console.log(JSON.stringify({ processes: [], count: 0 }));
    } else {
      console.log("No node processes found.");
    }
    process.exit(0);
  }
  
  // Categorize all processes
  const categorized = processes.map(proc => ({
    ...proc,
    category: categorizeProcess(proc),
    runtime: formatRuntime(proc.StartTime),
    memory: formatMemory(proc.WorkingSet),
    description: extractDescription(proc.CommandLine)
  }));
  
  // Handle kill operations
  if (args.killPid) {
    const result = killProcess(parseInt(args.killPid, 10), args.dryRun);
    if (args.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(result.success ? `✓ Killed PID ${args.killPid}` : `✗ Failed: ${result.error}`);
    }
    process.exit(result.success ? 0 : 1);
  }
  
  if (args.killAll || args.killTests || args.killCrawls) {
    let toKill = [];
    
    if (args.killAll) {
      toKill = categorized;
    } else if (args.killTests) {
      toKill = categorized.filter(p => p.category.key === "jest" || p.category.key === "npm");
    } else if (args.killCrawls) {
      toKill = categorized.filter(p => p.category.key === "crawl");
    }
    
    // Filter out protected unless --kill-all
    if (!args.killAll) {
      toKill = toKill.filter(p => !p.category.protected);
    }
    
    const results = toKill.map(p => ({
      pid: p.Id,
      category: p.category.label,
      ...killProcess(p.Id, args.dryRun)
    }));
    
    if (args.json) {
      console.log(JSON.stringify({ killed: results, count: results.length }));
    } else {
      if (results.length === 0) {
        console.log("No matching processes to kill.");
      } else {
        console.log(`${args.dryRun ? "[DRY-RUN] " : ""}Killing ${results.length} process(es):`);
        results.forEach(r => {
          const status = r.success ? "✓" : "✗";
          console.log(`  ${status} PID ${r.pid} (${r.category})`);
        });
      }
    }
    process.exit(0);
  }
  
  // Display process list
  if (args.json) {
    const output = {
      processes: categorized.map(p => ({
        pid: p.Id,
        category: p.category.key,
        categoryLabel: p.category.label,
        protected: p.category.protected,
        runtime: p.runtime,
        memory: p.memory,
        description: p.description,
        commandLine: args.verbose ? p.CommandLine : undefined
      })),
      summary: {
        total: categorized.length,
        byCategory: {}
      }
    };
    
    // Count by category
    categorized.forEach(p => {
      output.summary.byCategory[p.category.key] = (output.summary.byCategory[p.category.key] || 0) + 1;
    });
    
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log("\n┌─ Node Processes ─────────────────────────────────────────────────┐\n");
    
    // Group by category
    const byCategory = {};
    categorized.forEach(p => {
      const key = p.category.key;
      if (!byCategory[key]) byCategory[key] = [];
      byCategory[key].push(p);
    });
    
    for (const [key, procs] of Object.entries(byCategory)) {
      const cat = PROCESS_CATEGORIES[key];
      const protectedTag = cat.protected ? " 🛡️" : "";
      console.log(`${cat.emoji} ${cat.label}${protectedTag} (${procs.length}):`);
      
      procs.forEach(p => {
        const line = `   PID ${p.Id.toString().padEnd(6)} │ ${p.runtime.padEnd(8)} │ ${p.memory.padEnd(8)} │ ${p.description}`;
        console.log(line);
        if (args.verbose && p.CommandLine) {
          console.log(`      └─ ${p.CommandLine}`);
        }
      });
      console.log();
    }
    
    console.log(`└─ Total: ${categorized.length} process(es) ────────────────────────────────────────┘\n`);
    
    if (args.showProtected) {
      console.log("Protected categories (won't be killed by --kill-tests/--kill-crawls):");
      Object.entries(PROCESS_CATEGORIES)
        .filter(([_, v]) => v.protected)
        .forEach(([k, v]) => console.log(`  ${v.emoji} ${v.label}`));
      console.log();
    }
  }
}

main();
