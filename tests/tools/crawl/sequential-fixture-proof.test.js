'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildSequentialFixtureProofPlan,
  composeSequentialArtifacts,
} = require('../../../tools/crawl/lib/sequential-fixture-proof');
const {
  getPayloadExitCode,
  parseArgs,
  runCli,
} = require('../../../tools/crawl/sequential-fixture-proof');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`);
}

describe('sequential medium fixture proof helper', () => {
  test('builds a no-contact plan with one bounded local step per medium host', () => {
    const plan = buildSequentialFixtureProofPlan({
      fixturePort: 41965,
      targetToken: 'seq-test',
      artifactPrefix: 'tmp/medium-seq-test',
      generatedAt: '2026-05-29T20:00:00.000Z',
    });

    expect(plan).toMatchObject({
      mode: 'medium-sequential-fixture-proof-plan',
      actionPolicy: {
        planStartsCrawler: false,
        planContactsRemoteCrawler: false,
        planContactsInternetTargets: false,
        executeStartsLoopbackFixtureServer: true,
        executeStartsLocalCrawler: true,
        executeContactsInternetTargets: false,
        executeWritesLocalDb: true,
        mutatesRemoteQueue: false,
      },
      fixture: {
        preset: 'medium',
        targetToken: 'seq-test',
        port: 41965,
        hosts: ['127.0.0.1', '127.0.0.2', '127.0.0.3'],
      },
    });
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].launch.display).toContain('--watch-min-hosts 1');
    expect(plan.steps[0].launch.display).toContain('http://127.0.0.1:41965/news/medium-a-seq-test.html');
    expect(plan.compose.packetCommand.display).toContain('--launch-report tmp/medium-seq-test-launch.summary.json');
  });

  test('optional terminal wait remains opt-in and is reflected in run commands', () => {
    const defaultPlan = buildSequentialFixtureProofPlan({
      fixturePort: 41965,
      targetToken: 'seq-terminal-default',
      artifactPrefix: 'tmp/medium-seq-terminal-default',
      generatedAt: '2026-05-29T20:00:00.000Z',
    });
    const waitPlan = buildSequentialFixtureProofPlan({
      fixturePort: 41965,
      targetToken: 'seq-terminal-wait',
      artifactPrefix: 'tmp/medium-seq-terminal-wait',
      generatedAt: '2026-05-29T20:00:00.000Z',
      waitForTerminal: true,
      terminalWaitTimeoutSec: 15,
    });

    expect(defaultPlan.actionPolicy.defaultStopsAtDbProof).toBe(true);
    expect(defaultPlan.steps[0].launch.display).not.toContain('--watch-wait-terminal-after-db-proof');
    expect(waitPlan.actionPolicy.optionalTerminalWaitAfterDbProof).toEqual({
      enabled: true,
      timeoutSec: 15,
    });
    expect(waitPlan.steps[0].launch.display).toContain('--watch-wait-terminal-after-db-proof');
    expect(waitPlan.steps[0].launch.display).toContain('--watch-terminal-timeout 15');
    // The longer terminal-wait job-poll timeout is plumbed through so the cheap
    // /jobs/:jobId endpoint can respond even while the in-process crawl is busy.
    expect(waitPlan.steps[0].launch.display).toContain('--watch-terminal-job-poll-timeout 5000');
  });

  test('composes per-target launch/watch/verify artifacts into host coverage proof', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-fixture-compose-'));
    const plan = buildSequentialFixtureProofPlan({
      fixturePort: 41966,
      targetToken: 'compose',
      artifactPrefix: path.join(tmp, 'medium'),
      generatedAt: '2026-05-29T20:00:00.000Z',
    });
    const stepResults = plan.steps.map((step, index) => {
      writeJson(step.artifacts.launchStdout, {
        results: [{
          startUrl: step.url,
          ok: true,
          jobId: `job-${index + 1}`,
          attempts: 1,
        }],
      });
      fs.writeFileSync(step.artifacts.watchStderr, `${JSON.stringify({
        watchFinal: {
          stoppedReason: 'min-fetches-and-hosts-met',
          totals: { fetched: 1, errors: 0, pending: 0, bytes: 1024 },
          coveredHosts: [step.host],
          missingLocalTargets: [],
          minHosts: 1,
          minHostsMet: true,
          jobs: {
            available: true,
            error: null,
            counts: { total: 1, running: 1, completed: 0, failed: 0, terminal: 0, statuses: { running: 1 } },
            items: [{ id: `job-${index + 1}`, status: 'running', startUrl: step.url }],
          },
          jobPollErrors: index,
          terminalWait: {
            enabled: true,
            timeoutSec: 15,
            startedAt: '2026-05-29T20:00:10.000Z',
            finishedAt: '2026-05-29T20:00:25.000Z',
            elapsedMs: 15000,
            outcome: index === 0 ? 'terminal' : 'timed-out',
            reason: index === 0
              ? 'accepted-local-jobs-terminal-after-db-proof'
              : 'accepted-local-jobs-still-non-terminal-after-db-proof',
          },
        },
      })}\n`);
      writeJson(step.artifacts.verify, {
        readinessLabel: 'verified-new-data',
        database: { delta: { content: 1 } },
        recent: { downloads: 1, success: 1 },
        blockers: [],
      });
      return {
        index: index + 1,
        host: step.host,
        target: { url: step.url },
        artifacts: step.artifacts,
        runStatus: { exitCode: 0 },
      };
    });

    try {
      const composed = composeSequentialArtifacts(
        plan,
        stepResults,
        '2026-05-29T20:00:00.000Z',
        '2026-05-29T20:03:00.000Z'
      );
      expect(composed.launchSummary).toMatchObject({
        status: 'ok',
        counts: { total: 3, ok: 3, failed: 0 },
      });
      expect(composed.watchSummary.watchFinal).toMatchObject({
        stoppedReason: 'min-fetches-and-hosts-met',
        minFetches: 3,
        minFetchesMet: true,
        minHosts: 3,
        minHostsMet: true,
        coveredHosts: ['127.0.0.1', '127.0.0.2', '127.0.0.3'],
        missingLocalTargets: [],
        jobPollErrors: 3,
        jobs: {
          available: true,
          error: null,
          counts: { total: 3, running: 3, completed: 0, failed: 0, terminal: 0, unobserved: 0, statuses: { running: 3 } },
        },
        terminalWait: {
          enabled: true,
          timeoutSec: 15,
          outcome: 'incomplete',
          reason: 'one-or-more-sequential-host-jobs-non-terminal-after-db-proof',
          counts: { terminal: 1, 'timed-out': 2 },
        },
      });
      expect(composed.watchSummary.watchFinal.perTarget).toHaveLength(3);
      expect(composed.watchSummary.watchFinal.perTarget[0]).toMatchObject({
        jobId: 'job-1',
        jobStatus: 'running',
        jobTerminal: false,
        terminalState: 'still-running',
        dbProofMet: true,
        warnings: ['job-still-running-after-db-proof'],
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('CLI plan writes bounded JSON and execute exit code reflects packet blockers', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-fixture-cli-'));
    const outPath = path.join(tmp, 'plan.json');
    const writes = [];
    const originalLog = console.log;
    console.log = value => writes.push(String(value));
    try {
      expect(parseArgs(['--execute']).mode).toBe('execute');
      await expect(runCli([
        'plan',
        '--fixture-port', '41967',
        '--target-token', 'cli-test',
        '--artifact-prefix', path.join(tmp, 'medium'),
        '--out', outPath,
        '--json',
      ])).resolves.toBe(0);
      const plan = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      expect(plan.fixture.targetToken).toBe('cli-test');
      expect(writes.join('\n')).toContain('"mode":"medium-sequential-fixture-proof-plan"');

      expect(getPayloadExitCode({ mode: 'medium-sequential-fixture-proof-plan' })).toBe(0);
      expect(getPayloadExitCode({
        mode: 'medium-sequential-fixture-proof-result',
        runStatus: { exitCode: 0 },
        packet: { blockers: ['watch-host-coverage-not-met'] },
      })).toBe(2);
    } finally {
      console.log = originalLog;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
