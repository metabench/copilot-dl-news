const {
  is_defined,
  collectStatusCounts,
  normalizeStatus
} = require('../shared/renderer-utils');

function normalizeRow(row) {
  const status = normalizeStatus(row.status, { paused: false });
  return {
    ...row,
    status,
    pid: is_defined(row.pid) ? row.pid : ''
  };
}

function summarize(rows) {
  if (!rows.length) {
    return {
      shown: 0,
      totalEvents: 0,
      uniquePids: 0,
      latestEnded: null,
      statuses: []
    };
  }

  let totalEvents = 0;
  const pidSet = new Set();
  let latestEnded = null;

  for (const row of rows) {
    totalEvents += Number(row.events) || 0;
    if (is_defined(row.pid) && row.pid !== '') {
      pidSet.add(String(row.pid));
    }
    if (row.endedAt) {
      if (!latestEnded || String(row.endedAt) > String(latestEnded)) {
        latestEnded = row.endedAt;
      }
    }
  }

  const statuses = collectStatusCounts(rows, {
    statusSelector: (row) => row.status,
    priority: ['done', 'running', 'paused', 'unknown']
  });

  return {
    shown: rows.length,
    totalEvents,
    uniquePids: pidSet.size,
    latestEnded,
    statuses
  };
}

function createQueuesViewModel(items = []) {
  const rows = items.map(normalizeRow);
  const summary = summarize(rows);
  return { rows, summary };
}

module.exports = {
  createQueuesViewModel,
  summarize
};
