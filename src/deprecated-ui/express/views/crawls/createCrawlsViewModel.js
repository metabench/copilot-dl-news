const {
  is_defined,
  toNumber,
  normalizeStatus,
  collectStatusCounts
} = require('../shared/renderer-utils');

function getMetric(row, key) {
  if (row.metrics && is_defined(row.metrics[key])) return row.metrics[key];
  if (is_defined(row[key])) return row[key];
  return 0;
}

function deriveStatus(row) {
  if (is_defined(row.status)) {
    return row.status;
  }
  if (row.paused) return 'paused';
  if (row.endedAt) return 'done';
  return 'unknown';
}

function normalizeRow(row) {
  const metrics = row.metrics && typeof row.metrics === 'object' ? { ...row.metrics } : {};
  const paused = Boolean(row.paused);
  const baseStatus = deriveStatus(row);
  return {
    ...row,
    metrics,
    isActive: Boolean(row.isActive),
    paused,
    status: normalizeStatus(baseStatus, { paused })
  };
}

function summarize(rows) {
  if (!rows.length) {
    return {
      shown: 0,
      activeCrawls: 0,
      completed: 0,
      totalVisited: 0,
      totalDownloaded: 0,
      totalErrors: 0,
      statuses: []
    };
  }

  let visited = 0;
  let downloaded = 0;
  let errors = 0;
  let active = 0;
  let completed = 0;

  for (const row of rows) {
    const v = toNumber(getMetric(row, 'visited'));
    const d = toNumber(getMetric(row, 'downloaded'));
    const e = toNumber(getMetric(row, 'errors'));
    if (v) visited += v;
    if (d) downloaded += d;
    if (e) errors += e;
    if (row.isActive) {
      active += 1;
    } else if (row.endedAt) {
      completed += 1;
    }
  }

  const statuses = collectStatusCounts(rows, {
    statusSelector: (row) => row.status,
    pausedSelector: (row) => row.paused,
    priority: ['running', 'paused', 'done', 'unknown']
  });

  return {
    shown: rows.length,
    activeCrawls: active,
    completed,
    totalVisited: visited,
    totalDownloaded: downloaded,
    totalErrors: errors,
    statuses
  };
}

function createCrawlsViewModel(items = []) {
  const rows = items.map(normalizeRow);
  const summary = summarize(rows);
  return { rows, summary };
}

module.exports = {
  createCrawlsViewModel,
  summarize
};
