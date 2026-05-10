#!/usr/bin/env node
/**
 * orchestrate.js — "do the right thing" launcher
 * ════════════════════════════════════════════════
 *
 * One command for the common case:
 *   1. Probes the remote crawler /api/health (short timeout).
 *   2. If remote is healthy → spawns crawl-remote.js with `--remote` args.
 *   3. If not → falls back to a local profile (default: local-news-10x1000).
 *   4. Reports the Cloud Crawl URL the user can open in Electron.
 *
 * The user does not need to remember whether to use remote, sync, pull,
 * bounded, or cloud-crawl for the common 10x1000 case. Profiles like
 * news-10x1000 set tool=orchestrate and pass the remote-friendly flags;
 * orchestrate forwards them to crawl-remote when remote is up.
 */

'use strict';

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { decideOrchestration } = require('./lib/orchestrate-policy');

const argv = process.argv.slice(2);
const args = {};
const passthrough = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg.startsWith('--')) {
    const eqIdx = arg.indexOf('=');
    let key, value;
    if (eqIdx !== -1) {
      key = arg.slice(2, eqIdx);
      value = arg.slice(eqIdx + 1);
    } else {
      key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        value = next;
        i++;
      } else {
        value = true;
      }
    }
    args[key] = value;
    if (value === true) passthrough.push(`--${key}`);
    else passthrough.push(`--${key}`, String(value));
  } else {
    passthrough.push(arg);
  }
}

if (args.help || args.h) {
  console.log(`orchestrate.js — smart launcher
Usage: node tools/crawl/orchestrate.js [options]
Options:
  --host <host:port>     Remote crawler endpoint (default 141.144.193.218:3200)
  --health-timeout <ms>  Remote health probe timeout (default 1500)
  --no-fallback          Fail if remote is unavailable (skip local fallback)
  --local-profile <name> Local fallback profile (default local-news-10x1000)
  --ui-url <url>         Cloud Crawl URL to print on launch (default http://localhost:3170/?app=cloud-crawl)
  --dry-run              Print decision and the would-be command, then exit
  All other flags are forwarded to crawl-remote.js when remote is healthy.
`);
  process.exit(0);
}

const REMOTE_HOST = args.host || process.env.CRAWL_REMOTE_HOST || '141.144.193.218:3200';
const HEALTH_TIMEOUT = Number(args['health-timeout']) || 1500;
const ALLOW_FALLBACK = args['no-fallback'] !== true;
const LOCAL_PROFILE = args['local-profile'] || 'local-news-10x1000';
const UI_URL = args['ui-url'] || process.env.CLOUD_CRAWL_UI_URL || 'http://localhost:3170/?app=cloud-crawl';
const DRY_RUN = args['dry-run'] === true;

function probeRemoteHealth(host, timeoutMs) {
  return new Promise((resolve) => {
    const [hostname, portStr] = String(host).split(':');
    const req = http.request({
      method: 'GET',
      hostname,
      port: Number(portStr) || 3200,
      path: '/api/health',
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve({ ok: true, body: JSON.parse(data) });
          } catch (_) {
            resolve({ ok: true, body: null });
          }
        } else {
          resolve({ ok: false, error: `health status ${res.statusCode}` });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `timeout after ${timeoutMs}ms` }); });
    req.end();
  });
}

(async () => {
  let probe;
  try {
    probe = await probeRemoteHealth(REMOTE_HOST, HEALTH_TIMEOUT);
  } catch (err) {
    probe = { ok: false, error: err.message };
  }

  const decision = decideOrchestration({
    remoteAvailable: probe.ok,
    remoteHealthError: probe.error || null,
    remoteProfile: 'remote-news-10x1000',
    localFallback: LOCAL_PROFILE,
    allowFallback: ALLOW_FALLBACK,
    remoteHost: REMOTE_HOST,
    uiUrl: UI_URL,
  });

  console.log(`[orchestrate] ${decision.message}`);
  if (decision.uiHint) console.log(`[orchestrate] Open Cloud Crawl: ${decision.uiHint}`);

  if (decision.mode === 'fail') {
    process.exitCode = 2;
    return;
  }

  let toolScript;
  let toolArgs;
  if (decision.mode === 'remote') {
    toolScript = path.join(__dirname, 'crawl-remote.js');
    // Forward only flags that crawl-remote understands; `--host` is meaningful, so include it.
    toolArgs = ['run', ...filterPassthroughForRemote(passthrough), '--host', REMOTE_HOST];
  } else {
    // local fallback: spawn the unified launcher with the local profile
    toolScript = path.join(__dirname, 'index.js');
    toolArgs = ['profile', LOCAL_PROFILE];
  }

  if (DRY_RUN) {
    console.log(`[orchestrate] DRY-RUN: would run: node ${toolScript} ${toolArgs.join(' ')}`);
    return;
  }

  const child = spawn(process.execPath, [toolScript, ...toolArgs], { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
})();

function filterPassthroughForRemote(tokens) {
  // Strip orchestrator-only flags that crawl-remote doesn't know about.
  const drop = new Set(['--health-timeout', '--no-fallback', '--local-profile', '--ui-url', '--dry-run']);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (drop.has(tok)) {
      // skip flag and its value if next isn't another flag
      const next = tokens[i + 1];
      if (next && !next.startsWith('--')) i++;
      continue;
    }
    out.push(tok);
  }
  return out;
}
