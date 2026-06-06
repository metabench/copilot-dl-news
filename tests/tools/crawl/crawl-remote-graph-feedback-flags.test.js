'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

describe('crawl-remote graph-feedback flag boundaries', () => {
  const scriptPath = path.resolve(__dirname, '../../../tools/crawl/crawl-remote.js');

  test('rejects direct graph feedback live-seed flags before contacting a remote crawler', () => {
    const result = spawnSync(process.execPath, [
      scriptPath,
      'status',
      '--use-graph-feedback-seeds',
    ], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Graph-feedback live seeding is only supported through tools/crawl/index.js');
  });

  test('rejects direct graph feedback artifact flags before contacting a remote crawler', () => {
    const result = spawnSync(process.execPath, [
      scriptPath,
      'status',
      '--graph-feedback-artifact',
      'tmp/graph-feedback.json',
    ], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Graph-feedback live seeding is only supported through tools/crawl/index.js');
  });

  test('prints file-only readiness report without contacting a remote crawler or dumping URLs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-remote-readiness-report-'));
    try {
      const queuePath = path.join(dir, 'queue.json');
      const deployPath = path.join(dir, 'deploy.json');
      const artifactPath = path.join(dir, 'artifact.json');
      const previewPath = path.join(dir, 'preview.json');
      fs.writeFileSync(queuePath, JSON.stringify({
        schemaVersion: 1,
        mode: 'remote-queue-summary',
        generatedAt: '2026-05-28T00:00:00.000Z',
        requestedDomains: ['bbc.com'],
        deployPreflightImplication: 'ready-for-deploy-preflight',
        nextSafestAction: 'run-deploy-preflight-before-seed-or-deploy',
        totals: { pending: 0 },
        readinessCounts: { 'no-pending': 1 },
        missingDomains: [],
        domains: [{ domain: 'bbc.com', pending: 0, isRunning: false }],
      }));
      fs.writeFileSync(deployPath, JSON.stringify({
        mode: 'preflight-only',
        generatedAt: '2026-05-28T00:00:00.000Z',
        decision: 'current',
        readyForLiveSeedProof: true,
      }));
      fs.writeFileSync(artifactPath, JSON.stringify({
        schemaVersion: 1,
        mode: 'full',
        generatedAt: '2026-05-28T00:00:00.000Z',
        recommendationCount: 1,
        domains: [{
          host: 'bbc.com',
          recommendations: [{ url: 'https://bbc.com/should-not-print' }],
        }],
      }));
      fs.writeFileSync(previewPath, JSON.stringify({
        mode: 'graph-feedback-live-seed-preview-evidence',
        fingerprint: 'abc123',
        plannedHosts: ['bbc.com'],
        candidateCount: 1,
        requestBodyBytes: 128,
      }));

      const result = spawnSync(process.execPath, [
        scriptPath,
        'readiness-report',
        '--json',
        '--reference-at',
        '2026-05-28T00:10:00.000Z',
        '--queue-summary',
        queuePath,
        '--deploy-proof',
        deployPath,
        '--graph-artifact',
        artifactPath,
        '--preview-evidence',
        previewPath,
      ], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.readinessLabel).toBe('ready-for-human-approval-review');
      expect(report.actionPolicy).toMatchObject({
        readOnly: true,
        seedsRemote: false,
        prunesRemote: false,
        deploysRemote: false,
      });
      expect(result.stdout).not.toContain('https://bbc.com/should-not-print');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('prints file-only maintenance decision and refuses destructive approval by default', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-remote-maintenance-decision-'));
    try {
      const queuePath = path.join(dir, 'queue.json');
      const readinessPath = path.join(dir, 'readiness.json');
      fs.writeFileSync(queuePath, JSON.stringify({
        schemaVersion: 1,
        mode: 'remote-queue-summary',
        generatedAt: '2026-05-28T00:00:00.000Z',
        remoteHost: '127.0.0.1:3200',
        requestedDomains: ['bbc.com'],
        deployPreflightImplication: 'blocked-busy-pending',
        nextSafestAction: 'retain-queue-or-run-maintenance-checklist',
        totals: { pending: 1273, running: 0 },
        readinessCounts: { 'stopped-with-pending': 1 },
        missingDomains: [],
        domains: [{ domain: 'bbc.com', state: 'stopped', isRunning: false, pending: 1273, errors: 0, stored: 3 }],
      }));
      fs.writeFileSync(readinessPath, JSON.stringify({
        schemaVersion: 1,
        mode: 'remote-crawler-combined-readiness-report',
        generatedAt: '2026-05-28T00:00:00.000Z',
        readinessLabel: 'blocked-busy-pending',
        blockers: ['blocked-busy-pending', 'pending-queue-retained'],
        warnings: [],
        nextSafestAction: 'retain-queue-or-run-maintenance-checklist',
        queueSummary: {
          requestedDomains: ['bbc.com'],
          totals: { pending: 1273, running: 0 },
          deployPreflightImplication: 'blocked-busy-pending',
        },
      }));

      const result = spawnSync(process.execPath, [
        scriptPath,
        'maintenance-decision',
        '--json',
        '--reference-at',
        '2026-05-28T00:10:00.000Z',
        '--maintenance-action',
        'prune',
        '--readiness-report',
        readinessPath,
        '--queue-summary',
        queuePath,
      ], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.mode).toBe('remote-queue-maintenance-decision');
      expect(report.requestedAction).toBe('prune');
      expect(report.blockers).toEqual(expect.arrayContaining([
        'missing-APPROVE_REMOTE_QUEUE_MAINTENANCE',
      ]));
      expect(report.actionPolicy).toMatchObject({
        readOnly: true,
        executesRemoteAction: false,
        prunesRemote: false,
      });
      expect(result.stdout).not.toContain('https://');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('prints file-only sync proof readiness without running sync or dumping URLs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-remote-sync-proof-readiness-'));
    try {
      const queuePath = path.join(dir, 'queue.json');
      const readinessPath = path.join(dir, 'readiness.json');
      fs.writeFileSync(queuePath, JSON.stringify({
        schemaVersion: 1,
        mode: 'remote-queue-summary',
        generatedAt: '2026-05-28T00:00:00.000Z',
        remoteHost: '127.0.0.1:3200',
        requestedDomains: ['bbc.com'],
        deployPreflightImplication: 'blocked-busy-pending',
        nextSafestAction: 'retain-queue-or-run-maintenance-checklist',
        totals: { pending: 1273, running: 0 },
        readinessCounts: { 'stopped-with-pending': 1 },
        missingDomains: [],
        domains: [{ domain: 'bbc.com', state: 'stopped', isRunning: false, pending: 1273, errors: 0, stored: 3 }],
      }));
      fs.writeFileSync(readinessPath, JSON.stringify({
        schemaVersion: 1,
        mode: 'remote-crawler-combined-readiness-report',
        generatedAt: '2026-05-28T00:00:00.000Z',
        readinessLabel: 'blocked-busy-pending',
        blockers: ['blocked-busy-pending', 'pending-queue-retained'],
        warnings: [],
        nextSafestAction: 'retain-queue-or-run-maintenance-checklist',
        queueSummary: {
          requestedDomains: ['bbc.com'],
          totals: { pending: 1273, running: 0 },
          deployPreflightImplication: 'blocked-busy-pending',
        },
      }));

      const result = spawnSync(process.execPath, [
        scriptPath,
        'sync-proof-readiness',
        '--json',
        '--reference-at',
        '2026-05-28T00:10:00.000Z',
        '--readiness-report',
        readinessPath,
        '--queue-summary',
        queuePath,
      ], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.mode).toBe('remote-sync-local-proof-readiness');
      expect(report.actionPolicy).toMatchObject({
        readOnly: true,
        executesRemoteAction: false,
        syncsLocalDb: false,
      });
      expect(report.proofPlan.command).toContain('--no-prune-after-ingest');
      expect(result.stdout).not.toContain('https://');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('prints file-only maintenance execution plan without running maintenance', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-remote-maintenance-execution-plan-'));
    try {
      const queuePath = path.join(dir, 'queue.json');
      const readinessPath = path.join(dir, 'readiness.json');
      const decisionPath = path.join(dir, 'decision.json');
      const syncProofPath = path.join(dir, 'sync-proof.json');
      const deployPath = path.join(dir, 'deploy.json');
      const queue = {
        schemaVersion: 1,
        mode: 'remote-queue-summary',
        generatedAt: '2026-05-28T00:00:00.000Z',
        remoteHost: '127.0.0.1:3200',
        requestedDomains: ['bbc.com'],
        deployPreflightImplication: 'blocked-busy-pending',
        nextSafestAction: 'retain-queue-or-run-maintenance-checklist',
        totals: { pending: 1273, running: 0 },
        readinessCounts: { 'stopped-with-pending': 1 },
        missingDomains: [],
        domains: [{ domain: 'bbc.com', state: 'stopped', isRunning: false, pending: 1273, errors: 0, stored: 3 }],
      };
      const readiness = {
        schemaVersion: 1,
        mode: 'remote-crawler-combined-readiness-report',
        generatedAt: '2026-05-28T00:00:00.000Z',
        readinessLabel: 'blocked-busy-pending',
        blockers: ['blocked-busy-pending', 'pending-queue-retained'],
        warnings: [],
        nextSafestAction: 'retain-queue-or-run-maintenance-checklist',
        queueSummary: {
          requestedDomains: ['bbc.com'],
          totals: { pending: 1273, running: 0 },
          deployPreflightImplication: 'blocked-busy-pending',
        },
      };
      const decision = {
        schemaVersion: 1,
        mode: 'remote-queue-maintenance-decision',
        generatedAt: '2026-05-28T00:00:00.000Z',
        requestedAction: 'sync-local-proof',
        decisionLabel: 'approval-recorded-execution-unimplemented',
        action: { executionImplemented: false, executionAllowed: false },
        actionPolicy: { readOnly: true, executesRemoteAction: false },
        blockers: [],
        warnings: [],
        queue: {
          remoteHost: '127.0.0.1:3200',
          requestedDomains: ['bbc.com'],
          affectedDomains: [{ domain: 'bbc.com', state: 'stopped', isRunning: false, pending: 1273, errors: 0, stored: 3 }],
          pendingTotal: 1273,
          runningTotal: 0,
        },
        commands: {
          syncLocalProofPlan: 'node tools/crawl/crawl-remote.js sync --host 127.0.0.1:3200 --rounds 1 --limit 25 --include-content true --include-links true --no-prune-after-ingest',
          localDbConfirmationPlan: 'node tools/db/downloads.js recent --limit 20',
          rollbackStopCommand: 'node tools/crawl/crawl-remote.js stop --host 127.0.0.1:3200 --domains bbc.com',
        },
      };
      const syncProof = {
        schemaVersion: 1,
        mode: 'remote-sync-local-proof-readiness',
        generatedAt: '2026-05-28T00:00:00.000Z',
        decisionLabel: 'ready-for-operator-sync-proof-review',
        blockers: [],
        warnings: [],
        queue: {
          affectedDomains: [{ domain: 'bbc.com', state: 'stopped', isRunning: false, pending: 1273 }],
          pendingTotal: 1273,
          runningTotal: 0,
        },
        proofPlan: {
          command: 'node tools/crawl/crawl-remote.js sync --host 127.0.0.1:3200 --rounds 1 --limit 25 --include-content true --include-links true --no-prune-after-ingest',
          confirmationCommand: 'node tools/db/downloads.js recent --limit 20',
          rollbackStopCommand: 'node tools/crawl/crawl-remote.js stop --host 127.0.0.1:3200 --domains bbc.com',
          requiredFlags: ['--rounds 1', '--limit 25', '--include-content true', '--include-links true', '--no-prune-after-ingest'],
          caveats: [
            'This planned sync proof writes local DB proof only if an operator runs it later.',
            'Inspect prune ledger state before treating sync/pull as non-mutating.',
          ],
        },
      };
      fs.writeFileSync(queuePath, JSON.stringify(queue));
      fs.writeFileSync(readinessPath, JSON.stringify(readiness));
      fs.writeFileSync(decisionPath, JSON.stringify(decision));
      fs.writeFileSync(syncProofPath, JSON.stringify(syncProof));
      fs.writeFileSync(deployPath, JSON.stringify({
        mode: 'preflight-only',
        generatedAt: '2026-05-28T00:00:00.000Z',
        decision: 'blocked-busy',
        readyForLiveSeedProof: false,
        busy: { busy: true, pending: 1273, runningDomains: [] },
      }));

      const result = spawnSync(process.execPath, [
        scriptPath,
        'maintenance-execution-plan',
        '--json',
        '--reference-at',
        '2026-05-28T00:10:00.000Z',
        '--maintenance-action',
        'sync-local-proof',
        '--maintenance-decision',
        decisionPath,
        '--sync-proof-readiness',
        syncProofPath,
        '--readiness-report',
        readinessPath,
        '--queue-summary',
        queuePath,
        '--deploy-proof',
        deployPath,
      ], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.mode).toBe('remote-queue-maintenance-execution-plan');
      expect(report.actionPolicy).toMatchObject({
        readOnly: true,
        dryRunOnly: true,
        executesRemoteAction: false,
        syncsLocalDb: false,
      });
      expect(report.executionSkeleton.plannedCommand).toContain('--no-prune-after-ingest');
      expect(result.stdout).not.toContain('https://');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('prints file-only second seed readiness without contacting a remote crawler', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-remote-second-seed-readiness-'));
    try {
      const queuePath = path.join(dir, 'queue.json');
      const readinessPath = path.join(dir, 'readiness.json');
      const deployPath = path.join(dir, 'deploy.json');
      const artifactPath = path.join(dir, 'artifact.json');
      const previewPath = path.join(dir, 'preview.json');
      const postPath = path.join(dir, 'post.json');
      fs.writeFileSync(queuePath, JSON.stringify({
        schemaVersion: 1,
        mode: 'remote-queue-summary',
        generatedAt: '2026-05-28T00:00:00.000Z',
        requestedDomains: ['bbc.com'],
        deployPreflightImplication: 'ready-for-deploy-preflight',
        nextSafestAction: 'run-deploy-preflight-before-seed-or-deploy',
        totals: { pending: 0, running: 0 },
        readinessCounts: { 'no-pending': 1 },
        missingDomains: [],
        domains: [{ domain: 'bbc.com', state: 'stopped', isRunning: false, pending: 0 }],
      }));
      fs.writeFileSync(readinessPath, JSON.stringify({
        schemaVersion: 1,
        mode: 'remote-crawler-combined-readiness-report',
        generatedAt: '2026-05-28T00:00:00.000Z',
        readinessLabel: 'ready-for-human-approval-review',
        blockers: [],
        warnings: [],
        queueSummary: {
          requestedDomains: ['bbc.com'],
          totals: { pending: 0, running: 0 },
          deployPreflightImplication: 'ready-for-deploy-preflight',
        },
      }));
      fs.writeFileSync(deployPath, JSON.stringify({
        mode: 'preflight-only',
        generatedAt: '2026-05-28T00:00:00.000Z',
        decision: 'current',
        readyForLiveSeedProof: true,
      }));
      fs.writeFileSync(artifactPath, JSON.stringify({
        schemaVersion: 1,
        mode: 'full',
        generatedAt: '2026-05-28T00:00:00.000Z',
        domains: [{
          host: 'bbc.com',
          recommendations: [{ url: 'https://bbc.com/should-not-print' }],
        }],
      }));
      fs.writeFileSync(previewPath, JSON.stringify({
        mode: 'graph-feedback-live-seed-preview-evidence',
        fingerprint: 'abc123',
        plannedHosts: ['bbc.com'],
        candidateCount: 1,
        requestBodyBytes: 128,
      }));
      fs.writeFileSync(postPath, JSON.stringify({
        mode: 'graph-feedback-live-seed-post-seed-verification',
        checks: [{ name: 'health' }],
      }));

      const result = spawnSync(process.execPath, [
        scriptPath,
        'second-seed-readiness',
        '--json',
        '--reference-at',
        '2026-05-28T00:10:00.000Z',
        '--queue-summary',
        queuePath,
        '--readiness-report',
        readinessPath,
        '--deploy-proof',
        deployPath,
        '--graph-artifact',
        artifactPath,
        '--preview-evidence',
        previewPath,
        '--post-seed-checklist',
        postPath,
      ], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.mode).toBe('remote-second-seed-readiness');
      expect(report.readinessLabel).toBe('ready-for-human-second-seed-review');
      expect(report.actionPolicy).toMatchObject({
        readOnly: true,
        dryRunOnly: true,
        seedsRemote: false,
      });
      expect(result.stdout).not.toContain('https://bbc.com/should-not-print');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects malformed maintenance decision evidence before any remote contact', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-remote-maintenance-bad-json-'));
    try {
      const readinessPath = path.join(dir, 'readiness.json');
      fs.writeFileSync(readinessPath, '{bad json');

      const result = spawnSync(process.execPath, [
        scriptPath,
        'maintenance-decision',
        '--json',
        '--readiness-report',
        readinessPath,
      ], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid readiness report evidence JSON');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects malformed maintenance execution evidence before any remote contact', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-remote-maintenance-exec-bad-json-'));
    try {
      const decisionPath = path.join(dir, 'decision.json');
      fs.writeFileSync(decisionPath, '{bad json');

      const result = spawnSync(process.execPath, [
        scriptPath,
        'maintenance-execution-plan',
        '--json',
        '--maintenance-decision',
        decisionPath,
      ], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid maintenance decision evidence JSON');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects malformed second-seed readiness evidence before any remote contact', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crawl-remote-second-seed-bad-json-'));
    try {
      const queuePath = path.join(dir, 'queue.json');
      fs.writeFileSync(queuePath, '{bad json');

      const result = spawnSync(process.execPath, [
        scriptPath,
        'second-seed-readiness',
        '--json',
        '--queue-summary',
        queuePath,
      ], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid queue summary evidence JSON');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('crawl-remote read-only proof commands', () => {
  const scriptPath = path.resolve(__dirname, '../../../tools/crawl/crawl-remote.js');
  let server;
  let baseHost;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/status') {
        res.end(JSON.stringify({
          service: 'test crawler',
          version: 'test',
          schemaVersion: 4,
          orchestrator: { running: false, currentlyRunning: 0, maxConcurrent: 1 },
          totals: { fetched: 0, stored: 0, errors: 0, pending: 0 },
          domains: [],
        }));
        return;
      }
      if (req.url === '/api/errors?limit=10') {
        res.end(JSON.stringify({ count: 0, errors: [] }));
        return;
      }
      if (req.url === '/api/content/stats') {
        res.end(JSON.stringify({ totals: { total_stored: 0 }, byDomain: [] }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });
    server.listen(0, '127.0.0.1', () => {
      baseHost = `127.0.0.1:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  function runProofCommand(commandArgs) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [
        scriptPath,
        ...commandArgs,
        '--host',
        baseHost,
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({ timedOut: true, stdout, stderr });
      }, 3000);
      child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
      child.on('exit', (status, signal) => {
        clearTimeout(timeout);
        resolve({ timedOut: false, status, signal, stdout, stderr });
      });
    });
  }

  test.each([
    ['status', ['status', '--json']],
    ['errors', ['errors', '--limit', '10', '--json']],
    ['content', ['content', '--json']],
    ['queue-summary', ['queue-summary', '--json']],
    ['queue-checklist', ['queue-checklist', '--json']],
  ])('%s exits after printing JSON', async (_name, commandArgs) => {
    const result = await runProofCommand(commandArgs);

    expect(result.timedOut).toBe(false);
    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });
});
