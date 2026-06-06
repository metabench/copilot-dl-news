'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const {
  buildFixturePlan,
  startFixtureServers,
} = require('./local-fixture-server');
const {
  buildCrawlPacketComparison,
  buildCrawlReliabilityPacket,
  writeComparisonOut,
  writePacketOut,
} = require('./crawl-packet');
const {
  collectBaseline,
  collectVerification,
  readBoundedJson,
} = require('./monitored-small-crawl');

const DEFAULT_DB_PATH = 'data/news.db';
const DEFAULT_UI_HOST = '127.0.0.1';
const DEFAULT_UI_PORT = 3173;
const DEFAULT_ARTIFACT_PREFIX = 'tmp/medium-sequential-fixture';

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=,@%+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function commandObject(args, env = {}) {
  const envEntries = Object.entries(env)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => `${key}=${value}`);
  return {
    executable: 'node',
    env,
    args,
    display: [...envEntries, 'node', ...args].map(shellQuote).join(' '),
  };
}

function normalizePositiveInt(value, fallback, min, max, label) {
  const parsed = Number.parseInt(value, 10);
  const n = Number.isFinite(parsed) ? parsed : fallback;
  if (n < min || n > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return n;
}

function toIso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('date value must be valid');
  return date.toISOString();
}

function slugForArtifact(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'proof';
}

function defaultTargetToken(generatedAt) {
  const compact = toIso(generatedAt)
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'z');
  return `medium-sequential-${compact}`;
}

function normalizeOptions(options = {}) {
  const generatedAt = toIso(options.generatedAt || options['generated-at'] || new Date());
  const preset = String(options.preset || options.fixturePreset || options['fixture-preset'] || 'medium').trim().toLowerCase();
  if (preset !== 'medium') {
    throw new Error('sequential fixture proof currently supports the medium preset only');
  }
  const targetToken = String(options.targetToken || options['target-token'] || options.fixtureTargetToken || options['fixture-target-token'] || defaultTargetToken(generatedAt)).trim();
  const port = normalizePositiveInt(options.port || options.fixturePort || options['fixture-port'], 41892, 1024, 65535, 'fixture port');
  const artifactPrefix = String(options.artifactPrefix || options['artifact-prefix'] || DEFAULT_ARTIFACT_PREFIX).trim();
  const dbPath = String(options.dbPath || options.db || DEFAULT_DB_PATH);
  const uiHost = String(options.uiHost || options['ui-host'] || DEFAULT_UI_HOST);
  const uiPort = normalizePositiveInt(options.uiPort || options['ui-port'], DEFAULT_UI_PORT, 1024, 65535, 'UI port');
  const watchTimeoutSec = normalizePositiveInt(options.watchTimeoutSec || options['watch-timeout'], 120, 30, 1200, 'watch timeout');
  const terminalWaitTimeoutSec = normalizePositiveInt(options.terminalWaitTimeoutSec || options['terminal-wait-timeout'], 30, 5, 300, 'terminal wait timeout');
  const terminalWaitJobPollTimeoutMs = normalizePositiveInt(options.terminalWaitJobPollTimeoutMs || options['terminal-wait-job-poll-timeout'], 5000, 1500, 5000, 'terminal wait job poll timeout');
  const launchTimeoutSec = normalizePositiveInt(options.launchTimeoutSec || options['launch-timeout'], 180, 30, 600, 'launch timeout');
  const noOutputTimeoutSec = normalizePositiveInt(options.noOutputTimeoutSec || options['no-output-timeout'], 90, 30, 300, 'no output timeout');
  const serverReadyTimeoutMs = normalizePositiveInt(options.serverReadyTimeoutMs || options['server-ready-timeout-ms'], 240000, 30000, 900000, 'server ready timeout');
  const fixtureLifetimeMs = normalizePositiveInt(options.fixtureLifetimeMs || options['fixture-lifetime-ms'], 900000, 60000, 30 * 60 * 1000, 'fixture lifetime');
  const processTimeoutSec = normalizePositiveInt(
    options.processTimeoutSec || options['process-timeout'],
    watchTimeoutSec + launchTimeoutSec + noOutputTimeoutSec + 120,
    60,
    2400,
    'process timeout'
  );

  return {
    generatedAt,
    preset,
    targetToken,
    port,
    artifactPrefix,
    dbPath,
    uiHost,
    uiPort,
    watchTimeoutSec,
    launchTimeoutSec,
    noOutputTimeoutSec,
    serverReadyTimeoutMs,
    fixtureLifetimeMs,
    processTimeoutSec,
    waitForTerminal: Boolean(options.waitForTerminal || options['wait-for-terminal']),
    terminalWaitTimeoutSec,
    terminalWaitJobPollTimeoutMs,
    localSmokeReportPath: options.localSmokeReport || options['local-smoke-report'] || 'tmp/local-smoke-report.json',
    localSmokeComparisonPath: options.comparison || options.compare || 'tmp/local-smoke-comparison-sequential.json',
    compareWithPacket: options.compareWith || options['compare-with'] || null,
    noTargetFreshness: Boolean(options.noTargetFreshness || options['no-target-freshness']),
  };
}

function stepArtifactPrefix(options, target, index) {
  return `${options.artifactPrefix}-${index + 1}-${slugForArtifact(target.host)}`;
}

function buildStepRunCommand(options, target) {
  const args = [
    'tools/crawl/run.js',
    '--local',
    '--profile', 'gentle',
    '--max-pages', '1',
    '--max-depth', '0',
    '--concurrency', '1',
    '--batch-retries', '0',
    '--batch-request-timeout-ms', '60000',
    '--per-domain-interval-ms', '1000',
    '--override', 'preferCache=false',
    '--override', 'maxAgeMs=0',
    '--override', 'useSitemap=false',
    '--override', 'sitemapOnly=false',
    '--override', 'skipQueryUrls=false',
    '--watch',
    '--watch-interval', '2000',
    '--watch-timeout', String(options.watchTimeoutSec),
    '--watch-min-fetches', '1',
    '--watch-min-hosts', '1',
    '--launch-timeout', String(options.launchTimeoutSec),
    '--no-output-timeout', String(options.noOutputTimeoutSec),
    '--auto-stop',
    '--no-meter',
    '--json',
    '--db', options.dbPath,
    '--ui-host', options.uiHost,
    '--ui-port', String(options.uiPort),
    target.url,
  ];
  if (options.waitForTerminal) {
    args.splice(args.length - 1, 0,
      '--watch-wait-terminal-after-db-proof',
      '--watch-terminal-timeout', String(options.terminalWaitTimeoutSec),
      '--watch-terminal-job-poll-timeout', String(options.terminalWaitJobPollTimeoutMs)
    );
  }
  return commandObject(args, {
    CRAWL_RUN_SERVER_READY_TIMEOUT_MS: String(options.serverReadyTimeoutMs),
  });
}

function buildSequentialFixtureProofPlan(input = {}) {
  const options = normalizeOptions(input);
  const fixturePlan = buildFixturePlan({
    preset: 'medium',
    port: options.port,
    targetToken: options.targetToken,
    readyFile: `${options.artifactPrefix}-ready.json`,
    pidFile: `${options.artifactPrefix}.pid`,
  });
  const steps = fixturePlan.targets.map((target, index) => {
    const prefix = stepArtifactPrefix(options, target, index);
    const launch = buildStepRunCommand(options, target);
    return {
      index: index + 1,
      host: target.host,
      url: target.url,
      artifactPrefix: prefix,
      artifacts: {
        baseline: `${prefix}-baseline.json`,
        start: `${prefix}-start.txt`,
        end: `${prefix}-end.txt`,
        launchStdout: `${prefix}-launch.stdout.json`,
        watchStderr: `${prefix}-watch.stderr.log`,
        verify: `${prefix}-verify.json`,
        runStatus: `${prefix}-run-status.json`,
      },
      expected: {
        minDownloads: 1,
        minHosts: 1,
      },
      launch,
      verifyCommand: commandObject([
        'tools/crawl/monitored-small-crawl.js',
        'verify',
        '--baseline', `${prefix}-baseline.json`,
        '--since', '<step-start-iso>',
        '--until', '<step-end-iso>',
        '--hosts', target.host,
        '--expected-min-downloads', '1',
        '--command', launch.display,
        '--profile', `local-medium-reliability:sequential-host-${index + 1}`,
        '--db', options.dbPath,
        '--out', `${prefix}-verify.json`,
        '--json',
      ]),
    };
  });

  const packetPath = `${options.artifactPrefix}-packet.json`;
  const comparisonPath = `${options.artifactPrefix}-comparison.json`;
  return {
    schemaVersion: 1,
    mode: 'medium-sequential-fixture-proof-plan',
    generatedAt: options.generatedAt,
    actionPolicy: {
      planStartsCrawler: false,
      planContactsRemoteCrawler: false,
      planContactsInternetTargets: false,
      executeStartsLoopbackFixtureServer: true,
      executeStartsLocalCrawler: true,
      executeContactsInternetTargets: false,
      executeWritesLocalDb: true,
      defaultStopsAtDbProof: !options.waitForTerminal,
      optionalTerminalWaitAfterDbProof: options.waitForTerminal ? {
        enabled: true,
        timeoutSec: options.terminalWaitTimeoutSec,
      } : { enabled: false },
      mutatesRemoteQueue: false,
    },
    options,
    fixture: {
      preset: fixturePlan.preset,
      targetToken: fixturePlan.targetToken,
      port: fixturePlan.server.port,
      hosts: fixturePlan.hosts,
      urls: fixturePlan.urls,
      readyFile: fixturePlan.server.readyFile,
      pidFile: fixturePlan.server.pidFile,
      startCommand: fixturePlan.commands.start,
    },
    artifacts: {
      baseline: `${options.artifactPrefix}-baseline.json`,
      start: `${options.artifactPrefix}-start.txt`,
      end: `${options.artifactPrefix}-end.txt`,
      launchSummary: `${options.artifactPrefix}-launch.summary.json`,
      watchSummary: `${options.artifactPrefix}-watch.summary.log`,
      verify: `${options.artifactPrefix}-verify.json`,
      runStatus: `${options.artifactPrefix}-run-status.json`,
      packet: packetPath,
      comparison: comparisonPath,
    },
    steps,
    compose: {
      packetCommand: commandObject([
        'tools/crawl/crawl-packet.js',
        'plan',
        '--fixture-preset', 'medium',
        '--fixture-port', String(options.port),
        '--fixture-target-token', options.targetToken,
        '--local-smoke-report', options.localSmokeReportPath,
        '--comparison', options.localSmokeComparisonPath,
        '--verification-report', `${options.artifactPrefix}-verify.json`,
        '--launch-report', `${options.artifactPrefix}-launch.summary.json`,
        '--watch-log', `${options.artifactPrefix}-watch.summary.log`,
        '--json',
        '--out', packetPath,
      ]),
      comparisonCommand: options.compareWithPacket ? commandObject([
        'tools/crawl/crawl-packet.js',
        'compare',
        '--packet', options.compareWithPacket,
        '--packet', packetPath,
        '--json',
        '--out', comparisonPath,
      ]) : null,
    },
  };
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function writeTextFile(filePath, text) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, text);
}

function writeJsonFile(filePath, payload, pretty = true) {
  writeTextFile(filePath, `${JSON.stringify(payload, null, pretty ? 2 : 0)}\n`);
}

function readJsonFileOrNull(filePath) {
  try {
    return readBoundedJson(filePath, filePath);
  } catch (_error) {
    return null;
  }
}

function runNodeToFiles({ args, env = {}, stdoutPath, stderrPath, timeoutSec }) {
  return new Promise((resolve) => {
    ensureDirForFile(stdoutPath);
    ensureDirForFile(stderrPath);
    const out = fs.createWriteStream(stdoutPath);
    const err = fs.createWriteStream(stderrPath);
    const startedAt = toIso();
    let settled = false;
    let timeout = null;
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(out);
    child.stderr.pipe(err);

    const finish = (exitCode, timedOut = false) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      out.end();
      err.end();
      resolve({
        exitCode: Number.isInteger(exitCode) ? exitCode : 1,
        timedOut,
        startedAt,
        finishedAt: toIso(),
      });
    };

    timeout = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch (_error) {}
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_error) {}
        finish(124, true);
      }, 2500).unref?.();
    }, timeoutSec * 1000);
    timeout.unref?.();

    child.on('error', () => finish(1, false));
    child.on('close', code => finish(code, false));
  });
}

function parseLastWatchFinal(logPath) {
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);
  let final = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const payload = JSON.parse(line);
      if (payload && payload.watchFinal) final = payload.watchFinal;
    } catch (_error) {
      // Human stderr lines are expected alongside JSON watch events.
    }
  }
  return final;
}

function readLaunchResults(launchPath, target) {
  const launch = readJsonFileOrNull(launchPath);
  if (Array.isArray(launch?.results)) return launch.results;
  return [{
    startUrl: target.url,
    ok: false,
    error: launch ? 'launch-report-missing-results' : 'launch-report-unparseable',
    attempts: 0,
  }];
}

const TERMINAL_JOB_STATUSES = new Set([
  'aborted',
  'cancelled',
  'canceled',
  'complete',
  'completed',
  'done',
  'failed',
  'finished',
  'succeeded',
  'success',
  'terminal',
  'timed-out',
  'timeout',
]);

function normalizeJobStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return status || null;
}

function launchJobId(result) {
  return result?.jobId || result?.body?.jobId || result?.body?.job?.id || null;
}

function launchStartUrl(result) {
  return result?.startUrl || result?.body?.job?.startUrl || null;
}

function findJobSnapshot(watchFinal, launchItem) {
  const items = Array.isArray(watchFinal?.jobs?.items) ? watchFinal.jobs.items : [];
  const jobId = launchJobId(launchItem);
  if (jobId) {
    const byId = items.find(item => item && item.id === jobId);
    if (byId) return byId;
  }
  const startUrl = launchStartUrl(launchItem);
  if (startUrl) {
    const byUrl = items.find(item => item && item.startUrl === startUrl);
    if (byUrl) return byUrl;
  }
  return null;
}

function buildPerTargetProof(stepResult, launchItems, watchFinal, verification) {
  const acceptedLaunch = launchItems.find(item => item && item.ok === true) || null;
  const jobSnapshot = acceptedLaunch ? findJobSnapshot(watchFinal, acceptedLaunch) : null;
  const embeddedJob = acceptedLaunch?.body?.job || null;
  const jobStatus = normalizeJobStatus(jobSnapshot?.status || embeddedJob?.status);
  const jobTerminal = jobStatus == null ? null : TERMINAL_JOB_STATUSES.has(jobStatus);
  const dbDownloads = Number(verification?.recent?.downloads || 0);
  const dbSuccess = Number(verification?.recent?.success || 0);
  const dbContentDelta = Number(verification?.database?.delta?.content || 0);
  const blockers = Array.isArray(verification?.blockers) ? verification.blockers : [];
  const dbProofMet = dbSuccess > 0 && blockers.length === 0;
  const warnings = [];
  if (acceptedLaunch && dbProofMet && jobTerminal === false) {
    warnings.push('job-still-running-after-db-proof');
  }
  if (acceptedLaunch && !dbProofMet) {
    warnings.push('accepted-job-missing-db-evidence');
  }
  if (acceptedLaunch && !jobSnapshot && !embeddedJob) {
    warnings.push('accepted-job-status-unobserved');
  }

  return {
    index: stepResult.index,
    host: stepResult.host,
    url: stepResult.target.url,
    exitCode: stepResult.runStatus.exitCode,
    launchOk: Boolean(acceptedLaunch),
    jobId: acceptedLaunch ? launchJobId(acceptedLaunch) : null,
    jobStatus,
    jobStatusSource: jobSnapshot ? 'watch-jobs' : (embeddedJob ? 'launch-response' : null),
    jobObserved: Boolean(jobSnapshot || embeddedJob),
    jobTerminal,
    terminalState: jobTerminal === true
      ? 'terminal'
      : (jobTerminal === false ? 'still-running' : 'unobserved'),
    watchStoppedReason: watchFinal?.stoppedReason || null,
    minHostsMet: watchFinal?.minHostsMet ?? null,
    dbDownloads,
    dbSuccess,
    dbContentDelta,
    dbProofMet,
    blockers,
    warnings,
  };
}

function countPerTargetJobs(perTarget) {
  const counts = {
    total: perTarget.filter(item => item.launchOk).length,
    running: 0,
    completed: 0,
    failed: 0,
    terminal: 0,
    unobserved: 0,
    statuses: {},
  };
  for (const item of perTarget) {
    if (!item.launchOk) continue;
    if (!item.jobStatus) {
      counts.unobserved += 1;
      continue;
    }
    counts.statuses[item.jobStatus] = (counts.statuses[item.jobStatus] || 0) + 1;
    if (item.jobTerminal) counts.terminal += 1;
    if (item.jobStatus === 'running') counts.running += 1;
    if (['complete', 'completed', 'done', 'finished', 'succeeded', 'success'].includes(item.jobStatus)) {
      counts.completed += 1;
    }
    if (['aborted', 'cancelled', 'canceled', 'failed', 'timed-out', 'timeout'].includes(item.jobStatus)) {
      counts.failed += 1;
    }
  }
  return counts;
}

function composeSequentialArtifacts(plan, stepResults, startedAt, finishedAt) {
  const launchResults = [];
  const watchFinals = [];
  const perTarget = [];
  for (const stepResult of stepResults) {
    const launchItems = readLaunchResults(stepResult.artifacts.launchStdout, stepResult.target);
    launchResults.push(...launchItems);
    const watchFinal = parseLastWatchFinal(stepResult.artifacts.watchStderr);
    if (watchFinal) watchFinals.push(watchFinal);
    const verification = readJsonFileOrNull(stepResult.artifacts.verify);
    perTarget.push(buildPerTargetProof(stepResult, launchItems, watchFinal, verification));
  }

  const accepted = launchResults.filter(result => result && result.ok === true);
  const failed = launchResults.filter(result => !result || result.ok === false);
  const coveredHosts = Array.from(new Set(watchFinals.flatMap(item => Array.isArray(item.coveredHosts) ? item.coveredHosts : [])));
  const missingHosts = plan.fixture.hosts.filter(host => !coveredHosts.includes(host));
  const totals = watchFinals.reduce((sum, item) => {
    const t = item.totals || {};
    sum.fetched += Number(t.fetched || 0);
    sum.errors += Number(t.errors || 0);
    sum.pending += Number(t.pending || 0);
    sum.bytes += Number(t.bytes || 0);
    return sum;
  }, { fetched: 0, errors: 0, pending: 0, bytes: 0 });
  const jobPollErrors = watchFinals.reduce((sum, item) => sum + Number(item.jobPollErrors || 0), 0);
  const terminalWaits = watchFinals
    .map(item => item?.terminalWait)
    .filter(item => item && item.enabled);
  const terminalWaitOutcomeCounts = terminalWaits.reduce((counts, item) => {
    const outcome = item.outcome || 'unknown';
    counts[outcome] = (counts[outcome] || 0) + 1;
    return counts;
  }, {});
  const terminalWait = terminalWaits.length ? {
    enabled: true,
    timeoutSec: Math.max(...terminalWaits.map(item => Number(item.timeoutSec || 0))),
    startedAt: terminalWaits.map(item => item.startedAt).filter(Boolean).sort()[0] || null,
    finishedAt: terminalWaits.map(item => item.finishedAt).filter(Boolean).sort().slice(-1)[0] || null,
    elapsedMs: terminalWaits.reduce((sum, item) => sum + Number(item.elapsedMs || 0), 0),
    outcome: terminalWaits.every(item => item.outcome === 'terminal') ? 'terminal' : 'incomplete',
    reason: terminalWaits.every(item => item.outcome === 'terminal')
      ? 'all-sequential-host-jobs-terminal-after-db-proof'
      : 'one-or-more-sequential-host-jobs-non-terminal-after-db-proof',
    counts: terminalWaitOutcomeCounts,
    items: terminalWaits.map((item, index) => ({
      index: index + 1,
      outcome: item.outcome || null,
      reason: item.reason || null,
      elapsedMs: item.elapsedMs ?? null,
    })),
  } : null;
  const jobCounts = countPerTargetJobs(perTarget);
  const jobItems = perTarget
    .filter(item => item.launchOk)
    .map(item => ({
      id: item.jobId,
      status: item.jobStatus,
      host: item.host,
      startUrl: item.url,
      terminal: item.jobTerminal,
      terminalState: item.terminalState,
      dbProofMet: item.dbProofMet,
      warnings: item.warnings,
    }));

  return {
    launchSummary: {
      status: failed.length ? (accepted.length ? 'partial' : 'failed') : 'ok',
      startedAt,
      finishedAt,
      plan: {
        strategy: 'sequential-per-host-medium-fixture',
        urls: plan.fixture.urls,
      },
      counts: {
        total: launchResults.length,
        ok: accepted.length,
        failed: failed.length,
      },
      results: launchResults,
      perTarget,
    },
    watchSummary: {
      watchFinal: {
        stoppedReason: missingHosts.length ? 'sequential-host-coverage-not-met' : 'min-fetches-and-hosts-met',
        kind: 'local',
        totals,
        missingTargets: [],
        minFetches: plan.fixture.hosts.length,
        minFetchesMet: totals.fetched >= plan.fixture.hosts.length,
        minHosts: plan.fixture.hosts.length,
        minHostsMet: missingHosts.length === 0,
        coveredHosts,
        missingLocalTargets: missingHosts,
        jobs: {
          available: jobItems.some(item => item.status),
          error: jobItems.some(item => !item.status) ? 'one-or-more-job-status-unobserved' : null,
          counts: jobCounts,
          items: jobItems,
        },
        launchJobs: {
          source: 'sequential-launch-summary',
          available: true,
          counts: {
            total: launchResults.length,
            accepted: accepted.length,
            failed: failed.length,
          },
          items: accepted.map(result => ({
            id: result.jobId || result?.body?.jobId || result?.body?.job?.id || null,
            status: 'accepted',
            startUrl: result.startUrl || result?.body?.job?.startUrl || null,
            attempts: Number(result.attempts || 0) || 0,
          })),
        },
        jobPollErrors,
        terminalWait,
        perTarget,
      },
    },
  };
}

async function runSequentialFixtureProof(input = {}, deps = {}) {
  const plan = buildSequentialFixtureProofPlan(input);
  const options = plan.options;
  const fixturePlan = buildFixturePlan({
    preset: 'medium',
    port: options.port,
    targetToken: options.targetToken,
    readyFile: plan.fixture.readyFile,
    pidFile: plan.fixture.pidFile,
  });
  const startFixture = deps.startFixtureServers || startFixtureServers;
  const collectBaselineFn = deps.collectBaseline || collectBaseline;
  const collectVerificationFn = deps.collectVerification || collectVerification;
  const runNode = deps.runNodeToFiles || runNodeToFiles;
  let runtime = null;
  const stepResults = [];
  const startedAt = toIso();

  try {
    runtime = await startFixture(fixturePlan, {
      readyFile: plan.fixture.readyFile,
      pidFile: plan.fixture.pidFile,
      lifetimeMs: options.fixtureLifetimeMs,
    });
    writeTextFile(plan.artifacts.start, `${startedAt}\n`);
    const baseline = collectBaselineFn({
      generatedAt: startedAt,
      hosts: plan.fixture.hosts.join(','),
      db: options.dbPath,
    });
    writeJsonFile(plan.artifacts.baseline, baseline);

    for (const [index, target] of fixturePlan.targets.entries()) {
      const step = plan.steps[index];
      const stepStart = toIso();
      writeTextFile(step.artifacts.start, `${stepStart}\n`);
      const stepBaseline = collectBaselineFn({
        generatedAt: stepStart,
        hosts: target.host,
        db: options.dbPath,
      });
      writeJsonFile(step.artifacts.baseline, stepBaseline);

      const command = buildStepRunCommand(options, target);
      const runStatus = await runNode({
        args: command.args,
        env: command.env,
        stdoutPath: step.artifacts.launchStdout,
        stderrPath: step.artifacts.watchStderr,
        timeoutSec: options.processTimeoutSec,
      });
      writeTextFile(step.artifacts.end, `${runStatus.finishedAt}\n`);
      writeJsonFile(step.artifacts.runStatus, runStatus);

      const verification = collectVerificationFn({
        generatedAt: toIso(),
        baselineArtifact: stepBaseline,
        since: stepStart,
        until: runStatus.finishedAt,
        hosts: target.host,
        expectedMinDownloads: 1,
        command: command.display,
        profile: `local-medium-reliability:sequential-host-${index + 1}`,
        db: options.dbPath,
      });
      writeJsonFile(step.artifacts.verify, verification);
      stepResults.push({
        index: index + 1,
        host: target.host,
        target,
        artifacts: step.artifacts,
        runStatus,
        verification,
      });
    }

    const finishedAt = toIso();
    writeTextFile(plan.artifacts.end, `${finishedAt}\n`);
    const overallVerification = collectVerificationFn({
      generatedAt: toIso(),
      baselineArtifact: readBoundedJson(plan.artifacts.baseline, 'sequential fixture baseline'),
      since: startedAt,
      until: finishedAt,
      hosts: plan.fixture.hosts.join(','),
      expectedMinDownloads: plan.fixture.hosts.length,
      command: `sequential medium fixture proof: ${options.targetToken}`,
      profile: 'local-medium-reliability:sequential',
      db: options.dbPath,
    });
    writeJsonFile(plan.artifacts.verify, overallVerification);

    const composed = composeSequentialArtifacts(plan, stepResults, startedAt, finishedAt);
    writeJsonFile(plan.artifacts.launchSummary, composed.launchSummary);
    writeTextFile(plan.artifacts.watchSummary, `${JSON.stringify(composed.watchSummary)}\n`);

    const failedStep = stepResults.find(result => result.runStatus.exitCode !== 0);
    const runStatus = {
      exitCode: failedStep ? failedStep.runStatus.exitCode : 0,
      startedAt,
      finishedAt,
      stepCount: stepResults.length,
      failedSteps: stepResults.filter(result => result.runStatus.exitCode !== 0).map(result => ({
        index: result.index,
        host: result.host,
        exitCode: result.runStatus.exitCode,
      })),
    };
    writeJsonFile(plan.artifacts.runStatus, runStatus);

    const packet = buildCrawlReliabilityPacket({
      fixturePreset: 'medium',
      fixturePort: options.port,
      fixtureTargetToken: options.targetToken,
      localSmokeReport: options.localSmokeReportPath,
      comparison: options.localSmokeComparisonPath,
      verificationReport: plan.artifacts.verify,
      launchReport: plan.artifacts.launchSummary,
      watchLog: plan.artifacts.watchSummary,
      targetFreshness: !options.noTargetFreshness,
    });
    writePacketOut(plan.artifacts.packet, packet, true);

    let comparison = null;
    if (options.compareWithPacket) {
      comparison = buildCrawlPacketComparison({
        packet: [options.compareWithPacket, plan.artifacts.packet],
      });
      writeComparisonOut(plan.artifacts.comparison, comparison, true);
    }

    return {
      schemaVersion: 1,
      mode: 'medium-sequential-fixture-proof-result',
      generatedAt: toIso(),
      actionPolicy: plan.actionPolicy,
      plan,
      runStatus,
      verification: {
        readinessLabel: overallVerification.readinessLabel,
        delta: overallVerification.database?.delta || null,
        hosts: overallVerification.hosts || null,
        recent: overallVerification.recent ? {
          downloads: overallVerification.recent.downloads,
          success: overallVerification.recent.success,
          failed: overallVerification.recent.failed,
          distinctHosts: overallVerification.recent.distinctHosts,
        } : null,
      },
      packet: {
        path: plan.artifacts.packet,
        label: packet.classification.label,
        primary: packet.classification.primary,
        blockers: packet.classification.blockers,
        taxonomy: packet.classification.taxonomy,
        score: packet.score,
      },
      comparison: comparison ? {
        path: plan.artifacts.comparison,
        summary: comparison.comparison,
      } : null,
      stepResults: stepResults.map(result => ({
        index: result.index,
        host: result.host,
        exitCode: result.runStatus.exitCode,
        readinessLabel: result.verification.readinessLabel,
        dbDelta: result.verification.database?.delta || null,
      })),
    };
  } finally {
    if (runtime && typeof runtime.close === 'function') {
      await runtime.close();
    }
  }
}

module.exports = {
  buildSequentialFixtureProofPlan,
  buildStepRunCommand,
  commandObject,
  composeSequentialArtifacts,
  normalizeOptions,
  parseLastWatchFinal,
  runNodeToFiles,
  runSequentialFixtureProof,
  slugForArtifact,
  writeJsonFile,
};
