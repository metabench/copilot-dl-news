'use strict';

const DEFAULT_MAX_DOMAINS = 25;
const HARD_MAX_DOMAINS = 50;
const DEFAULT_ERROR_LIMIT = 10;
const HARD_ERROR_LIMIT = 50;
const DEFAULT_EVIDENCE_STALE_AFTER_MS = 60 * 60 * 1000;
const QUEUE_MAINTENANCE_APPROVAL_TOKEN = 'APPROVE_REMOTE_QUEUE_MAINTENANCE';
const FORCE_DEPLOY_APPROVAL_TOKEN = 'APPROVE_REMOTE_FORCE_DEPLOY';
const LIVE_SEED_APPROVAL_TOKEN = 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE';

const REMOTE_QUEUE_MAINTENANCE_ACTIONS = Object.freeze({
  'retain-queue': {
    operation: 'queue-summary',
    label: 'retain-queue',
    destructive: false,
    approvalToken: null,
    note: 'Default safe action while pending URLs are still valuable or unreviewed.',
  },
  'sync-local-proof': {
    operation: 'sync',
    label: 'sync-local-proof',
    destructive: false,
    approvalToken: null,
    note: 'Plan a bounded sync/local DB proof. Use no prune flags and inspect pending prune ledger state first.',
  },
  'stop-only': {
    operation: 'stop',
    label: 'stop-only',
    destructive: false,
    approvalToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
    note: 'Stabilize running domains without removing queued URLs.',
  },
  prune: {
    operation: 'prune',
    label: 'prune',
    destructive: true,
    approvalToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
    note: 'May remove exported remote state after exact local proof.',
  },
  drain: {
    operation: 'drain',
    label: 'drain',
    destructive: true,
    approvalToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
    note: 'May remove or consume remote queue/export state after local proof.',
  },
  clear: {
    operation: 'clear',
    label: 'clear',
    destructive: true,
    approvalToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
    note: 'Would remove pending remote queue state; execution is not implemented here.',
  },
  'force-deploy': {
    operation: 'force-deploy',
    label: 'force-deploy',
    destructive: true,
    approvalToken: FORCE_DEPLOY_APPROVAL_TOKEN,
    note: 'May interrupt retained work; requires fresh busy evidence plus force-deploy approval.',
  },
});

const REMOTE_OPERATION_CLASSIFICATIONS = Object.freeze({
  status: {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads /api/status only.',
  },
  health: {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads /api/health only.',
  },
  errors: {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads bounded recent error evidence.',
  },
  content: {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads content statistics only.',
  },
  'queue-summary': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads status, errors, and content stats to classify queue/deploy readiness.',
  },
  'queue-checklist': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Builds dry-run maintenance evidence checklist from read-only queue summary.',
  },
  'queue-maintenance-checklist': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Alias for queue-checklist.',
  },
  'readiness-report': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads saved local JSON evidence to combine graph, queue, deploy, and post-seed readiness.',
  },
  'maintenance-decision': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads saved local evidence to produce an approval-gated queue maintenance decision artifact.',
  },
  'queue-maintenance-decision': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Alias for maintenance-decision.',
  },
  'sync-proof-readiness': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads saved local evidence to plan a bounded sync/local DB proof without running sync.',
  },
  'maintenance-execution-plan': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads saved local evidence to build a dry-run maintenance execution skeleton without running it.',
  },
  'queue-maintenance-execution-plan': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Alias for maintenance-execution-plan.',
  },
  'second-seed-readiness': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads saved local evidence to decide whether a future second graph-feedback seed can be considered.',
  },
  'live-seed-readiness': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Alias for second-seed-readiness.',
  },
  watch: {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Polls status until terminal/timeout; does not change remote state.',
  },
  profiles: {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Lists local profile files.',
  },
  'monitored-small-crawl': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads local DB evidence for bounded crawl monitoring; it does not start crawlers or write rows.',
  },
  'small-crawl-baseline': {
    class: 'read-only',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Captures local DB baseline evidence before a bounded crawl.',
  },
  pull: {
    class: 'sync-local-proof',
    mutatesRemote: 'conditional-prune',
    writesLocalDb: true,
    approvalToken: null,
    note: 'Exports and ingests local proof; prune flags or pending prune watermarks can mutate remote export state.',
  },
  sync: {
    class: 'sync-local-proof',
    mutatesRemote: 'conditional-prune',
    writesLocalDb: true,
    approvalToken: null,
    note: 'Repeats pull/ingest proof; prune flags or pending prune watermarks can mutate remote export state.',
  },
  stop: {
    class: 'safe-stop-stabilize',
    mutatesRemote: true,
    writesLocalDb: false,
    approvalToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
    note: 'Stops running domains; does not remove queued URLs.',
  },
  start: {
    class: 'live-crawl-behavior',
    mutatesRemote: true,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Starts crawling remote domains.',
  },
  launch: {
    class: 'live-crawl-behavior',
    mutatesRemote: true,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Registers missing domains and starts crawling.',
  },
  bounded: {
    class: 'live-crawl-behavior',
    mutatesRemote: true,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Starts crawling and waits for bounded completion.',
  },
  run: {
    class: 'live-crawl-behavior',
    mutatesRemote: true,
    writesLocalDb: true,
    approvalToken: null,
    note: 'Starts crawling and continuously syncs local data until stopped.',
  },
  collect: {
    class: 'live-crawl-behavior',
    mutatesRemote: true,
    writesLocalDb: true,
    approvalToken: null,
    note: 'Preflights, starts, syncs, verifies, stops, drains, and may prune confirmed exports.',
  },
  seed: {
    class: 'live-crawl-behavior',
    mutatesRemote: true,
    writesLocalDb: false,
    approvalToken: LIVE_SEED_APPROVAL_TOKEN,
    note: 'Queues URLs remotely; graph-feedback live seeding must use the unified launcher gates.',
  },
  add: {
    class: 'live-crawl-behavior',
    mutatesRemote: true,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Adds a remote domain entry.',
  },
  remove: {
    class: 'destructive-maintenance',
    mutatesRemote: true,
    writesLocalDb: false,
    approvalToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
    note: 'Removes a remote domain entry; treat as remote maintenance.',
  },
  'graph-seeds': {
    class: 'sync-local-proof',
    mutatesRemote: false,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Reads local DB graph candidates only; separate live seed commands mutate remote state.',
  },
  prune: {
    class: 'destructive-maintenance',
    mutatesRemote: true,
    writesLocalDb: false,
    approvalToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
    note: 'Remote export prune is destructive and requires exact local proof plus maintenance approval.',
  },
  drain: {
    class: 'destructive-maintenance',
    mutatesRemote: true,
    writesLocalDb: true,
    approvalToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
    note: 'Drain/prune decisions can remove remote state and require maintenance approval.',
  },
  clear: {
    class: 'destructive-maintenance',
    mutatesRemote: true,
    writesLocalDb: false,
    approvalToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
    note: 'Queue clear is not implemented here; any future implementation requires maintenance approval.',
  },
  deploy: {
    class: 'deploy-action',
    mutatesRemote: true,
    writesLocalDb: false,
    approvalToken: null,
    note: 'Normal deploy requires clean preflight; force deploy requires separate force approval.',
  },
  'force-deploy': {
    class: 'deploy-action',
    mutatesRemote: true,
    writesLocalDb: false,
    approvalToken: FORCE_DEPLOY_APPROVAL_TOKEN,
    note: 'May interrupt retained work; requires fresh busy evidence and force-deploy approval.',
  },
});

function classifyRemoteOperation(command) {
  const key = String(command || '').trim().toLowerCase();
  return REMOTE_OPERATION_CLASSIFICATIONS[key] || {
    class: 'unknown',
    mutatesRemote: 'unknown',
    writesLocalDb: 'unknown',
    approvalToken: null,
    note: 'Unknown remote operation; classify before using it in maintenance workflow.',
  };
}

function parseReferenceMs(referenceAt) {
  const parsed = Date.parse(referenceAt || new Date().toISOString());
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function summarizeEvidenceTimestamp(payload, options = {}) {
  const referenceMs = parseReferenceMs(options.referenceAt);
  const staleAfterMs = Number.isFinite(Number(options.staleAfterMs))
    ? Number(options.staleAfterMs)
    : DEFAULT_EVIDENCE_STALE_AFTER_MS;
  const generatedAt = payload && typeof payload === 'object'
    ? (payload.generatedAt || payload.checkedAt || payload.createdAt || null)
    : null;
  const generatedAtMs = generatedAt ? Date.parse(generatedAt) : NaN;
  const generatedAtValid = Number.isFinite(generatedAtMs);
  const ageSeconds = generatedAtValid
    ? Math.max(0, Math.round((referenceMs - generatedAtMs) / 1000))
    : null;
  return {
    generatedAt,
    generatedAtValid,
    ageSeconds,
    stale: generatedAtValid ? (referenceMs - generatedAtMs) > staleAfterMs : false,
  };
}

function countGraphArtifactRecommendations(artifact) {
  const domains = Array.isArray(artifact?.domains) ? artifact.domains : [];
  return domains.reduce((total, row) => total + (Array.isArray(row?.recommendations) ? row.recommendations.length : 0), 0);
}

function summarizeGraphArtifactEvidence(entry, options = {}) {
  const artifact = entry?.value || null;
  if (!artifact) {
    return {
      supplied: false,
      path: entry?.path || null,
      byteSize: Number(entry?.byteSize || 0),
      generatedAt: null,
      generatedAtValid: false,
      ageSeconds: null,
      stale: false,
      hosts: [],
      recommendationCount: 0,
      warnings: ['graph artifact evidence missing'],
    };
  }
  const domains = Array.isArray(artifact.domains) ? artifact.domains : [];
  const timestamp = summarizeEvidenceTimestamp(artifact, options);
  const warnings = [];
  if (!timestamp.generatedAt) warnings.push('graph artifact generatedAt missing');
  else if (!timestamp.generatedAtValid) warnings.push('graph artifact generatedAt invalid');
  else if (timestamp.stale) warnings.push('graph artifact is stale for live-seed review');
  return {
    supplied: true,
    path: entry?.path || null,
    byteSize: Number(entry?.byteSize || 0),
    schemaVersion: artifact.schemaVersion ?? null,
    mode: artifact.mode || null,
    generatedAt: timestamp.generatedAt,
    generatedAtValid: timestamp.generatedAtValid,
    ageSeconds: timestamp.ageSeconds,
    stale: timestamp.stale,
    hosts: domains.map(row => normalizeDomain(row?.host || row?.domain)).filter(Boolean),
    recommendationCount: Number.isFinite(Number(artifact.recommendationCount))
      ? Number(artifact.recommendationCount)
      : countGraphArtifactRecommendations(artifact),
    warnings,
  };
}

function summarizeQueueSummaryEvidence(entry, options = {}) {
  const summary = entry?.value || null;
  if (!summary) {
    return {
      supplied: false,
      path: entry?.path || null,
      generatedAt: null,
      generatedAtValid: false,
      ageSeconds: null,
      stale: false,
      deployPreflightImplication: 'missing',
      nextSafestAction: 'run-queue-summary-first',
      totals: null,
      readinessCounts: {},
      warnings: ['queue summary evidence missing'],
    };
  }
  const timestamp = summarizeEvidenceTimestamp(summary, options);
  const warnings = [];
  if (summary.mode !== 'remote-queue-summary') warnings.push('queue summary mode is not remote-queue-summary');
  if (!timestamp.generatedAt) warnings.push('queue summary generatedAt missing');
  else if (!timestamp.generatedAtValid) warnings.push('queue summary generatedAt invalid');
  else if (timestamp.stale) warnings.push('queue summary is stale; refresh before maintenance or seeding');
  if (summary.deployPreflightImplication === 'blocked-busy-pending') {
    warnings.push('pending remote queue blocks deploy/live-seed readiness by default');
  }
  return {
    supplied: true,
    path: entry?.path || null,
    generatedAt: timestamp.generatedAt,
    generatedAtValid: timestamp.generatedAtValid,
    ageSeconds: timestamp.ageSeconds,
    stale: timestamp.stale,
    remoteHost: summary.remoteHost || null,
    requestedDomains: Array.isArray(summary.requestedDomains) ? summary.requestedDomains : [],
    domainCount: Array.isArray(summary.domains) ? summary.domains.length : 0,
    missingDomains: Array.isArray(summary.missingDomains) ? summary.missingDomains : [],
    deployPreflightImplication: summary.deployPreflightImplication || 'unknown',
    nextSafestAction: summary.nextSafestAction || 'inspect-queue-summary',
    totals: summary.totals || null,
    readinessCounts: summary.readinessCounts || {},
    warnings,
  };
}

function summarizeDeployProofEvidence(entry, options = {}) {
  const proof = entry?.value || null;
  if (!proof) {
    return {
      supplied: false,
      path: entry?.path || null,
      generatedAt: null,
      generatedAtValid: false,
      ageSeconds: null,
      stale: false,
      decision: 'missing',
      readyForLiveSeedProof: false,
      warnings: ['deploy proof evidence missing'],
    };
  }
  const timestamp = summarizeEvidenceTimestamp(proof, options);
  const warnings = [];
  if (!timestamp.generatedAt) warnings.push('deploy proof generatedAt missing; rerun preflight for current proof');
  else if (!timestamp.generatedAtValid) warnings.push('deploy proof generatedAt invalid');
  else if (timestamp.stale) warnings.push('deploy proof is stale; rerun preflight before deploy or seed');
  if (proof.decision && proof.decision !== 'current') warnings.push(`deploy proof decision is ${proof.decision}`);
  if (proof.readyForLiveSeedProof !== true) warnings.push('deploy proof is not ready for live seed');
  const busy = proof.busy || null;
  if (busy?.busy) warnings.push('deploy proof reports busy remote state');
  return {
    supplied: true,
    path: entry?.path || null,
    generatedAt: timestamp.generatedAt,
    generatedAtValid: timestamp.generatedAtValid,
    ageSeconds: timestamp.ageSeconds,
    stale: timestamp.stale,
    decision: proof.decision || 'unknown',
    readyForLiveSeedProof: proof.readyForLiveSeedProof === true,
    localBuild: proof.localBuild ? {
      current: proof.localBuild.current === true,
      buildId: proof.localBuild.buildId || null,
      builtAt: proof.localBuild.builtAt || null,
      staleReasonCount: Array.isArray(proof.localBuild.staleReasons) ? proof.localBuild.staleReasons.length : 0,
    } : null,
    remoteBuild: proof.remoteBuild ? {
      buildId: proof.remoteBuild.buildId || null,
      builtAt: proof.remoteBuild.builtAt || null,
    } : null,
    busy: busy ? {
      busy: busy.busy === true,
      pending: numberFrom(busy.pending),
      runningDomainCount: Array.isArray(busy.runningDomains) ? busy.runningDomains.length : 0,
    } : null,
    warnings,
  };
}

function summarizePreviewEvidence(entry) {
  const evidence = entry?.value || null;
  if (!evidence) {
    return {
      supplied: false,
      path: entry?.path || null,
      fingerprint: null,
      plannedHosts: [],
      candidateCount: 0,
      requestBodyBytes: 0,
      warnings: ['preview evidence missing'],
    };
  }
  return {
    supplied: true,
    path: entry?.path || null,
    fingerprint: evidence.fingerprint || null,
    plannedHosts: Array.isArray(evidence.plannedHosts) ? evidence.plannedHosts : [],
    domainCount: Number(evidence.domainCount || 0),
    candidateCount: Number(evidence.candidateCount || 0),
    requestBodyBytes: Number(evidence.requestBodyBytes || 0),
    warnings: evidence.fingerprint ? [] : ['preview evidence fingerprint missing'],
  };
}

function summarizePostSeedPlan(entry) {
  const plan = entry?.value || null;
  if (!plan) {
    return {
      supplied: false,
      path: entry?.path || null,
      mode: null,
      checkCount: 0,
      commandCount: 0,
      warnings: ['post-seed proof plan missing'],
    };
  }
  const checks = Array.isArray(plan.checks) ? plan.checks : [];
  const commands = Array.isArray(plan.commands)
    ? plan.commands
    : Object.values(plan.commands || {}).filter(Boolean);
  return {
    supplied: true,
    path: entry?.path || null,
    mode: plan.mode || null,
    checkCount: checks.length,
    commandCount: commands.length,
    warnings: [],
  };
}

function summarizeGraphCandidateBounds(entry, options = {}) {
  const artifact = entry?.value || null;
  const maxHosts = clampPositiveInt(options.maxHosts, {
    defaultValue: 1,
    max: 5,
    name: 'maxHosts',
  });
  const maxCandidatesPerHost = clampPositiveInt(options.maxCandidatesPerHost, {
    defaultValue: 3,
    max: 10,
    name: 'maxCandidatesPerHost',
  });
  const maxTotalCandidates = clampPositiveInt(options.maxTotalCandidates, {
    defaultValue: 3,
    max: 25,
    name: 'maxTotalCandidates',
  });
  const domains = Array.isArray(artifact?.domains) ? artifact.domains : [];
  const perHost = domains
    .map(row => ({
      host: normalizeDomain(row?.host || row?.domain),
      candidateCount: Array.isArray(row?.recommendations) ? row.recommendations.length : 0,
    }))
    .filter(row => row.host);
  const totalCandidates = perHost.reduce((sum, row) => sum + row.candidateCount, 0);
  const overCandidateHosts = perHost
    .filter(row => row.candidateCount > maxCandidatesPerHost)
    .map(row => row.host);
  const blockers = [];
  if (perHost.length > maxHosts) blockers.push('second-seed-host-cap-exceeded');
  if (totalCandidates > maxTotalCandidates) blockers.push('second-seed-total-candidate-cap-exceeded');
  if (overCandidateHosts.length > 0) blockers.push('second-seed-per-host-candidate-cap-exceeded');
  if (artifact && totalCandidates <= 0) blockers.push('no-graph-feedback-candidates');
  return {
    maxHosts,
    maxCandidatesPerHost,
    maxTotalCandidates,
    hostCount: perHost.length,
    totalCandidates,
    perHost,
    overCandidateHosts,
    blockers,
  };
}

function chooseCombinedReadinessLabel({ graphArtifact, queueSummary, deployProof, previewEvidence }) {
  if (!queueSummary.supplied) return 'needs-queue-summary';
  if (queueSummary.stale || !queueSummary.generatedAtValid) return 'needs-fresh-queue-summary';
  if (queueSummary.deployPreflightImplication !== 'ready-for-deploy-preflight') {
    return String(queueSummary.deployPreflightImplication || '').startsWith('blocked-')
      ? queueSummary.deployPreflightImplication
      : `blocked-${queueSummary.deployPreflightImplication}`;
  }
  if (!deployProof.supplied) return 'needs-deploy-proof';
  if (deployProof.stale || !deployProof.generatedAtValid) return 'needs-fresh-deploy-proof';
  if (deployProof.readyForLiveSeedProof !== true) return `deploy-${deployProof.decision || 'not-ready'}`;
  if (!graphArtifact.supplied) return 'needs-graph-artifact';
  if (graphArtifact.stale || !graphArtifact.generatedAtValid) return 'needs-fresh-graph-artifact';
  if (!previewEvidence.supplied) return 'needs-preview-evidence';
  if (!previewEvidence.fingerprint) return 'needs-valid-preview-evidence';
  return 'ready-for-human-approval-review';
}

function buildCombinedReadinessReport(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const staleAfterMs = Number.isFinite(Number(options.staleAfterMs))
    ? Number(options.staleAfterMs)
    : DEFAULT_EVIDENCE_STALE_AFTER_MS;
  const timestampOptions = {
    referenceAt: generatedAt,
    staleAfterMs,
  };
  const graphArtifact = summarizeGraphArtifactEvidence(options.graphArtifact, timestampOptions);
  const queueSummary = summarizeQueueSummaryEvidence(options.queueSummary, timestampOptions);
  const deployProof = summarizeDeployProofEvidence(options.deployProof, timestampOptions);
  const previewEvidence = summarizePreviewEvidence(options.previewEvidence);
  const postSeedPlan = summarizePostSeedPlan(options.postSeedPlan);
  const warnings = [
    ...graphArtifact.warnings,
    ...queueSummary.warnings,
    ...deployProof.warnings,
    ...previewEvidence.warnings,
    ...postSeedPlan.warnings,
  ];
  const readinessLabel = chooseCombinedReadinessLabel({
    graphArtifact,
    queueSummary,
    deployProof,
    previewEvidence,
  });
  const blockers = [];
  if (readinessLabel !== 'ready-for-human-approval-review') blockers.push(readinessLabel);
  if (queueSummary.deployPreflightImplication === 'blocked-busy-pending') blockers.push('pending-queue-retained');
  if (deployProof.decision === 'blocked-busy') blockers.push('deploy-preflight-blocked-busy');

  return {
    schemaVersion: 1,
    mode: 'remote-crawler-combined-readiness-report',
    generatedAt,
    staleAfterSeconds: Math.round(staleAfterMs / 1000),
    readinessLabel,
    actionPolicy: {
      readOnly: true,
      startsCrawl: false,
      seedsRemote: false,
      syncsLocalDb: false,
      stopsRemote: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      deploysRemote: false,
      forceDeploys: false,
    },
    graphArtifact,
    queueSummary,
    deployProof,
    previewEvidence,
    postSeedPlan,
    blockers: unique(blockers),
    warnings: unique(warnings),
    nextSafestAction: readinessLabel === 'ready-for-human-approval-review'
      ? 'review-approval-checklist-before-any-live-seed'
      : (queueSummary.nextSafestAction || 'refresh-missing-evidence'),
    approvals: {
      liveSeedToken: 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE',
      queueMaintenanceToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
      forceDeployToken: FORCE_DEPLOY_APPROVAL_TOKEN,
      present: false,
    },
    caveats: [
      'File-only report: no remote command is run, no URLs are enqueued, no remote state is changed, and collect behavior is unchanged.',
      'A ready label is not approval; live seed, queue maintenance, and force deploy each require their own explicit human approval.',
      'Candidate URLs and full remote payloads are intentionally omitted.',
    ],
  };
}

function normalizeMaintenanceAction(action, fallback = 'retain-queue') {
  const key = String(action || fallback || '').trim().toLowerCase();
  if (REMOTE_QUEUE_MAINTENANCE_ACTIONS[key]) return key;
  throw new Error(`maintenanceAction must be one of: ${Object.keys(REMOTE_QUEUE_MAINTENANCE_ACTIONS).join(', ')}`);
}

function suppliedApprovalTokens(options = {}) {
  const values = [
    options.approvalToken,
    options.approvalTokens,
    options.approvals,
  ].flat(Infinity);
  return unique(values.map(value => String(value || '').trim()).filter(Boolean));
}

function summarizeReadinessReportEvidence(entry, options = {}) {
  const report = entry?.value || null;
  if (!report) {
    return {
      supplied: false,
      path: entry?.path || null,
      generatedAt: null,
      generatedAtValid: false,
      ageSeconds: null,
      stale: false,
      readinessLabel: 'missing',
      blockers: ['readiness-report-missing'],
      warnings: ['readiness report evidence missing'],
      nextSafestAction: 'build-readiness-report-first',
    };
  }
  const timestamp = summarizeEvidenceTimestamp(report, options);
  const warnings = [];
  const blockers = Array.isArray(report.blockers) ? report.blockers.slice(0, 20) : [];
  if (report.mode !== 'remote-crawler-combined-readiness-report') {
    warnings.push('readiness report mode is not remote-crawler-combined-readiness-report');
    blockers.push('invalid-readiness-report-mode');
  }
  if (!timestamp.generatedAt) warnings.push('readiness report generatedAt missing');
  else if (!timestamp.generatedAtValid) warnings.push('readiness report generatedAt invalid');
  else if (timestamp.stale) {
    warnings.push('readiness report is stale; rebuild from current queue and deploy evidence');
    blockers.push('stale-readiness-report');
  }
  return {
    supplied: true,
    path: entry?.path || null,
    generatedAt: timestamp.generatedAt,
    generatedAtValid: timestamp.generatedAtValid,
    ageSeconds: timestamp.ageSeconds,
    stale: timestamp.stale,
    readinessLabel: report.readinessLabel || 'unknown',
    blockers: unique(blockers),
    warnings: unique([
      ...warnings,
      ...(Array.isArray(report.warnings) ? report.warnings.slice(0, 20) : []),
    ]),
    nextSafestAction: report.nextSafestAction || 'inspect-readiness-report',
  };
}

function summarizeQueueForDecision(queueSummaryEntry, readinessReport) {
  const summary = queueSummaryEntry?.value || null;
  if (summary && summary.mode === 'remote-queue-summary') {
    const affectedDomains = Array.isArray(summary.domains)
      ? summary.domains.map(row => ({
        domain: row.domain,
        state: row.state,
        isRunning: row.isRunning === true,
        pending: numberFrom(row.pending),
        errors: numberFrom(row.errors),
        stored: numberFrom(row.stored),
        nextSafestAction: row.nextSafestAction || null,
      }))
      : [];
    return {
      supplied: true,
      path: queueSummaryEntry?.path || null,
      remoteHost: summary.remoteHost || null,
      requestedDomains: Array.isArray(summary.requestedDomains) ? summary.requestedDomains : [],
      deployPreflightImplication: summary.deployPreflightImplication || 'unknown',
      nextSafestAction: summary.nextSafestAction || 'inspect-queue-summary',
      totals: summary.totals || null,
      readinessCounts: summary.readinessCounts || {},
      missingDomains: Array.isArray(summary.missingDomains) ? summary.missingDomains : [],
      affectedDomains,
      pendingTotal: summary.totals ? numberFrom(summary.totals.pending) : affectedDomains.reduce((sum, row) => sum + row.pending, 0),
      runningTotal: summary.totals ? numberFrom(summary.totals.running) : affectedDomains.filter(row => row.isRunning).length,
      warnings: [],
    };
  }

  const reportQueue = readinessReport?.value?.queueSummary || null;
  if (reportQueue) {
    const requestedDomains = Array.isArray(reportQueue.requestedDomains) ? reportQueue.requestedDomains : [];
    return {
      supplied: false,
      path: queueSummaryEntry?.path || null,
      remoteHost: reportQueue.remoteHost || null,
      requestedDomains,
      deployPreflightImplication: reportQueue.deployPreflightImplication || 'unknown',
      nextSafestAction: reportQueue.nextSafestAction || 'inspect-readiness-report',
      totals: reportQueue.totals || null,
      readinessCounts: reportQueue.readinessCounts || {},
      missingDomains: Array.isArray(reportQueue.missingDomains) ? reportQueue.missingDomains : [],
      affectedDomains: requestedDomains.map(domain => ({
        domain,
        state: 'unknown',
        isRunning: false,
        pending: reportQueue.totals && requestedDomains.length === 1 ? numberFrom(reportQueue.totals.pending) : 0,
        errors: 0,
        stored: 0,
        nextSafestAction: reportQueue.nextSafestAction || null,
      })),
      pendingTotal: reportQueue.totals ? numberFrom(reportQueue.totals.pending) : 0,
      runningTotal: reportQueue.totals ? numberFrom(reportQueue.totals.running) : 0,
      warnings: ['full queue summary evidence missing; using summarized readiness-report queue fields'],
    };
  }

  return {
    supplied: false,
    path: queueSummaryEntry?.path || null,
    remoteHost: null,
    requestedDomains: [],
    deployPreflightImplication: 'missing',
    nextSafestAction: 'run-queue-summary-first',
    totals: null,
    readinessCounts: {},
    missingDomains: [],
    affectedDomains: [],
    pendingTotal: 0,
    runningTotal: 0,
    warnings: ['queue summary evidence missing'],
  };
}

function normalizedList(values) {
  return unique((Array.isArray(values) ? values : [])
    .map(value => normalizeDomain(value))
    .filter(Boolean))
    .sort();
}

function sameDomainSet(left, right) {
  const a = normalizedList(left);
  const b = normalizedList(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function buildMaintenanceEvidenceValidation({
  action,
  readinessReportEntry,
  queueSummaryEntry,
  queue,
  queueEvidence,
}) {
  const readinessPayload = readinessReportEntry?.value || null;
  const reportQueue = readinessPayload?.queueSummary || null;
  const reportDeployProof = readinessPayload?.deployProof || null;
  const warnings = [];
  const blockers = [];

  if (!readinessReportEntry?.value) {
    blockers.push('readiness-report-required');
  }

  if (!queueSummaryEntry?.value) {
    warnings.push('full queue-summary evidence missing; maintenance decisions should use current per-domain queue evidence');
    if (action !== 'retain-queue') blockers.push('full-queue-summary-required');
  } else if (queueEvidence?.stale || !queueEvidence?.generatedAtValid) {
    warnings.push('queue-summary evidence is stale or has invalid generatedAt');
    if (action !== 'retain-queue') blockers.push('fresh-queue-summary-required');
  }

  const reportDomains = normalizedList(reportQueue?.requestedDomains || []);
  const queueDomains = normalizedList(queue.requestedDomains.length > 0
    ? queue.requestedDomains
    : queue.affectedDomains.map(row => row.domain));
  const hostMatch = reportDomains.length === 0 || queueDomains.length === 0
    ? null
    : sameDomainSet(reportDomains, queueDomains);
  if (hostMatch === false) {
    warnings.push(`readiness-report hosts (${reportDomains.join(', ')}) do not match queue-summary hosts (${queueDomains.join(', ')})`);
    blockers.push('queue-readiness-host-mismatch');
  }

  const reportPending = reportQueue?.totals ? numberFrom(reportQueue.totals.pending) : null;
  const pendingCountMatch = reportPending === null ? null : reportPending === queue.pendingTotal;
  if (pendingCountMatch === false) {
    warnings.push(`readiness-report pending count (${reportPending}) does not match queue-summary pending count (${queue.pendingTotal})`);
    if (action !== 'retain-queue') blockers.push('queue-pending-count-mismatch');
  }

  const reportImplication = reportQueue?.deployPreflightImplication || null;
  const deployImplicationMatch = reportImplication && queue.deployPreflightImplication
    ? reportImplication === queue.deployPreflightImplication
    : null;
  if (deployImplicationMatch === false) {
    warnings.push(`readiness-report deploy implication (${reportImplication}) does not match queue-summary implication (${queue.deployPreflightImplication})`);
    if (action !== 'retain-queue') blockers.push('queue-deploy-implication-mismatch');
  }

  const deployProofDecision = reportDeployProof?.decision || null;
  const deployProofReadyForLiveSeedProof = reportDeployProof?.readyForLiveSeedProof === true;
  if (deployProofDecision && deployProofDecision !== 'current') {
    warnings.push(`readiness-report deploy proof decision is ${deployProofDecision}`);
  }
  if (action === 'force-deploy') {
    const hasBusyEvidence = deployProofDecision === 'blocked-busy'
      || queue.deployPreflightImplication === 'blocked-busy-pending'
      || queue.deployPreflightImplication === 'blocked-running'
      || queue.pendingTotal > 0
      || queue.runningTotal > 0;
    if (!hasBusyEvidence) blockers.push('force-deploy-requires-fresh-busy-evidence');
  }

  return {
    readinessReportSupplied: Boolean(readinessReportEntry?.value),
    fullQueueSummarySupplied: Boolean(queueSummaryEntry?.value),
    queueSummaryFresh: Boolean(queueSummaryEntry?.value) && queueEvidence?.generatedAtValid === true && queueEvidence?.stale === false,
    reportHosts: reportDomains,
    queueHosts: queueDomains,
    hostMatch,
    reportPending,
    queuePending: queue.pendingTotal,
    pendingCountMatch,
    reportDeployPreflightImplication: reportImplication,
    queueDeployPreflightImplication: queue.deployPreflightImplication,
    deployImplicationMatch,
    deployProofDecision,
    deployProofReadyForLiveSeedProof,
    warnings: unique(warnings),
    blockers: unique(blockers),
  };
}

const SYNC_PROOF_CONTEXT_BLOCKERS = new Set([
  'blocked-busy-pending',
  'pending-queue-retained',
  'deploy-preflight-blocked-busy',
]);

function blockersForMaintenanceAction(action, blockers) {
  const values = Array.isArray(blockers) ? blockers : [];
  if (action === 'sync-local-proof') {
    return values.filter(blocker => !SYNC_PROOF_CONTEXT_BLOCKERS.has(blocker));
  }
  return values;
}

function buildMaintenanceCommands(queue) {
  const remoteHostArg = queue.remoteHost ? ` --host ${queue.remoteHost}` : '';
  const domains = queue.affectedDomains.map(row => row.domain).filter(Boolean);
  const domainsArg = domains.length > 0 ? ` --domains ${domains.join(',')}` : '';
  return {
    refreshQueueSummary: `node tools/crawl/crawl-remote.js queue-summary${remoteHostArg}${domainsArg} --json`,
    refreshReadinessReport: 'node tools/crawl/crawl-remote.js readiness-report --queue-summary tmp/queue-summary.json --deploy-proof tmp/deploy-preflight.json --graph-artifact tmp/graph-feedback.json --preview-evidence tmp/preview-evidence.json --post-seed-checklist tmp/post-seed-checklist.json --json',
    syncLocalProofPlan: `node tools/crawl/crawl-remote.js sync${remoteHostArg} --rounds 1 --limit 25 --include-content true --include-links true --no-prune-after-ingest`,
    localDbConfirmationPlan: 'node tools/db/downloads.js recent --limit 20',
    rollbackStopCommand: `node tools/crawl/crawl-remote.js stop${remoteHostArg}${domainsArg || ' --all'}`,
    deployPreflight: 'node tools/crawl/deploy-remote-server.js --preflight-only --json',
  };
}

function buildSyncLocalProofPlan(queue) {
  const commands = buildMaintenanceCommands(queue);
  return {
    command: commands.syncLocalProofPlan,
    confirmationCommand: commands.localDbConfirmationPlan,
    rollbackStopCommand: commands.rollbackStopCommand,
    deployPreflightCommand: commands.deployPreflight,
    maxProofRounds: 1,
    maxProofLimit: 25,
    includeContent: true,
    includeLinks: true,
    requiredFlags: ['--rounds 1', '--limit 25', '--include-content true', '--include-links true', '--no-prune-after-ingest'],
    caveats: [
      'This artifact does not run sync. The planned sync command writes local DB proof if an operator runs it later.',
      'Use --no-prune-after-ingest for the first proof so remote export state is not intentionally pruned.',
      'Inspect prune ledger state before treating sync/pull as non-mutating.',
      'Confirm local DB growth with a bounded recent-download check before any prune/drain/clear decision.',
    ],
  };
}

function buildQueueMaintenanceDecisionArtifact(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const staleAfterMs = Number.isFinite(Number(options.staleAfterMs))
    ? Number(options.staleAfterMs)
    : DEFAULT_EVIDENCE_STALE_AFTER_MS;
  const action = normalizeMaintenanceAction(options.maintenanceAction || options.action);
  const actionMeta = REMOTE_QUEUE_MAINTENANCE_ACTIONS[action];
  const operationClass = classifyRemoteOperation(actionMeta.operation);
  const tokens = suppliedApprovalTokens(options);
  const requiredToken = actionMeta.approvalToken;
  const approvalPresent = requiredToken ? tokens.includes(requiredToken) : true;
  const wrongSeedApproval = tokens.includes('APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE') && requiredToken !== 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE';
  const timestampOptions = { referenceAt: generatedAt, staleAfterMs };
  const readiness = summarizeReadinessReportEvidence(options.readinessReport, timestampOptions);
  const queueEvidence = summarizeQueueSummaryEvidence(options.queueSummary, timestampOptions);
  const queue = summarizeQueueForDecision(options.queueSummary, options.readinessReport);
  const evidenceValidation = buildMaintenanceEvidenceValidation({
    action,
    readinessReportEntry: options.readinessReport,
    queueSummaryEntry: options.queueSummary,
    queue,
    queueEvidence,
  });
  const warnings = unique([
    ...readiness.warnings,
    ...queueEvidence.warnings,
    ...queue.warnings,
    ...evidenceValidation.warnings,
    ...(wrongSeedApproval ? ['graph-feedback seed approval does not authorize queue maintenance or force deploy'] : []),
    ...(action === 'sync-local-proof' ? ['sync/pull proof can mutate remote export state if prune flags or pending prune ledger state are present; use no-prune proof commands first'] : []),
  ]);
  const blockers = unique([
    ...blockersForMaintenanceAction(action, readiness.blockers),
    ...evidenceValidation.blockers,
    ...(requiredToken && !approvalPresent ? [`missing-${requiredToken}`] : []),
    ...(operationClass.class === 'unknown' ? ['unknown-operation-class'] : []),
    ...(action === 'force-deploy' && queue.pendingTotal > 0 ? ['force-deploy-with-retained-pending-queue'] : []),
  ]);
  const decisionLabel = action === 'retain-queue'
    ? 'retain-queue'
    : blockers.length > 0
      ? 'blocked'
      : 'approval-recorded-execution-unimplemented';

  return {
    schemaVersion: 1,
    mode: 'remote-queue-maintenance-decision',
    generatedAt,
    requestedAction: action,
    decisionLabel,
    actionPolicy: {
      readOnly: true,
      executesRemoteAction: false,
      startsCrawl: false,
      seedsRemote: false,
      syncsLocalDb: false,
      stopsRemote: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      deploysRemote: false,
      forceDeploys: false,
      changesCollect: false,
    },
    action: {
      ...actionMeta,
      operationClass,
      approvalRequired: Boolean(requiredToken),
      requiredToken,
      approvalPresent,
      executionImplemented: false,
      executionAllowed: false,
    },
    approvals: {
      queueMaintenanceToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
      forceDeployToken: FORCE_DEPLOY_APPROVAL_TOKEN,
      liveSeedToken: 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE',
      suppliedTokenCount: tokens.length,
      requiredToken,
      requiredTokenPresent: approvalPresent,
      graphFeedbackSeedApprovalAcceptedForMaintenance: false,
    },
    readiness,
    evidenceValidation,
    contextBlockers: action === 'sync-local-proof'
      ? readiness.blockers.filter(blocker => SYNC_PROOF_CONTEXT_BLOCKERS.has(blocker))
      : [],
    queue,
    commands: buildMaintenanceCommands(queue),
    syncLocalProofPlan: buildSyncLocalProofPlan(queue),
    requiredEvidence: [
      'current-queue-summary',
      'combined-readiness-report',
      'deploy-preflight-proof',
      'sync-local-proof-plan-without-prune',
      'local-db-confirmation-plan',
      'rollback-stop-command',
    ],
    blockers,
    warnings,
    nextSafestAction: decisionLabel === 'retain-queue'
      ? 'retain-queue-and-refresh-readiness-before-any-seed-or-deploy'
      : action === 'sync-local-proof' && blockers.length === 0
        ? 'review-sync-proof-command-then-run-bounded-sync-only-if-operator-accepts-local-write'
        : blockers.length === 0
          ? 'execution-remains-unimplemented-even-with-approval-recorded'
      : 'resolve-blockers-or-use-documented-approval-token-before-maintenance',
    dataLossCaveats: [
      'Pending URLs may be useful frontier state from the first graph-feedback seed smoke.',
      'Prune, drain, clear, and force-deploy decisions are separate from graph-feedback live seed approval.',
      'Use bounded sync/local DB proof before removing or interrupting remote state.',
      'This artifact never executes maintenance; it is an operator decision record only.',
    ],
  };
}

function buildSyncLocalProofReadinessArtifact(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const staleAfterMs = Number.isFinite(Number(options.staleAfterMs))
    ? Number(options.staleAfterMs)
    : DEFAULT_EVIDENCE_STALE_AFTER_MS;
  const timestampOptions = { referenceAt: generatedAt, staleAfterMs };
  const readiness = summarizeReadinessReportEvidence(options.readinessReport, timestampOptions);
  const queueEvidence = summarizeQueueSummaryEvidence(options.queueSummary, timestampOptions);
  const queue = summarizeQueueForDecision(options.queueSummary, options.readinessReport);
  const evidenceValidation = buildMaintenanceEvidenceValidation({
    action: 'sync-local-proof',
    readinessReportEntry: options.readinessReport,
    queueSummaryEntry: options.queueSummary,
    queue,
    queueEvidence,
  });
  const blockers = unique([
    ...blockersForMaintenanceAction('sync-local-proof', readiness.blockers),
    ...evidenceValidation.blockers,
    ...(queue.runningTotal > 0 ? ['running-queue-stop-before-sync-proof'] : []),
    ...(queue.pendingTotal <= 0 ? ['no-pending-queue-to-prove'] : []),
  ]);
  const warnings = unique([
    ...readiness.warnings,
    ...queueEvidence.warnings,
    ...queue.warnings,
    ...evidenceValidation.warnings,
    'sync/local proof is not pure read-only if an operator runs it later; it writes local DB proof and must use no-prune flags for the first proof',
  ]);
  const decisionLabel = blockers.length > 0
    ? 'blocked'
    : 'ready-for-operator-sync-proof-review';

  return {
    schemaVersion: 1,
    mode: 'remote-sync-local-proof-readiness',
    generatedAt,
    staleAfterSeconds: Math.round(staleAfterMs / 1000),
    decisionLabel,
    actionPolicy: {
      readOnly: true,
      executesRemoteAction: false,
      startsCrawl: false,
      seedsRemote: false,
      syncsLocalDb: false,
      stopsRemote: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      deploysRemote: false,
      forceDeploys: false,
      changesCollect: false,
    },
    readiness,
    evidenceValidation,
    queue,
    proofPlan: buildSyncLocalProofPlan(queue),
    approvals: {
      queueMaintenanceToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
      forceDeployToken: FORCE_DEPLOY_APPROVAL_TOKEN,
      liveSeedToken: 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE',
      syncProofRequiresOperatorReview: true,
      destructiveMaintenanceAuthorized: false,
      forceDeployAuthorized: false,
    },
    blockers,
    warnings,
    nextSafestAction: blockers.length > 0
      ? 'refresh-evidence-or-stabilize-queue-before-sync-proof'
      : 'review-sync-proof-command-then-run-bounded-sync-only-if-operator-accepts-local-write',
    caveats: [
      'This is a file-only readiness artifact; it does not run sync, pull, stop, prune, drain, clear, deploy, or seed.',
      'The planned sync proof writes to the local DB only if an operator runs the command later.',
      'Do not prune/drain/clear retained remote state until sync/local proof and explicit maintenance approval are both ready.',
      'Do not treat graph-feedback live seed approval as queue maintenance approval.',
    ],
  };
}

function summarizeMaintenanceDecisionEvidence(entry, options = {}) {
  const decision = entry?.value || null;
  if (!decision) {
    return {
      supplied: false,
      path: entry?.path || null,
      generatedAt: null,
      generatedAtValid: false,
      ageSeconds: null,
      stale: false,
      requestedAction: null,
      decisionLabel: 'missing',
      blockers: ['maintenance-decision-required'],
      warnings: ['maintenance decision evidence missing'],
      queueHosts: [],
      pendingTotal: 0,
      runningTotal: 0,
      executionImplemented: false,
      executionAllowed: false,
    };
  }
  const timestamp = summarizeEvidenceTimestamp(decision, options);
  const warnings = [];
  const blockers = Array.isArray(decision.blockers) ? decision.blockers.slice(0, 30) : [];
  if (decision.mode !== 'remote-queue-maintenance-decision') {
    warnings.push('maintenance decision mode is not remote-queue-maintenance-decision');
    blockers.push('invalid-maintenance-decision-mode');
  }
  if (!timestamp.generatedAt) warnings.push('maintenance decision generatedAt missing');
  else if (!timestamp.generatedAtValid) warnings.push('maintenance decision generatedAt invalid');
  else if (timestamp.stale) {
    warnings.push('maintenance decision is stale; rebuild from current readiness and queue evidence');
    blockers.push('stale-maintenance-decision');
  }
  const affectedDomains = Array.isArray(decision.queue?.affectedDomains) ? decision.queue.affectedDomains : [];
  const queueHosts = affectedDomains.length > 0
    ? affectedDomains.map(row => row.domain)
    : (Array.isArray(decision.queue?.requestedDomains) ? decision.queue.requestedDomains : []);
  if (decision.action?.executionAllowed === true || decision.actionPolicy?.executesRemoteAction === true) {
    warnings.push('maintenance decision unexpectedly allows execution; execution-plan keeps execution disabled');
    blockers.push('maintenance-decision-execution-enabled');
  }
  return {
    supplied: true,
    path: entry?.path || null,
    generatedAt: timestamp.generatedAt,
    generatedAtValid: timestamp.generatedAtValid,
    ageSeconds: timestamp.ageSeconds,
    stale: timestamp.stale,
    requestedAction: decision.requestedAction || null,
    decisionLabel: decision.decisionLabel || 'unknown',
    blockers: unique(blockers),
    warnings: unique([
      ...warnings,
      ...(Array.isArray(decision.warnings) ? decision.warnings.slice(0, 30) : []),
    ]),
    queueHosts: normalizedList(queueHosts),
    pendingTotal: numberFrom(decision.queue?.pendingTotal),
    runningTotal: numberFrom(decision.queue?.runningTotal),
    queue: decision.queue || null,
    commands: decision.commands || {},
    syncLocalProofPlan: decision.syncLocalProofPlan || null,
    requiredEvidence: Array.isArray(decision.requiredEvidence) ? decision.requiredEvidence : [],
    executionImplemented: decision.action?.executionImplemented === true,
    executionAllowed: decision.action?.executionAllowed === true,
  };
}

function summarizeSyncProofReadinessEvidence(entry, options = {}) {
  const report = entry?.value || null;
  if (!report) {
    return {
      supplied: false,
      path: entry?.path || null,
      generatedAt: null,
      generatedAtValid: false,
      ageSeconds: null,
      stale: false,
      decisionLabel: 'missing',
      blockers: ['sync-proof-readiness-required'],
      warnings: ['sync-proof-readiness evidence missing'],
      queueHosts: [],
      pendingTotal: 0,
      runningTotal: 0,
      proofPlan: null,
      noPruneRequired: false,
      localDbConfirmationPlanPresent: false,
      rollbackCommandPresent: false,
      localWriteCaveatPresent: false,
      pruneLedgerCaveatPresent: false,
    };
  }
  const timestamp = summarizeEvidenceTimestamp(report, options);
  const warnings = [];
  const blockers = Array.isArray(report.blockers) ? report.blockers.slice(0, 30) : [];
  if (report.mode !== 'remote-sync-local-proof-readiness') {
    warnings.push('sync-proof-readiness mode is not remote-sync-local-proof-readiness');
    blockers.push('invalid-sync-proof-readiness-mode');
  }
  if (!timestamp.generatedAt) warnings.push('sync-proof-readiness generatedAt missing');
  else if (!timestamp.generatedAtValid) warnings.push('sync-proof-readiness generatedAt invalid');
  else if (timestamp.stale) {
    warnings.push('sync-proof-readiness is stale; rebuild from current readiness and queue evidence');
    blockers.push('stale-sync-proof-readiness');
  }
  const affectedDomains = Array.isArray(report.queue?.affectedDomains) ? report.queue.affectedDomains : [];
  const queueHosts = affectedDomains.length > 0
    ? affectedDomains.map(row => row.domain)
    : (Array.isArray(report.queue?.requestedDomains) ? report.queue.requestedDomains : []);
  const proofPlan = report.proofPlan || {};
  const requiredFlags = Array.isArray(proofPlan.requiredFlags) ? proofPlan.requiredFlags : [];
  const caveats = Array.isArray(proofPlan.caveats) ? proofPlan.caveats : [];
  const command = String(proofPlan.command || '');
  const noPruneRequired = requiredFlags.includes('--no-prune-after-ingest') || command.includes('--no-prune-after-ingest');
  const localDbConfirmationPlanPresent = Boolean(proofPlan.confirmationCommand);
  const rollbackCommandPresent = Boolean(proofPlan.rollbackStopCommand);
  const localWriteCaveatPresent = caveats.some(caveat => /local DB|local proof|writes local/i.test(String(caveat)));
  const pruneLedgerCaveatPresent = caveats.some(caveat => /prune ledger|pending prune/i.test(String(caveat)));
  if (!noPruneRequired) blockers.push('sync-proof-must-require-no-prune');
  if (!localDbConfirmationPlanPresent) blockers.push('local-db-confirmation-plan-required');
  if (!rollbackCommandPresent) blockers.push('rollback-stop-command-required');
  if (!localWriteCaveatPresent) blockers.push('local-write-caveat-required');
  if (!pruneLedgerCaveatPresent) blockers.push('prune-ledger-caveat-required');
  return {
    supplied: true,
    path: entry?.path || null,
    generatedAt: timestamp.generatedAt,
    generatedAtValid: timestamp.generatedAtValid,
    ageSeconds: timestamp.ageSeconds,
    stale: timestamp.stale,
    decisionLabel: report.decisionLabel || 'unknown',
    blockers: unique(blockers),
    warnings: unique([
      ...warnings,
      ...(Array.isArray(report.warnings) ? report.warnings.slice(0, 30) : []),
    ]),
    queueHosts: normalizedList(queueHosts),
    pendingTotal: numberFrom(report.queue?.pendingTotal),
    runningTotal: numberFrom(report.queue?.runningTotal),
    proofPlan,
    noPruneRequired,
    localDbConfirmationPlanPresent,
    rollbackCommandPresent,
    localWriteCaveatPresent,
    pruneLedgerCaveatPresent,
  };
}

function buildDryRunExecutionSkeleton(action, { decision, syncProof, deployProof, queueSummary }) {
  const decisionCommands = decision.commands || {};
  const syncProofPlan = syncProof.proofPlan || decision.syncLocalProofPlan || {};
  const queueHosts = decision.queueHosts.length > 0 ? decision.queueHosts : syncProof.queueHosts;
  const domainsArg = queueHosts.length > 0 ? ` --domains ${queueHosts.join(',')}` : '';
  const remoteHost = decision.queue?.remoteHost || queueSummary.remoteHost || null;
  const remoteHostArg = remoteHost ? ` --host ${remoteHost}` : '';
  const rollbackStopCommand = syncProofPlan.rollbackStopCommand
    || decisionCommands.rollbackStopCommand
    || `node tools/crawl/crawl-remote.js stop${remoteHostArg}${domainsArg || ' --all'}`;
  const syncCommand = syncProofPlan.command
    || decisionCommands.syncLocalProofPlan
    || `node tools/crawl/crawl-remote.js sync${remoteHostArg} --rounds 1 --limit 25 --include-content true --include-links true --no-prune-after-ingest`;
  const deployCommand = decisionCommands.deployPreflight
    || 'node tools/crawl/deploy-remote-server.js --preflight-only --json';

  if (action === 'retain-queue') {
    return {
      action,
      dryRunOnly: true,
      executionImplemented: false,
      plannedCommand: decisionCommands.refreshQueueSummary || `node tools/crawl/crawl-remote.js queue-summary${remoteHostArg}${domainsArg} --json`,
      commandIntent: 'refresh-read-only-queue-evidence',
      remoteMutationIfExecutedElsewhere: false,
      localDbWriteIfExecutedElsewhere: false,
    };
  }
  if (action === 'sync-local-proof') {
    return {
      action,
      dryRunOnly: true,
      executionImplemented: false,
      plannedCommand: syncCommand,
      confirmationCommand: syncProofPlan.confirmationCommand || decisionCommands.localDbConfirmationPlan || 'node tools/db/downloads.js recent --limit 20',
      rollbackStopCommand,
      commandIntent: 'future-bounded-sync-local-proof-with-no-prune',
      requiredFlags: ['--rounds 1', '--limit 25', '--include-content true', '--include-links true', '--no-prune-after-ingest'],
      remoteMutationIfExecutedElsewhere: 'conditional-prune-ledger-state',
      localDbWriteIfExecutedElsewhere: true,
    };
  }
  if (action === 'stop-only') {
    return {
      action,
      dryRunOnly: true,
      executionImplemented: false,
      plannedCommand: rollbackStopCommand,
      commandIntent: 'future-stop-running-domains-with-maintenance-approval',
      remoteMutationIfExecutedElsewhere: true,
      localDbWriteIfExecutedElsewhere: false,
    };
  }
  if (action === 'force-deploy') {
    return {
      action,
      dryRunOnly: true,
      executionImplemented: false,
      plannedCommand: 'node tools/crawl/deploy-remote-server.js --if-needed --apply --force --json',
      preflightCommand: deployCommand,
      commandIntent: 'future-force-deploy-after-fresh-busy-evidence-and-force-approval',
      remoteMutationIfExecutedElsewhere: true,
      localDbWriteIfExecutedElsewhere: false,
      deployProofDecision: deployProof.decision,
    };
  }
  return {
    action,
    dryRunOnly: true,
    executionImplemented: false,
    plannedCommand: null,
    commandIntent: `future-${action}-execution-not-implemented`,
    prerequisiteSyncProofCommand: syncCommand,
    confirmationCommand: syncProofPlan.confirmationCommand || decisionCommands.localDbConfirmationPlan || 'node tools/db/downloads.js recent --limit 20',
    rollbackStopCommand,
    remoteMutationIfExecutedElsewhere: true,
    localDbWriteIfExecutedElsewhere: false,
  };
}

function buildQueueMaintenanceExecutionPlanArtifact(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const staleAfterMs = Number.isFinite(Number(options.staleAfterMs))
    ? Number(options.staleAfterMs)
    : DEFAULT_EVIDENCE_STALE_AFTER_MS;
  const timestampOptions = { referenceAt: generatedAt, staleAfterMs };
  const action = normalizeMaintenanceAction(options.maintenanceAction || options.action || options.maintenanceDecision?.value?.requestedAction);
  const actionMeta = REMOTE_QUEUE_MAINTENANCE_ACTIONS[action];
  const operationClass = classifyRemoteOperation(actionMeta.operation);
  const tokens = suppliedApprovalTokens(options);
  const requiredToken = actionMeta.approvalToken;
  const approvalPresent = requiredToken ? tokens.includes(requiredToken) : true;
  const wrongSeedApproval = tokens.includes('APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE') && requiredToken !== 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE';
  const maintenanceDecision = summarizeMaintenanceDecisionEvidence(options.maintenanceDecision, timestampOptions);
  const syncProofReadiness = summarizeSyncProofReadinessEvidence(options.syncProofReadiness, timestampOptions);
  const queueSummary = summarizeQueueSummaryEvidence(options.queueSummary, timestampOptions);
  const readiness = summarizeReadinessReportEvidence(options.readinessReport, timestampOptions);
  const deployProof = summarizeDeployProofEvidence(options.deployProof, timestampOptions);

  const blockers = [];
  const warnings = [];
  warnings.push(
    ...maintenanceDecision.warnings,
    ...queueSummary.warnings,
    ...readiness.warnings,
    ...deployProof.warnings,
  );
  blockers.push(...maintenanceDecision.blockers);

  if (maintenanceDecision.requestedAction && maintenanceDecision.requestedAction !== action) {
    warnings.push(`maintenance decision action (${maintenanceDecision.requestedAction}) does not match requested action (${action})`);
    blockers.push('maintenance-action-mismatch');
  }
  if (!options.queueSummary?.value) blockers.push('current-queue-summary-required');
  else if (queueSummary.stale || !queueSummary.generatedAtValid) blockers.push('fresh-queue-summary-required');
  if (!options.readinessReport?.value) blockers.push('combined-readiness-report-required');
  else if (readiness.stale || !readiness.generatedAtValid) blockers.push('fresh-readiness-report-required');
  if (!options.deployProof?.value) blockers.push('deploy-proof-required');
  else if (deployProof.stale || !deployProof.generatedAtValid) blockers.push('fresh-deploy-proof-required');
  if (deployProof.decision && !['current', 'blocked-busy'].includes(deployProof.decision)) {
    blockers.push(`deploy-proof-${deployProof.decision}`);
  }

  const syncProofRequired = ['sync-local-proof', 'prune', 'drain', 'clear'].includes(action);
  if (syncProofRequired) {
    warnings.push(...syncProofReadiness.warnings);
    blockers.push(...syncProofReadiness.blockers);
    if (syncProofReadiness.decisionLabel !== 'ready-for-operator-sync-proof-review') {
      blockers.push('sync-proof-readiness-not-ready');
    }
  }

  const decisionHosts = maintenanceDecision.queueHosts;
  const syncHosts = syncProofReadiness.queueHosts;
  const queueHosts = normalizedList(queueSummary.requestedDomains || []);
  if (decisionHosts.length > 0 && queueHosts.length > 0 && !sameDomainSet(decisionHosts, queueHosts)) {
    blockers.push('maintenance-decision-queue-summary-host-mismatch');
  }
  if (syncProofRequired && decisionHosts.length > 0 && syncHosts.length > 0 && !sameDomainSet(decisionHosts, syncHosts)) {
    blockers.push('maintenance-decision-sync-proof-host-mismatch');
  }
  if (maintenanceDecision.pendingTotal !== queueSummary.totals?.pending && options.queueSummary?.value) {
    blockers.push('maintenance-decision-queue-summary-pending-mismatch');
  }
  if (syncProofRequired && syncProofReadiness.pendingTotal !== maintenanceDecision.pendingTotal) {
    blockers.push('maintenance-decision-sync-proof-pending-mismatch');
  }
  if (maintenanceDecision.runningTotal > 0 && !['retain-queue', 'stop-only'].includes(action)) {
    blockers.push('running-queue-requires-stop-before-maintenance');
  }
  if (maintenanceDecision.pendingTotal <= 0 && ['sync-local-proof', 'prune', 'drain', 'clear'].includes(action)) {
    blockers.push('no-pending-queue-to-maintain');
  }
  if (requiredToken && !approvalPresent) blockers.push(`missing-${requiredToken}`);
  if (wrongSeedApproval) warnings.push('graph-feedback seed approval does not authorize queue maintenance or force deploy');
  if (action === 'force-deploy') {
    const busyEvidence = deployProof.decision === 'blocked-busy'
      || queueSummary.deployPreflightImplication === 'blocked-busy-pending'
      || maintenanceDecision.pendingTotal > 0
      || maintenanceDecision.runningTotal > 0;
    if (!busyEvidence) blockers.push('force-deploy-requires-fresh-busy-evidence');
  }
  if (operationClass.class === 'unknown') blockers.push('unknown-operation-class');

  const executionSkeleton = buildDryRunExecutionSkeleton(action, {
    decision: maintenanceDecision,
    syncProof: syncProofReadiness,
    deployProof,
    queueSummary,
  });
  const decisionLabel = blockers.length > 0
    ? 'blocked'
    : approvalPresent && requiredToken
      ? 'approval-recorded-execution-disabled'
      : 'dry-run-ready-execution-disabled';

  return {
    schemaVersion: 1,
    mode: 'remote-queue-maintenance-execution-plan',
    generatedAt,
    requestedAction: action,
    decisionLabel,
    actionPolicy: {
      readOnly: true,
      dryRunOnly: true,
      executesRemoteAction: false,
      startsCrawl: false,
      seedsRemote: false,
      syncsLocalDb: false,
      stopsRemote: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      deploysRemote: false,
      forceDeploys: false,
      changesCollect: false,
    },
    action: {
      ...actionMeta,
      operationClass,
      approvalRequired: Boolean(requiredToken),
      requiredToken,
      approvalPresent,
      executionImplemented: false,
      executionAllowed: false,
    },
    approvals: {
      queueMaintenanceToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
      forceDeployToken: FORCE_DEPLOY_APPROVAL_TOKEN,
      liveSeedToken: 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE',
      suppliedTokenCount: tokens.length,
      requiredToken,
      requiredTokenPresent: approvalPresent,
      graphFeedbackSeedApprovalAcceptedForMaintenance: false,
    },
    evidence: {
      maintenanceDecision,
      queueSummary,
      readiness,
      deployProof,
      syncProofReadiness: syncProofReadiness.supplied ? syncProofReadiness : {
        ...syncProofReadiness,
        blockers: syncProofRequired ? syncProofReadiness.blockers : [],
      },
    },
    validators: {
      requiresFreshQueueSummary: true,
      requiresFreshReadinessReport: true,
      requiresFreshDeployProof: true,
      requiresSyncProofReadiness: syncProofRequired,
      requiresNoPruneSyncProof: syncProofRequired,
      requiresLocalDbConfirmationPlan: syncProofRequired,
      requiresRollbackStopCommand: syncProofRequired,
      requiredApprovalToken: requiredToken,
      executionRemainsDisabledEvenWhenApproved: true,
    },
    executionSkeleton,
    blockers: unique(blockers),
    warnings: unique([
      ...warnings,
      'dry-run execution skeleton only; this command never runs stop, sync, prune, drain, clear, force deploy, seed, or collect',
    ]),
    nextSafestAction: blockers.length > 0
      ? 'resolve-evidence-and-approval-blockers-before-any-maintenance'
      : 'review-dry-run-plan-and-request-a-separate-approved-execution-implementation',
    caveats: [
      'This artifact is a planning skeleton only; execution is deliberately disabled.',
      'Sync/local proof remains distinct from destructive maintenance and must use no-prune flags for the first proof.',
      'Prune, drain, clear, and force deploy require separate explicit approvals and future execution code.',
      'Candidate URLs and full remote payloads are intentionally omitted.',
    ],
  };
}

function summarizeMaintenanceExecutionPlanEvidence(entry, options = {}) {
  const plan = entry?.value || null;
  if (!plan) {
    return {
      supplied: false,
      path: entry?.path || null,
      generatedAt: null,
      generatedAtValid: false,
      ageSeconds: null,
      stale: false,
      requestedAction: null,
      decisionLabel: 'missing',
      blockers: [],
      warnings: ['maintenance execution plan evidence missing'],
      queueHosts: [],
      pendingTotal: 0,
      runningTotal: 0,
      executionImplemented: false,
      executionAllowed: false,
    };
  }
  const timestamp = summarizeEvidenceTimestamp(plan, options);
  const warnings = [];
  const blockers = Array.isArray(plan.blockers) ? plan.blockers.slice(0, 30) : [];
  if (plan.mode !== 'remote-queue-maintenance-execution-plan') {
    warnings.push('maintenance execution plan mode is not remote-queue-maintenance-execution-plan');
    blockers.push('invalid-maintenance-execution-plan-mode');
  }
  if (!timestamp.generatedAt) warnings.push('maintenance execution plan generatedAt missing');
  else if (!timestamp.generatedAtValid) warnings.push('maintenance execution plan generatedAt invalid');
  else if (timestamp.stale) {
    warnings.push('maintenance execution plan is stale; rebuild from current queue/readiness/deploy evidence');
    blockers.push('stale-maintenance-execution-plan');
  }
  if (plan.action?.executionAllowed === true || plan.actionPolicy?.executesRemoteAction === true) {
    warnings.push('maintenance execution plan unexpectedly enables execution');
    blockers.push('maintenance-execution-plan-enabled');
  }
  const decision = plan.evidence?.maintenanceDecision || {};
  const queueHosts = Array.isArray(decision.queueHosts) ? decision.queueHosts : [];
  return {
    supplied: true,
    path: entry?.path || null,
    generatedAt: timestamp.generatedAt,
    generatedAtValid: timestamp.generatedAtValid,
    ageSeconds: timestamp.ageSeconds,
    stale: timestamp.stale,
    requestedAction: plan.requestedAction || null,
    decisionLabel: plan.decisionLabel || 'unknown',
    blockers: unique(blockers),
    warnings: unique([
      ...warnings,
      ...(Array.isArray(plan.warnings) ? plan.warnings.slice(0, 30) : []),
    ]),
    queueHosts: normalizedList(queueHosts),
    pendingTotal: numberFrom(decision.pendingTotal),
    runningTotal: numberFrom(decision.runningTotal),
    executionImplemented: plan.action?.executionImplemented === true,
    executionAllowed: plan.action?.executionAllowed === true,
  };
}

function queueHostsFromSummaryEntry(entry, summary) {
  const payload = entry?.value || null;
  const domains = Array.isArray(payload?.domains)
    ? payload.domains.map(row => row?.domain || row?.host)
    : [];
  const requested = Array.isArray(summary?.requestedDomains) ? summary.requestedDomains : [];
  return normalizedList(domains.length > 0 ? domains : requested);
}

function buildHostAgreementEvidence({ graphArtifact, previewEvidence, queueSummary, queueHosts, readiness }) {
  const graphHosts = normalizedList(graphArtifact.hosts || []);
  const previewHosts = normalizedList(previewEvidence.plannedHosts || []);
  const reportHosts = normalizedList(readiness?.value?.queueSummary?.requestedDomains || []);
  const checks = [];
  if (graphHosts.length > 0 && queueHosts.length > 0) {
    checks.push({
      name: 'graph-artifact-vs-queue-summary',
      left: graphHosts,
      right: queueHosts,
      match: sameDomainSet(graphHosts, queueHosts),
    });
  }
  if (previewHosts.length > 0 && queueHosts.length > 0) {
    checks.push({
      name: 'preview-evidence-vs-queue-summary',
      left: previewHosts,
      right: queueHosts,
      match: sameDomainSet(previewHosts, queueHosts),
    });
  }
  if (reportHosts.length > 0 && queueHosts.length > 0) {
    checks.push({
      name: 'readiness-report-vs-queue-summary',
      left: reportHosts,
      right: queueHosts,
      match: sameDomainSet(reportHosts, queueHosts),
    });
  }
  return {
    queueHosts,
    graphHosts,
    previewHosts,
    readinessReportHosts: reportHosts,
    checks,
    blockers: checks.filter(check => check.match === false).map(check => `${check.name}-host-mismatch`),
  };
}

function chooseSecondSeedReadinessLabel({ blockers, queueSummary, deployProof, graphArtifact, previewEvidence }) {
  if (!queueSummary.supplied) return 'needs-queue-summary';
  if (queueSummary.totals && numberFrom(queueSummary.totals.pending) > 0) return 'blocked-retained-queue';
  if (queueSummary.totals && numberFrom(queueSummary.totals.running) > 0) return 'blocked-running-queue';
  if (!deployProof.supplied) return 'needs-deploy-proof';
  if (deployProof.decision !== 'current' || deployProof.readyForLiveSeedProof !== true) return `deploy-${deployProof.decision || 'not-ready'}`;
  if (!graphArtifact.supplied) return 'needs-graph-artifact';
  if (!previewEvidence.supplied) return 'needs-preview-evidence';
  return blockers.length > 0 ? 'blocked' : 'ready-for-human-second-seed-review';
}

function buildSecondSeedReadinessArtifact(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const staleAfterMs = Number.isFinite(Number(options.staleAfterMs))
    ? Number(options.staleAfterMs)
    : DEFAULT_EVIDENCE_STALE_AFTER_MS;
  const timestampOptions = { referenceAt: generatedAt, staleAfterMs };
  const tokens = suppliedApprovalTokens(options);
  const graphArtifact = summarizeGraphArtifactEvidence(options.graphArtifact, timestampOptions);
  const graphCandidateBounds = summarizeGraphCandidateBounds(options.graphArtifact, options);
  const queueSummary = summarizeQueueSummaryEvidence(options.queueSummary, timestampOptions);
  const deployProof = summarizeDeployProofEvidence(options.deployProof, timestampOptions);
  const previewEvidence = summarizePreviewEvidence(options.previewEvidence);
  const postSeedPlan = summarizePostSeedPlan(options.postSeedPlan);
  const readiness = summarizeReadinessReportEvidence(options.readinessReport, timestampOptions);
  const maintenanceExecutionPlan = summarizeMaintenanceExecutionPlanEvidence(options.maintenanceExecutionPlan, timestampOptions);
  const queueHosts = queueHostsFromSummaryEntry(options.queueSummary, queueSummary);
  const hostAgreement = buildHostAgreementEvidence({
    graphArtifact,
    previewEvidence,
    queueSummary,
    queueHosts,
    readiness: options.readinessReport,
  });
  const pendingTotal = queueSummary.totals ? numberFrom(queueSummary.totals.pending) : 0;
  const runningTotal = queueSummary.totals ? numberFrom(queueSummary.totals.running) : 0;

  const blockers = [];
  if (!queueSummary.supplied) blockers.push('queue-summary-required');
  else {
    if (queueSummary.stale || !queueSummary.generatedAtValid) blockers.push('fresh-queue-summary-required');
    if (queueSummary.deployPreflightImplication !== 'ready-for-deploy-preflight') {
      blockers.push(`queue-${queueSummary.deployPreflightImplication || 'not-ready'}`);
    }
  }
  if (pendingTotal > 0) blockers.push('retained-pending-queue-blocks-second-seed');
  if (runningTotal > 0) blockers.push('running-queue-blocks-second-seed');
  if (!deployProof.supplied) blockers.push('deploy-proof-required');
  else {
    if (deployProof.stale || !deployProof.generatedAtValid) blockers.push('fresh-deploy-proof-required');
    if (deployProof.decision !== 'current') blockers.push(`deploy-proof-${deployProof.decision || 'not-current'}`);
    if (deployProof.readyForLiveSeedProof !== true) blockers.push('deploy-proof-not-ready-for-live-seed');
  }
  if (!graphArtifact.supplied) blockers.push('graph-artifact-required');
  else {
    if (graphArtifact.stale || !graphArtifact.generatedAtValid) blockers.push('fresh-graph-artifact-required');
    if (graphArtifact.schemaVersion !== 1) blockers.push('graph-artifact-schema-version-unsupported');
  }
  if (!previewEvidence.supplied) blockers.push('preview-evidence-required');
  else if (!previewEvidence.fingerprint) blockers.push('preview-evidence-fingerprint-required');
  if (!postSeedPlan.supplied) blockers.push('post-seed-checklist-required');
  if (!readiness.supplied) blockers.push('readiness-report-required');
  else if (readiness.stale || !readiness.generatedAtValid) blockers.push('fresh-readiness-report-required');
  if (pendingTotal > 0 && !maintenanceExecutionPlan.supplied) {
    blockers.push('maintenance-execution-plan-required-for-retained-queue-review');
  }
  if (maintenanceExecutionPlan.supplied) {
    if (maintenanceExecutionPlan.stale || !maintenanceExecutionPlan.generatedAtValid) blockers.push('fresh-maintenance-execution-plan-required');
    blockers.push(...maintenanceExecutionPlan.blockers.map(blocker => `maintenance-plan-${blocker}`));
  }
  blockers.push(...hostAgreement.blockers);
  blockers.push(...graphCandidateBounds.blockers);

  const warnings = unique([
    ...graphArtifact.warnings,
    ...queueSummary.warnings,
    ...deployProof.warnings,
    ...previewEvidence.warnings,
    ...postSeedPlan.warnings,
    ...readiness.warnings,
    ...maintenanceExecutionPlan.warnings,
    ...(tokens.includes(QUEUE_MAINTENANCE_APPROVAL_TOKEN) ? ['queue maintenance approval does not authorize live seeding'] : []),
    ...(tokens.includes(FORCE_DEPLOY_APPROVAL_TOKEN) ? ['force deploy approval does not authorize live seeding'] : []),
    ...(tokens.includes(LIVE_SEED_APPROVAL_TOKEN) ? ['live seed approval token recorded; this command still never sends seeds'] : []),
  ]);
  const uniqueBlockers = unique(blockers);
  const readinessLabel = chooseSecondSeedReadinessLabel({
    blockers: uniqueBlockers,
    queueSummary,
    deployProof,
    graphArtifact,
    previewEvidence,
  });

  return {
    schemaVersion: 1,
    mode: 'remote-second-seed-readiness',
    generatedAt,
    staleAfterSeconds: Math.round(staleAfterMs / 1000),
    readinessLabel,
    actionPolicy: {
      readOnly: true,
      dryRunOnly: true,
      executesRemoteAction: false,
      startsCrawl: false,
      seedsRemote: false,
      syncsLocalDb: false,
      stopsRemote: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      deploysRemote: false,
      forceDeploys: false,
      changesCollect: false,
    },
    approvals: {
      liveSeedToken: LIVE_SEED_APPROVAL_TOKEN,
      liveSeedApprovalPresent: tokens.includes(LIVE_SEED_APPROVAL_TOKEN),
      queueMaintenanceToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
      forceDeployToken: FORCE_DEPLOY_APPROVAL_TOKEN,
      suppliedTokenCount: tokens.length,
      approvalDoesNotExecute: true,
    },
    caps: {
      maxHosts: graphCandidateBounds.maxHosts,
      maxCandidatesPerHost: graphCandidateBounds.maxCandidatesPerHost,
      maxTotalCandidates: graphCandidateBounds.maxTotalCandidates,
    },
    evidence: {
      graphArtifact,
      graphCandidateBounds,
      queueSummary,
      deployProof,
      previewEvidence,
      postSeedPlan,
      readiness,
      maintenanceExecutionPlan,
      hostAgreement,
    },
    blockers: uniqueBlockers,
    warnings,
    nextSafestAction: readinessLabel === 'ready-for-human-second-seed-review'
      ? 'review-approval-checklist-then-request-a-separate-approved-second-seed-prompt'
      : pendingTotal > 0
        ? 'retain-queue-or-complete-approved-sync-local-proof-before-second-seed'
        : 'refresh-or-fix-blocking-evidence-before-second-seed',
    caveats: [
      'File-only second-seed readiness only: no URLs are enqueued, no remote crawlers are seeded, no sync/pull/stop/prune/drain/clear/deploy command is run, and collect behavior is unchanged.',
      'A ready label is not approval; any future second live seed still requires the explicit live seed approval token in a separate prompt.',
      'Retained pending queues and non-current deploy proof block a second seed by default.',
      'Candidate URLs and full remote payloads are intentionally omitted.',
    ],
  };
}

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '');
}

function parseDomainList(value) {
  if (Array.isArray(value)) return value.map(normalizeDomain).filter(Boolean);
  if (!value || value === true) return [];
  return String(value)
    .split(',')
    .map(normalizeDomain)
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clampPositiveInt(value, { defaultValue, min = 1, max, name }) {
  if (value === undefined || value === null || value === true || value === '') return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function normalizeQueueOptions(options = {}) {
  const requestedDomains = unique([
    ...parseDomainList(options.requestedDomains),
    ...parseDomainList(options.domain),
    ...parseDomainList(options.domains),
  ]);
  return {
    requestedDomains,
    maxDomains: clampPositiveInt(options.maxDomains, {
      defaultValue: DEFAULT_MAX_DOMAINS,
      max: HARD_MAX_DOMAINS,
      name: 'maxDomains',
    }),
    errorLimit: clampPositiveInt(options.errorLimit, {
      defaultValue: DEFAULT_ERROR_LIMIT,
      max: HARD_ERROR_LIMIT,
      name: 'errorLimit',
    }),
    remoteHost: options.remoteHost || null,
    generatedAt: options.generatedAt || new Date().toISOString(),
  };
}

function numberFrom(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function statusDomainName(row) {
  return normalizeDomain(row?.domain || row?.host || row?.hostname);
}

function buildContentByDomain(contentStats) {
  const map = new Map();
  const rows = Array.isArray(contentStats?.byDomain)
    ? contentStats.byDomain
    : (Array.isArray(contentStats?.domains) ? contentStats.domains : []);
  for (const row of rows) {
    const domain = normalizeDomain(row?.domain || row?.host);
    if (!domain) continue;
    map.set(domain, {
      stored: numberFrom(row.count, row.totalStored, row.total_stored, row.stored),
      totalCompressed: numberFrom(row.total_compressed, row.totalCompressed, row.compressedBytes),
      totalUncompressed: numberFrom(row.total_uncompressed, row.totalUncompressed, row.rawBytes),
    });
  }
  return map;
}

function buildRecentErrorsByDomain(errorsPayload) {
  const rows = Array.isArray(errorsPayload?.errors) ? errorsPayload.errors : [];
  const counts = new Map();
  for (const row of rows) {
    const domain = normalizeDomain(row?.host || row?.domain);
    if (!domain) continue;
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }
  return {
    totalRecent: Number.isFinite(Number(errorsPayload?.count)) ? Number(errorsPayload.count) : rows.length,
    byDomain: counts,
    sampleCount: rows.length,
  };
}

function classifyDomain(row) {
  const running = Boolean(row.isRunning || row.running || String(row.state || '').toLowerCase() === 'running');
  const pending = numberFrom(row.stats?.pending, row.stats?.queued, row.pending, row.queue?.pending);
  const errors = numberFrom(row.stats?.errors, row.errors);
  if (running && pending > 0) {
    return {
      deployPreflightImplication: 'blocked-running',
      nextSafestAction: 'wait-or-stop-with-approval',
      readiness: 'running-with-pending',
    };
  }
  if (running) {
    return {
      deployPreflightImplication: 'blocked-running',
      nextSafestAction: 'wait-for-terminal-status-or-stop-with-approval',
      readiness: 'running',
    };
  }
  if (pending > 0) {
    return {
      deployPreflightImplication: 'blocked-busy-pending',
      nextSafestAction: 'retain-queue-or-run-maintenance-checklist',
      readiness: 'stopped-with-pending',
    };
  }
  if (errors > 0) {
    return {
      deployPreflightImplication: 'inspect-errors',
      nextSafestAction: 'inspect-errors-before-seed-or-deploy',
      readiness: 'errors-present',
    };
  }
  return {
    deployPreflightImplication: 'ready-for-deploy-preflight',
    nextSafestAction: 'run-deploy-preflight-before-seed-or-deploy',
    readiness: 'no-pending',
  };
}

function summarizeStatusDomain(row, { contentByDomain, recentErrorsByDomain }) {
  const domain = statusDomainName(row);
  const content = contentByDomain.get(domain) || {};
  const stats = row.stats || {};
  const contentPipeline = row.contentPipeline || {};
  const classification = classifyDomain(row);
  return {
    domain,
    state: String(row.state || (row.isRunning ? 'running' : 'unknown')),
    isRunning: Boolean(row.isRunning || row.running),
    fetched: numberFrom(stats.fetched, stats.done, row.fetched),
    done: numberFrom(stats.done, stats.fetched, row.done),
    pending: numberFrom(stats.pending, stats.queued, row.pending, row.queue?.pending),
    errors: numberFrom(stats.errors, row.errors),
    stored: numberFrom(content.stored, contentPipeline.totalStored, stats.stored, row.stored),
    totalCompressedBytes: numberFrom(content.totalCompressed, contentPipeline.totalCompressedBytes),
    totalCompressedMB: numberFrom(contentPipeline.totalCompressedMB),
    recentErrorCount: recentErrorsByDomain.get(domain) || 0,
    startedAt: row.startedAt || null,
    stoppedAt: row.stoppedAt || null,
    lastActivityAt: row.lastActivityAt || row.updatedAt || row.stoppedAt || row.startedAt || null,
    queue: {
      seedQueued: numberFrom(row.queue?.seedQueued),
      seedAlreadyKnown: numberFrom(row.queue?.seedAlreadyKnown),
      seedRefreshed: numberFrom(row.queue?.seedRefreshed),
      discoveredQueued: numberFrom(row.queue?.discoveredQueued),
      discoveredAlreadyKnown: numberFrom(row.queue?.discoveredAlreadyKnown),
    },
    ...classification,
  };
}

function buildQueueSummary(statusPayload, options = {}) {
  const normalized = normalizeQueueOptions(options);
  if (!statusPayload || !Array.isArray(statusPayload.domains)) {
    throw new Error('Remote status payload must include a domains array');
  }
  const contentByDomain = buildContentByDomain(options.contentStats || {});
  const recentErrors = buildRecentErrorsByDomain(options.errorsPayload || {});
  const statusRows = statusPayload.domains
    .map(row => ({ row, domain: statusDomainName(row) }))
    .filter(item => item.domain);
  const requestedSet = new Set(normalized.requestedDomains);
  const selectedRows = requestedSet.size > 0
    ? statusRows.filter(item => requestedSet.has(item.domain))
    : statusRows;
  const domains = selectedRows
    .slice(0, normalized.maxDomains)
    .map(item => summarizeStatusDomain(item.row, {
      contentByDomain,
      recentErrorsByDomain: recentErrors.byDomain,
    }));
  const presentDomains = new Set(statusRows.map(item => item.domain));
  const missingDomains = normalized.requestedDomains.filter(domain => !presentDomains.has(domain));
  const totals = domains.reduce((acc, row) => {
    acc.fetched += row.fetched;
    acc.done += row.done;
    acc.pending += row.pending;
    acc.errors += row.errors;
    acc.stored += row.stored;
    acc.running += row.isRunning ? 1 : 0;
    acc.recentErrors += row.recentErrorCount;
    return acc;
  }, {
    fetched: 0,
    done: 0,
    pending: 0,
    errors: 0,
    stored: 0,
    running: 0,
    recentErrors: 0,
  });
  const readinessCounts = domains.reduce((acc, row) => {
    acc[row.readiness] = (acc[row.readiness] || 0) + 1;
    return acc;
  }, {});
  const truncated = selectedRows.length > domains.length;
  let overallNextSafestAction = 'run-deploy-preflight-before-seed-or-deploy';
  let deployPreflightImplication = 'ready-for-deploy-preflight';
  if (missingDomains.length > 0) {
    overallNextSafestAction = 'fix-host-selection-before-maintenance';
    deployPreflightImplication = 'host-not-found';
  } else if (domains.some(row => row.isRunning)) {
    overallNextSafestAction = 'wait-or-stop-with-approval';
    deployPreflightImplication = 'blocked-running';
  } else if (domains.some(row => row.pending > 0)) {
    overallNextSafestAction = 'retain-queue-or-run-maintenance-checklist';
    deployPreflightImplication = 'blocked-busy-pending';
  } else if (domains.some(row => row.errors > 0 || row.recentErrorCount > 0)) {
    overallNextSafestAction = 'inspect-errors-before-seed-or-deploy';
    deployPreflightImplication = 'inspect-errors';
  }

  return {
    schemaVersion: 1,
    mode: 'remote-queue-summary',
    generatedAt: normalized.generatedAt,
    remoteHost: normalized.remoteHost,
    requestedDomains: normalized.requestedDomains,
    actionPolicy: {
      readOnly: true,
      startsCrawl: false,
      seedsRemote: false,
      syncsLocalDb: false,
      stopsRemote: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      deploysRemote: false,
      forceDeploys: false,
    },
    bounds: {
      maxDomains: normalized.maxDomains,
      errorLimit: normalized.errorLimit,
      selectedDomainCount: selectedRows.length,
      reportedDomainCount: domains.length,
      truncated,
    },
    remoteStatus: {
      version: statusPayload.version || null,
      schemaVersion: statusPayload.schemaVersion || null,
      build: statusPayload.build || null,
      orchestrator: {
        running: Boolean(statusPayload.orchestrator?.running),
        currentlyRunning: numberFrom(statusPayload.orchestrator?.currentlyRunning),
        maxConcurrent: numberFrom(statusPayload.orchestrator?.maxConcurrent),
      },
    },
    missingDomains,
    totals,
    readinessCounts,
    deployPreflightImplication,
    nextSafestAction: overallNextSafestAction,
    recentErrors: {
      totalRecent: recentErrors.totalRecent,
      sampleCount: recentErrors.sampleCount,
    },
    domains,
    caveats: buildSummaryCaveats({
      domains,
      missingDomains,
      truncated,
      requestedDomains: normalized.requestedDomains,
    }),
  };
}

function buildSummaryCaveats({ domains, missingDomains, truncated, requestedDomains }) {
  const caveats = [
    'Read-only summary only: no URLs are enqueued, no remote crawlers are seeded, no remote state is pruned/drained/cleared, and collect behavior is unchanged.',
    'Deploy preflight implications are inferred from status; run deploy preflight before deploy or live seed decisions.',
  ];
  if (requestedDomains.length === 0) caveats.push('No domain filter supplied; output is capped and may omit domains.');
  if (truncated) caveats.push('Output truncated by maxDomains; narrow with --domain/--domains before maintenance decisions.');
  if (missingDomains.length > 0) caveats.push(`Requested domain(s) missing from remote status: ${missingDomains.join(', ')}.`);
  if (domains.some(row => row.pending > 0 && !row.isRunning)) {
    caveats.push('Stopped domains with pending URLs still block deploy by default; retain the queue unless explicit maintenance approval and sync/local proof are ready.');
  }
  if (domains.some(row => row.isRunning)) {
    caveats.push('Running domains require wait/stop decisions before deploy, queue maintenance, or another live seed.');
  }
  return caveats;
}

function buildQueueMaintenanceChecklist(summary, options = {}) {
  if (!summary || summary.mode !== 'remote-queue-summary') {
    throw new Error('Queue maintenance checklist requires a remote queue summary');
  }
  const affectedDomains = summary.domains.map(row => ({
    domain: row.domain,
    state: row.state,
    isRunning: row.isRunning,
    pending: row.pending,
    errors: row.errors,
    stored: row.stored,
    nextSafestAction: row.nextSafestAction,
  }));
  const domainsCsv = affectedDomains.map(row => row.domain).join(',');
  const remoteHostArg = summary.remoteHost ? ` --host ${summary.remoteHost}` : '';
  const domainsArg = domainsCsv ? ` --domains ${domainsCsv}` : '';
  const generatedAt = options.generatedAt || new Date().toISOString();
  return {
    schemaVersion: 1,
    mode: 'remote-queue-maintenance-checklist',
    generatedAt,
    actionPolicy: {
      readOnly: true,
      startsCrawl: false,
      seedsRemote: false,
      syncsLocalDb: false,
      stopsRemote: false,
      prunesRemote: false,
      drainsRemote: false,
      clearsRemote: false,
      deploysRemote: false,
      forceDeploys: false,
    },
    approvals: {
      queueMaintenanceRequired: true,
      queueMaintenanceToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
      forceDeployRequiredForBusyDeploy: true,
      forceDeployToken: FORCE_DEPLOY_APPROVAL_TOKEN,
      present: false,
    },
    summary: {
      remoteHost: summary.remoteHost,
      requestedDomains: summary.requestedDomains,
      deployPreflightImplication: summary.deployPreflightImplication,
      nextSafestAction: summary.nextSafestAction,
      totals: summary.totals,
      readinessCounts: summary.readinessCounts,
      missingDomains: summary.missingDomains,
      affectedDomains,
    },
    requiredEvidence: [
      {
        name: 'current-queue-summary',
        command: `node tools/crawl/crawl-remote.js queue-summary${remoteHostArg}${domainsArg} --json`,
      },
      {
        name: 'recent-errors',
        command: `node tools/crawl/crawl-remote.js errors${remoteHostArg} --limit 10 --json`,
      },
      {
        name: 'content-proof',
        command: `node tools/crawl/crawl-remote.js content${remoteHostArg} --json`,
      },
      {
        name: 'sync-local-proof-plan',
        command: `node tools/crawl/crawl-remote.js sync${remoteHostArg} --rounds 1 --limit 25 --include-content true --include-links true`,
      },
      {
        name: 'local-db-confirmation-plan',
        command: 'node tools/db/downloads.js recent --limit 20',
      },
      {
        name: 'rollback-stop-command',
        command: `node tools/crawl/crawl-remote.js stop${remoteHostArg}${domainsArg}`,
      },
      {
        name: 'deploy-preflight-before-deploy-or-seed',
        command: 'node tools/crawl/deploy-remote-server.js --preflight-only --json',
      },
    ],
    maintenanceOptions: [
      {
        action: 'retain-queue',
        destructive: false,
        approvalRequired: false,
        note: 'Default safe action while deciding whether pending URLs are valuable.',
      },
      {
        action: 'sync-local-proof',
        destructive: false,
        approvalRequired: false,
        note: 'Pull bounded export evidence before changing remote queue state.',
      },
      {
        action: 'stop-only',
        destructive: false,
        approvalRequired: true,
        approvalToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
        note: 'Stabilize running domains before maintenance; does not remove queued URLs.',
      },
      {
        action: 'drain-or-prune-or-clear',
        destructive: true,
        approvalRequired: true,
        approvalToken: QUEUE_MAINTENANCE_APPROVAL_TOKEN,
        note: 'May remove pending/exported remote state. Requires explicit human approval and local proof.',
      },
      {
        action: 'force-deploy',
        destructive: true,
        approvalRequired: true,
        approvalToken: FORCE_DEPLOY_APPROVAL_TOKEN,
        note: 'May interrupt retained queue work. Requires fresh busy evidence and explicit force-deploy approval.',
      },
    ],
    dataLossCaveats: [
      'Pending URLs may represent useful discovered frontier state from the first seed smoke.',
      'Prune/drain/clear decisions must be separated from live-seed approval.',
      'A seed approval does not authorize queue maintenance or force deploy.',
    ],
  };
}

function renderQueueSummaryText(summary) {
  const lines = [];
  lines.push('Remote Queue Summary');
  lines.push(`Remote: ${summary.remoteHost || '(unknown)'}`);
  lines.push(`Domains: ${summary.bounds.reportedDomainCount}/${summary.bounds.selectedDomainCount}${summary.bounds.truncated ? ' (truncated)' : ''}`);
  lines.push(`Totals: running=${summary.totals.running} pending=${summary.totals.pending} fetched=${summary.totals.fetched} done=${summary.totals.done} errors=${summary.totals.errors} stored=${summary.totals.stored} recentErrors=${summary.totals.recentErrors}`);
  lines.push(`Deploy preflight implication: ${summary.deployPreflightImplication}`);
  lines.push(`Next safest action: ${summary.nextSafestAction}`);
  if (summary.missingDomains.length > 0) lines.push(`Missing domains: ${summary.missingDomains.join(', ')}`);
  lines.push('');
  for (const row of summary.domains) {
    lines.push(`- ${row.domain}: state=${row.state}${row.isRunning ? ' running' : ''}; pending=${row.pending}; done=${row.done}; fetched=${row.fetched}; errors=${row.errors}; recentErrors=${row.recentErrorCount}; stored=${row.stored}; next=${row.nextSafestAction}`);
  }
  if (summary.caveats.length > 0) {
    lines.push('');
    lines.push('Caveats:');
    for (const caveat of summary.caveats) lines.push(`- ${caveat}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderQueueMaintenanceChecklistText(checklist) {
  const lines = [];
  lines.push('Remote Queue Maintenance Checklist');
  lines.push(`Remote: ${checklist.summary.remoteHost || '(unknown)'}`);
  lines.push(`Deploy preflight implication: ${checklist.summary.deployPreflightImplication}`);
  lines.push(`Next safest action: ${checklist.summary.nextSafestAction}`);
  lines.push(`Approval required: ${checklist.approvals.queueMaintenanceToken}`);
  lines.push(`Force deploy approval: ${checklist.approvals.forceDeployToken}`);
  lines.push('');
  lines.push('Affected domains:');
  for (const row of checklist.summary.affectedDomains) {
    lines.push(`- ${row.domain}: state=${row.state}; running=${row.isRunning}; pending=${row.pending}; errors=${row.errors}; stored=${row.stored}`);
  }
  lines.push('');
  lines.push('Required evidence:');
  for (const item of checklist.requiredEvidence) lines.push(`- ${item.name}: ${item.command}`);
  lines.push('');
  lines.push('Maintenance options:');
  for (const item of checklist.maintenanceOptions) {
    lines.push(`- ${item.action}: destructive=${item.destructive}; approvalRequired=${item.approvalRequired}; ${item.note}`);
  }
  lines.push('');
  lines.push('Data-loss caveats:');
  for (const caveat of checklist.dataLossCaveats) lines.push(`- ${caveat}`);
  return `${lines.join('\n')}\n`;
}

function renderCombinedReadinessReportText(report) {
  const lines = [];
  lines.push('Remote Crawler Combined Readiness Report');
  lines.push(`Readiness: ${report.readinessLabel}`);
  lines.push(`Next safest action: ${report.nextSafestAction}`);
  lines.push(`Queue: supplied=${report.queueSummary.supplied}; implication=${report.queueSummary.deployPreflightImplication}; pending=${report.queueSummary.totals ? report.queueSummary.totals.pending : 'unknown'}; stale=${report.queueSummary.stale}`);
  lines.push(`Deploy proof: supplied=${report.deployProof.supplied}; decision=${report.deployProof.decision}; readyForLiveSeedProof=${report.deployProof.readyForLiveSeedProof}; stale=${report.deployProof.stale}`);
  lines.push(`Graph artifact: supplied=${report.graphArtifact.supplied}; hosts=${report.graphArtifact.hosts.join(', ') || '(none)'}; recommendations=${report.graphArtifact.recommendationCount}; stale=${report.graphArtifact.stale}`);
  lines.push(`Preview evidence: supplied=${report.previewEvidence.supplied}; fingerprint=${report.previewEvidence.fingerprint || '(missing)'}; candidates=${report.previewEvidence.candidateCount}`);
  lines.push(`Post-seed plan: supplied=${report.postSeedPlan.supplied}; checks=${report.postSeedPlan.checkCount}; commands=${report.postSeedPlan.commandCount}`);
  if (report.blockers.length > 0) {
    lines.push('');
    lines.push('Blockers:');
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  }
  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  lines.push('');
  lines.push('No-action policy: no URLs are enqueued, no remote state is pruned/drained/cleared, no deploy is run, and collect behavior is unchanged.');
  return `${lines.join('\n')}\n`;
}

function renderQueueMaintenanceDecisionText(decision) {
  const lines = [];
  lines.push('Remote Queue Maintenance Decision');
  lines.push(`Action: ${decision.requestedAction}`);
  lines.push(`Decision: ${decision.decisionLabel}`);
  lines.push(`Operation class: ${decision.action.operationClass.class}`);
  lines.push(`Approval required: ${decision.action.approvalRequired ? decision.action.requiredToken : 'no'}`);
  lines.push(`Approval present: ${decision.action.approvalPresent}`);
  lines.push(`Execution implemented: ${decision.action.executionImplemented}`);
  lines.push(`Pending total: ${decision.queue.pendingTotal}`);
  lines.push(`Readiness: ${decision.readiness.readinessLabel}`);
  lines.push(`Next safest action: ${decision.nextSafestAction}`);
  if (decision.queue.affectedDomains.length > 0) {
    lines.push('');
    lines.push('Affected domains:');
    for (const row of decision.queue.affectedDomains) {
      lines.push(`- ${row.domain}: state=${row.state}; running=${row.isRunning}; pending=${row.pending}; errors=${row.errors}; stored=${row.stored}`);
    }
  }
  if (decision.blockers.length > 0) {
    lines.push('');
    lines.push('Blockers:');
    for (const blocker of decision.blockers) lines.push(`- ${blocker}`);
  }
  if (decision.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of decision.warnings) lines.push(`- ${warning}`);
  }
  lines.push('');
  lines.push('Required evidence:');
  for (const item of decision.requiredEvidence) lines.push(`- ${item}`);
  lines.push('');
  lines.push('Proof commands:');
  for (const [name, command] of Object.entries(decision.commands)) lines.push(`- ${name}: ${command}`);
  lines.push('');
  lines.push('No-action policy: this artifact does not stop crawlers, sync local DB, prune, drain, clear, force deploy, seed URLs, or change collect.');
  return `${lines.join('\n')}\n`;
}

function renderSyncLocalProofReadinessText(report) {
  const lines = [];
  lines.push('Remote Sync/Local Proof Readiness');
  lines.push(`Decision: ${report.decisionLabel}`);
  lines.push(`Readiness: ${report.readiness.readinessLabel}`);
  lines.push(`Pending total: ${report.queue.pendingTotal}`);
  lines.push(`Running total: ${report.queue.runningTotal}`);
  lines.push(`Next safest action: ${report.nextSafestAction}`);
  if (report.queue.affectedDomains.length > 0) {
    lines.push('');
    lines.push('Affected domains:');
    for (const row of report.queue.affectedDomains) {
      lines.push(`- ${row.domain}: state=${row.state}; running=${row.isRunning}; pending=${row.pending}; errors=${row.errors}; stored=${row.stored}`);
    }
  }
  if (report.blockers.length > 0) {
    lines.push('');
    lines.push('Blockers:');
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  }
  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  lines.push('');
  lines.push('Proof plan:');
  lines.push(`- sync: ${report.proofPlan.command}`);
  lines.push(`- local DB confirmation: ${report.proofPlan.confirmationCommand}`);
  lines.push(`- rollback stop: ${report.proofPlan.rollbackStopCommand}`);
  lines.push('');
  lines.push('No-action policy: this artifact does not run sync, pull, stop, prune, drain, clear, deploy, seed URLs, or change collect.');
  return `${lines.join('\n')}\n`;
}

function renderQueueMaintenanceExecutionPlanText(plan) {
  const lines = [];
  lines.push('Remote Queue Maintenance Execution Plan');
  lines.push(`Action: ${plan.requestedAction}`);
  lines.push(`Decision: ${plan.decisionLabel}`);
  lines.push(`Operation class: ${plan.action.operationClass.class}`);
  lines.push(`Approval required: ${plan.action.approvalRequired ? plan.action.requiredToken : 'no'}`);
  lines.push(`Approval present: ${plan.action.approvalPresent}`);
  lines.push(`Execution implemented: ${plan.action.executionImplemented}`);
  lines.push(`Execution allowed: ${plan.action.executionAllowed}`);
  lines.push(`Next safest action: ${plan.nextSafestAction}`);
  lines.push('');
  lines.push('Evidence:');
  lines.push(`- maintenance decision: supplied=${plan.evidence.maintenanceDecision.supplied}; stale=${plan.evidence.maintenanceDecision.stale}; pending=${plan.evidence.maintenanceDecision.pendingTotal}; running=${plan.evidence.maintenanceDecision.runningTotal}`);
  lines.push(`- queue summary: supplied=${plan.evidence.queueSummary.supplied}; stale=${plan.evidence.queueSummary.stale}; implication=${plan.evidence.queueSummary.deployPreflightImplication}`);
  lines.push(`- readiness report: supplied=${plan.evidence.readiness.supplied}; stale=${plan.evidence.readiness.stale}; label=${plan.evidence.readiness.readinessLabel}`);
  lines.push(`- deploy proof: supplied=${plan.evidence.deployProof.supplied}; stale=${plan.evidence.deployProof.stale}; decision=${plan.evidence.deployProof.decision}`);
  lines.push(`- sync proof readiness: supplied=${plan.evidence.syncProofReadiness.supplied}; stale=${plan.evidence.syncProofReadiness.stale}; label=${plan.evidence.syncProofReadiness.decisionLabel}`);
  lines.push('');
  lines.push('Dry-run skeleton:');
  lines.push(`- intent: ${plan.executionSkeleton.commandIntent}`);
  lines.push(`- command: ${plan.executionSkeleton.plannedCommand || '(execution not implemented)'}`);
  if (plan.executionSkeleton.confirmationCommand) lines.push(`- local DB confirmation: ${plan.executionSkeleton.confirmationCommand}`);
  if (plan.executionSkeleton.rollbackStopCommand) lines.push(`- rollback stop: ${plan.executionSkeleton.rollbackStopCommand}`);
  if (plan.executionSkeleton.preflightCommand) lines.push(`- deploy preflight: ${plan.executionSkeleton.preflightCommand}`);
  if (plan.blockers.length > 0) {
    lines.push('');
    lines.push('Blockers:');
    for (const blocker of plan.blockers) lines.push(`- ${blocker}`);
  }
  if (plan.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of plan.warnings) lines.push(`- ${warning}`);
  }
  lines.push('');
  lines.push('No-action policy: this artifact does not stop crawlers, sync local DB, prune, drain, clear, force deploy, seed URLs, or change collect.');
  return `${lines.join('\n')}\n`;
}

function renderSecondSeedReadinessText(report) {
  const lines = [];
  lines.push('Remote Second Graph-Feedback Seed Readiness');
  lines.push(`Readiness: ${report.readinessLabel}`);
  lines.push(`Next safest action: ${report.nextSafestAction}`);
  lines.push(`Approval token present: ${report.approvals.liveSeedApprovalPresent}`);
  lines.push('');
  lines.push('Evidence:');
  lines.push(`- queue summary: supplied=${report.evidence.queueSummary.supplied}; stale=${report.evidence.queueSummary.stale}; implication=${report.evidence.queueSummary.deployPreflightImplication}; pending=${report.evidence.queueSummary.totals ? report.evidence.queueSummary.totals.pending : 'unknown'}; running=${report.evidence.queueSummary.totals ? report.evidence.queueSummary.totals.running : 'unknown'}`);
  lines.push(`- deploy proof: supplied=${report.evidence.deployProof.supplied}; stale=${report.evidence.deployProof.stale}; decision=${report.evidence.deployProof.decision}; readyForLiveSeedProof=${report.evidence.deployProof.readyForLiveSeedProof}`);
  lines.push(`- graph artifact: supplied=${report.evidence.graphArtifact.supplied}; stale=${report.evidence.graphArtifact.stale}; hosts=${report.evidence.graphArtifact.hosts.join(', ') || '(none)'}; recommendations=${report.evidence.graphArtifact.recommendationCount}`);
  lines.push(`- preview evidence: supplied=${report.evidence.previewEvidence.supplied}; fingerprint=${report.evidence.previewEvidence.fingerprint || '(missing)'}; candidates=${report.evidence.previewEvidence.candidateCount}`);
  lines.push(`- post-seed checklist: supplied=${report.evidence.postSeedPlan.supplied}; checks=${report.evidence.postSeedPlan.checkCount}; commands=${report.evidence.postSeedPlan.commandCount}`);
  lines.push(`- maintenance execution plan: supplied=${report.evidence.maintenanceExecutionPlan.supplied}; stale=${report.evidence.maintenanceExecutionPlan.stale}; decision=${report.evidence.maintenanceExecutionPlan.decisionLabel}`);
  lines.push(`- candidate caps: hosts=${report.evidence.graphCandidateBounds.hostCount}/${report.caps.maxHosts}; candidates=${report.evidence.graphCandidateBounds.totalCandidates}/${report.caps.maxTotalCandidates}; perHostMax=${report.caps.maxCandidatesPerHost}`);
  if (report.evidence.hostAgreement.checks.length > 0) {
    lines.push('');
    lines.push('Host checks:');
    for (const check of report.evidence.hostAgreement.checks) {
      lines.push(`- ${check.name}: match=${check.match}; left=${check.left.join(', ') || '(none)'}; right=${check.right.join(', ') || '(none)'}`);
    }
  }
  if (report.blockers.length > 0) {
    lines.push('');
    lines.push('Blockers:');
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  }
  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  lines.push('');
  lines.push('No-action policy: this artifact does not run sync/pull/stop/prune/drain/clear/deploy, does not seed URLs, and does not change collect.');
  return `${lines.join('\n')}\n`;
}

module.exports = {
  DEFAULT_EVIDENCE_STALE_AFTER_MS,
  DEFAULT_ERROR_LIMIT,
  DEFAULT_MAX_DOMAINS,
  FORCE_DEPLOY_APPROVAL_TOKEN,
  HARD_ERROR_LIMIT,
  HARD_MAX_DOMAINS,
  LIVE_SEED_APPROVAL_TOKEN,
  QUEUE_MAINTENANCE_APPROVAL_TOKEN,
  REMOTE_QUEUE_MAINTENANCE_ACTIONS,
  REMOTE_OPERATION_CLASSIFICATIONS,
  buildCombinedReadinessReport,
  buildQueueMaintenanceExecutionPlanArtifact,
  buildQueueMaintenanceDecisionArtifact,
  buildQueueMaintenanceChecklist,
  buildQueueSummary,
  buildSecondSeedReadinessArtifact,
  buildSyncLocalProofReadinessArtifact,
  classifyRemoteOperation,
  normalizeQueueOptions,
  renderCombinedReadinessReportText,
  renderQueueMaintenanceExecutionPlanText,
  renderQueueMaintenanceDecisionText,
  renderQueueMaintenanceChecklistText,
  renderQueueSummaryText,
  renderSecondSeedReadinessText,
  renderSyncLocalProofReadinessText,
};
