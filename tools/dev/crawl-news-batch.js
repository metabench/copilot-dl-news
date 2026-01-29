#!/usr/bin/env node
'use strict';

// Long-running batch crawl harness:
// 1) Clone gazetteer-only DB into a fresh directory
// 2) Start crawl daemon if not running
// 3) Enqueue a host list (target ~500+ downloads per host)
// 4) Poll jobs until completion
// 5) Run place/topic hub matrix checks
// 6) Emit JSON logs for diagnostics

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { setTimeout: delay } = require('timers/promises');
const { findProjectRoot } = require('../../src/utils/project-root');
const { CliArgumentParser } = require('../../src/utils/CliArgumentParser');

const projectRoot = findProjectRoot(__dirname);

function logEvent(type, data = {}) {
  const payload = { type, ts: new Date().toISOString(), ...data };
  console.log(JSON.stringify(payload));
}

function parseJsonSafe(str) {
  try { return JSON.parse(str); } catch (_) { return null; }
}

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, {
    cwd: projectRoot,
    encoding: 'utf-8',
    ...options
  });
  return {
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || ''
  };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function parseArgs(argv) {
  const parser = new CliArgumentParser(
    'crawl-news-batch',
    'End-to-end batch crawl with gazetteer-only DB and hub checks'
  );
  parser
    .add('--source <path>', 'Source DB (with gazetteer)', 'data/news.db')
    .add('--dest-dir <path>', 'Destination directory for fresh DB', 'tmp/crawl-batch')
    .add('--max-pages <n>', 'Max pages per host', 650)
    .add('--hosts <csv>', 'Comma-separated host list (https:// prefix will be added)')
    .add('--poll-ms <n>', 'Poll interval (ms)', 15000)
    .add('--max-polls <n>', 'Max poll iterations per job', 400)
    .add('--quiet', 'Minimal stdout (JSON only)', false, 'boolean');
  return parser.parse(argv);
}

function defaultHosts() {
  return [
    'guardian.co.uk',
    'bbc.co.uk',
    'nytimes.com',
    'washingtonpost.com',
    'reuters.com',
    'apnews.com',
    'cnn.com',
    'foxnews.com',
    'aljazeera.com',
    'dw.com',
    'france24.com',
    'abc.net.au',
    'smh.com.au',
    'thehindu.com',
    'timesofindia.com',
    'nikkei.com',
    'asahi.com',
    'koreaherald.com',
    'cbc.ca',
    'elpais.com'
  ];
}

async function main() {
  const args = parseArgs(process.argv);
  const hosts = args.hosts ? args.hosts.split(',').map((h) => h.trim()).filter(Boolean) : defaultHosts();
  const destDir = path.isAbsolute(args.destDir) ? args.destDir : path.join(projectRoot, args.destDir);
  ensureDir(destDir);
  const destDb = path.join(destDir, 'news-gazetteer-only.db');
  const sourceDb = path.isAbsolute(args.source) ? args.source : path.join(projectRoot, args.source);
  const envBase = { ...process.env, DB_PATH: destDb };

  // Step 1: clone DB
  logEvent('clone.start', { source: sourceDb, dest: destDb });
  const clone = run('node', [
    'tools/dev/db-clone-gazetteer.js',
    '--source', sourceDb,
    '--dest', destDb,
    '--overwrite',
    '--json'
  ]);
  const cloneJson = parseJsonSafe(clone.stdout);
  logEvent('clone.result', { code: clone.code, summary: cloneJson, stderr: clone.stderr?.trim() });
  if (clone.code !== 0) {
    process.exit(clone.code || 1);
  }

  // Step 2: ensure daemon running
  const status = run('node', ['tools/dev/crawl-daemon.js', 'status', '--json']);
  const statusJson = parseJsonSafe(status.stdout);
  const needsStart = status.code !== 0 || (statusJson && statusJson.status !== 'running');
  if (needsStart) {
    logEvent('daemon.start');
    const started = run('node', ['tools/dev/crawl-daemon.js', 'start']);
    logEvent('daemon.result', { code: started.code, stdout: started.stdout.trim(), stderr: started.stderr.trim() });
    if (started.code !== 0) {
      process.exit(started.code || 1);
    }
  } else {
    logEvent('daemon.already_running');
  }

  // Step 3: enqueue jobs
  const jobs = [];
  for (const host of hosts) {
    const url = `https://${host}`;
    const started = run('node', [
      'tools/dev/crawl-api.js',
      'jobs',
      'start',
      'siteExplorer',
      url,
      '-n', String(args.maxPages),
      '--json'
    ], { env: envBase });
    const payload = parseJsonSafe(started.stdout) || {};
    const jobId = payload?.jobId || payload?.id || null;
    jobs.push({ host, url, jobId, startCode: started.code, startRaw: payload, stderr: started.stderr?.trim() });
    logEvent('job.enqueued', { host, jobId, code: started.code, stderr: started.stderr?.trim() });
    if (started.code !== 0 || !jobId) {
      logEvent('job.enqueue_failed', { host, jobId, stdout: started.stdout, stderr: started.stderr });
    }
  }

  // Step 4: poll jobs
  for (const job of jobs) {
    if (!job.jobId) continue;
    let polls = 0;
    let lastStatus = null;
    while (polls < args.maxPolls) {
      const res = run('node', ['tools/dev/crawl-api.js', 'jobs', 'get', String(job.jobId), '--json'], { env: envBase });
      const json = parseJsonSafe(res.stdout) || {};
      lastStatus = json?.status || json?.state || null;
      logEvent('job.poll', { jobId: job.jobId, host: job.host, status: lastStatus, code: res.code });
      if (lastStatus === 'completed' || lastStatus === 'failed' || lastStatus === 'stopped') break;
      await delay(args.pollMs);
      polls += 1;
    }
    job.finalStatus = lastStatus;
    job.polls = polls;
  }

  // Step 5: run hub matrix checks
  const checks = [];
  const placeCheck = run('node', ['src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js'], { env: envBase });
  checks.push({ name: 'place-matrix', code: placeCheck.code, stdout: placeCheck.stdout, stderr: placeCheck.stderr });
  logEvent('check.place', { code: placeCheck.code });

  const topicCheck = run('node', ['src/ui/server/topicHubGuessing/checks/topicHubGuessing.matrix.check.js'], { env: envBase });
  checks.push({ name: 'topic-matrix', code: topicCheck.code, stdout: topicCheck.stdout, stderr: topicCheck.stderr });
  logEvent('check.topic', { code: topicCheck.code });

  // Final summary
  const summary = {
    db: destDb,
    clone: cloneJson,
    jobs,
    checks: checks.map(({ name, code }) => ({ name, code })),
  };
  logEvent('summary', summary);

  const failed =
    (clone.code !== 0) ||
    jobs.some((j) => j.startCode !== 0 || !j.jobId) ||
    jobs.some((j) => j.finalStatus && j.finalStatus !== 'completed') ||
    checks.some((c) => c.code !== 0);

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  logEvent('fatal', { error: err?.message || String(err) });
  process.exit(1);
});
