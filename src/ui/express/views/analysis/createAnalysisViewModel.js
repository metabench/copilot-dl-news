const {
  is_defined,
  normalizeStatus,
  formatTimestamp,
  formatDuration,
  collectStatusCounts
} = require('../shared/renderer-utils');

const ACTIVE_STATUSES = new Set(['running', 'starting', 'resuming']);
const COMPLETED_STATUSES = new Set(['completed', 'done', 'finished']);
const FAILED_STATUSES = new Set(['failed', 'errored', 'error', 'cancelled']);

function formatConfig(run) {
  if (!run || typeof run !== 'object') return '';
  const parts = [];
  if (is_defined(run.pageLimit)) parts.push(`pages: ${run.pageLimit}`);
  if (is_defined(run.domainLimit)) parts.push(`domains: ${run.domainLimit}`);
  if (run.skipPages) parts.push('skipPages');
  if (run.skipDomains) parts.push('skipDomains');
  if (run.dryRun) parts.push('dryRun');
  return parts.join(', ');
}

function truncate(text, max = 160) {
  if (!text) return '';
  const value = String(text);
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function collectDiagnosticLines(run = {}) {
  const diag = run.diagnostics || run.summary?.diagnostics || run.lastProgress?.diagnostics || null;
  if (!diag) {
    if (run.status === 'failed' && run.error) {
      return [truncate(run.error)];
    }
    return [];
  }

  const lines = [];
  if (run.status === 'failed') {
    if (diag.failure?.stage) {
      let failureLine = `Failed at ${diag.failure.stage}`;
      if (diag.failure?.message) {
        failureLine += ` — ${truncate(diag.failure.message)}`;
      }
      lines.push(failureLine);
    } else if (run.error) {
      lines.push(truncate(run.error));
    }
  } else if ((run.status === 'running' || run.status === 'starting') && diag.currentStage) {
    lines.push(`Currently in ${diag.currentStage}`);
  }

  if (diag.lastCompletedStage) {
    lines.push(`Last completed: ${diag.lastCompletedStage}`);
  }

  if (diag.failure?.stack && run.status === 'failed' && lines.length < 3) {
    lines.push(truncate(diag.failure.stack, 200));
  }

  return lines;
}

function toTitleCase(value) {
  if (!value) return 'Unknown';
  const str = String(value);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function normalizeRow(run = {}) {
  const normalizedStatus = normalizeStatus(run.status, {
    paused: run.status === 'paused' || run.status === 'pausing',
    fallback: 'unknown'
  });

  const startedAt = run.startedAt || null;
  const endedAt = run.endedAt || null;
  const durationLabel = formatDuration(startedAt, endedAt) || '—';
  const diagnostics = collectDiagnosticLines(run);
  const backgroundTaskId = run.backgroundTaskId != null ? Number(run.backgroundTaskId) : null;
  const backgroundTaskStatus = run.backgroundTaskStatus || null;
  const backgroundTaskHref = backgroundTaskId != null ? `/api/background-tasks/${backgroundTaskId}` : null;

  return {
    id: run.id,
    status: normalizedStatus,
    statusLabel: toTitleCase(normalizedStatus),
    stage: run.stage || null,
    startedAt,
    startedAtLabel: formatTimestamp(startedAt) || '—',
    endedAt,
    endedAtLabel: formatTimestamp(endedAt) || '—',
    durationLabel,
    configLabel: formatConfig(run) || '—',
    isActive: ACTIVE_STATUSES.has(normalizedStatus),
    isPaused: normalizedStatus === 'paused',
    diagnostics,
    lastProgress: run.lastProgress || null,
    summary: run.summary || null,
    backgroundTaskId,
    backgroundTaskStatus,
    backgroundTaskHref,
    raw: run
  };
}

function summarize(rows, { total = rows.length, limit = rows.length } = {}) {
  const summary = {
    shown: rows.length,
    total,
    limit,
    running: 0,
    paused: 0,
    completed: 0,
    failed: 0,
    statuses: []
  };

  for (const row of rows) {
    if (ACTIVE_STATUSES.has(row.status)) {
      summary.running += 1;
    } else if (row.status === 'paused') {
      summary.paused += 1;
    } else if (COMPLETED_STATUSES.has(row.status)) {
      summary.completed += 1;
    } else if (FAILED_STATUSES.has(row.status)) {
      summary.failed += 1;
    }
  }

  summary.statuses = collectStatusCounts(rows, {
    statusSelector: (row) => row.status,
    pausedSelector: (row) => row.isPaused,
    priority: ['running', 'starting', 'resuming', 'paused', 'completed', 'done', 'failed', 'unknown']
  });

  return summary;
}

function createAnalysisViewModel(items = [], { total = items.length, limit = items.length } = {}) {
  const rows = items.map(normalizeRow);
  const summary = summarize(rows, { total, limit });
  return { rows, summary };
}

module.exports = {
  createAnalysisViewModel,
  summarize,
  collectDiagnosticLines,
  formatConfig
};
