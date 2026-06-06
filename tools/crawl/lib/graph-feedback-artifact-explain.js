'use strict';

const fs = require('fs');

const {
  MAX_ARTIFACT_BYTES,
  buildArtifactPlanningDryRunFromPlan,
} = require('../graph-feedback');

/**
 * Build a graph-feedback artifact explanation for already-planned hosts.
 *
 * This helper is file-only: it reads a saved artifact, validates it against
 * caller-supplied hosts, and returns non-action seed consideration data.
 *
 * @param {string[]} plannedHosts Hosts from an existing dry-run/explain plan.
 * @param {string} artifactPath Saved graph-feedback artifact path.
 * @param {object} [options]
 * @param {object} [options.fs] Synchronous fs seam for tests.
 * @param {string} [options.generatedAt] Stable timestamp for deterministic tests.
 * @returns {object} Graph-feedback explain block.
 */
function buildGraphFeedbackArtifactExplanationForHosts(plannedHosts, artifactPath, options = {}) {
  const hosts = normalizeHosts(plannedHosts);
  if (!hosts.length) {
    throw new Error('--graph-feedback-artifact requires planned hosts to validate against');
  }

  const normalizedPath = String(artifactPath || '').trim();
  if (!normalizedPath) {
    throw new Error('--graph-feedback-artifact requires a non-empty path');
  }

  const fsApi = options.fs || fs;
  let artifact;
  try {
    const raw = fsApi.readFileSync(normalizedPath, 'utf8');
    const rawText = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    const byteSize = Buffer.byteLength(rawText, 'utf8');
    if (byteSize > MAX_ARTIFACT_BYTES) {
      throw new Error(`artifact is ${byteSize} bytes; max supported size is ${MAX_ARTIFACT_BYTES} bytes`);
    }
    artifact = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`Unable to read graph-feedback artifact ${normalizedPath}: ${err.message}`);
  }

  const dryRun = buildArtifactPlanningDryRunFromPlan(artifact, {
    artifactPath: normalizedPath,
    domains: hosts,
    generatedAt: options.generatedAt,
  });

  return {
    ...dryRun,
    plannedHosts: hosts,
    actionPolicy: {
      enqueueUrls: false,
      seedRemoteCrawlers: false,
      alterCollectBehavior: false,
    },
  };
}

function renderGraphFeedbackSummary(graphFeedback, options = {}) {
  if (!graphFeedback || typeof graphFeedback !== 'object') return '';

  const maxCandidatesPerHost = positiveInt(options.maxCandidatesPerHost, 3);
  const plannedHosts = Array.isArray(graphFeedback.plannedHosts)
    ? graphFeedback.plannedHosts
    : [];
  const domains = Array.isArray(graphFeedback.domains) ? graphFeedback.domains : [];
  const lines = [
    '',
    'Graph feedback summary (read-only):',
    `  Planned hosts: ${plannedHosts.length ? plannedHosts.join(', ') : '(none)'}`,
    `  Candidates: ${Number(graphFeedback.candidateCount || 0)} across ${Number(graphFeedback.domainCount || domains.length || 0)} host(s)`,
  ];

  for (const domain of domains) {
    const host = domain && domain.host ? String(domain.host) : '(unknown-host)';
    const candidates = Array.isArray(domain && domain.candidates) ? domain.candidates : [];
    lines.push(`  ${host}: ${candidates.length} candidate(s)`);

    for (const [index, candidate] of candidates.slice(0, maxCandidatesPerHost).entries()) {
      const rank = Number(candidate.rank || 0) || index + 1;
      const url = candidate.url || '(missing-url)';
      const reason = candidate.reason || 'graph feedback recommendation';
      lines.push(`    ${rank}. ${url} - ${reason}`);
    }

    if (candidates.length > maxCandidatesPerHost) {
      lines.push(`    ... ${candidates.length - maxCandidatesPerHost} more candidate(s) omitted`);
    }
  }

  if (!domains.length || Number(graphFeedback.candidateCount || 0) === 0) {
    lines.push('  No seed candidates in the artifact for the planned hosts.');
  }

  lines.push('  Actions: no URLs enqueued; no remote crawlers seeded; collect behavior unchanged.');
  return lines.join('\n') + '\n';
}

function normalizeHosts(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const host = String(item || '').trim().toLowerCase();
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(host);
  }
  return out;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

module.exports = {
  buildGraphFeedbackArtifactExplanationForHosts,
  normalizeHosts,
  renderGraphFeedbackSummary,
};
