const express = require('express');
const { EventEmitter } = require('events');

function isTruthyFlag(value) {
  if (value === true) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(v);
  }
  return false;
}

function createAnalysisControlRouter({
  analysisRunner,
  analysisRuns,
  urlsDbPath,
  generateRunId
} = {}) {
  if (!analysisRunner || typeof analysisRunner.start !== 'function') {
    throw new Error('createAnalysisControlRouter requires analysisRunner.start');
  }
  if (!analysisRuns || typeof analysisRuns.set !== 'function') {
    throw new Error('createAnalysisControlRouter requires analysisRuns Map');
  }
  if (typeof urlsDbPath !== 'string' || !urlsDbPath) {
    throw new Error('createAnalysisControlRouter requires urlsDbPath');
  }
  const runIdFactory = typeof generateRunId === 'function' ? generateRunId : (() => `analysis-${Date.now()}`);
  const router = express.Router();

  router.post('/api/analysis/start', (req, res) => {
    const body = req.body || {};
    const runId = runIdFactory(body.runId);
    const args = [];
    if (!args.some((a) => a.startsWith('--db='))) {
      args.push(`--db=${urlsDbPath}`);
    }
    args.push(`--run-id=${runId}`);
    if (body.analysisVersion != null && body.analysisVersion !== '') {
      const v = Number(body.analysisVersion);
      if (Number.isFinite(v)) args.push(`--analysis-version=${v}`);
    }
    if (body.pageLimit != null && body.pageLimit !== '') {
      const v = Number(body.pageLimit);
      if (Number.isFinite(v)) args.push(`--limit=${v}`);
    }
    if (body.domainLimit != null && body.domainLimit !== '') {
      const v = Number(body.domainLimit);
      if (Number.isFinite(v)) args.push(`--domain-limit=${v}`);
    }
    if (isTruthyFlag(body.skipPages)) args.push('--skip-pages');
    if (isTruthyFlag(body.skipDomains)) args.push('--skip-domains');
    if (isTruthyFlag(body.dryRun)) args.push('--dry-run');
    if (isTruthyFlag(body.verbose)) args.push('--verbose');

    try {
      const child = analysisRunner.start(args);
      if (!child || typeof child.on !== 'function') {
        throw new Error('analysis runner did not return a child process');
      }
      if (!child.stdout) child.stdout = new EventEmitter();
      if (!child.stderr) child.stderr = new EventEmitter();
      analysisRuns.set(runId, {
        child,
        startedAt: new Date().toISOString()
      });
      const cleanup = () => {
        analysisRuns.delete(runId);
      };
      child.on('exit', cleanup);
      child.on('close', cleanup);
      child.on('error', cleanup);
      res.status(202).json({
        runId,
        detailUrl: `/analysis/${runId}/ssr`,
        apiUrl: `/api/analysis/${runId}`
      });
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  return router;
}

module.exports = {
  createAnalysisControlRouter
};
