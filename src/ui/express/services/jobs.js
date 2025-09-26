// Small helpers for job IDs and summaries used by the UI server.

function newJobIdFactory() {
  let seq = 0;
  return function newJobId() {
    return `${Date.now().toString(36)}-${(++seq).toString(36)}`;
  };
}

function computeJobsSummary(jobs) {
  try {
    if (!jobs || jobs.size === 0) return { count: 0, items: [] };
    const items = [];
    for (const [id, j] of jobs.entries()) {
      const m = j.metrics || {};
      const stage = j.stage || (j.child ? 'running' : 'done');
      let status;
      if (j.child) {
        if (stage === 'preparing') status = 'preparing';
        else if (j.paused) status = 'paused';
        else status = stage || 'running';
      } else {
        status = stage || 'done';
      }
      items.push({
        id,
        pid: j.child?.pid || null,
        url: j.url || null,
        startedAt: j.startedAt || null,
        paused: !!j.paused,
        visited: m.visited || 0,
        downloaded: m.downloaded || 0,
        errors: m.errors || 0,
        queueSize: m.queueSize || 0,
        lastActivityAt: m._lastProgressWall || null,
        status,
        stage,
        stageChangedAt: j.stageChangedAt || null
      });
    }
    return { count: items.length, items };
  } catch (_) {
    return { count: 0, items: [] };
  }
}

module.exports = { newJobIdFactory, computeJobsSummary };
