#!/usr/bin/env node
'use strict';

/**
 * crawl-api.js — AI Agent CLI for interacting with the Crawl Daemon API
 * 
 * Provides a simple, scriptable interface for AI agents to:
 * - Start/stop/manage crawl jobs
 * - Query crawl status
 * - List available operations
 * 
 * All output is designed to be machine-readable (JSON) by default.
 * 
 * Usage:
 *   node tools/dev/crawl-api.js status              # Daemon status
 *   node tools/dev/crawl-api.js jobs list           # List jobs
 *   node tools/dev/crawl-api.js jobs start <op> <url> [--json]
 *   node tools/dev/crawl-api.js jobs stop <jobId>
 *   node tools/dev/crawl-api.js ops list            # List operations
 */

const http = require('http');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const DEFAULT_PORT = 3099;
const DEFAULT_HOST = 'localhost';

function getApiConfig() {
  return {
    host: process.env.CRAWL_API_HOST || DEFAULT_HOST,
    port: parseInt(process.env.CRAWL_API_PORT, 10) || DEFAULT_PORT,
    basePath: '/v1'
  };
}

// ─────────────────────────────────────────────────────────────
// HTTP Client
// ─────────────────────────────────────────────────────────────

function apiRequest(method, path, body = null) {
  const config = getApiConfig();
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: config.host,
      port: config.port,
      path: path.startsWith('/') ? path : `${config.basePath}${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: json });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data, parseError: true });
        }
      });
    });
    
    req.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        reject(new Error('Daemon not running. Start with: node src/cli/crawl/daemon.js --start --detach'));
      } else {
        reject(e);
      }
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────

async function cmdStatus(flags) {
  try {
    const result = await apiRequest('GET', '/healthz');
    
    if (flags.json) {
      console.log(JSON.stringify({
        running: true,
        ...result.data
      }, null, 2));
    } else {
      console.log('✅ Daemon running');
      console.log(`   Service: ${result.data.service}`);
      console.log(`   Version: ${result.data.version}`);
    }
    return 0;
  } catch (e) {
    if (flags.json) {
      console.log(JSON.stringify({ running: false, error: e.message }));
    } else {
      console.log('❌ Daemon not running');
      console.log(`   ${e.message}`);
    }
    return 1;
  }
}

async function cmdJobsList(flags) {
  try {
    const result = await apiRequest('GET', '/v1/jobs');
    
    if (flags.json) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      const jobs = result.data.items || [];
      if (jobs.length === 0) {
        console.log('No jobs found');
      } else {
        console.log(`\n📋 Jobs (${jobs.length}):\n`);
        for (const job of jobs) {
          const statusIcon = job.status === 'running' ? '🔄' : job.status === 'completed' ? '✅' : '❌';
          console.log(`  ${statusIcon} ${job.id}`);
          console.log(`     Operation: ${job.operationName} → ${job.startUrl}`);
          console.log(`     Status: ${job.status} | Started: ${job.startedAt || 'N/A'}`);
          console.log();
        }
      }
    }
    return 0;
  } catch (e) {
    if (flags.json) {
      console.log(JSON.stringify({ error: e.message }));
    } else {
      console.error('Error:', e.message);
    }
    return 1;
  }
}

async function cmdJobsGet(jobId, flags) {
  try {
    const result = await apiRequest('GET', `/v1/jobs/${jobId}`);
    
    if (flags.json) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      const job = result.data.job;
      if (!job) {
        console.log('Job not found');
        return 1;
      }
      console.log(`\n📋 Job: ${job.id}\n`);
      console.log(`  Operation: ${job.operationName}`);
      console.log(`  URL: ${job.startUrl}`);
      console.log(`  Status: ${job.status}`);
      console.log(`  Started: ${job.startedAt || 'N/A'}`);
      console.log(`  Finished: ${job.finishedAt || 'N/A'}`);
      if (job.paused) console.log('  ⏸ PAUSED');
      if (job.abortRequested) console.log('  🛑 ABORT REQUESTED');
    }
    return 0;
  } catch (e) {
    if (flags.json) {
      console.log(JSON.stringify({ error: e.message }));
    } else {
      console.error('Error:', e.message);
    }
    return 1;
  }
}

async function cmdJobsStart(operationName, startUrl, overrides, flags) {
  try {
    const body = {
      startUrl,
      overrides: overrides || {}
    };
    
    const result = await apiRequest('POST', `/v1/operations/${operationName}/start`, body);
    
    if (flags.json) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      if (result.data.status === 'ok') {
        console.log(`✅ Job started: ${result.data.jobId}`);
        console.log(`   Operation: ${operationName}`);
        console.log(`   URL: ${startUrl}`);
        console.log(`\n   Monitor with: node tools/dev/crawl-api.js jobs get ${result.data.jobId}`);
      } else {
        console.log('❌ Failed to start job');
        console.log(`   ${result.data.error?.message || 'Unknown error'}`);
      }
    }
    return result.data.status === 'ok' ? 0 : 1;
  } catch (e) {
    if (flags.json) {
      console.log(JSON.stringify({ error: e.message }));
    } else {
      console.error('Error:', e.message);
    }
    return 1;
  }
}

async function cmdJobsAction(jobId, action, flags) {
  try {
    const result = await apiRequest('POST', `/v1/jobs/${jobId}/${action}`);
    
    if (flags.json) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      if (result.data.status === 'ok') {
        console.log(`✅ Job ${action}: ${jobId}`);
      } else {
        console.log(`❌ Failed to ${action} job`);
        console.log(`   ${result.data.error?.message || 'Unknown error'}`);
      }
    }
    return result.data.status === 'ok' ? 0 : 1;
  } catch (e) {
    if (flags.json) {
      console.log(JSON.stringify({ error: e.message }));
    } else {
      console.error('Error:', e.message);
    }
    return 1;
  }
}

async function cmdOpsList(flags) {
  try {
    const result = await apiRequest('GET', '/v1/availability?all=true');
    
    if (flags.json) {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      const ops = result.data.availability?.operations || [];
      const seqs = result.data.availability?.sequences || [];
      
      console.log(`\n📋 Operations (${ops.length}):\n`);
      for (const op of ops) {
        console.log(`  • ${op.name}`);
        if (op.summary) console.log(`    ${op.summary}`);
      }
      
      if (seqs.length > 0) {
        console.log(`\n📋 Sequences (${seqs.length}):\n`);
        for (const seq of seqs) {
          console.log(`  • ${seq.name} (${seq.stepCount} steps)`);
          if (seq.description) console.log(`    ${seq.description}`);
        }
      }
    }
    return 0;
  } catch (e) {
    if (flags.json) {
      console.log(JSON.stringify({ error: e.message }));
    } else {
      console.error('Error:', e.message);
    }
    return 1;
  }
}

// ─────────────────────────────────────────────────────────────
// CLI Parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    help: false,
    json: false,
    overrides: {}
  };
  const positional = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    if (arg === '-h' || arg === '--help') {
      flags.help = true;
    } else if (arg === '-j' || arg === '--json') {
      flags.json = true;
    } else if (arg === '--max-pages' || arg === '-n') {
      flags.overrides.maxDownloads = parseInt(next, 10);
      i++;
    } else if (arg === '--max-depth') {
      flags.overrides.maxDepth = parseInt(next, 10);
      i++;
    } else if (arg === '--timeout') {
      flags.overrides.crawlTimeoutMs = parseInt(next, 10);
      i++;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }
  
  return { flags, positional };
}

function printHelp() {
  console.log(`
crawl-api.js — AI Agent CLI for Crawl Daemon API

USAGE:
  node tools/dev/crawl-api.js <command> [options]

COMMANDS:
  status                           Check if daemon is running
  jobs list                        List all jobs
  jobs get <jobId>                 Get job details
  jobs start <op> <url>            Start a crawl job
  jobs stop <jobId>                Stop a running job
  jobs pause <jobId>               Pause a running job
  jobs resume <jobId>              Resume a paused job
  ops list                         List available operations

OPTIONS:
  -j, --json                       Output as JSON (default for scripts)
  -n, --max-pages <n>              Max pages to crawl (for start)
  --max-depth <n>                  Max crawl depth (for start)
  --timeout <ms>                   Crawl timeout (for start)
  -h, --help                       Show this help

EXAMPLES:
  # Check daemon status
  node tools/dev/crawl-api.js status

  # Start a site explorer crawl (JSON output for AI)
  node tools/dev/crawl-api.js jobs start siteExplorer https://bbc.com -n 100 --json

  # Monitor job progress
  node tools/dev/crawl-api.js jobs get <jobId> --json

  # Stop a running job
  node tools/dev/crawl-api.js jobs stop <jobId>

AI AGENT WORKFLOW:
  1. Start daemon:    node src/cli/crawl/daemon.js --start --detach
  2. Start crawl:     node tools/dev/crawl-api.js jobs start siteExplorer <url> --json
  3. Monitor:         node tools/dev/crawl-api.js jobs get <jobId> --json
  4. Use crawl-live:  node tools/dev/crawl-live.js --task <taskId> --json
`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const { flags, positional } = parseArgs(process.argv);
  
  if (flags.help || positional.length === 0) {
    printHelp();
    process.exit(0);
  }
  
  const [cmd, subcmd, ...rest] = positional;
  
  let exitCode = 0;
  
  try {
    switch (cmd) {
      case 'status':
        exitCode = await cmdStatus(flags);
        break;
        
      case 'jobs':
        switch (subcmd) {
          case 'list':
            exitCode = await cmdJobsList(flags);
            break;
          case 'get':
            if (!rest[0]) {
              console.error('Error: Job ID required');
              exitCode = 1;
            } else {
              exitCode = await cmdJobsGet(rest[0], flags);
            }
            break;
          case 'start':
            if (!rest[0] || !rest[1]) {
              console.error('Error: Operation name and URL required');
              console.error('Usage: jobs start <operation> <url>');
              exitCode = 1;
            } else {
              exitCode = await cmdJobsStart(rest[0], rest[1], flags.overrides, flags);
            }
            break;
          case 'stop':
          case 'pause':
          case 'resume':
            if (!rest[0]) {
              console.error(`Error: Job ID required for ${subcmd}`);
              exitCode = 1;
            } else {
              exitCode = await cmdJobsAction(rest[0], subcmd, flags);
            }
            break;
          default:
            console.error(`Unknown jobs command: ${subcmd}`);
            exitCode = 1;
        }
        break;
        
      case 'ops':
        switch (subcmd) {
          case 'list':
            exitCode = await cmdOpsList(flags);
            break;
          default:
            console.error(`Unknown ops command: ${subcmd}`);
            exitCode = 1;
        }
        break;
        
      default:
        console.error(`Unknown command: ${cmd}`);
        exitCode = 1;
    }
  } catch (e) {
    if (flags.json) {
      console.log(JSON.stringify({ error: e.message }));
    } else {
      console.error('Error:', e.message);
    }
    exitCode = 1;
  }
  
  process.exit(exitCode);
}

main();
