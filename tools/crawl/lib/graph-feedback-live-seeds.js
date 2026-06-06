'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const {
  ARTIFACT_SCHEMA_VERSION,
  MAX_ARTIFACT_BYTES,
  MAX_ARTIFACT_URL_LENGTH,
  STALE_ARTIFACT_WARNING_DAYS,
  buildArtifactEvidence,
  buildArtifactPlanningDryRunFromPlan,
} = require('../graph-feedback');
const { normalizeHosts } = require('./graph-feedback-artifact-explain');

const STALE_ARTIFACT_WARNING_MS = STALE_ARTIFACT_WARNING_DAYS * 24 * 60 * 60 * 1000;

const LIVE_SEED_CAPS = Object.freeze({
  maxHosts: 5,
  maxCandidatesPerHost: 10,
  maxTotalUrls: 25,
  maxUrlLength: MAX_ARTIFACT_URL_LENGTH,
  maxArtifactBytes: MAX_ARTIFACT_BYTES,
  maxRequestBodyBytes: 128 * 1024,
});

const REAL_REMOTE_SMOKE_CAPS = Object.freeze({
  maxHosts: 1,
  maxCandidates: 3,
  timeoutSeconds: 30,
  maxApprovalChecklistBytes: 16 * 1024,
  maxApprovalReadinessBytes: 16 * 1024,
  maxPostSeedChecklistBytes: 16 * 1024,
  maxPostSeedEvidenceBytes: 16 * 1024,
  maxPostSeedSummaryChars: 240,
  maxPostSeedChecks: 12,
});

const DEFAULT_POST_SEED_CHECK_NAMES = Object.freeze([
  'health',
  'status',
  'errors',
  'content',
  'sync-or-pull',
  'local-db-confirmation',
]);

const REQUIRED_REMOTE_USABILITY_COMMANDS = Object.freeze([
  'health',
  'status-build',
  'recent-errors',
  'content-probe',
  'deploy-preflight',
]);

const REQUIRED_POST_SEED_COMMANDS = Object.freeze([
  'health',
  'status',
  'errors',
  'content',
  'one-round-sync',
  'local-db-recent',
]);

const REQUIRED_ROLLBACK_COMMANDS = Object.freeze([
  'stop-target-hosts',
  'status-after-stop',
]);

function buildGraphFeedbackLiveSeedPlan(plannedHosts, artifactPath, options = {}) {
  const hosts = normalizeHosts(plannedHosts);
  const caps = { ...LIVE_SEED_CAPS, ...(options.caps || {}) };
  if (!hosts.length) {
    throw new Error('--use-graph-feedback-seeds requires planned remote --domain or --domains hosts');
  }
  if (hosts.length > caps.maxHosts) {
    throw new Error(`--use-graph-feedback-seeds supports at most ${caps.maxHosts} host(s); requested ${hosts.length}`);
  }
  const wwwHosts = hosts.filter(host => host.startsWith('www.'));
  if (wwwHosts.length) {
    throw new Error(`--use-graph-feedback-seeds requires non-www remote domain keys; crawl-remote canonicalizes seed domains, so use exact non-www hosts instead of: ${wwwHosts.join(', ')}`);
  }

  const { artifact, evidence } = readGraphFeedbackArtifactSync(artifactPath, {
    ...options,
    maxArtifactBytes: caps.maxArtifactBytes,
  });
  assertLiveArtifactFresh(evidence);

  const dryRun = buildArtifactPlanningDryRunFromPlan(artifact, {
    artifactPath,
    domains: hosts,
    generatedAt: options.generatedAt,
    artifactEvidence: evidence,
  });

  const errors = [];
  const seedUrlsByDomain = {};
  let totalUrls = 0;

  for (const domainPlan of dryRun.domains || []) {
    const host = normalizeHosts([domainPlan.host])[0];
    const candidates = Array.isArray(domainPlan.candidates) ? domainPlan.candidates : [];
    if (candidates.length > caps.maxCandidatesPerHost) {
      errors.push(`${host} has ${candidates.length} candidate(s); max live seed candidates per host is ${caps.maxCandidatesPerHost}`);
      continue;
    }

    seedUrlsByDomain[host] = [];
    for (const candidate of candidates) {
      const url = validateLiveSeedUrl(candidate && candidate.url, host, caps);
      seedUrlsByDomain[host].push(url);
      totalUrls += 1;
    }
  }

  if (totalUrls > caps.maxTotalUrls) {
    errors.push(`candidate count ${totalUrls} exceeds max live seed URLs ${caps.maxTotalUrls}`);
  }
  if (totalUrls === 0) {
    errors.push('no graph-feedback seed candidates are available for the planned hosts');
  }

  const seedUrlsByDomainSpec = serializeSeedUrlsByDomain(seedUrlsByDomain);
  const requestBody = { seedUrlsByDomain };
  const requestBodyBytes = Buffer.byteLength(JSON.stringify(requestBody), 'utf8');
  if (requestBodyBytes > caps.maxRequestBodyBytes) {
    errors.push(`seed request body is ${requestBodyBytes} bytes; max is ${caps.maxRequestBodyBytes} bytes`);
  }

  if (errors.length) {
    throw new Error(`Invalid graph-feedback live seed plan: ${errors.join('; ')}`);
  }

  const plan = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    source: 'graph-feedback-live-seeds',
    mode: 'live-seed-plan',
    generatedAt: options.generatedAt || new Date().toISOString(),
    artifactPath,
    artifactGeneratedAt: dryRun.artifactGeneratedAt,
    plannedHosts: hosts,
    domainCount: dryRun.domainCount,
    candidateCount: totalUrls,
    seedUrlsByDomain,
    seedUrlsByDomainSpec,
    requestBodyBytes,
    caps,
    artifactEvidence: evidence,
    actionPolicy: {
      enqueueUrls: false,
      seedRemoteCrawlers: true,
      alterCollectBehavior: false,
      requiresExplicitLiveFlag: true,
    },
  };
  plan.previewEvidence = buildLiveSeedPreviewEvidence(plan);
  return plan;
}

function readGraphFeedbackArtifactSync(artifactPath, options = {}) {
  const normalizedPath = String(artifactPath || '').trim();
  if (!normalizedPath) {
    throw new Error('--use-graph-feedback-seeds requires --graph-feedback-artifact <path>');
  }

  const fsApi = options.fs || fs;
  let rawText;
  try {
    const raw = fsApi.readFileSync(normalizedPath, 'utf8');
    rawText = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  } catch (err) {
    throw new Error(`Unable to read graph-feedback artifact ${normalizedPath}: ${err.message}`);
  }

  const byteSize = Buffer.byteLength(rawText, 'utf8');
  const maxArtifactBytes = Number(options.maxArtifactBytes || LIVE_SEED_CAPS.maxArtifactBytes);
  if (byteSize > maxArtifactBytes) {
    throw new Error(`Graph-feedback artifact ${normalizedPath} is ${byteSize} bytes; max supported size is ${maxArtifactBytes} bytes`);
  }

  let artifact;
  try {
    artifact = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Invalid graph-feedback artifact JSON at ${normalizedPath}: ${err.message}`);
  }

  return {
    artifact,
    evidence: buildArtifactEvidence(artifact, {
      byteSize,
      referenceAt: options.referenceAt || options.generatedAt,
    }),
  };
}

function assertLiveArtifactFresh(evidence) {
  if (!evidence || !evidence.generatedAt) {
    throw new Error('Graph-feedback live seeding requires artifact generatedAt freshness evidence');
  }
  if (!evidence.generatedAtValid) {
    throw new Error('Graph-feedback live seeding requires a valid artifact generatedAt timestamp');
  }
  if (!Number.isFinite(evidence.ageSeconds)) {
    throw new Error('Graph-feedback live seeding cannot assess artifact freshness');
  }
  if (evidence.ageSeconds < 0) {
    throw new Error('Graph-feedback live seeding rejects artifacts generated in the future');
  }
  if (evidence.ageSeconds * 1000 > STALE_ARTIFACT_WARNING_MS) {
    throw new Error(`Graph-feedback live seeding rejects artifacts older than ${STALE_ARTIFACT_WARNING_DAYS} days; regenerate the artifact`);
  }
}

function validateLiveSeedUrl(value, host, caps = LIVE_SEED_CAPS) {
  const url = String(value || '').trim();
  if (!url) {
    throw new Error(`${host} has an empty live seed URL candidate`);
  }
  if (url.length > caps.maxUrlLength) {
    throw new Error(`${host} live seed URL length ${url.length} exceeds ${caps.maxUrlLength}`);
  }
  if (/[;|\r\n]/.test(url)) {
    throw new Error(`${host} live seed URL contains unsupported command delimiters`);
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (_err) {
    throw new Error(`${host} live seed URL is not a valid URL: ${url}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${host} live seed URL must use http or https: ${url}`);
  }

  const urlHost = String(parsed.hostname || '').trim().toLowerCase();
  if (urlHost !== host) {
    throw new Error(`${host} live seed URL host mismatch: ${urlHost || '(none)'}`);
  }

  return url;
}

function appendGraphFeedbackSeedArgs(args, liveSeedPlan) {
  const tokens = Array.isArray(args) ? args.map(value => String(value)) : [];
  if (hasExistingSeedArgs(tokens)) {
    throw new Error('--use-graph-feedback-seeds cannot be combined with existing --seed-urls or --seed-urls-by-domain flags');
  }
  if (!liveSeedPlan || !liveSeedPlan.seedUrlsByDomainSpec) {
    throw new Error('Expected a validated graph-feedback live seed plan');
  }
  return [...tokens, '--seed-urls-by-domain', liveSeedPlan.seedUrlsByDomainSpec];
}

function hasExistingSeedArgs(args) {
  return (Array.isArray(args) ? args : []).some((token) => {
    const text = String(token || '');
    return text === '--seed-urls'
      || text === '--seed-urls-by-domain'
      || text.startsWith('--seed-urls=')
      || text.startsWith('--seed-urls-by-domain=');
  });
}

function serializeSeedUrlsByDomain(seedUrlsByDomain) {
  return Object.entries(seedUrlsByDomain || {})
    .filter(([, urls]) => Array.isArray(urls) && urls.length > 0)
    .map(([host, urls]) => `${host}=${urls.join('|')}`)
    .join(';');
}

function buildLiveSeedPreviewEvidence(liveSeedPlan) {
  if (!liveSeedPlan || typeof liveSeedPlan !== 'object') {
    throw new Error('Expected a validated graph-feedback live seed plan for preview evidence');
  }

  const evidence = liveSeedPlan.artifactEvidence || {};
  const fingerprintInput = {
    artifactPath: String(liveSeedPlan.artifactPath || ''),
    artifactGeneratedAt: liveSeedPlan.artifactGeneratedAt || null,
    artifactByteSize: Number(evidence.byteSize || 0),
    plannedHosts: Array.isArray(liveSeedPlan.plannedHosts) ? liveSeedPlan.plannedHosts : [],
    domainCount: Number(liveSeedPlan.domainCount || 0),
    candidateCount: Number(liveSeedPlan.candidateCount || 0),
    requestBodyBytes: Number(liveSeedPlan.requestBodyBytes || 0),
    seedUrlsByDomain: liveSeedPlan.seedUrlsByDomain || {},
    caps: {
      maxHosts: liveSeedPlan.caps && liveSeedPlan.caps.maxHosts,
      maxCandidatesPerHost: liveSeedPlan.caps && liveSeedPlan.caps.maxCandidatesPerHost,
      maxTotalUrls: liveSeedPlan.caps && liveSeedPlan.caps.maxTotalUrls,
      maxUrlLength: liveSeedPlan.caps && liveSeedPlan.caps.maxUrlLength,
      maxRequestBodyBytes: liveSeedPlan.caps && liveSeedPlan.caps.maxRequestBodyBytes,
    },
  };

  return {
    schemaVersion: 1,
    mode: 'graph-feedback-live-seed-preview-evidence',
    fingerprintAlgorithm: 'sha256:stable-json:v1',
    fingerprint: hashStableJson(fingerprintInput),
    artifactPath: fingerprintInput.artifactPath,
    artifactGeneratedAt: fingerprintInput.artifactGeneratedAt,
    artifactByteSize: fingerprintInput.artifactByteSize,
    plannedHosts: fingerprintInput.plannedHosts,
    domainCount: fingerprintInput.domainCount,
    candidateCount: fingerprintInput.candidateCount,
    requestBodyBytes: fingerprintInput.requestBodyBytes,
    caps: fingerprintInput.caps,
    actionPolicy: {
      dryRunEvidenceOnly: true,
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    },
  };
}

function readLiveSeedPreviewEvidenceSync(evidencePath, options = {}) {
  const normalizedPath = String(evidencePath || '').trim();
  if (!normalizedPath) {
    throw new Error('--graph-feedback-preview-evidence requires a path');
  }
  const fsApi = options.fs || fs;
  let rawText;
  try {
    const raw = fsApi.readFileSync(normalizedPath, 'utf8');
    rawText = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  } catch (err) {
    throw new Error(`Unable to read graph-feedback preview evidence ${normalizedPath}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Invalid graph-feedback preview evidence JSON at ${normalizedPath}: ${err.message}`);
  }
  return parsed;
}

function writeLiveSeedPreviewEvidenceSync(evidencePath, liveSeedPlan, options = {}) {
  const normalizedPath = String(evidencePath || '').trim();
  if (!normalizedPath) {
    throw new Error('--graph-feedback-preview-evidence requires a path');
  }
  const fsApi = options.fs || fs;
  const record = {
    ...buildLiveSeedPreviewEvidence(liveSeedPlan),
    generatedAt: options.generatedAt || new Date().toISOString(),
  };
  fsApi.mkdirSync(path.dirname(normalizedPath), { recursive: true });
  fsApi.writeFileSync(normalizedPath, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function verifyLiveSeedPreviewEvidence(liveSeedPlan, previewEvidence) {
  const expected = buildLiveSeedPreviewEvidence(liveSeedPlan);
  if (!previewEvidence || typeof previewEvidence !== 'object' || Array.isArray(previewEvidence)) {
    throw new Error('Graph-feedback preview evidence must be a JSON object');
  }
  if (previewEvidence.schemaVersion !== expected.schemaVersion) {
    throw new Error(`Graph-feedback preview evidence schemaVersion must be ${expected.schemaVersion}`);
  }
  if (previewEvidence.mode !== expected.mode) {
    throw new Error(`Graph-feedback preview evidence mode must be ${expected.mode}`);
  }
  if (previewEvidence.fingerprintAlgorithm !== expected.fingerprintAlgorithm) {
    throw new Error(`Graph-feedback preview evidence fingerprintAlgorithm must be ${expected.fingerprintAlgorithm}`);
  }
  if (previewEvidence.fingerprint !== expected.fingerprint) {
    throw new Error('Graph-feedback preview evidence fingerprint does not match the live seed plan; rerun the dry-run preview');
  }
  return {
    ok: true,
    fingerprint: expected.fingerprint,
  };
}

function buildSeedAttemptLogRecord(liveSeedPlan, options = {}) {
  if (!liveSeedPlan || typeof liveSeedPlan !== 'object') {
    throw new Error('Expected a validated graph-feedback live seed plan for seed attempt logging');
  }
  const evidence = liveSeedPlan.artifactEvidence || {};
  return {
    schemaVersion: 1,
    mode: 'graph-feedback-live-seed-attempt',
    generatedAt: options.generatedAt || new Date().toISOString(),
    artifactPath: liveSeedPlan.artifactPath,
    artifactGeneratedAt: liveSeedPlan.artifactGeneratedAt,
    artifactByteSize: Number(evidence.byteSize || 0),
    artifactGeneratedAtValid: evidence.generatedAtValid === true,
    artifactAgeSeconds: Number.isFinite(evidence.ageSeconds) ? evidence.ageSeconds : null,
    plannedHosts: liveSeedPlan.plannedHosts,
    domainCount: liveSeedPlan.domainCount,
    candidateCount: liveSeedPlan.candidateCount,
    requestBodyBytes: liveSeedPlan.requestBodyBytes,
    previewFingerprint: liveSeedPlan.previewEvidence && liveSeedPlan.previewEvidence.fingerprint,
    delegatedCommand: redactSeedUrlArgs(options.delegatedCommand || null),
    actionPolicy: {
      seedRemoteCrawlers: true,
      enqueueUrls: false,
      alterCollectBehavior: false,
    },
  };
}

function redactSeedUrlArgs(command) {
  if (!command) return null;
  const text = String(command);
  return text
    .replace(/--seed-urls-by-domain(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/g, '--seed-urls-by-domain [redacted:graph-feedback-seeds]')
    .replace(/--seed-urls(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/g, '--seed-urls [redacted:seed-urls]');
}

function writeSeedAttemptLogSync(logPath, liveSeedPlan, options = {}) {
  const normalizedPath = String(logPath || '').trim();
  if (!normalizedPath) {
    throw new Error('--seed-attempt-log requires a path');
  }
  const fsApi = options.fs || fs;
  const record = buildSeedAttemptLogRecord(liveSeedPlan, options);
  fsApi.mkdirSync(path.dirname(normalizedPath), { recursive: true });
  fsApi.appendFileSync(normalizedPath, `${JSON.stringify(record)}\n`);
  return record;
}

function sanitizeEvidenceText(value, maxChars = REAL_REMOTE_SMOKE_CAPS.maxPostSeedSummaryChars) {
  const compact = String(value || '')
    .replace(/https?:\/\/[^\s"'<>]+/g, '[redacted:url]')
    .replace(/\s+/g, ' ')
    .trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizePostSeedChecks(checks = [], options = {}) {
  const maxChecks = Number(options.maxChecks || REAL_REMOTE_SMOKE_CAPS.maxPostSeedChecks);
  if (!Array.isArray(checks)) {
    throw new Error('Post-seed verification evidence checks must be an array');
  }
  if (checks.length > maxChecks) {
    throw new Error(`Post-seed verification evidence supports at most ${maxChecks} check(s)`);
  }
  return checks.map((check, index) => {
    const name = String(check && check.name || DEFAULT_POST_SEED_CHECK_NAMES[index] || `check-${index + 1}`)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return {
      name: name || `check-${index + 1}`,
      ok: check && check.ok === true,
      summary: sanitizeEvidenceText(check && check.summary, options.maxSummaryChars),
    };
  });
}

function buildPostSeedVerificationEvidence(liveSeedPlan, options = {}) {
  if (!liveSeedPlan || typeof liveSeedPlan !== 'object') {
    throw new Error('Expected a validated graph-feedback live seed plan for post-seed evidence');
  }
  const checks = normalizePostSeedChecks(options.checks || [], options);
  const rollback = options.rollbackStatus || {};
  const record = {
    schemaVersion: 1,
    mode: 'graph-feedback-live-seed-post-seed-verification-evidence',
    generatedAt: options.generatedAt || new Date().toISOString(),
    previewFingerprint: liveSeedPlan.previewEvidence && liveSeedPlan.previewEvidence.fingerprint,
    approvalChecklistPath: options.approvalChecklistPath || null,
    seedAttemptLogPath: options.seedAttemptLogPath || null,
    hosts: Array.isArray(liveSeedPlan.plannedHosts) ? liveSeedPlan.plannedHosts : [],
    candidateCount: Number(liveSeedPlan.candidateCount || 0),
    requestBodyBytes: Number(liveSeedPlan.requestBodyBytes || 0),
    checks,
    allChecksOk: checks.length > 0 && checks.every(check => check.ok === true),
    rollback: {
      attempted: rollback.attempted === true,
      ok: rollback.ok === true,
      summary: sanitizeEvidenceText(rollback.summary, options.maxSummaryChars),
    },
    actionPolicy: {
      evidenceOnly: true,
      seedRemoteCrawlers: false,
      enqueueUrls: false,
      alterCollectBehavior: false,
    },
  };
  const text = JSON.stringify(record);
  const maxBytes = Number(options.maxBytes || REAL_REMOTE_SMOKE_CAPS.maxPostSeedEvidenceBytes);
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new Error(`Post-seed verification evidence exceeds ${maxBytes} bytes`);
  }
  return record;
}

function writePostSeedVerificationEvidenceSync(evidencePath, liveSeedPlan, options = {}) {
  const normalizedPath = String(evidencePath || '').trim();
  if (!normalizedPath) {
    throw new Error('Post-seed verification evidence requires an output path');
  }
  const fsApi = options.fs || fs;
  const record = buildPostSeedVerificationEvidence(liveSeedPlan, options);
  const text = `${JSON.stringify(record, null, 2)}\n`;
  const maxBytes = Number(options.maxBytes || REAL_REMOTE_SMOKE_CAPS.maxPostSeedEvidenceBytes);
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new Error(`Post-seed verification evidence exceeds ${maxBytes} bytes`);
  }
  fsApi.mkdirSync(path.dirname(normalizedPath), { recursive: true });
  fsApi.writeFileSync(normalizedPath, text);
  return record;
}

function buildPostSeedVerificationChecklist(liveSeedPlan, options = {}) {
  if (!liveSeedPlan || typeof liveSeedPlan !== 'object') {
    throw new Error('Expected a validated graph-feedback live seed plan for post-seed verification');
  }
  const hosts = Array.isArray(liveSeedPlan.plannedHosts) ? liveSeedPlan.plannedHosts : [];
  const hostCsv = hosts.join(',');
  const hostFlag = hostCsv ? ` --domains ${hostCsv}` : '';
  const singleHostFlag = hosts.length === 1 ? ` --domain ${hosts[0]}` : '';
  const timeoutSeconds = Number(options.timeoutSeconds || REAL_REMOTE_SMOKE_CAPS.timeoutSeconds);
  const postSeedEvidencePath = options.postSeedEvidencePath || deriveSiblingEvidencePath(
    options.approvalChecklistPath || options.seedAttemptLogPath || liveSeedPlan.artifactPath,
    'post-seed-verification.json'
  );

  return {
    mode: 'graph-feedback-live-seed-post-seed-verification',
    timeoutSeconds,
    evidenceArtifact: {
      path: postSeedEvidencePath,
      maxBytes: 16 * 1024,
      shape: {
        schemaVersion: 1,
        mode: 'graph-feedback-live-seed-post-seed-verification-evidence',
        generatedAt: '<iso timestamp>',
        previewFingerprint: '<preview evidence fingerprint>',
        seedAttemptLogPath: '<path>',
        hosts,
        checks: DEFAULT_POST_SEED_CHECK_NAMES.map(name => ({ name, ok: '<boolean>', summary: '<bounded text>' })),
        rollback: { attempted: '<boolean>', ok: '<boolean>', summary: '<bounded text>' },
      },
    },
    commands: [
      { name: 'health', command: `timeout ${timeoutSeconds}s node tools/crawl/crawl-remote.js health` },
      { name: 'status', command: `timeout ${timeoutSeconds}s node tools/crawl/crawl-remote.js status --json` },
      { name: 'errors', command: `timeout ${timeoutSeconds}s node tools/crawl/crawl-remote.js errors --limit 10 --json` },
      { name: 'content', command: `timeout ${timeoutSeconds}s node tools/crawl/crawl-remote.js content${singleHostFlag} --json` },
      { name: 'one-round-sync', command: `timeout ${timeoutSeconds}s node tools/crawl/crawl-remote.js sync --rounds 1 --limit 5 --include-content true --include-links true` },
      { name: 'local-db-recent', command: 'npm run db:downloads:recent' },
    ],
    rollbackCommands: [
      { name: 'stop-target-hosts', command: `timeout ${timeoutSeconds}s node tools/crawl/crawl-remote.js stop${hostFlag || ' --all'}` },
      { name: 'status-after-stop', command: `timeout ${timeoutSeconds}s node tools/crawl/crawl-remote.js status --json` },
    ],
    notes: [
      'Capture command output into the bounded evidence artifact; do not paste full payload dumps into session notes.',
      'If status/errors look unhealthy, stop the target hosts and switch to the remote recovery workflow before any further seeding.',
    ],
  };
}

function writePostSeedVerificationChecklistSync(checklistPath, liveSeedPlan, options = {}) {
  const normalizedPath = String(checklistPath || '').trim();
  if (!normalizedPath) {
    throw new Error('--graph-feedback-post-seed-checklist requires a path');
  }
  const fsApi = options.fs || fs;
  const record = buildPostSeedVerificationChecklist(liveSeedPlan, options);
  const text = `${JSON.stringify(record, null, 2)}\n`;
  const maxBytes = Number(options.maxBytes || REAL_REMOTE_SMOKE_CAPS.maxPostSeedChecklistBytes);
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new Error(`Post-seed verification checklist exceeds ${maxBytes} bytes`);
  }
  fsApi.mkdirSync(path.dirname(normalizedPath), { recursive: true });
  fsApi.writeFileSync(normalizedPath, text);
  return record;
}

function buildPreSeedRemoteUsabilityProof(liveSeedPlan, options = {}) {
  if (!liveSeedPlan || typeof liveSeedPlan !== 'object') {
    throw new Error('Expected a validated graph-feedback live seed plan for remote usability proof');
  }
  const hosts = Array.isArray(liveSeedPlan.plannedHosts) ? liveSeedPlan.plannedHosts : [];
  const singleHostFlag = hosts.length === 1 ? ` --domain ${hosts[0]}` : '';
  const timeoutSeconds = Number(options.timeoutSeconds || REAL_REMOTE_SMOKE_CAPS.timeoutSeconds);

  return {
    mode: 'graph-feedback-live-seed-pre-seed-remote-usability',
    timeoutSeconds,
    commands: [
      { name: 'health', command: `timeout ${timeoutSeconds}s node tools/crawl/crawl-remote.js health` },
      { name: 'status-build', command: `timeout ${timeoutSeconds}s node tools/crawl/crawl-remote.js status --json` },
      { name: 'recent-errors', command: `timeout ${timeoutSeconds}s node tools/crawl/crawl-remote.js errors --limit 10 --json` },
      { name: 'content-probe', command: `timeout ${timeoutSeconds}s node tools/crawl/crawl-remote.js content${singleHostFlag} --json` },
      { name: 'deploy-preflight', command: `timeout ${timeoutSeconds}s node tools/crawl/deploy-remote-server.js --preflight-only --json` },
    ],
    decisionPoints: [
      'If health or status fails, do not seed; inspect PM2/logs/install state through the recovery workflow.',
      'If status lacks current build metadata, run deploy preflight before asking for approval.',
      'If recent errors or content probes look unhealthy, stop/stabilize before any live seed.',
      'Use --force only after explicit interruption approval and rollback/stop commands are understood.',
    ],
    actionPolicy: {
      checklistOnly: true,
      seedRemoteCrawlers: false,
      enqueueUrls: false,
      alterCollectBehavior: false,
    },
  };
}

function buildLiveSeedApprovalChecklist(liveSeedPlan, options = {}) {
  if (!liveSeedPlan || typeof liveSeedPlan !== 'object') {
    throw new Error('Expected a validated graph-feedback live seed plan for approval checklist');
  }
  const previewEvidencePath = String(options.previewEvidencePath || '').trim();
  const approvalChecklistPath = String(options.approvalChecklistPath || '').trim();
  const seedAttemptLogPath = String(options.seedAttemptLogPath || deriveSiblingEvidencePath(
    approvalChecklistPath || previewEvidencePath || liveSeedPlan.artifactPath,
    'seed-attempts.jsonl'
  ));
  const evidence = liveSeedPlan.artifactEvidence || {};
  const hostCount = Array.isArray(liveSeedPlan.plannedHosts) ? liveSeedPlan.plannedHosts.length : 0;
  const candidateCount = Number(liveSeedPlan.candidateCount || 0);
  const caps = {
    maxHosts: REAL_REMOTE_SMOKE_CAPS.maxHosts,
    maxCandidates: REAL_REMOTE_SMOKE_CAPS.maxCandidates,
    timeoutSeconds: REAL_REMOTE_SMOKE_CAPS.timeoutSeconds,
  };
  const checks = [
    {
      name: 'separate-human-approval',
      ok: false,
      required: true,
      detail: 'A real seed may run only after the prompt contains a separate explicit approval line.',
    },
    {
      name: 'max-one-host',
      ok: hostCount > 0 && hostCount <= caps.maxHosts,
      required: true,
      detail: `planned host count ${hostCount}; max ${caps.maxHosts}`,
    },
    {
      name: 'max-three-candidates',
      ok: candidateCount > 0 && candidateCount <= caps.maxCandidates,
      required: true,
      detail: `candidate count ${candidateCount}; max ${caps.maxCandidates}`,
    },
    {
      name: 'preview-evidence-present',
      ok: Boolean(previewEvidencePath),
      required: true,
      detail: previewEvidencePath || 'missing --graph-feedback-preview-evidence path',
    },
    {
      name: 'seed-attempt-log-planned',
      ok: Boolean(seedAttemptLogPath),
      required: true,
      detail: seedAttemptLogPath || 'missing seed attempt log path',
    },
    {
      name: 'fresh-artifact',
      ok: evidence.generatedAtValid === true && Number.isFinite(evidence.ageSeconds) && evidence.ageSeconds >= 0 && evidence.ageSeconds * 1000 <= STALE_ARTIFACT_WARNING_MS,
      required: true,
      detail: `generatedAt=${evidence.generatedAt || '(missing)'} ageSeconds=${Number.isFinite(evidence.ageSeconds) ? evidence.ageSeconds : 'unknown'}`,
    },
    {
      name: 'request-body-bounded',
      ok: Number(liveSeedPlan.requestBodyBytes || 0) <= LIVE_SEED_CAPS.maxRequestBodyBytes,
      required: true,
      detail: `${liveSeedPlan.requestBodyBytes} bytes; max ${LIVE_SEED_CAPS.maxRequestBodyBytes}`,
    },
  ];
  const approvalReadyForHuman = checks
    .filter(check => check.name !== 'separate-human-approval')
    .every(check => check.ok === true);
  const hostCsv = (liveSeedPlan.plannedHosts || []).join(',');
  const postSeedVerification = buildPostSeedVerificationChecklist(liveSeedPlan, {
    approvalChecklistPath,
    seedAttemptLogPath,
    timeoutSeconds: caps.timeoutSeconds,
  });
  const remoteUsabilityProof = buildPreSeedRemoteUsabilityProof(liveSeedPlan, {
    timeoutSeconds: caps.timeoutSeconds,
  });

  return {
    schemaVersion: 1,
    mode: 'graph-feedback-live-seed-approval-checklist',
    generatedAt: options.generatedAt || new Date().toISOString(),
    approvalReadyForHuman,
    realSeedAuthorized: false,
    explicitApprovalRequired: true,
    explicitApprovalLine: 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE',
    constraints: caps,
    artifact: {
      path: liveSeedPlan.artifactPath,
      generatedAt: liveSeedPlan.artifactGeneratedAt,
      byteSize: Number(evidence.byteSize || 0),
      ageSeconds: Number.isFinite(evidence.ageSeconds) ? evidence.ageSeconds : null,
    },
    previewEvidence: {
      path: previewEvidencePath || null,
      fingerprint: liveSeedPlan.previewEvidence && liveSeedPlan.previewEvidence.fingerprint,
    },
    seedAttemptLog: {
      path: seedAttemptLogPath,
      maxBytes: 16 * 1024,
    },
    plannedHosts: liveSeedPlan.plannedHosts,
    candidateCount,
    requestBodyBytes: liveSeedPlan.requestBodyBytes,
    checks,
    commands: {
      preSeedHealth: `timeout ${caps.timeoutSeconds}s node tools/crawl/crawl-remote.js health`,
      preSeedStatus: `timeout ${caps.timeoutSeconds}s node tools/crawl/crawl-remote.js status --json`,
      preSeedErrors: remoteUsabilityProof.commands.find(command => command.name === 'recent-errors').command,
      preSeedContent: remoteUsabilityProof.commands.find(command => command.name === 'content-probe').command,
      deployPreflight: remoteUsabilityProof.commands.find(command => command.name === 'deploy-preflight').command,
      dryRunPreview: options.dryRunCommand ? redactSeedUrlArgs(options.dryRunCommand) : null,
      liveSeedTemplate: `timeout ${caps.timeoutSeconds}s node tools/crawl/index.js remote bounded --domains ${hostCsv} --graph-feedback-artifact ${liveSeedPlan.artifactPath} --use-graph-feedback-seeds --graph-feedback-preview-evidence ${previewEvidencePath || '<preview-evidence.json>'} --seed-attempt-log ${seedAttemptLogPath}`,
      rollbackStop: postSeedVerification.rollbackCommands[0].command,
    },
    remoteUsabilityProof,
    postSeedVerification,
    actionPolicy: {
      dryRunOnly: true,
      requiresSeparateHumanApproval: true,
      seedRemoteCrawlers: false,
      enqueueUrls: false,
      alterCollectBehavior: false,
    },
  };
}

function writeLiveSeedApprovalChecklistSync(checklistPath, liveSeedPlan, options = {}) {
  const normalizedPath = String(checklistPath || '').trim();
  if (!normalizedPath) {
    throw new Error('--graph-feedback-approval-checklist requires a path');
  }
  const fsApi = options.fs || fs;
  const record = buildLiveSeedApprovalChecklist(liveSeedPlan, {
    ...options,
    approvalChecklistPath: normalizedPath,
  });
  const text = `${JSON.stringify(record, null, 2)}\n`;
  if (Buffer.byteLength(text, 'utf8') > REAL_REMOTE_SMOKE_CAPS.maxApprovalChecklistBytes) {
    throw new Error(`Graph-feedback approval checklist exceeds ${REAL_REMOTE_SMOKE_CAPS.maxApprovalChecklistBytes} bytes`);
  }
  fsApi.mkdirSync(path.dirname(normalizedPath), { recursive: true });
  fsApi.writeFileSync(normalizedPath, text);
  return record;
}

function writeLiveSeedApprovalReadinessSync(readinessPath, options = {}) {
  const normalizedPath = String(readinessPath || '').trim();
  if (!normalizedPath) {
    throw new Error('--graph-feedback-approval-readiness requires a path');
  }
  const fsApi = options.fs || fs;
  const record = buildLiveSeedApprovalReadiness({
    ...options,
    approvalReadinessPath: normalizedPath,
  });
  const text = `${JSON.stringify(record, null, 2)}\n`;
  if (Buffer.byteLength(text, 'utf8') > REAL_REMOTE_SMOKE_CAPS.maxApprovalReadinessBytes) {
    throw new Error(`Graph-feedback approval readiness exceeds ${REAL_REMOTE_SMOKE_CAPS.maxApprovalReadinessBytes} bytes`);
  }
  fsApi.mkdirSync(path.dirname(normalizedPath), { recursive: true });
  fsApi.writeFileSync(normalizedPath, text);
  return record;
}

function readLiveSeedApprovalChecklistSync(checklistPath, options = {}) {
  return readBoundedJsonFileSync(checklistPath, 'graph-feedback approval checklist', {
    ...options,
    maxBytes: options.maxBytes || REAL_REMOTE_SMOKE_CAPS.maxApprovalChecklistBytes,
  });
}

function readPostSeedVerificationEvidenceSync(evidencePath, options = {}) {
  return readBoundedJsonFileSync(evidencePath, 'post-seed verification evidence', {
    ...options,
    maxBytes: options.maxBytes || REAL_REMOTE_SMOKE_CAPS.maxPostSeedEvidenceBytes,
  });
}

function readBoundedJsonFileSync(filePath, label, options = {}) {
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) {
    throw new Error(`${label} requires a path`);
  }
  const fsApi = options.fs || fs;
  let rawText;
  try {
    const raw = fsApi.readFileSync(normalizedPath, 'utf8');
    rawText = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  } catch (err) {
    throw new Error(`Unable to read ${label} ${normalizedPath}: ${err.message}`);
  }
  const maxBytes = Number(options.maxBytes || 0);
  if (maxBytes > 0) {
    const byteSize = Buffer.byteLength(rawText, 'utf8');
    if (byteSize > maxBytes) {
      throw new Error(`${label} ${normalizedPath} is ${byteSize} bytes; max supported size is ${maxBytes} bytes`);
    }
  }
  try {
    return JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Invalid ${label} JSON at ${normalizedPath}: ${err.message}`);
  }
}

function buildLiveSeedApprovalReadiness(options = {}) {
  const checklist = options.approvalChecklist || readLiveSeedApprovalChecklistSync(options.approvalChecklistPath, options);
  const previewEvidence = options.previewEvidence
    || (options.previewEvidencePath ? readLiveSeedPreviewEvidenceSync(options.previewEvidencePath, options) : null);
  const postSeedEvidence = options.postSeedEvidence
    || (options.postSeedEvidencePath ? readPostSeedVerificationEvidenceSync(options.postSeedEvidencePath, options) : null);
  const checks = [];
  const addCheck = (name, ok, detail, extra = {}) => {
    checks.push({
      name,
      ok: ok === true,
      required: extra.required !== false,
      detail: sanitizeEvidenceText(detail, 220),
    });
  };

  const plannedHosts = Array.isArray(checklist && checklist.plannedHosts) ? checklist.plannedHosts : [];
  const candidateCount = Number(checklist && checklist.candidateCount || 0);
  const constraints = checklist && checklist.constraints || {};
  const previewInfo = checklist && checklist.previewEvidence || {};
  const previewFingerprint = previewInfo.fingerprint || null;
  const seedAttemptLogPath = checklist && checklist.seedAttemptLog && checklist.seedAttemptLog.path;
  const postSeedShape = checklist
    && checklist.postSeedVerification
    && checklist.postSeedVerification.evidenceArtifact
    && checklist.postSeedVerification.evidenceArtifact.shape;
  const remoteUsabilityProof = checklist && checklist.remoteUsabilityProof || null;
  const remoteUsabilityCommandNames = commandNames(remoteUsabilityProof && remoteUsabilityProof.commands);
  const postSeedVerification = checklist && checklist.postSeedVerification || null;
  const postSeedCommandNames = commandNames(postSeedVerification && postSeedVerification.commands);
  const rollbackCommandNames = commandNames(postSeedVerification && postSeedVerification.rollbackCommands);
  const postSeedCheckNames = Array.isArray(postSeedShape && postSeedShape.checks)
    ? postSeedShape.checks.map(check => String(check && check.name || '').trim()).filter(Boolean)
    : [];

  addCheck(
    'checklist-schema',
    checklist && checklist.schemaVersion === 1 && checklist.mode === 'graph-feedback-live-seed-approval-checklist',
    `schemaVersion=${checklist && checklist.schemaVersion}; mode=${checklist && checklist.mode}`
  );
  addCheck(
    'checklist-ready',
    checklist && checklist.approvalReadyForHuman === true,
    `approvalReadyForHuman=${checklist && checklist.approvalReadyForHuman}`
  );
  addCheck(
    'not-authorized-yet',
    checklist && checklist.realSeedAuthorized === false,
    `realSeedAuthorized=${checklist && checklist.realSeedAuthorized}`
  );
  addCheck(
    'approval-line',
    checklist && checklist.explicitApprovalLine === 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE',
    checklist && checklist.explicitApprovalLine || '(missing)'
  );
  addCheck(
    'max-one-host',
    plannedHosts.length > 0 && plannedHosts.length <= REAL_REMOTE_SMOKE_CAPS.maxHosts,
    `planned host count ${plannedHosts.length}; max ${REAL_REMOTE_SMOKE_CAPS.maxHosts}`
  );
  addCheck(
    'max-three-candidates',
    candidateCount > 0 && candidateCount <= REAL_REMOTE_SMOKE_CAPS.maxCandidates,
    `candidate count ${candidateCount}; max ${REAL_REMOTE_SMOKE_CAPS.maxCandidates}`
  );
  addCheck(
    'timeout-cap',
    Number(constraints.timeoutSeconds || 0) > 0
      && Number(constraints.timeoutSeconds) <= REAL_REMOTE_SMOKE_CAPS.timeoutSeconds,
    `timeoutSeconds=${constraints.timeoutSeconds || '(missing)'}`
  );
  addCheck(
    'preview-evidence-path',
    Boolean(previewInfo.path),
    previewInfo.path || 'missing preview evidence path'
  );
  addCheck(
    'preview-fingerprint',
    /^[a-f0-9]{64}$/.test(String(previewFingerprint || '')),
    previewFingerprint || 'missing preview fingerprint'
  );
  addCheck(
    'seed-attempt-log-path',
    Boolean(seedAttemptLogPath),
    seedAttemptLogPath || 'missing seed-attempt log path'
  );
  addCheck(
    'post-seed-evidence-shape',
    postSeedShape && postSeedShape.mode === 'graph-feedback-live-seed-post-seed-verification-evidence',
    postSeedShape && postSeedShape.mode || 'missing post-seed evidence shape'
  );
  addCheck(
    'no-action-policy',
    checklist
      && checklist.actionPolicy
      && checklist.actionPolicy.dryRunOnly === true
      && checklist.actionPolicy.seedRemoteCrawlers === false
      && checklist.actionPolicy.enqueueUrls === false
      && checklist.actionPolicy.alterCollectBehavior === false,
    'approval package must remain dry-run-only'
  );
  addCheck(
    'remote-usability-proof',
    REQUIRED_REMOTE_USABILITY_COMMANDS.every(name => remoteUsabilityCommandNames.includes(name)),
    `commands=${remoteUsabilityCommandNames.join(',') || '(missing)'}`
  );
  addCheck(
    'remote-usability-no-action',
    remoteUsabilityProof
      && remoteUsabilityProof.actionPolicy
      && remoteUsabilityProof.actionPolicy.checklistOnly === true
      && remoteUsabilityProof.actionPolicy.seedRemoteCrawlers === false
      && remoteUsabilityProof.actionPolicy.enqueueUrls === false
      && remoteUsabilityProof.actionPolicy.alterCollectBehavior === false,
    'remote usability proof must be checklist-only'
  );
  addCheck(
    'post-seed-verification-plan',
    REQUIRED_POST_SEED_COMMANDS.every(name => postSeedCommandNames.includes(name)),
    `commands=${postSeedCommandNames.join(',') || '(missing)'}`
  );
  addCheck(
    'rollback-command-plan',
    REQUIRED_ROLLBACK_COMMANDS.every(name => rollbackCommandNames.includes(name)),
    `rollbackCommands=${rollbackCommandNames.join(',') || '(missing)'}`
  );

  if (previewEvidence) {
    addCheck(
      'preview-evidence-schema',
      previewEvidence.schemaVersion === 1 && previewEvidence.mode === 'graph-feedback-live-seed-preview-evidence',
      `schemaVersion=${previewEvidence.schemaVersion}; mode=${previewEvidence.mode}`
    );
    addCheck(
      'preview-evidence-match',
      previewEvidence.fingerprint === previewFingerprint,
      `checklist=${previewFingerprint || '(missing)'} preview=${previewEvidence.fingerprint || '(missing)'}`
    );
    addCheck(
      'preview-hosts-match',
      stableStringify(previewEvidence.plannedHosts || []) === stableStringify(plannedHosts),
      `checklist=${plannedHosts.join(',') || '(none)'} preview=${(previewEvidence.plannedHosts || []).join(',') || '(none)'}`
    );
    addCheck(
      'preview-counts-match',
      Number(previewEvidence.candidateCount || 0) === candidateCount,
      `checklist=${candidateCount} preview=${previewEvidence.candidateCount || 0}`
    );
  } else {
    addCheck('preview-evidence-loaded', false, 'missing preview evidence object/path');
  }

  if (postSeedEvidence) {
    const rawPostSeedEvidence = JSON.stringify(postSeedEvidence);
    addCheck(
      'post-seed-evidence-schema',
      postSeedEvidence.schemaVersion === 1
        && postSeedEvidence.mode === 'graph-feedback-live-seed-post-seed-verification-evidence',
      `schemaVersion=${postSeedEvidence.schemaVersion}; mode=${postSeedEvidence.mode}`
    );
    addCheck(
      'post-seed-preview-match',
      postSeedEvidence.previewFingerprint === previewFingerprint,
      `checklist=${previewFingerprint || '(missing)'} postSeed=${postSeedEvidence.previewFingerprint || '(missing)'}`
    );
    addCheck(
      'post-seed-checks-bounded',
      Array.isArray(postSeedEvidence.checks)
        && postSeedEvidence.checks.length <= REAL_REMOTE_SMOKE_CAPS.maxPostSeedChecks,
      `checks=${Array.isArray(postSeedEvidence.checks) ? postSeedEvidence.checks.length : '(invalid)'}`
    );
    addCheck(
      'post-seed-no-url-dumps',
      !/https?:\/\//.test(rawPostSeedEvidence),
      'post-seed evidence summaries must be URL-redacted'
    );
  }

  const readyForApproval = checks
    .filter(check => check.required !== false)
    .every(check => check.ok === true);
  const blockers = checks
    .filter(check => check.required !== false && check.ok !== true)
    .map(check => check.name);

  return {
    schemaVersion: 1,
    mode: 'graph-feedback-live-seed-approval-readiness',
    generatedAt: options.generatedAt || new Date().toISOString(),
    approvalChecklistPath: options.approvalChecklistPath || null,
    approvalReadinessPath: options.approvalReadinessPath || null,
    previewEvidencePath: options.previewEvidencePath || previewInfo.path || null,
    postSeedEvidencePath: options.postSeedEvidencePath || null,
    readyForApproval,
    realSeedAuthorized: false,
    explicitApprovalLine: 'APPROVE_GRAPH_FEEDBACK_REAL_SEED_SMOKE',
    plannedHosts,
    candidateCount,
    requestBodyBytes: Number(checklist && checklist.requestBodyBytes || 0),
    previewFingerprint,
    summary: {
      readyForApproval,
      blockerCount: blockers.length,
      blockers: blockers.slice(0, 10),
      plannedHostCount: plannedHosts.length,
      candidateCount,
      requestBodyBytes: Number(checklist && checklist.requestBodyBytes || 0),
      previewFingerprintShort: previewFingerprint ? `${String(previewFingerprint).slice(0, 16)}...` : null,
      seedAttemptLogPath: seedAttemptLogPath || null,
    },
    remoteUsability: {
      present: Boolean(remoteUsabilityProof),
      timeoutSeconds: Number(remoteUsabilityProof && remoteUsabilityProof.timeoutSeconds || 0) || null,
      commandNames: remoteUsabilityCommandNames,
      requiredCommandNames: REQUIRED_REMOTE_USABILITY_COMMANDS.slice(),
      decisionPointCount: Array.isArray(remoteUsabilityProof && remoteUsabilityProof.decisionPoints)
        ? remoteUsabilityProof.decisionPoints.length
        : 0,
      actionPolicy: remoteUsabilityProof && remoteUsabilityProof.actionPolicy || null,
    },
    postSeedVerificationPlan: {
      present: Boolean(postSeedVerification),
      evidencePath: postSeedVerification
        && postSeedVerification.evidenceArtifact
        && postSeedVerification.evidenceArtifact.path || null,
      maxBytes: Number(postSeedVerification
        && postSeedVerification.evidenceArtifact
        && postSeedVerification.evidenceArtifact.maxBytes || 0) || null,
      commandNames: postSeedCommandNames,
      requiredCommandNames: REQUIRED_POST_SEED_COMMANDS.slice(),
      rollbackCommandNames,
      requiredRollbackCommandNames: REQUIRED_ROLLBACK_COMMANDS.slice(),
      checkNames: postSeedCheckNames,
    },
    checks,
    actionPolicy: {
      dryRunOnly: true,
      requiresSeparateHumanApproval: true,
      seedRemoteCrawlers: false,
      enqueueUrls: false,
      alterCollectBehavior: false,
    },
  };
}

function commandNames(commands) {
  return (Array.isArray(commands) ? commands : [])
    .map(command => String(command && command.name || '').trim())
    .filter(Boolean);
}

function deriveSiblingEvidencePath(anchorPath, suffix) {
  const base = String(anchorPath || '').trim();
  if (!base) return path.join('tmp', `graph-feedback-${suffix}`);
  const parsed = path.parse(base);
  return path.join(parsed.dir || '.', `${parsed.name}-${suffix}`);
}

function hashStableJson(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function renderGraphFeedbackLiveSeedSummary(liveSeedPlan, options = {}) {
  if (!liveSeedPlan || typeof liveSeedPlan !== 'object') return '';
  const mode = options.dryRun ? 'dry-run preview' : 'live request';
  const evidence = liveSeedPlan.artifactEvidence || {};
  const lines = [
    '',
    `Graph feedback live seed plan (${mode}):`,
    `  Planned hosts: ${liveSeedPlan.plannedHosts.join(', ')}`,
    `  Seed candidates: ${liveSeedPlan.candidateCount} across ${liveSeedPlan.domainCount} host(s)`,
    `  Artifact size: ${Number(evidence.byteSize || 0)} bytes`,
    `  Artifact generatedAt valid: ${evidence.generatedAtValid ? 'yes' : 'no'}`,
  ];
  if (Number.isFinite(evidence.ageSeconds)) {
    lines.push(`  Artifact age: ${formatDurationSeconds(evidence.ageSeconds)}`);
  }
  if (liveSeedPlan.previewEvidence && liveSeedPlan.previewEvidence.fingerprint) {
    lines.push(`  Preview fingerprint: ${liveSeedPlan.previewEvidence.fingerprint.slice(0, 16)}...`);
  }
  lines.push(`  Request body: ${liveSeedPlan.requestBodyBytes} bytes (cap ${liveSeedPlan.caps.maxRequestBodyBytes})`);
  lines.push(options.dryRun
    ? '  Actions: dry-run only; no remote seed request is sent.'
    : '  Actions: explicit live graph-feedback seed request enabled; collect behavior unchanged.');
  return `${lines.join('\n')}\n`;
}

function formatDurationSeconds(seconds) {
  const value = Math.abs(Number(seconds || 0));
  if (value < 60) return `${Math.round(seconds)}s`;
  if (value < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (value < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

module.exports = {
  LIVE_SEED_CAPS,
  REAL_REMOTE_SMOKE_CAPS,
  appendGraphFeedbackSeedArgs,
  assertLiveArtifactFresh,
  buildLiveSeedApprovalChecklist,
  buildLiveSeedApprovalReadiness,
  buildLiveSeedPreviewEvidence,
  buildPostSeedVerificationChecklist,
  buildPostSeedVerificationEvidence,
  buildPreSeedRemoteUsabilityProof,
  buildSeedAttemptLogRecord,
  buildGraphFeedbackLiveSeedPlan,
  hasExistingSeedArgs,
  readLiveSeedApprovalChecklistSync,
  readLiveSeedPreviewEvidenceSync,
  readPostSeedVerificationEvidenceSync,
  redactSeedUrlArgs,
  readGraphFeedbackArtifactSync,
  renderGraphFeedbackLiveSeedSummary,
  serializeSeedUrlsByDomain,
  verifyLiveSeedPreviewEvidence,
  validateLiveSeedUrl,
  writeLiveSeedApprovalChecklistSync,
  writeLiveSeedApprovalReadinessSync,
  writeLiveSeedPreviewEvidenceSync,
  writePostSeedVerificationChecklistSync,
  writePostSeedVerificationEvidenceSync,
  writeSeedAttemptLogSync,
};
