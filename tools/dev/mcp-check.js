#!/usr/bin/env node
"use strict";

/**
 * MCP Health Check CLI
 * 
 * Verifies MCP servers are responsive before agents attempt tool calls.
 * Prevents agents from getting stuck waiting for unresponsive servers.
 * 
 * Usage:
 *   node tools/dev/mcp-check.js                    # Check all configured servers
 *   node tools/dev/mcp-check.js --server svg-editor # Check specific server
 *   node tools/dev/mcp-check.js --timeout 3000     # Custom timeout (ms)
 *   node tools/dev/mcp-check.js --json             # JSON output for automation
 *   node tools/dev/mcp-check.js --list             # List available servers
 *   node tools/dev/mcp-check.js --quick            # Fast check (initialize only, skip tool test)
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 5000; // 5 seconds
const MCP_CONFIG_PATH = path.join(process.cwd(), ".vscode", "mcp.json");

// ─────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
        server: null,
        timeout: DEFAULT_TIMEOUT,
        json: false,
        list: false,
        quick: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--server" || arg === "-s") {
            opts.server = args[++i];
        } else if (arg === "--timeout" || arg === "-t") {
            opts.timeout = parseInt(args[++i], 10) || DEFAULT_TIMEOUT;
        } else if (arg === "--json" || arg === "-j") {
            opts.json = true;
        } else if (arg === "--list" || arg === "-l") {
            opts.list = true;
        } else if (arg === "--quick" || arg === "-q") {
            opts.quick = true;
        } else if (arg === "--help" || arg === "-h") {
            opts.help = true;
        }
    }

    return opts;
}

function printHelp() {
    console.log(`
MCP Health Check CLI
====================

Verifies MCP servers are responsive before agents attempt tool calls.

Usage:
  node tools/dev/mcp-check.js [options]

Options:
  --server, -s <name>   Check specific server only
  --timeout, -t <ms>    Timeout in milliseconds (default: 5000)
  --json, -j            Output JSON for automation
  --list, -l            List available servers without checking
  --quick, -q           Fast check (spawn only, skip tool listing)
  --help, -h            Show this help

Examples:
  node tools/dev/mcp-check.js                     # Check all servers
  node tools/dev/mcp-check.js --server svg-editor # Check svg-editor only
  node tools/dev/mcp-check.js --quick --json      # Fast JSON health check
  node tools/dev/mcp-check.js --timeout 2000      # 2s timeout

Exit codes:
  0  All checked servers are healthy
  1  One or more servers failed or timed out
  2  Configuration error (missing mcp.json, etc.)
`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Load MCP configuration
// ─────────────────────────────────────────────────────────────────────────────

function loadMcpConfig() {
    if (!fs.existsSync(MCP_CONFIG_PATH)) {
        return { error: `MCP config not found: ${MCP_CONFIG_PATH}` };
    }

    try {
        const content = fs.readFileSync(MCP_CONFIG_PATH, "utf-8");
        // Strip JSONC comments
        const jsonContent = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        const config = JSON.parse(jsonContent);
        return { servers: config.servers || {} };
    } catch (err) {
        return { error: `Failed to parse MCP config: ${err.message}` };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Protocol helpers
// ─────────────────────────────────────────────────────────────────────────────

function createJsonRpcMessage(method, params = {}, id = 1) {
    return JSON.stringify({ jsonrpc: "2.0", method, params, id }) + "\n";
}

// ─────────────────────────────────────────────────────────────────────────────
// Server health check
// ─────────────────────────────────────────────────────────────────────────────

function checkServer(name, config, opts) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const result = {
            name,
            status: "unknown",
            latency: null,
            tools: [],
            error: null
        };

        // Spawn the server process
        const proc = spawn(config.command, config.args || [], {
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, MCP_CHECK_MODE: "1" }
        });

        let stdout = "";
        let stderr = "";
        let responded = false;
        let toolsReceived = false;

        // Timeout handler
        const timeoutId = setTimeout(() => {
            if (!responded) {
                responded = true;
                result.status = "timeout";
                result.error = `No response within ${opts.timeout}ms`;
                result.latency = opts.timeout;
                proc.kill("SIGTERM");
                resolve(result);
            }
        }, opts.timeout);

        proc.stdout.on("data", (data) => {
            stdout += data.toString();
            
            // Look for JSON-RPC responses
            const lines = stdout.split("\n");
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    
                    // Check for initialization response
                    if (msg.result && msg.result.protocolVersion) {
                        result.latency = Date.now() - startTime;
                        result.status = "healthy";
                        
                        if (opts.quick) {
                            responded = true;
                            clearTimeout(timeoutId);
                            proc.kill("SIGTERM");
                            resolve(result);
                            return;
                        }
                        
                        // Request tool list
                        proc.stdin.write(createJsonRpcMessage("tools/list", {}, 2));
                    }
                    
                    // Check for tools list response
                    if (msg.id === 2 && msg.result && msg.result.tools) {
                        toolsReceived = true;
                        result.tools = msg.result.tools.map(t => t.name);
                        responded = true;
                        clearTimeout(timeoutId);
                        proc.kill("SIGTERM");
                        resolve(result);
                        return;
                    }
                } catch (e) {
                    // Not valid JSON, continue
                }
            }
        });

        proc.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        proc.on("error", (err) => {
            if (!responded) {
                responded = true;
                clearTimeout(timeoutId);
                result.status = "error";
                result.error = `Failed to spawn: ${err.message}`;
                result.latency = Date.now() - startTime;
                resolve(result);
            }
        });

        proc.on("close", (code) => {
            if (!responded) {
                responded = true;
                clearTimeout(timeoutId);
                if (code !== 0 && code !== null) {
                    result.status = "error";
                    result.error = `Process exited with code ${code}`;
                    if (stderr) result.error += `: ${stderr.slice(0, 200)}`;
                }
                result.latency = Date.now() - startTime;
                resolve(result);
            }
        });

        // Send initialization request
        const initMessage = createJsonRpcMessage("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "mcp-check", version: "1.0.0" }
        }, 1);
        
        proc.stdin.write(initMessage);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Output formatting
// ─────────────────────────────────────────────────────────────────────────────

function formatHumanOutput(results, opts) {
    console.log("\n" + "═".repeat(60));
    console.log("MCP Server Health Check");
    console.log("═".repeat(60));

    let allHealthy = true;

    for (const r of results) {
        const icon = r.status === "healthy" ? "✅" : r.status === "timeout" ? "⏱️" : "❌";
        const latency = r.latency ? `${r.latency}ms` : "—";
        
        console.log(`\n${icon} ${r.name}`);
        console.log(`   Status: ${r.status.toUpperCase()}`);
        console.log(`   Latency: ${latency}`);
        
        if (r.tools.length > 0) {
            console.log(`   Tools: ${r.tools.length} available`);
            if (!opts.quick) {
                for (const tool of r.tools.slice(0, 10)) {
                    console.log(`     • ${tool}`);
                }
                if (r.tools.length > 10) {
                    console.log(`     ... and ${r.tools.length - 10} more`);
                }
            }
        }
        
        if (r.error) {
            console.log(`   Error: ${r.error}`);
        }

        if (r.status !== "healthy") {
            allHealthy = false;
        }
    }

    console.log("\n" + "─".repeat(60));
    if (allHealthy) {
        console.log("✅ All servers healthy");
    } else {
        console.log("⚠️  Some servers unhealthy — agents should use CLI fallbacks");
    }
    console.log("");

    return allHealthy;
}

function formatJsonOutput(results) {
    const summary = {
        timestamp: new Date().toISOString(),
        allHealthy: results.every(r => r.status === "healthy"),
        servers: results
    };
    console.log(JSON.stringify(summary, null, 2));
    return summary.allHealthy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    const opts = parseArgs();

    if (opts.help) {
        printHelp();
        process.exit(0);
    }

    // Load configuration
    const configResult = loadMcpConfig();
    if (configResult.error) {
        if (opts.json) {
            console.log(JSON.stringify({ error: configResult.error, allHealthy: false }));
        } else {
            console.error(`❌ ${configResult.error}`);
        }
        process.exit(2);
    }

    const servers = configResult.servers;
    const serverNames = Object.keys(servers);

    if (serverNames.length === 0) {
        if (opts.json) {
            console.log(JSON.stringify({ error: "No MCP servers configured", allHealthy: false }));
        } else {
            console.error("❌ No MCP servers configured in .vscode/mcp.json");
        }
        process.exit(2);
    }

    // List mode
    if (opts.list) {
        if (opts.json) {
            console.log(JSON.stringify({ servers: serverNames }));
        } else {
            console.log("\nConfigured MCP Servers:");
            for (const name of serverNames) {
                const cfg = servers[name];
                console.log(`  • ${name}: ${cfg.command} ${(cfg.args || []).join(" ")}`);
            }
            console.log("");
        }
        process.exit(0);
    }

    // Filter to specific server if requested
    const toCheck = opts.server
        ? { [opts.server]: servers[opts.server] }
        : servers;

    if (opts.server && !servers[opts.server]) {
        const msg = `Server "${opts.server}" not found. Available: ${serverNames.join(", ")}`;
        if (opts.json) {
            console.log(JSON.stringify({ error: msg, allHealthy: false }));
        } else {
            console.error(`❌ ${msg}`);
        }
        process.exit(2);
    }

    // Check servers
    const results = [];
    for (const [name, config] of Object.entries(toCheck)) {
        const result = await checkServer(name, config, opts);
        results.push(result);
    }

    // Output
    const allHealthy = opts.json
        ? formatJsonOutput(results)
        : formatHumanOutput(results, opts);

    process.exit(allHealthy ? 0 : 1);
}

main().catch(err => {
    console.error("❌ Unexpected error:", err.message);
    process.exit(2);
});
