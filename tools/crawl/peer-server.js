#!/usr/bin/env node
'use strict';

/**
 * peer-server.js — CLI entry point for running a NewsCrawler peer.
 *
 * Starts a P2P-capable crawl server backed by the full NewsCrawler engine.
 * Each domain gets its own NewsCrawler instance with all intelligence,
 * planning, and self-healing capabilities.
 *
 * Usage:
 *   node tools/crawl/peer-server.js --domains bbc.com,reuters.com --port 3200
 *   node tools/crawl/peer-server.js --config crawl-domains.json --port 3200
 *   node tools/crawl/peer-server.js --domains bbc.com --crawl-type intelligent --auto-start
 *
 * Options:
 *   --domains <list>       Comma-separated domain list
 *   --config <file>        JSON config file (same format as deploy/remote-crawler-v2/domains.json)
 *   --port <n>             Port to bind (default: 3200)
 *   --host <ip>            Host to bind (default: 0.0.0.0)
 *   --node-id <id>         Custom node identifier
 *   --max-concurrent <n>   Max domains crawling concurrently (default: 5)
 *   --crawl-type <type>    Default crawl type: basic, intelligent, gazetteer (default: basic)
 *   --max-pages <n>        Default max pages per domain (default: 200)
 *   --data-dir <path>      Data directory for databases (default: data)
 *   --auto-start           Start crawling all domains immediately
 *   --hub <url>            Register with a hub node for coordination
 *   --help                 Show this help
 */

const path = require('path');
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const eqIndex = token.indexOf('=');
    if (eqIndex !== -1) {
      args[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
╔══════════════════════════════════════════════╗
║  NewsCrawler Peer Server                     ║
║  P2P distributed crawling with full engine   ║
╚══════════════════════════════════════════════╝

Usage:
  node tools/crawl/peer-server.js --domains bbc.com,reuters.com --port 3200
  node tools/crawl/peer-server.js --config domains.json --auto-start
  node tools/crawl/peer-server.js --domains bbc.com --crawl-type intelligent

Options:
  --domains <list>       Comma-separated domain list
  --config <file>        JSON config file with { domains: [...] }
  --port <n>             Port to bind (default: 3200)
  --host <ip>            Host to bind (default: 0.0.0.0)
  --node-id <id>         Custom node identifier
  --max-concurrent <n>   Max domains crawling concurrently (default: 5)
  --crawl-type <type>    Default crawl type: basic, intelligent, gazetteer
  --max-pages <n>        Default max pages per domain (default: 200)
  --data-dir <path>      Data directory for databases (default: data)
  --per-domain-db        Use a separate DB per domain instead of shared news.db
  --auto-start           Start crawling all domains immediately
  --hub <url>            Register with a hub node
  --help                 Show this help

API Endpoints (once running):
  GET  /api/health           Health check
  GET  /api/status           Full multi-domain status
  GET  /api/domains          List domains
  POST /api/crawl/start      Start crawling { domain?, domains?, maxPages? }
  POST /api/crawl/stop       Stop crawling { domain? }
  POST /api/seed             Seed URLs { domain, urls }
  GET  /api/export/batch     Watermark-based incremental export
  GET  /api/export/full      Full export
  GET  /api/intelligence     Domain intelligence
  GET  /api/peers            List connected peers
  POST /api/peers/announce   Register as a peer
  GET  /api/config           Runtime configuration
  GET  /api/runs             Crawl run history
`);
}

function loadDomainConfigs(args) {
  const maxPages = parseInt(args['max-pages'], 10) || 200;
  const crawlType = args['crawl-type'] || 'basic';

  // From config file
  if (args.config) {
    const configPath = path.resolve(args.config);
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const rawDomains = parsed.domains || [];
    return rawDomains.map(d => {
      if (typeof d === 'string') return { domain: d, maxPages, crawlType };
      return {
        domain: d.domain || d.host,
        maxPages: d.maxPages || maxPages,
        crawlType: d.crawlType || crawlType,
        seedUrls: d.seedUrls || [],
      };
    }).filter(d => d && d.domain);
  }

  // From --domains flag
  if (args.domains) {
    return String(args.domains).split(',').map(d => d.trim()).filter(Boolean).map(domain => ({
      domain,
      maxPages,
      crawlType,
    }));
  }

  return [];
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help || args.h) {
    printHelp();
    return 0;
  }

  const domainConfigs = loadDomainConfigs(args);
  if (domainConfigs.length === 0) {
    console.error('Error: No domains specified. Use --domains or --config.');
    console.error('Run with --help for usage info.');
    process.exit(1);
  }

  const port = parseInt(args.port, 10) || 3200;
  const host = args.host || '0.0.0.0';
  const nodeId = args['node-id'] || undefined;
  const maxConcurrent = parseInt(args['max-concurrent'], 10) || 5;
  const dataDir = args['data-dir'] || path.join(process.cwd(), 'data');

  // Lazy-load heavy modules only when actually running
  const { createPeerServer } = require('../../src/core/crawler/remote/PeerCrawlServer');
  const NewsCrawler = require('../../src/core/crawler/NewsCrawler');

  // Use shared news.db by default (matches repo production persistence convention).
  // With --per-domain-db, each domain gets an isolated file.
  const usePerDomainDb = Boolean(args['per-domain-db']);

  /**
   * Factory function that creates a NewsCrawler instance for a given domain.
   */
  function crawlerFactory(domain, options) {
    const startUrl = `https://${domain}`;
    const dbPath = usePerDomainDb
      ? path.join(dataDir, `peer-${domain.replace(/\./g, '_')}.db`)
      : path.join(dataDir, 'news.db');

    const crawlerOpts = {
      crawlType: options.crawlType || 'basic',
      maxDownloads: options.maxDownloads || options.maxPages || 200,
      dataDir,
      dbPath,
      enableDb: true,
      fastStart: true,
      concurrency: 1,
      outputVerbosity: 'minimal',
      loggingQueue: false,
      loggingNetwork: false,
      progressJson: true,
    };

    return new NewsCrawler(startUrl, crawlerOpts);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  NewsCrawler Peer Server                     ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Domains:        ${domainConfigs.map(d => d.domain).join(', ')}`);
  console.log(`  Crawl type:     ${domainConfigs[0]?.crawlType || 'basic'}`);
  console.log(`  Max concurrent: ${maxConcurrent}`);
  console.log(`  Data dir:       ${dataDir}`);
  console.log('');

  const server = createPeerServer({
    nodeId,
    port,
    host,
    maxConcurrent,
    crawlerFactory,
    domains: domainConfigs,
  });

  const address = await server.start();

  console.log(`  API:  http://${address.host}:${address.port}/api/health`);
  console.log(`  Node: ${address.nodeId}`);
  console.log('');

  // Auto-start if requested
  if (args['auto-start']) {
    console.log('  [auto-start] Starting crawl on all domains...');
    const app = server.app;
    // Use the internal orchestrator to start all
    const { orchestrator } = server;
    for (const [domain, entry] of orchestrator.workers) {
      if (orchestrator.getRunningCount() >= maxConcurrent) {
        console.log(`  [auto-start] Deferred ${domain} (max concurrent reached)`);
        break;
      }
      const result = entry.adapter.start({ maxDownloads: entry.config.maxPages || 200 });
      if (result.started) {
        entry.state = 'running';
        console.log(`  [auto-start] Started: ${domain}`);
      }
    }
    console.log('');
  }

  // Register with hub if specified
  if (args.hub) {
    const { createAnnouncement } = require('../../src/core/crawler/remote/PeerProtocol');
    const announcement = createAnnouncement({
      nodeId: address.nodeId,
      baseUrl: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`,
      domains: domainConfigs.map(d => d.domain),
    });

    try {
      const response = await fetch(`${args.hub}/api/peers/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(announcement),
      });
      const result = await response.json();
      console.log(`  [hub] Registered with hub: ${args.hub}`);
      console.log(`  [hub] Hub node: ${result.hubNodeId}, Peer count: ${result.peerCount}`);
    } catch (err) {
      console.warn(`  [hub] Failed to register with hub: ${err.message}`);
    }
    console.log('');
  }

  // Graceful shutdown
  let stopping = false;
  const handleSignal = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n  Stopping peer server (${signal})...`);
    await server.stop();
    console.log('  Peer server stopped.');
    process.exit(0);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  return 0;
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err.message || err);
    process.exit(1);
  });
}

module.exports = { main, parseArgs, loadDomainConfigs };
