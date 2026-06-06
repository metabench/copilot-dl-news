'use strict';

const {
  buildCombinedReadinessReport,
  buildQueueMaintenanceDecisionArtifact,
  buildQueueMaintenanceExecutionPlanArtifact,
  buildQueueMaintenanceChecklist,
  buildQueueSummary,
  buildSecondSeedReadinessArtifact,
  buildSyncLocalProofReadinessArtifact,
  classifyRemoteOperation,
  normalizeQueueOptions,
  renderCombinedReadinessReportText,
  renderQueueMaintenanceDecisionText,
  renderQueueMaintenanceExecutionPlanText,
  renderQueueMaintenanceChecklistText,
  renderQueueSummaryText,
  renderSecondSeedReadinessText,
  renderSyncLocalProofReadinessText,
} = require('../../../tools/crawl/lib/remote-queue-summary');

function statusFor(domains) {
  return {
    version: 'test',
    schemaVersion: 4,
    build: { buildId: 'test-build' },
    orchestrator: { running: false, currentlyRunning: 0, maxConcurrent: 2 },
    domains,
  };
}

describe('remote queue summary', () => {
  test('classifies stopped domains with pending URLs as deploy-blocking retained queues', () => {
    const summary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { fetched: 3, done: 3, errors: 0, pending: 1273 },
        contentPipeline: { totalStored: 3, totalCompressedMB: 1 },
      },
    ]), {
      domains: 'bbc.com',
      remoteHost: '127.0.0.1:3200',
      errorsPayload: { count: 0, errors: [] },
      contentStats: { byDomain: [{ domain: 'bbc.com', count: 3 }] },
      generatedAt: '2026-05-28T00:00:00.000Z',
    });

    expect(summary.actionPolicy).toMatchObject({
      readOnly: true,
      seedsRemote: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      deploysRemote: false,
    });
    expect(summary.deployPreflightImplication).toBe('blocked-busy-pending');
    expect(summary.nextSafestAction).toBe('retain-queue-or-run-maintenance-checklist');
    expect(summary.domains[0]).toMatchObject({
      domain: 'bbc.com',
      readiness: 'stopped-with-pending',
      pending: 1273,
      stored: 3,
    });
    expect(summary.caveats.join(' ')).toContain('Stopped domains with pending URLs still block deploy');
  });

  test('classifies running domains with pending URLs separately from retained stopped queues', () => {
    const summary = buildQueueSummary(statusFor([
      {
        domain: 'guardian.com',
        state: 'running',
        isRunning: true,
        stats: { fetched: 10, done: 8, errors: 1, pending: 20 },
      },
    ]), {
      errorsPayload: { count: 1, errors: [{ host: 'guardian.com', message: 'timeout' }] },
    });

    expect(summary.deployPreflightImplication).toBe('blocked-running');
    expect(summary.domains[0]).toMatchObject({
      readiness: 'running-with-pending',
      recentErrorCount: 1,
      nextSafestAction: 'wait-or-stop-with-approval',
    });
  });

  test('reports clean no-pending domains as ready for deploy preflight, not ready for deploy', () => {
    const summary = buildQueueSummary(statusFor([
      {
        domain: 'apnews.com',
        state: 'stopped',
        isRunning: false,
        stats: { fetched: 5, done: 5, errors: 0, pending: 0 },
      },
    ]));

    expect(summary.deployPreflightImplication).toBe('ready-for-deploy-preflight');
    expect(summary.nextSafestAction).toBe('run-deploy-preflight-before-seed-or-deploy');
    expect(renderQueueSummaryText(summary)).toContain('no remote state is pruned');
  });

  test('reports requested hosts missing from remote status without guessing', () => {
    const summary = buildQueueSummary(statusFor([
      { domain: 'bbc.com', state: 'stopped', isRunning: false, stats: { pending: 0 } },
    ]), {
      domains: 'missing.example',
    });

    expect(summary.missingDomains).toEqual(['missing.example']);
    expect(summary.deployPreflightImplication).toBe('host-not-found');
    expect(summary.nextSafestAction).toBe('fix-host-selection-before-maintenance');
    expect(summary.domains).toEqual([]);
  });

  test('rejects malformed status payloads and invalid bounds clearly', () => {
    expect(() => buildQueueSummary({ domains: null })).toThrow('domains array');
    expect(normalizeQueueOptions({ requestedDomains: ['BBC.com', 'www.BBC.com'] }).requestedDomains).toEqual(['bbc.com']);
    expect(() => normalizeQueueOptions({ maxDomains: 500 })).toThrow('maxDomains must be an integer');
    expect(() => normalizeQueueOptions({ errorLimit: 0 })).toThrow('errorLimit must be an integer');
  });

  test('builds a read-only maintenance checklist with separate approvals', () => {
    const summary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { fetched: 3, done: 3, errors: 0, pending: 1273 },
      },
    ]), {
      domains: 'bbc.com',
      remoteHost: '141.144.193.218:3200',
    });
    const checklist = buildQueueMaintenanceChecklist(summary, {
      generatedAt: '2026-05-28T00:00:00.000Z',
    });

    expect(checklist.actionPolicy).toMatchObject({
      readOnly: true,
      stopsRemote: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      forceDeploys: false,
    });
    expect(checklist.approvals).toMatchObject({
      queueMaintenanceRequired: true,
      queueMaintenanceToken: 'APPROVE_REMOTE_QUEUE_MAINTENANCE',
      forceDeployToken: 'APPROVE_REMOTE_FORCE_DEPLOY',
      present: false,
    });
    expect(checklist.requiredEvidence.map(item => item.name)).toEqual(expect.arrayContaining([
      'current-queue-summary',
      'sync-local-proof-plan',
      'local-db-confirmation-plan',
      'rollback-stop-command',
    ]));
    expect(renderQueueMaintenanceChecklistText(checklist)).toContain('drain-or-prune-or-clear: destructive=true');
  });

  test('classifies remote operations by safety class and approval boundary', () => {
    expect(classifyRemoteOperation('status')).toMatchObject({
      class: 'read-only',
      mutatesRemote: false,
      writesLocalDb: false,
      approvalToken: null,
    });
    expect(classifyRemoteOperation('queue-checklist')).toMatchObject({
      class: 'read-only',
      mutatesRemote: false,
    });
    expect(classifyRemoteOperation('readiness-report')).toMatchObject({
      class: 'read-only',
      mutatesRemote: false,
      writesLocalDb: false,
    });
    expect(classifyRemoteOperation('maintenance-decision')).toMatchObject({
      class: 'read-only',
      mutatesRemote: false,
      writesLocalDb: false,
    });
    expect(classifyRemoteOperation('sync-proof-readiness')).toMatchObject({
      class: 'read-only',
      mutatesRemote: false,
      writesLocalDb: false,
    });
    expect(classifyRemoteOperation('maintenance-execution-plan')).toMatchObject({
      class: 'read-only',
      mutatesRemote: false,
      writesLocalDb: false,
    });
    expect(classifyRemoteOperation('second-seed-readiness')).toMatchObject({
      class: 'read-only',
      mutatesRemote: false,
      writesLocalDb: false,
    });
    expect(classifyRemoteOperation('monitored-small-crawl')).toMatchObject({
      class: 'read-only',
      mutatesRemote: false,
      writesLocalDb: false,
    });
    expect(classifyRemoteOperation('sync')).toMatchObject({
      class: 'sync-local-proof',
      mutatesRemote: 'conditional-prune',
      writesLocalDb: true,
    });
    expect(classifyRemoteOperation('stop')).toMatchObject({
      class: 'safe-stop-stabilize',
      mutatesRemote: true,
      approvalToken: 'APPROVE_REMOTE_QUEUE_MAINTENANCE',
    });
    expect(classifyRemoteOperation('prune')).toMatchObject({
      class: 'destructive-maintenance',
      approvalToken: 'APPROVE_REMOTE_QUEUE_MAINTENANCE',
    });
    expect(classifyRemoteOperation('force-deploy')).toMatchObject({
      class: 'deploy-action',
      approvalToken: 'APPROVE_REMOTE_FORCE_DEPLOY',
    });
    expect(classifyRemoteOperation('unknown-op')).toMatchObject({
      class: 'unknown',
      mutatesRemote: 'unknown',
    });
  });

  test('builds bounded combined readiness report without copying URLs or remote payloads', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { fetched: 3, done: 3, errors: 0, pending: 0 },
      },
    ]), {
      domains: 'bbc.com',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const graphArtifact = {
      schemaVersion: 1,
      mode: 'full',
      generatedAt: '2026-05-28T00:00:00.000Z',
      recommendationCount: 1,
      domains: [{
        host: 'bbc.com',
        recommendations: [{ url: 'https://bbc.com/news', reason: 'missing content' }],
      }],
    };
    const report = buildCombinedReadinessReport({
      generatedAt: '2026-05-28T00:10:00.000Z',
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
      deployProof: {
        path: '/tmp/deploy.json',
        byteSize: 100,
        value: {
          mode: 'preflight-only',
          generatedAt: '2026-05-28T00:00:00.000Z',
          decision: 'current',
          readyForLiveSeedProof: true,
          localBuild: { current: true, buildId: 'local', builtAt: '2026-05-28T00:00:00.000Z', staleReasons: [] },
          remoteBuild: { buildId: 'remote', builtAt: '2026-05-28T00:00:00.000Z' },
        },
      },
      graphArtifact: { path: '/tmp/artifact.json', byteSize: 200, value: graphArtifact },
      previewEvidence: {
        path: '/tmp/preview.json',
        byteSize: 100,
        value: {
          mode: 'graph-feedback-live-seed-preview-evidence',
          fingerprint: 'abc123',
          plannedHosts: ['bbc.com'],
          candidateCount: 1,
          requestBodyBytes: 128,
        },
      },
      postSeedPlan: {
        path: '/tmp/post.json',
        byteSize: 100,
        value: { mode: 'graph-feedback-live-seed-post-seed-verification', checks: [{ name: 'health' }] },
      },
    });

    expect(report).toMatchObject({
      mode: 'remote-crawler-combined-readiness-report',
      readinessLabel: 'ready-for-human-approval-review',
      actionPolicy: {
        readOnly: true,
        seedsRemote: false,
        prunesRemote: false,
        deploysRemote: false,
      },
      graphArtifact: {
        hosts: ['bbc.com'],
        recommendationCount: 1,
      },
      previewEvidence: {
        fingerprint: 'abc123',
        candidateCount: 1,
      },
    });
    expect(JSON.stringify(report)).not.toContain('https://bbc.com/news');
    expect(renderCombinedReadinessReportText(report)).toContain('No-action policy');
  });

  test('combined readiness report handles stale, missing, and busy evidence', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { pending: 1273 },
      },
    ]), {
      domains: 'bbc.com',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const report = buildCombinedReadinessReport({
      generatedAt: '2026-05-28T02:30:00.000Z',
      staleAfterMs: 60 * 60 * 1000,
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
      deployProof: {
        path: '/tmp/deploy.json',
        byteSize: 100,
        value: {
          mode: 'preflight-only',
          decision: 'blocked-busy',
          readyForLiveSeedProof: false,
          busy: { busy: true, pending: 1273, runningDomains: [] },
        },
      },
    });

    expect(report.readinessLabel).toBe('needs-fresh-queue-summary');
    expect(report.blockers).toEqual(expect.arrayContaining([
      'needs-fresh-queue-summary',
      'pending-queue-retained',
      'deploy-preflight-blocked-busy',
    ]));
    expect(report.warnings).toEqual(expect.arrayContaining([
      'queue summary is stale; refresh before maintenance or seeding',
      'deploy proof generatedAt missing; rerun preflight for current proof',
      'deploy proof decision is blocked-busy',
      'deploy proof reports busy remote state',
      'graph artifact evidence missing',
      'preview evidence missing',
      'post-seed proof plan missing',
    ]));
  });

  test('builds file-only maintenance decision for retained pending queue', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { fetched: 3, done: 3, errors: 0, pending: 1273 },
      },
    ]), {
      domains: 'bbc.com',
      remoteHost: '141.144.193.218:3200',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const readinessReport = buildCombinedReadinessReport({
      generatedAt: '2026-05-28T00:10:00.000Z',
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
    });
    const decision = buildQueueMaintenanceDecisionArtifact({
      generatedAt: '2026-05-28T00:11:00.000Z',
      maintenanceAction: 'retain-queue',
      readinessReport: { path: '/tmp/readiness.json', byteSize: 100, value: readinessReport },
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
    });

    expect(decision).toMatchObject({
      mode: 'remote-queue-maintenance-decision',
      requestedAction: 'retain-queue',
      decisionLabel: 'retain-queue',
      actionPolicy: {
        readOnly: true,
        executesRemoteAction: false,
        syncsLocalDb: false,
        prunesRemote: false,
        drainsRemote: false,
        forceDeploys: false,
      },
      queue: {
        pendingTotal: 1273,
        runningTotal: 0,
      },
    });
    expect(decision.blockers).toContain('blocked-busy-pending');
    expect(decision.evidenceValidation).toMatchObject({
      hostMatch: true,
      pendingCountMatch: true,
      queueSummaryFresh: true,
    });
    expect(decision.commands.syncLocalProofPlan).toContain('--no-prune-after-ingest');
    expect(renderQueueMaintenanceDecisionText(decision)).toContain('No-action policy');
  });

  test('adds blockers for stale or mismatched maintenance evidence before action approval', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'guardian.com',
        state: 'stopped',
        isRunning: false,
        stats: { pending: 44 },
      },
    ]), {
      domains: 'guardian.com',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const readinessReport = {
      schemaVersion: 1,
      mode: 'remote-crawler-combined-readiness-report',
      generatedAt: '2026-05-28T00:00:00.000Z',
      readinessLabel: 'blocked-busy-pending',
      blockers: [],
      warnings: [],
      nextSafestAction: 'retain-queue-or-run-maintenance-checklist',
      queueSummary: {
        requestedDomains: ['bbc.com'],
        totals: { pending: 1273, running: 0 },
        deployPreflightImplication: 'blocked-busy-pending',
      },
    };

    const decision = buildQueueMaintenanceDecisionArtifact({
      generatedAt: '2026-05-28T02:30:00.000Z',
      staleAfterMs: 60 * 60 * 1000,
      maintenanceAction: 'drain',
      approvalToken: 'APPROVE_REMOTE_QUEUE_MAINTENANCE',
      readinessReport: { path: '/tmp/readiness.json', byteSize: 100, value: readinessReport },
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
    });

    expect(decision.evidenceValidation).toMatchObject({
      hostMatch: false,
      pendingCountMatch: false,
      queueSummaryFresh: false,
    });
    expect(decision.blockers).toEqual(expect.arrayContaining([
      'stale-readiness-report',
      'fresh-queue-summary-required',
      'queue-readiness-host-mismatch',
      'queue-pending-count-mismatch',
    ]));
    expect(decision.action.executionAllowed).toBe(false);
    expect(decision.actionPolicy.drainsRemote).toBe(false);
  });

  test('blocks destructive maintenance when approval is missing or wrong token is supplied', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { pending: 1273 },
      },
    ]), {
      domains: 'bbc.com',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const readinessReport = buildCombinedReadinessReport({
      generatedAt: '2026-05-28T00:10:00.000Z',
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
    });

    const missingApproval = buildQueueMaintenanceDecisionArtifact({
      generatedAt: '2026-05-28T00:11:00.000Z',
      maintenanceAction: 'prune',
      approvalToken: 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE',
      readinessReport: { path: '/tmp/readiness.json', byteSize: 100, value: readinessReport },
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
    });

    expect(missingApproval.action.requiredToken).toBe('APPROVE_REMOTE_QUEUE_MAINTENANCE');
    expect(missingApproval.action.approvalPresent).toBe(false);
    expect(missingApproval.blockers).toEqual(expect.arrayContaining([
      'missing-APPROVE_REMOTE_QUEUE_MAINTENANCE',
    ]));
    expect(missingApproval.warnings).toContain('graph-feedback seed approval does not authorize queue maintenance or force deploy');
    expect(missingApproval.actionPolicy.prunesRemote).toBe(false);
  });

  test('records force-deploy approval gate without enabling execution', () => {
    const decision = buildQueueMaintenanceDecisionArtifact({
      generatedAt: '2026-05-28T00:11:00.000Z',
      maintenanceAction: 'force-deploy',
      approvalToken: 'APPROVE_REMOTE_FORCE_DEPLOY',
      readinessReport: {
        path: '/tmp/readiness.json',
        byteSize: 100,
        value: {
          mode: 'remote-crawler-combined-readiness-report',
          generatedAt: '2026-05-28T00:10:00.000Z',
          readinessLabel: 'blocked-busy-pending',
          blockers: ['pending-queue-retained'],
          warnings: [],
          nextSafestAction: 'retain-queue-or-run-maintenance-checklist',
          queueSummary: {
            requestedDomains: ['bbc.com'],
            totals: { pending: 1273, running: 0 },
            deployPreflightImplication: 'blocked-busy-pending',
          },
        },
      },
    });

    expect(decision.action).toMatchObject({
      requiredToken: 'APPROVE_REMOTE_FORCE_DEPLOY',
      approvalPresent: true,
      executionImplemented: false,
      executionAllowed: false,
    });
    expect(decision.blockers).toEqual(expect.arrayContaining([
      'pending-queue-retained',
      'force-deploy-with-retained-pending-queue',
    ]));
    expect(decision.actionPolicy.forceDeploys).toBe(false);
  });

  test('warns that sync/local proof is not pure read-only', () => {
    const decision = buildQueueMaintenanceDecisionArtifact({
      generatedAt: '2026-05-28T00:11:00.000Z',
      maintenanceAction: 'sync-local-proof',
    });

    expect(decision.action.operationClass).toMatchObject({
      class: 'sync-local-proof',
      mutatesRemote: 'conditional-prune',
      writesLocalDb: true,
    });
    expect(decision.warnings.join(' ')).toContain('pending prune ledger');
    expect(decision.commands.syncLocalProofPlan).toContain('--no-prune-after-ingest');
    expect(decision.actionPolicy.syncsLocalDb).toBe(false);
  });

  test('builds no-contact sync/local proof readiness artifact with no-prune command', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { fetched: 3, done: 3, errors: 0, pending: 1273 },
      },
    ]), {
      domains: 'bbc.com',
      remoteHost: '141.144.193.218:3200',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const readinessReport = buildCombinedReadinessReport({
      generatedAt: '2026-05-28T00:10:00.000Z',
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
    });

    const report = buildSyncLocalProofReadinessArtifact({
      generatedAt: '2026-05-28T00:11:00.000Z',
      readinessReport: { path: '/tmp/readiness.json', byteSize: 100, value: readinessReport },
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
    });

    expect(report).toMatchObject({
      mode: 'remote-sync-local-proof-readiness',
      decisionLabel: 'ready-for-operator-sync-proof-review',
      actionPolicy: {
        readOnly: true,
        executesRemoteAction: false,
        syncsLocalDb: false,
        prunesRemote: false,
      },
      queue: {
        pendingTotal: 1273,
        runningTotal: 0,
      },
    });
    expect(report.blockers).toEqual([]);
    expect(report.proofPlan.command).toContain('--no-prune-after-ingest');
    expect(JSON.stringify(report)).not.toContain('https://');
    expect(renderSyncLocalProofReadinessText(report)).toContain('No-action policy');
  });

  test('sync/local proof readiness blocks running queues and no-pending queues', () => {
    const runningQueue = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'running',
        isRunning: true,
        stats: { pending: 4 },
      },
    ]), {
      domains: 'bbc.com',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const runningReport = buildSyncLocalProofReadinessArtifact({
      generatedAt: '2026-05-28T00:10:00.000Z',
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: runningQueue },
    });

    expect(runningReport.blockers).toContain('running-queue-stop-before-sync-proof');

    const cleanQueue = buildQueueSummary(statusFor([
      {
        domain: 'apnews.com',
        state: 'stopped',
        isRunning: false,
        stats: { pending: 0 },
      },
    ]), {
      domains: 'apnews.com',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const cleanReport = buildSyncLocalProofReadinessArtifact({
      generatedAt: '2026-05-28T00:10:00.000Z',
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: cleanQueue },
    });

    expect(cleanReport.blockers).toContain('no-pending-queue-to-prove');
  });

  test('rejects unknown maintenance actions clearly', () => {
    expect(() => buildQueueMaintenanceDecisionArtifact({
      maintenanceAction: 'teleport',
    })).toThrow('maintenanceAction must be one of');
  });

  test('builds dry-run execution plan for sync/local proof with evidence validators', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { fetched: 3, done: 3, errors: 0, pending: 1273 },
      },
    ]), {
      domains: 'bbc.com',
      remoteHost: '141.144.193.218:3200',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const readinessReport = buildCombinedReadinessReport({
      generatedAt: '2026-05-28T00:05:00.000Z',
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
      deployProof: {
        path: '/tmp/deploy.json',
        byteSize: 100,
        value: {
          mode: 'preflight-only',
          generatedAt: '2026-05-28T00:00:00.000Z',
          decision: 'blocked-busy',
          readyForLiveSeedProof: false,
          busy: { busy: true, pending: 1273, runningDomains: [] },
        },
      },
    });
    const decision = buildQueueMaintenanceDecisionArtifact({
      generatedAt: '2026-05-28T00:06:00.000Z',
      maintenanceAction: 'sync-local-proof',
      readinessReport: { path: '/tmp/readiness.json', byteSize: 100, value: readinessReport },
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
    });
    const syncProof = buildSyncLocalProofReadinessArtifact({
      generatedAt: '2026-05-28T00:07:00.000Z',
      readinessReport: { path: '/tmp/readiness.json', byteSize: 100, value: readinessReport },
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
    });

    const plan = buildQueueMaintenanceExecutionPlanArtifact({
      generatedAt: '2026-05-28T00:08:00.000Z',
      maintenanceAction: 'sync-local-proof',
      maintenanceDecision: { path: '/tmp/decision.json', byteSize: 100, value: decision },
      syncProofReadiness: { path: '/tmp/sync-proof.json', byteSize: 100, value: syncProof },
      readinessReport: { path: '/tmp/readiness.json', byteSize: 100, value: readinessReport },
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
      deployProof: {
        path: '/tmp/deploy.json',
        byteSize: 100,
        value: {
          mode: 'preflight-only',
          generatedAt: '2026-05-28T00:00:00.000Z',
          decision: 'blocked-busy',
          readyForLiveSeedProof: false,
          busy: { busy: true, pending: 1273, runningDomains: [] },
        },
      },
    });

    expect(plan).toMatchObject({
      mode: 'remote-queue-maintenance-execution-plan',
      requestedAction: 'sync-local-proof',
      decisionLabel: 'dry-run-ready-execution-disabled',
      actionPolicy: {
        readOnly: true,
        dryRunOnly: true,
        executesRemoteAction: false,
        syncsLocalDb: false,
        prunesRemote: false,
      },
      validators: {
        requiresSyncProofReadiness: true,
        requiresNoPruneSyncProof: true,
        executionRemainsDisabledEvenWhenApproved: true,
      },
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.executionSkeleton.plannedCommand).toContain('--no-prune-after-ingest');
    expect(plan.evidence.syncProofReadiness).toMatchObject({
      noPruneRequired: true,
      localDbConfirmationPlanPresent: true,
      rollbackCommandPresent: true,
      localWriteCaveatPresent: true,
      pruneLedgerCaveatPresent: true,
    });
    expect(JSON.stringify(plan)).not.toContain('https://');
    expect(renderQueueMaintenanceExecutionPlanText(plan)).toContain('No-action policy');
  });

  test('maintenance execution plan keeps approval-present actions disabled', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { pending: 0 },
      },
    ]), {
      domains: 'bbc.com',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const readinessReport = {
      mode: 'remote-crawler-combined-readiness-report',
      generatedAt: '2026-05-28T00:05:00.000Z',
      readinessLabel: 'ready-for-human-approval-review',
      blockers: [],
      warnings: [],
      queueSummary: {
        requestedDomains: ['bbc.com'],
        totals: { pending: 0, running: 0 },
        deployPreflightImplication: 'ready-for-deploy-preflight',
      },
    };
    const decision = {
      mode: 'remote-queue-maintenance-decision',
      generatedAt: '2026-05-28T00:06:00.000Z',
      requestedAction: 'stop-only',
      decisionLabel: 'approval-recorded-execution-unimplemented',
      blockers: [],
      warnings: [],
      action: { executionImplemented: false, executionAllowed: false },
      actionPolicy: { executesRemoteAction: false },
      queue: {
        requestedDomains: ['bbc.com'],
        affectedDomains: [{ domain: 'bbc.com', state: 'stopped', isRunning: false, pending: 0 }],
        pendingTotal: 0,
        runningTotal: 0,
      },
    };
    const plan = buildQueueMaintenanceExecutionPlanArtifact({
      generatedAt: '2026-05-28T00:07:00.000Z',
      maintenanceAction: 'stop-only',
      approvalToken: 'APPROVE_REMOTE_QUEUE_MAINTENANCE',
      maintenanceDecision: { path: '/tmp/decision.json', byteSize: 100, value: decision },
      readinessReport: { path: '/tmp/readiness.json', byteSize: 100, value: readinessReport },
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
      deployProof: {
        path: '/tmp/deploy.json',
        byteSize: 100,
        value: {
          mode: 'preflight-only',
          generatedAt: '2026-05-28T00:00:00.000Z',
          decision: 'current',
          readyForLiveSeedProof: true,
        },
      },
    });

    expect(plan.action).toMatchObject({
      approvalPresent: true,
      executionImplemented: false,
      executionAllowed: false,
    });
    expect(plan.decisionLabel).toBe('approval-recorded-execution-disabled');
    expect(plan.actionPolicy.stopsRemote).toBe(false);
    expect(plan.executionSkeleton.plannedCommand).toContain('crawl-remote.js stop');
  });

  test('maintenance execution plan blocks stale, mismatched, and incomplete evidence', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'guardian.com',
        state: 'stopped',
        isRunning: false,
        stats: { pending: 44 },
      },
    ]), {
      domains: 'guardian.com',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const decision = {
      mode: 'remote-queue-maintenance-decision',
      generatedAt: '2026-05-28T00:00:00.000Z',
      requestedAction: 'prune',
      decisionLabel: 'blocked',
      blockers: [],
      warnings: [],
      queue: {
        requestedDomains: ['bbc.com'],
        affectedDomains: [{ domain: 'bbc.com', state: 'stopped', isRunning: false, pending: 1273 }],
        pendingTotal: 1273,
        runningTotal: 0,
      },
      action: { executionImplemented: false, executionAllowed: false },
      actionPolicy: { executesRemoteAction: false },
    };
    const plan = buildQueueMaintenanceExecutionPlanArtifact({
      generatedAt: '2026-05-28T02:30:00.000Z',
      staleAfterMs: 60 * 60 * 1000,
      maintenanceAction: 'drain',
      approvalToken: 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE',
      maintenanceDecision: { path: '/tmp/decision.json', byteSize: 100, value: decision },
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
    });

    expect(plan.blockers).toEqual(expect.arrayContaining([
      'stale-maintenance-decision',
      'maintenance-action-mismatch',
      'combined-readiness-report-required',
      'deploy-proof-required',
      'sync-proof-readiness-required',
      'maintenance-decision-queue-summary-host-mismatch',
      'maintenance-decision-queue-summary-pending-mismatch',
      'missing-APPROVE_REMOTE_QUEUE_MAINTENANCE',
    ]));
    expect(plan.warnings).toContain('graph-feedback seed approval does not authorize queue maintenance or force deploy');
    expect(plan.actionPolicy.drainsRemote).toBe(false);
  });

  test('force-deploy execution plan requires force approval and busy evidence while staying disabled', () => {
    const decision = buildQueueMaintenanceDecisionArtifact({
      generatedAt: '2026-05-28T00:06:00.000Z',
      maintenanceAction: 'force-deploy',
      approvalToken: 'APPROVE_REMOTE_FORCE_DEPLOY',
      readinessReport: {
        path: '/tmp/readiness.json',
        byteSize: 100,
        value: {
          mode: 'remote-crawler-combined-readiness-report',
          generatedAt: '2026-05-28T00:05:00.000Z',
          readinessLabel: 'blocked-busy-pending',
          blockers: ['pending-queue-retained'],
          warnings: [],
          queueSummary: {
            requestedDomains: ['bbc.com'],
            totals: { pending: 1273, running: 0 },
            deployPreflightImplication: 'blocked-busy-pending',
          },
        },
      },
    });
    const plan = buildQueueMaintenanceExecutionPlanArtifact({
      generatedAt: '2026-05-28T00:07:00.000Z',
      maintenanceAction: 'force-deploy',
      approvalToken: 'APPROVE_REMOTE_FORCE_DEPLOY',
      maintenanceDecision: { path: '/tmp/decision.json', byteSize: 100, value: decision },
      deployProof: {
        path: '/tmp/deploy.json',
        byteSize: 100,
        value: {
          mode: 'preflight-only',
          generatedAt: '2026-05-28T00:05:00.000Z',
          decision: 'blocked-busy',
          readyForLiveSeedProof: false,
          busy: { busy: true, pending: 1273, runningDomains: [] },
        },
      },
    });

    expect(plan.action.requiredToken).toBe('APPROVE_REMOTE_FORCE_DEPLOY');
    expect(plan.action.approvalPresent).toBe(true);
    expect(plan.action.executionAllowed).toBe(false);
    expect(plan.executionSkeleton.plannedCommand).toContain('--force');
    expect(plan.blockers).toEqual(expect.arrayContaining([
      'pending-queue-retained',
      'current-queue-summary-required',
      'combined-readiness-report-required',
    ]));
  });

  test('second seed readiness blocks retained pending queues and deploy proof blockers', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { pending: 1273 },
      },
    ]), {
      domains: 'bbc.com',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const graphArtifact = {
      schemaVersion: 1,
      mode: 'full',
      generatedAt: '2026-05-28T00:00:00.000Z',
      domains: [{
        host: 'bbc.com',
        recommendations: [{ url: 'https://bbc.com/should-not-print' }],
      }],
    };
    const report = buildSecondSeedReadinessArtifact({
      generatedAt: '2026-05-28T00:10:00.000Z',
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
      deployProof: {
        path: '/tmp/deploy.json',
        byteSize: 100,
        value: {
          mode: 'preflight-only',
          generatedAt: '2026-05-28T00:00:00.000Z',
          decision: 'blocked-busy',
          readyForLiveSeedProof: false,
          busy: { busy: true, pending: 1273, runningDomains: [] },
        },
      },
      graphArtifact: { path: '/tmp/artifact.json', byteSize: 100, value: graphArtifact },
      previewEvidence: {
        path: '/tmp/preview.json',
        byteSize: 100,
        value: {
          mode: 'graph-feedback-live-seed-preview-evidence',
          fingerprint: 'abc123',
          plannedHosts: ['bbc.com'],
          candidateCount: 1,
          requestBodyBytes: 128,
        },
      },
      postSeedPlan: {
        path: '/tmp/post.json',
        byteSize: 100,
        value: { mode: 'graph-feedback-live-seed-post-seed-verification', checks: [{ name: 'health' }] },
      },
    });

    expect(report).toMatchObject({
      mode: 'remote-second-seed-readiness',
      readinessLabel: 'blocked-retained-queue',
      actionPolicy: {
        readOnly: true,
        dryRunOnly: true,
        seedsRemote: false,
        syncsLocalDb: false,
        prunesRemote: false,
      },
      evidence: {
        graphCandidateBounds: {
          hostCount: 1,
          totalCandidates: 1,
        },
      },
    });
    expect(report.blockers).toEqual(expect.arrayContaining([
      'queue-blocked-busy-pending',
      'retained-pending-queue-blocks-second-seed',
      'deploy-proof-blocked-busy',
      'deploy-proof-not-ready-for-live-seed',
      'maintenance-execution-plan-required-for-retained-queue-review',
    ]));
    expect(JSON.stringify(report)).not.toContain('https://bbc.com/should-not-print');
    expect(renderSecondSeedReadinessText(report)).toContain('No-action policy');
  });

  test('second seed readiness becomes ready only with clean queue, current deploy proof, and bounded candidates', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { pending: 0, done: 3, fetched: 3 },
      },
    ]), {
      domains: 'bbc.com',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const readinessReport = buildCombinedReadinessReport({
      generatedAt: '2026-05-28T00:05:00.000Z',
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
      deployProof: {
        path: '/tmp/deploy.json',
        byteSize: 100,
        value: {
          mode: 'preflight-only',
          generatedAt: '2026-05-28T00:00:00.000Z',
          decision: 'current',
          readyForLiveSeedProof: true,
        },
      },
      graphArtifact: {
        path: '/tmp/artifact.json',
        byteSize: 100,
        value: {
          schemaVersion: 1,
          mode: 'full',
          generatedAt: '2026-05-28T00:00:00.000Z',
          domains: [{ host: 'bbc.com', recommendations: [{ url: 'https://bbc.com/news' }] }],
        },
      },
      previewEvidence: {
        path: '/tmp/preview.json',
        byteSize: 100,
        value: { fingerprint: 'abc123', plannedHosts: ['bbc.com'], candidateCount: 1, requestBodyBytes: 128 },
      },
    });
    const report = buildSecondSeedReadinessArtifact({
      generatedAt: '2026-05-28T00:10:00.000Z',
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
      readinessReport: { path: '/tmp/readiness.json', byteSize: 100, value: readinessReport },
      deployProof: {
        path: '/tmp/deploy.json',
        byteSize: 100,
        value: {
          mode: 'preflight-only',
          generatedAt: '2026-05-28T00:00:00.000Z',
          decision: 'current',
          readyForLiveSeedProof: true,
        },
      },
      graphArtifact: {
        path: '/tmp/artifact.json',
        byteSize: 100,
        value: {
          schemaVersion: 1,
          mode: 'full',
          generatedAt: '2026-05-28T00:00:00.000Z',
          domains: [{ host: 'bbc.com', recommendations: [{ url: 'https://bbc.com/news' }] }],
        },
      },
      previewEvidence: {
        path: '/tmp/preview.json',
        byteSize: 100,
        value: { fingerprint: 'abc123', plannedHosts: ['bbc.com'], candidateCount: 1, requestBodyBytes: 128 },
      },
      postSeedPlan: {
        path: '/tmp/post.json',
        byteSize: 100,
        value: { mode: 'graph-feedback-live-seed-post-seed-verification', checks: [{ name: 'health' }] },
      },
    });

    expect(report.readinessLabel).toBe('ready-for-human-second-seed-review');
    expect(report.blockers).toEqual([]);
    expect(report.nextSafestAction).toBe('review-approval-checklist-then-request-a-separate-approved-second-seed-prompt');
    expect(report.approvals.liveSeedToken).toBe('APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE');
  });

  test('second seed readiness blocks host mismatch and candidate caps', () => {
    const queueSummary = buildQueueSummary(statusFor([
      {
        domain: 'bbc.com',
        state: 'stopped',
        isRunning: false,
        stats: { pending: 0 },
      },
    ]), {
      domains: 'bbc.com',
      generatedAt: '2026-05-28T00:00:00.000Z',
    });
    const report = buildSecondSeedReadinessArtifact({
      generatedAt: '2026-05-28T00:10:00.000Z',
      queueSummary: { path: '/tmp/queue.json', byteSize: 100, value: queueSummary },
      deployProof: {
        path: '/tmp/deploy.json',
        byteSize: 100,
        value: {
          mode: 'preflight-only',
          generatedAt: '2026-05-28T00:00:00.000Z',
          decision: 'current',
          readyForLiveSeedProof: true,
        },
      },
      graphArtifact: {
        path: '/tmp/artifact.json',
        byteSize: 100,
        value: {
          schemaVersion: 1,
          mode: 'full',
          generatedAt: '2026-05-28T00:00:00.000Z',
          domains: [{
            host: 'guardian.com',
            recommendations: [
              { url: 'https://guardian.com/a' },
              { url: 'https://guardian.com/b' },
              { url: 'https://guardian.com/c' },
              { url: 'https://guardian.com/d' },
            ],
          }],
        },
      },
      previewEvidence: {
        path: '/tmp/preview.json',
        byteSize: 100,
        value: { fingerprint: 'abc123', plannedHosts: ['guardian.com'], candidateCount: 4, requestBodyBytes: 128 },
      },
      postSeedPlan: {
        path: '/tmp/post.json',
        byteSize: 100,
        value: { checks: [{ name: 'health' }] },
      },
    });

    expect(report.blockers).toEqual(expect.arrayContaining([
      'graph-artifact-vs-queue-summary-host-mismatch',
      'preview-evidence-vs-queue-summary-host-mismatch',
      'second-seed-total-candidate-cap-exceeded',
      'second-seed-per-host-candidate-cap-exceeded',
    ]));
    expect(report.actionPolicy.seedsRemote).toBe(false);
  });
});
