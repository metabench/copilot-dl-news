#!/usr/bin/env node
'use strict';

/**
 * crawl-liveness.check.js — zombie crawl-state tripwire on the Oracle box
 * (task #70, cycle 151; born from the 2026-07-28 incident).
 *
 * For 6.8 days the box's /api/status claimed 4 domains 'running' while the
 * workers were dead: throughput 0, totals.fetched frozen at 12 against a
 * 10,048-URL queue, orchestrator stopped. Nothing went red — the product was
 * silently dead for a week AND the deploy busy-gate refused deploys on the
 * corpse. Two fixes shipped (the engine's heartbeat-loss transition, the deploy
 * tool's two-sample corroboration); this probe is the loop-visible tripwire
 * that fires if the zombie class ever reappears.
 *
 * RED = the zombie SIGNATURE: domain states claim 'running' while the
 * orchestrator reports nothing running and throughput is zero. A genuinely
 * polite slow crawl does not match (its orchestrator is running); with the
 * engine fix deployed, zombies self-heal within ~2 minutes, so a persistent
 * red means the heartbeat-loss transition regressed or a new stale-state class
 * appeared. Confirm with the deploy tool's corroborating dry-run (it takes two
 * spaced samples): node tools/crawl/deploy-remote-server.js
 *
 * An UNREACHABLE box is NOT red here — plane reachability belongs to the
 * remote-endpoints probe; this one only judges what a reachable box says.
 */

const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const { getFleetHostSync } = require(path.join(ROOT, 'tools', 'crawl', 'lib', 'fleet-host-resolver'));
const { classifyBusyStatus } = require(path.join(ROOT, 'tools', 'crawl', 'deploy-remote-server'));

function fetchJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          // A reachable endpoint serving garbage is NOT "unreachable" — a
          // wedged server, an error page, or a proxy interstitial is itself a
          // symptom worth going red for (review catch: this used to pass).
          const bad = new Error(`endpoint reachable but served non-JSON (${error.message}; first bytes: ${JSON.stringify(body.slice(0, 60))})`);
          bad.kind = 'bad-payload';
          reject(bad);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function main() {
  const host = getFleetHostSync();
  const url = `http://${host}:3200/api/status`;

  let status;
  try {
    status = await fetchJson(url, 6000);
  } catch (error) {
    if (error.kind === 'bad-payload') {
      console.log(`🧟 ${url}: ${error.message}`);
      console.log('   The status endpoint answers but does not speak status — a wedged/misbehaving server, not a down one.');
      process.exit(1);
    }
    console.log(`⚪ box unreachable (${error.message}) — liveness not judged; reachability is the remote-endpoints probe's job.`);
    return;
  }

  // classifyBusyStatus is the deploy tool's own single-sample classifier, so
  // probe and gate can never disagree about what they see. RED is only the
  // BARE-states zombie signature (running domains, orchestrator stopped, no
  // throughput) — orchestrator-running-without-throughput is a normal polite
  // crawl between fetches, and judging it needs two spaced samples this fast
  // probe deliberately does not take (the deploy dry-run does).
  const verdict = classifyBusyStatus(status);
  const bareStatesZombie = verdict.runningDomains.length > 0
    && !verdict.orchestratorEvidence && !verdict.activeThroughput;

  if (bareStatesZombie) {
    console.log('🧟 ZOMBIE CRAWL-STATE SIGNATURE on the box:');
    console.log(`   domains claiming 'running': ${verdict.runningDomains.join(', ')}`);
    console.log(`   orchestrator: stopped, currentlyRunning=0 · throughput: 0 · pending: ${verdict.pending}`);
    console.log('   The engine heartbeat-loss transition should clear this within ~2 minutes of it arising —');
    console.log('   a persistent red means that fix regressed on the deployed build, or a new stale-state class.');
    console.log('   Corroborate (two spaced samples): node tools/crawl/deploy-remote-server.js');
    process.exit(1);
  }

  if (verdict.busy) {
    console.log(`✅ box is working (${verdict.liveReasons.join(' · ')})${verdict.activeThroughput ? ' — corroborated by measured throughput.' : ' — orchestrator evidence; the deploy gate corroborates before trusting it.'}`);
  } else {
    console.log(`✅ box idle and honest about it (no running states, no live evidence · pending: ${verdict.pending}).`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.log(`⚪ liveness check errored (${error.message}) — not judged.`);
  });
}
